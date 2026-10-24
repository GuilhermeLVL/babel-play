/**
 * O CLIENTE DA IA DE ESTUDO (planos v4, etapa 2): a explicação de uma frase (`POST /api/ai/explicar`) e o resumo
 * da sessão que vira cartões (`POST /api/ai/resumir`), atrás da flag `ia_de_estudo`.
 *
 * Irmão de `apiDaNuance.ts`, e fora da fachada pelo mesmo motivo: só "Explicar esta frase" e "Resumir a sessão"
 * o importam, e chegam por `import()`. Não há espelho sem conta (`/api/ai` está em `SO_COM_CONTA`).
 *
 * `explicarFrase` e `resumirSessao` NÃO lançam: devolve `{ ok: false, motivo }`, e a tela escolhe a frase. O servidor decide
 * pelo `code` (não pelo texto); aqui só se traduz o `code` para um motivo que a tela entende. Nenhum motivo
 * carrega oferta: quem decide mostrar o link de Planos é a tela (adulto no Grátis, fim da amostra).
 */
import { apiFetch, lerErro } from './funil';

export type FalhaDoEstudo =
  | 'sem_conta'
  /** 402 `sem_plano`: a conta existe e está logada, mas o plano não tem a cota (nunca "entre na sua conta"). */
  | 'sem_plano'
  /** 400 `sessao_curta`: a sessão tem menos de 4 falas (só o resumo). */
  | 'sessao_curta'
  | 'amostra_acabou'
  | 'cota_do_mes'
  | 'uso_justo'
  | 'nuvem_ocupada'
  /** 404 `recurso_indisponivel`: a flag está desligada no servidor (a do cliente era um cache velho). */
  | 'fora'
  | 'invalido'
  | 'indisponivel';

export type ResultadoDoEstudo<T> = { ok: true; valor: T } | { ok: false; motivo: FalhaDoEstudo; status: number };

export interface PedidoDeExplicacao {
  texto: string;
  traducao: string;
  /** O idioma da fala. */
  lang: string;
  /** O idioma da tradução: a explicação é escrita nele. */
  langDaTraducao: string;
  /** As falas anteriores (≤ 3). */
  contexto?: ReadonlyArray<string>;
}

export interface ExplicacaoDaFrase {
  porQue: string;
  gramatica: string;
  registro: string;
  girias: { termo: string; sentido: string }[];
}

export interface RespostaDaExplicacao {
  explicacao: ExplicacaoDaFrase;
  origem: 'plano' | 'amostra';
  /** Amostra: quantas sobram hoje depois desta. Plano: `null`. */
  restanteNaAmostra: number | null;
}

function motivoDaFalha(status: number, code: string | undefined): FalhaDoEstudo {
  if (status === 404 && code === 'recurso_indisponivel') return 'fora';
  if (code === 'sem_plano') return 'sem_plano';
  /* Sem sessão, quem responde é o servidor em memória: 501 `EXIGE_CONTA` (`data/efemero/nucleo.ts`), em maiúsculas. */
  if (status === 401 || code?.toLowerCase() === 'exige_conta') return 'sem_conta';
  if (code === 'sessao_curta') return 'sessao_curta';
  if (code === 'amostra_acabou') return 'amostra_acabou';
  if (code === 'cota_do_mes' || code === 'quota_exceeded' || code === 'teto_usd_da_conta') return 'cota_do_mes';
  if (code === 'uso_justo_do_dia') return 'uso_justo';
  if (status === 429) return 'nuvem_ocupada';
  if (status === 400) return 'invalido';
  return 'indisponivel';
}

const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Leitura defensiva: forma fora do contrato vira `null` (a tela diz "não deu"). */
function lerResposta(c: unknown): RespostaDaExplicacao | null {
  const o = (c ?? {}) as { explicacao?: Record<string, unknown>; origem?: unknown; restanteNaAmostra?: unknown };
  const e = o.explicacao;
  if (!e || typeof e !== 'object') return null;
  const porQue = texto(e.porQue);
  const gramatica = texto(e.gramatica);
  const registro = texto(e.registro);
  if (!porQue || gramatica === null || registro === null) return null;
  const girias = Array.isArray(e.girias)
    ? e.girias.flatMap((g: unknown) => {
        const x = (g ?? {}) as { termo?: unknown; sentido?: unknown };
        return typeof x.termo === 'string' && x.termo && typeof x.sentido === 'string'
          ? [{ termo: x.termo, sentido: x.sentido }]
          : [];
      })
    : [];
  return {
    explicacao: { porQue, gramatica, registro, girias },
    origem: o.origem === 'amostra' ? 'amostra' : 'plano',
    restanteNaAmostra: typeof o.restanteNaAmostra === 'number' ? o.restanteNaAmostra : null,
  };
}

