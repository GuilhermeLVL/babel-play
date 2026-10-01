/**
 * Adapter Groq Whisper via proxy do servidor — áudio do sistema/aba (PCM → Ogg Opus, ou WAV) chega ao
 * modelo whisper-large-v3-turbo na nuvem. A chave da API nunca chega ao cliente; o servidor
 * injeta via `x-credential-id`.
 */
import { apiFetch } from '../../data/api';
import { edicaoEstatica } from '../../lib/edicaoEstatica';
import { cabecalhoDoAlivio, registrarRecusaDoAlivio } from '../../lib/nuvemDeAlivio/estado';
import {
  cabecalhoDoDono,
  ENDPOINT_DA_NUVEM_DO_QUEST,
  guardarTraducaoPronta,
  nuvemDoQuestAtiva,
} from '../../lib/nuvemDoQuest';
import { sinalizarRecusaLida } from '../../lib/ofertas/eventos';
import { registrarRecusaDoUsoJusto } from '../../lib/usoJustoDoDia';
import { filtrarAlucinacao } from '../alucinacao';
import { audioParaStt } from '../audio/opusDoStt';
import { encodeWav } from '../audio/wav';
import type { SttFinal, SttProvider } from '../capabilities';
import { avisarFalhaDaNuvemDoStt } from '../falhaDaNuvemDoStt';
import { esperaDoRetryAfter, PAUSA_MAXIMA_MS, PausaDaNuvem } from '../pausaDaNuvem';
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
    // Edição estática: não há servidor com a chave — a cadeia vai direto ao Whisper local.
    // …menos no Quest com a nuvem ligada: lá a função do próprio site transcreve (`nuvemDoQuest.ts`).
    if (edicaoEstatica() && !nuvemDoQuestAtiva()) return false;
    return typeof fetch !== 'undefined' && !this.pausa.pausada;
  }

  async preload(): Promise<void> {
    // No-op; nada para baixar no cliente.
  }

  async transcribePcm(
    pcm: Float32Array,
    sampleRate: number,
    opts?: { languageHint?: string; signal?: AbortSignal; prompt?: string; traduzirPara?: string },
  ): Promise<SttFinal> {
    /* OGG OPUS (~24 kbps) quando o navegador codifica; WAV de 16 bits quando não (`opusDoStt.ts`).
       ~10× menos dados por fala, mesma transcrição (bancada 2026-09). A duração cobrada é medida
       no servidor, pelo contêiner — este cabeçalho só rotula o corpo. */
    /* NO QUEST, WAV: codificar Opus custaria CPU nos 3 núcleos do headset, e uma fala de 12 s em WAV
       são ~380 KB no Wi-Fi. */
    const noQuest = nuvemDoQuestAtiva();
    const audio = noQuest
      ? { corpo: encodeWav(pcm, sampleRate), tipo: 'audio/wav' as const }
      : await audioParaStt(pcm, sampleRate);

    const headers: Record<string, string> = {
      'Content-Type': audio.tipo,
      'x-model': this.cfg.model,
      /* A NUVEM DE ALÍVIO (A10): só depois do "Usar a nuvem grátis" — sem ele, a conta Grátis nunca
         gasta a franquia por acaso (o servidor responde o 402 de sempre). */
      ...cabecalhoDoAlivio(),
    };
    if (this.cfg.credentialId) {
      headers['x-credential-id'] = this.cfg.credentialId;
    }
    if (opts?.languageHint) {
      headers['x-language'] = opts.languageHint;
    }
    /* CONTEXTO: a última fala final da mesma fonte, no mesmo idioma (quem escolhe é o chamador; ver
       `promptDeStt.ts`). Cabeçalho e não campo do corpo porque o corpo é o áudio cru. Codificado
       porque cabeçalho HTTP não carrega acento nem quebra de linha; cortado aqui de novo porque o
       teto de 224 é contrato com o servidor e não pode depender de todo chamador lembrar dele. */
    const prompt = opts?.prompt ? cortarPrompt(opts.prompt) : '';
    if (prompt) {
      headers['x-stt-prompt'] = encodeURIComponent(prompt);
    }

    // Pelo funil (`apiFetch`): injeta o Bearer no modo público — este `fetch` cru não injetava, e
    // a STT de nuvem respondia 401 com login — e, sem conta, responde 501 sem tocar a rede.
    let res: Response;
    try {
      const pedido = {
        method: 'POST',
        headers: noQuest
          ? {
              ...headers,
              ...cabecalhoDoDono(),
              // A tradução volta na mesma viagem (`functions/quest/stt.js`).
              ...(opts?.traduzirPara ? { 'x-traduzir-para': opts.traduzirPara } : {}),
            }
          : headers,
        body: audio.corpo,
        signal: opts?.signal,
      };
      // No Quest (site estático) é `fetch` direto à função do Pages: o `apiFetch` ali responde em memória.
      res = noQuest ? await fetch(ENDPOINT_DA_NUVEM_DO_QUEST, pedido) : await apiFetch(this.endpoint, pedido);
    } catch (e) {
      // Rede caída também é falha da nuvem (acorda a reserva preguiçosa); cancelamento não é.
      if ((e as Error)?.name !== 'AbortError') avisarFalhaDaNuvemDoStt();
      throw e;
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      const retryAfter = res.headers?.get?.('retry-after');
      this.pausa.falha(res.status, retryAfter);
      /* A reserva local preguiçosa (celular/Quest, `lib/captura/reservaLocal.ts`) começa a carregar
         na primeira falha — o gateway já cai no local nesta mesma fala. */
      avisarFalhaDaNuvemDoStt();
      // 402 de cota/plano vira momento de oferta (Fase 8); o host espera a captura acabar.
      sinalizarRecusaLida(res.status, errorText, 'transcricao');
      let code: string | undefined;
      let corpo: unknown = null;
      try {
        corpo = JSON.parse(errorText);
        code = (corpo as { code?: unknown }).code as string | undefined;
      } catch {
        /* corpo não-JSON */
      }
      /* O SERVIDOR RECUSOU O ALÍVIO (flag, responsável, pool, franquia): a nuvem pausa pelo teto — o
         aparelho segue sem uma ida ao servidor por fala para ouvir a mesma recusa. */
      if (registrarRecusaDoAlivio(res.status, corpo)) this.pausa.pausar(PAUSA_MAXIMA_MS);
      /* O USO JUSTO DO DIA ACABOU (429 `uso_justo_do_dia`, matriz v2): a pausa acima já vale (todo 429
         pausa pelo `Retry-After`, com o teto que reavalia); aqui só sai o aviso funcional, uma vez por
         dia. Nenhuma oferta: o 429 não é momento de venda (`momentoDaRecusa`). */
      registrarRecusaDoUsoJusto(res.status, corpo);
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
    const json = (await res.json()) as { text?: string; language?: string; translation?: string };
    /* O MESMO filtro de alucinação do worker local, aplicado aqui também. O servidor já filtra a
       saída da nuvem com esta função; reaplicar é inócuo (o filtro é idempotente) e é o único jeito
       de o cliente SABER que houve descarte e contá-lo na telemetria. */
    const bruto = (json.text ?? '').trim();
    const text = filtrarAlucinacao(bruto, pcm.length / sampleRate, opts?.languageHint || json.language);
    // A tradução que veio junto fica à espera do tradutor (`ServerLlmMt`), que a pega sem ir à rede.
    if (text && json.translation && opts?.traduzirPara)
      guardarTraducaoPronta(text, opts.traduzirPara, json.translation);
    return {
      text,
      language: json.language || undefined,
      ...(bruto && !text ? { alucinacaoDescartada: true } : {}),
    };
  }
}
