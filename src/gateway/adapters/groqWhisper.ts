/**
 * Adapter Groq Whisper via proxy do servidor — áudio do sistema/aba (PCM → WAV) chega ao
 * modelo whisper-large-v3-turbo na nuvem. A chave da API nunca chega ao cliente; o servidor
 * injeta via `x-credential-id`.
 */
import { apiFetch } from '../../data/api';
import { sinalizarRecusaLida } from '../../lib/ofertas/eventos';
import { filtrarAlucinacao } from '../alucinacao';
import { encodeWav } from '../audio/wav';
import type { SttFinal, SttProvider } from '../capabilities';
import { esperaDoRetryAfter, PausaDaNuvem } from '../pausaDaNuvem';
import { cortarPrompt } from '../promptDeStt';

export interface GroqWhisperConfig {
  model: string;
  credentialId?: string;
  endpoint?: string;
}

export class GroqWhisperStt implements SttProvider {
  readonly id = 'groq-whisper';
  readonly runtime = 'proxy' as const;
  readonly cost = 'byo-cloud' as const;
  readonly label = 'Nuvem STT (Groq/OpenAI)';

  readonly supportsLiveMic = false;
  readonly supportsBlob = true;

  private endpoint: string;
  /* 429 `nuvem_ocupada`, 402 e 503 PAUSAM a nuvem pelo `Retry-After` (ou 60 s) e ela religa sozinha
     (ADR 0007). Em pausa o adaptador se declara indisponível e o gateway passa direto para o Whisper
     local — sem ida ao servidor para ouvir a mesma recusa a cada fala. */
  private readonly pausa = new PausaDaNuvem();

  constructor(private cfg: GroqWhisperConfig) {
    this.endpoint = cfg.endpoint ?? '/api/ai/stt';
  }

  isAvailable(): boolean {
    return typeof fetch !== 'undefined' && !this.pausa.pausada;
  }

  async preload(): Promise<void> {
    // No-op; nada para baixar no cliente.
  }

  async transcribePcm(
    pcm: Float32Array,
    sampleRate: number,
    opts?: { languageHint?: string; signal?: AbortSignal; prompt?: string },
  ): Promise<SttFinal> {
    const wav = encodeWav(pcm, sampleRate);

    const headers: Record<string, string> = {
      'Content-Type': 'audio/wav',
      'x-model': this.cfg.model,
    };
    if (this.cfg.credentialId) {
      headers['x-credential-id'] = this.cfg.credentialId;
    }
    if (opts?.languageHint) {
      headers['x-language'] = opts.languageHint;
    }
    /* CONTEXTO: a última fala final da mesma fonte, no mesmo idioma (quem escolhe é o chamador; ver
       `promptDeStt.ts`). Cabeçalho e não campo do corpo porque o corpo é o WAV cru. Codificado
       porque cabeçalho HTTP não carrega acento nem quebra de linha; cortado aqui de novo porque o
       teto de 224 é contrato com o servidor e não pode depender de todo chamador lembrar dele. */
    const prompt = opts?.prompt ? cortarPrompt(opts.prompt) : '';
    if (prompt) {
      headers['x-stt-prompt'] = encodeURIComponent(prompt);
    }

    // Pelo funil (`apiFetch`): injeta o Bearer no modo público — este `fetch` cru não injetava, e
    // a STT de nuvem respondia 401 com login — e, sem conta, responde 501 sem tocar a rede.
    const res = await apiFetch(this.endpoint, {
      method: 'POST',
      headers,
      body: wav,
      signal: opts?.signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      const retryAfter = res.headers?.get?.('retry-after');
      this.pausa.falha(res.status, retryAfter);
      // 402 de cota/plano vira momento de oferta (Fase 8); o host espera a captura acabar.
      sinalizarRecusaLida(res.status, errorText, 'transcricao');
      let code: string | undefined;
      try {
        code = (JSON.parse(errorText) as { code?: unknown }).code as string | undefined;
      } catch {
        /* corpo não-JSON */
      }
      /* O STATUS, o CÓDIGO e a ESPERA vão no erro, e não só na mensagem: quem chama decide por eles
         (a importação espera o `Retry-After` do 429 `nuvem_ocupada` e volta à nuvem; o resto de
         402/429/501/503 recusa a nuvem no arquivo). */
      throw Object.assign(new Error(`groq-whisper HTTP ${res.status}: ${errorText.slice(0, 160)}`), {
        status: res.status,
        ...(typeof code === 'string' ? { code } : {}),
        ...(retryAfter ? { retryAfterMs: esperaDoRetryAfter(retryAfter) } : {}),
      });
    }
    this.pausa.sucesso();

    /* `language` vem do DECODE, não de um palpite sobre o texto: o Whisper identifica o idioma a
       partir do áudio. O servidor pede `verbose_json` e normaliza para ISO-639-1 (ver
       `server/lib/idiomaDoWhisper.ts`); '' significa "o provedor não informou".

       A dica do usuário NÃO entra aqui. `language` significa "o que o motor identificou", e
       ecoar a dica de volta faria o chamador tomar a própria pergunta por resposta. */
    const json = (await res.json()) as { text?: string; language?: string };
    /* O MESMO filtro de alucinação do worker local, aplicado aqui também. O servidor já filtra a
       saída da nuvem com esta função; reaplicar é inócuo (o filtro é idempotente) e é o único jeito
       de o cliente SABER que houve descarte e contá-lo na telemetria. */
    const bruto = (json.text ?? '').trim();
    const text = filtrarAlucinacao(bruto, pcm.length / sampleRate, opts?.languageHint || json.language);
    return {
      text,
      language: json.language || undefined,
      ...(bruto && !text ? { alucinacaoDescartada: true } : {}),
    };
  }
}
