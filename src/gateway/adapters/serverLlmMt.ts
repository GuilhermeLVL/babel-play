import { apiFetch } from '../../data/api';
import { edicaoEstatica } from '../../lib/edicaoEstatica';
import { alivioAceito, cabecalhoDoAlivio, registrarRecusaDoAlivio } from '../../lib/nuvemDeAlivio/estado';
import {
  cabecalhoDoDono,
  ENDPOINT_DA_TRADUCAO_DO_QUEST,
  nuvemDoQuestAtiva,
  pegarTraducaoPronta,
} from '../../lib/nuvemDoQuest';
import { sinalizarRecusaDaNuvem } from '../../lib/ofertas/eventos';
import { nuanceDasPreferencias } from '../../lib/traducao/preferenciasDaNuance';
import { registrarRecusaDoUsoJusto } from '../../lib/usoJustoDoDia';
import type { MtResult, TranslationProvider } from '../capabilities';
import { PAUSA_MAXIMA_MS, PausaDaNuvem } from '../pausaDaNuvem';

/**
 * Tradução via LLM no SERVIDOR (Groq) — o elo de qualidade da cadeia de MT quando os
 * motores locais falham e o MyMemory estoura a cota. Sem chave no servidor, o endpoint
 * responde 501 e a cadeia segue (honesto: nunca inventa tradução).
 *
 * Diferencial: NÃO exige o idioma de origem — o LLM detecta. É o motor que sustenta o
 * modo multi-idioma (detecção automática) da captura. E é o único motor que traduz o
 * SENTIDO de fala informal (prompt comunicativo + contexto das falas anteriores).
 */
export class ServerLlmMt implements TranslationProvider {
  readonly id = 'server-llm-mt';
  readonly runtime = 'browser' as const;
  readonly cost = 'byo-cloud' as const;
  readonly label = 'Tradutor IA (servidor)';

  /* 501 (servidor sem chave) é PERMANENTE na sessão: configuração não muda enquanto a página está
     aberta. Todo o resto é TEMPORÁRIO (`PausaDaNuvem`): 429/402/503 pausam pelo `Retry-After` (ou
     60 s) e religam sozinhos; 5xx só pausa em sequência. Antes 402 e QUALQUER 5xx desligavam a
     tradução por nuvem até recarregar a página — um soluço do provedor custava a sessão inteira. */
  private unavailable = false;
  private readonly pausa = new PausaDaNuvem();

  supports(src: string | null, tgt: string): boolean {
    void src; // origem é opcional (o LLM detecta)
    // Edição estática: não há servidor com LLM — a cadeia cai no motor local sem tentar.
    // …menos na nuvem do site (aparelho fraco com a nuvem ligada, `nuvemDoQuest.ts`).
    if (edicaoEstatica() && !nuvemDoQuestAtiva()) return false;
    // Em pausa, "não suporto": a cadeia cai no motor local NA HORA, sem ida ao servidor.
    return !this.unavailable && !this.pausa.pausada && !!tgt && tgt !== src;
  }