/** Pede a explicação de uma frase. Nunca lança. */
export async function explicarFrase(p: PedidoDeExplicacao): Promise<ResultadoDoEstudo<RespostaDaExplicacao>> {
  let res: Response;
  try {
    res = await apiFetch('/api/ai/explicar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texto: p.texto,
        traducao: p.traducao,
        lang: p.lang,
        langDaTraducao: p.langDaTraducao,
        ...(p.contexto?.length ? { contexto: p.contexto.slice(-3) } : {}),
      }),
    });
  } catch {
    return { ok: false, motivo: 'indisponivel', status: 0 };
  }
  if (!res.ok) {
    const erro = await lerErro(res);
    return { ok: false, motivo: motivoDaFalha(res.status, erro.code), status: res.status };
  }
  const valor = lerResposta(await res.json().catch(() => null));
  return valor === null ? { ok: false, motivo: 'indisponivel', status: res.status } : { ok: true, valor };
}

/** Um cartão proposto pelo resumo, já no formato do bulk-add (o servidor já filtrou). */
export interface CartaoDoResumo {
  word: string;
  back: string;
  sentence: string;
  srcLang: string;
  tgtLang: string;
}

export interface RespostaDoResumo {
  pontos: string[];
  cartoes: CartaoDoResumo[];
  origem: 'plano' | 'amostra';
  /** Amostra: quantos resumos sobram nesta semana depois deste. Plano: `null`. */
  restanteNaAmostra: number | null;
}

const textoCheio = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/** Leitura defensiva: sem os 3 pontos, `null`; cartão fora da forma é descartado (o servidor já filtrou). */
function lerResumo(c: unknown): RespostaDoResumo | null {
  const o = (c ?? {}) as { pontos?: unknown; cartoes?: unknown; origem?: unknown; restanteNaAmostra?: unknown };
  if (!Array.isArray(o.pontos) || o.pontos.length !== 3) return null;
  const pontos = o.pontos.map(textoCheio);
  if (pontos.some((p) => p === null)) return null;
  const cartoes = Array.isArray(o.cartoes)
    ? o.cartoes.flatMap((x: unknown) => {
        const k = (x ?? {}) as Record<string, unknown>;
        const word = textoCheio(k.word);
        const back = textoCheio(k.back);
        const sentence = textoCheio(k.sentence);
        const srcLang = textoCheio(k.srcLang);
        const tgtLang = textoCheio(k.tgtLang);
        return word && back && sentence && srcLang && tgtLang ? [{ word, back, sentence, srcLang, tgtLang }] : [];
      })
    : [];
  return {
    pontos: pontos as string[],
    cartoes,
    origem: o.origem === 'amostra' ? 'amostra' : 'plano',
    restanteNaAmostra: typeof o.restanteNaAmostra === 'number' ? o.restanteNaAmostra : null,
  };
}

/** Pede o resumo de uma sessão (as falas o servidor lê do banco). Nunca lança. */
export async function resumirSessao(p: {
  sessionId: string;
  /** O idioma de quem estuda: os pontos e os versos vêm nele. */
  lang?: string;
}): Promise<ResultadoDoEstudo<RespostaDoResumo>> {
  let res: Response;
  try {
    res = await apiFetch('/api/ai/resumir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: p.sessionId, ...(p.lang ? { lang: p.lang } : {}) }),
    });
  } catch {
    return { ok: false, motivo: 'indisponivel', status: 0 };
  }
  if (!res.ok) {
    const erro = await lerErro(res);
    return { ok: false, motivo: motivoDaFalha(res.status, erro.code), status: res.status };
  }
  const valor = lerResumo(await res.json().catch(() => null));
  return valor === null ? { ok: false, motivo: 'indisponivel', status: res.status } : { ok: true, valor };
}