  async translate(
    text: string,
    src: string | null,
    tgt: string,
    opts?: { signal?: AbortSignal; contexto?: ReadonlyArray<string>; falada?: boolean },
  ): Promise<MtResult> {
    // Pelo funil: sem conta o servidor em memória responde 501 (a nuvem gerenciada exige conta) e
    // este adaptador se marca indisponível — a tradução cai para o caminho local, como deve.
    /* A NUVEM DO SITE: a tradução normalmente já veio com a transcrição (`pegarTraducaoPronta`); o que
       sobra vai à função `/quest/mt`. Sem LLM: é o m2m100 do Workers AI. */
    if (nuvemDoQuestAtiva()) {
      const pronta = pegarTraducaoPronta(text, tgt);
      if (pronta) return { text: pronta, engine: this.id };
      const resposta = await fetch(ENDPOINT_DA_TRADUCAO_DO_QUEST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...cabecalhoDoDono() },
        body: JSON.stringify({ text, src: src || undefined, tgt }),
        signal: opts?.signal,
      });
      if (!resposta.ok) {
        this.pausa.falha(resposta.status, resposta.headers?.get?.('retry-after'));
        throw Object.assign(new Error(`tradução da nuvem do site indisponível (HTTP ${resposta.status})`), {
          status: resposta.status,
        });
      }
      const dados = (await resposta.json()) as { text?: string };
      if (!dados.text) throw new Error('a nuvem do site devolveu tradução vazia');
      this.pausa.sucesso();
      return { text: dados.text, engine: this.id };
    }
    const res = await apiFetch('/api/ai/mt', {
      method: 'POST',
      /* A NUVEM DE ALÍVIO (A10): o cabeçalho só vai depois do "Usar a nuvem grátis". */
      headers: { 'Content-Type': 'application/json', ...cabecalhoDoAlivio() },
      body: JSON.stringify({
        text,
        src: src || undefined,
        tgt,
        contexto: opts?.contexto?.slice(-3),
        falada: opts?.falada === true,
        /* A TRADUÇÃO NUANCE (D2/D6): o registro padrão e a variante dos Ajustes, só fora do padrão e
           só para quem tem a capacidade. Sem `nivel`: a legenda ao vivo fica na rápida (D1). */
        ...nuanceDasPreferencias(tgt),
      }),
      signal: opts?.signal,
    });
    if (res.status === 501) {
      this.unavailable = true;
      throw new Error(`tradução por LLM de nuvem indisponível (HTTP ${res.status})`);
    }
    /* 429 `nuvem_ocupada` (admissão do servidor), 402 (plano/cota) e 503 (portão, Pages sem
       API_ORIGIN): pausa pelo `Retry-After`. 5xx avulso: só conta — o terceiro seguido pausa. */
    /* O ALÍVIO RECUSADO (A10): o 403 do perfil protegido e as recusas com código do alívio pausam pelo
       teto — a tradução segue no motor local, sem perguntar de novo a cada fala e sem oferta de venda. */
    if (alivioAceito() && res.status >= 400) {
      const corpo: unknown =
        typeof res.clone === 'function'
          ? await res
              .clone()
              .json()
              .catch(() => null)
          : null;
      if (registrarRecusaDoAlivio(res.status, corpo) || res.status === 403) this.pausa.pausar(PAUSA_MAXIMA_MS);
    }
    if (res.status === 402 || res.status === 429 || res.status >= 500) {
      this.pausa.falha(res.status, res.headers?.get?.('retry-after'));
      /* O USO JUSTO DO DIA (429 `uso_justo_do_dia`, matriz v2): a pausa acima já vale; sai o aviso
         funcional, uma vez por dia — e nada de venda (o 429 não é momento de oferta). */
      if (res.status === 429 && typeof res.clone === 'function') {
        const corpo: unknown = await res
          .clone()
          .json()
          .catch(() => null);
        registrarRecusaDoUsoJusto(res.status, corpo);
      }
      /* O 402 não é mais silencioso: cota acabada ou plano insuficiente viram um MOMENTO de oferta
         (Fase 8). O host espera a captura acabar para mostrar — a tradução segue no motor local. */
      void sinalizarRecusaDaNuvem(res, 'traducao');
      throw Object.assign(new Error(`tradução por LLM de nuvem indisponível (HTTP ${res.status})`), {
        status: res.status,
      });
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        msg = ((await res.json()) as { error?: string }).error || msg;
      } catch {
        /* corpo não-JSON */
      }
      throw new Error(`Tradutor IA: ${msg}`);
    }
    const data = (await res.json()) as { text?: string };
    if (!data.text) throw new Error('Tradutor IA devolveu resposta vazia');
    this.pausa.sucesso();
    // O id neutro do próprio adaptador (A5): o servidor pode servir por qualquer provedor da cascata.
    return { text: data.text, detectedSourceLang: src || undefined, engine: 'server-llm-mt' };
  }
}
