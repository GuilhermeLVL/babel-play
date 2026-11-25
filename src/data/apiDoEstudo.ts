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
import { motivoDeCota } from './motivoDeCota';

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
  /** O modelo que respondeu (cabeçalho `x-ia-modelo`), para o 👍/👎. Ausente se o servidor não disse. */
  modelo?: string;
  origem: 'plano' | 'amostra';
  /** Amostra: quantas sobram hoje depois desta. Plano: `null`. */
  restanteNaAmostra: number | null;
}

function motivoDaFalha(status: number, code: string | undefined, detalhes?: Record<string, unknown>): FalhaDoEstudo {
  if (status === 404 && code === 'recurso_indisponivel') return 'fora';
  if (code === 'sem_plano') return 'sem_plano';
  /* Sem sessão, quem responde é o servidor em memória: 501 `EXIGE_CONTA` (`data/efemero/nucleo.ts`), em maiúsculas. */
  if (status === 401 || code?.toLowerCase() === 'exige_conta') return 'sem_conta';
  if (code === 'sessao_curta') return 'sessao_curta';
  if (code === 'amostra_acabou') return 'amostra_acabou';
  const cota = motivoDeCota(status, code, detalhes);
  if (cota) return cota;
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

/**
 * Quanto a folha espera a explicação: 35 s, DEPOIS do prazo total da cascata no servidor (30 s, `PRAZO_TOTAL_MS` em
 * `server/ai/nucleo/explicarFrase.ts`) — o servidor responde antes, e o cliente só desiste se a rede travar. O padrão
 * do `apiFetch` (30 s) cortaria a reserva que ainda podia entregar. Esgotado, vira `indisponivel` ("Não deu para
 * explicar agora."), sem lançar.
 */
export const TEMPO_DA_EXPLICACAO_MS = 35_000;

/** Pede a explicação de uma frase. Nunca lança. */
export async function explicarFrase(p: PedidoDeExplicacao): Promise<ResultadoDoEstudo<RespostaDaExplicacao>> {
  let res: Response;
  try {
    res = await apiFetch('/api/ai/explicar', {
      method: 'POST',
      timeoutMs: TEMPO_DA_EXPLICACAO_MS,
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
    return { ok: false, motivo: motivoDaFalha(res.status, erro.code, erro.detalhes), status: res.status };
  }
  const valor = lerResposta(await res.json().catch(() => null));
  return valor === null
    ? { ok: false, motivo: 'indisponivel', status: res.status }
    : { ok: true, valor: { ...valor, ...modeloDaResposta(res) } };
}

/** O modelo que o servidor disse ter respondido (`x-ia-modelo`), se disse. */
function modeloDaResposta(res: Response): { modelo?: string } {
  const modelo = res.headers?.get?.('x-ia-modelo');
  return modelo ? { modelo } : {};
}

/* ─────────────── a escrita da Leitura ativa (`POST /api/ai/escrita`, flag `leitura_ativa`) ─────────────── */

export type TipoDePonto = 'sentido' | 'tempoVerbal' | 'concordancia' | 'ortografia' | 'palavra' | 'outro';

export interface RetornoDaEscrita {
  elogio: string;
  pontos: { trecho: string; tipo: TipoDePonto; dica: string; exemplo: string }[];
  /** Os trechos da versão anterior que esta resolveu. */
  resolvidos: string[];
}

export interface PedidoDeRetorno {
  textoId: string;
  tarefa: 'reescrever' | 'opinar';
  escrita: string;
  /** Os trechos dos pontos da primeira versão (o reenvio, um por texto). */
  anteriores?: ReadonlyArray<string>;
}

/**
 * Por que não veio o retorno: o 403 do Grátis (`sem_plano`), a cota do mês (429 `cota_esgotada`, com `voltam`: "em 1 de
 * dezembro"), o dado pessoal que escapou do filtro local (422), e o resto ("Não deu para ler seu texto agora.").
 */
export type FalhaDaEscrita =
  | { motivo: 'sem_plano' | 'sem_conta' | 'fora' | 'dado_pessoal' | 'invalido' | 'indisponivel' }
  | { motivo: 'cota_esgotada'; limite: number | null; voltam: string | null };

const TIPOS_DE_PONTO: readonly TipoDePonto[] = ['sentido', 'tempoVerbal', 'concordancia', 'ortografia', 'palavra', 'outro'];

/** Leitura defensiva (o servidor já cortou em 3 e conferiu os trechos). */
function lerRetorno(c: unknown): RetornoDaEscrita | null {
  const r = ((c ?? {}) as { retorno?: Record<string, unknown> }).retorno;
  if (!r || typeof r !== 'object') return null;
  const elogio = textoCheio(r.elogio);
  if (!elogio || !Array.isArray(r.pontos)) return null;
  const pontos = r.pontos.flatMap((x: unknown) => {
    const p = (x ?? {}) as Record<string, unknown>;
    const trecho = textoCheio(p.trecho);
    const dica = textoCheio(p.dica);
    if (!trecho || !dica) return [];
    const tipo = TIPOS_DE_PONTO.includes(p.tipo as TipoDePonto) ? (p.tipo as TipoDePonto) : 'outro';
    return [{ trecho, tipo, dica, exemplo: typeof p.exemplo === 'string' ? p.exemplo : '' }];
  });
  const resolvidos = Array.isArray(r.resolvidos) ? r.resolvidos.filter((x): x is string => typeof x === 'string') : [];
  return { elogio, pontos: pontos.slice(0, 3), resolvidos };
}

/** Pede o retorno da IA sobre a escrita. Nunca lança. */
export async function pedirRetornoDaEscrita(
  p: PedidoDeRetorno,
): Promise<{ ok: true; valor: RetornoDaEscrita } | ({ ok: false } & FalhaDaEscrita)> {
  let res: Response;
  try {
    res = await apiFetch('/api/ai/escrita', {
      method: 'POST',
      timeoutMs: TEMPO_DA_EXPLICACAO_MS,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        textoId: p.textoId,
        tarefa: p.tarefa,
        escrita: p.escrita,
        ...(p.anteriores?.length ? { anteriores: p.anteriores.slice(0, 3) } : {}),
      }),
    });
  } catch {
    return { ok: false, motivo: 'indisponivel' };
  }
  if (!res.ok) {
    const erro = await lerErro(res);
    if (erro.code === 'cota_esgotada') {
      const d = erro.detalhes ?? {};
      return {
        ok: false,
        motivo: 'cota_esgotada',
        limite: typeof d.limite === 'number' ? d.limite : null,
        voltam: typeof d.voltam === 'string' ? d.voltam : null,
      };
    }
    if (erro.code === 'dado_pessoal') return { ok: false, motivo: 'dado_pessoal' };
    if (res.status === 403) return { ok: false, motivo: 'sem_plano' };
    const m = motivoDaFalha(res.status, erro.code, erro.detalhes);
    return { ok: false, motivo: m === 'sem_plano' || m === 'sem_conta' || m === 'fora' || m === 'invalido' ? m : 'indisponivel' };
  }
  const valor = lerRetorno(await res.json().catch(() => null));
  return valor === null ? { ok: false, motivo: 'indisponivel' } : { ok: true, valor };
}

/* ─────────────── o diário (`POST /api/ai/diario`, flag `diario`) ─────────────── */

export interface PedidoDoDiario {
  idioma: 'en' | 'es';
  nivel: 'A1' | 'A2' | 'B1';
  escrita: string;
}

/** As falhas do diário: as da escrita e o `sinal_de_risco` (422, o texto nem chegou à IA). */
export type FalhaDoDiario = FalhaDaEscrita | { motivo: 'sinal_de_risco' };

/** Pede o retorno da IA sobre o diário (o mesmo formato do retorno da escrita; `resolvidos` vem vazio). Nunca lança. */
export async function pedirRetornoDoDiario(
  p: PedidoDoDiario,
): Promise<{ ok: true; valor: RetornoDaEscrita } | ({ ok: false } & FalhaDoDiario)> {
  let res: Response;
  try {
    res = await apiFetch('/api/ai/diario', {
      method: 'POST',
      timeoutMs: TEMPO_DA_EXPLICACAO_MS,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idioma: p.idioma, nivel: p.nivel, escrita: p.escrita }),
    });
  } catch {
    return { ok: false, motivo: 'indisponivel' };
  }
  if (!res.ok) {
    const erro = await lerErro(res);
    if (erro.code === 'cota_esgotada') {
      const d = erro.detalhes ?? {};
      return {
        ok: false,
        motivo: 'cota_esgotada',
        limite: typeof d.limite === 'number' ? d.limite : null,
        voltam: typeof d.voltam === 'string' ? d.voltam : null,
      };
    }
    if (erro.code === 'dado_pessoal') return { ok: false, motivo: 'dado_pessoal' };
    if (erro.code === 'sinal_de_risco') return { ok: false, motivo: 'sinal_de_risco' };
    if (res.status === 403) return { ok: false, motivo: 'sem_plano' };
    const m = motivoDaFalha(res.status, erro.code, erro.detalhes);
    return { ok: false, motivo: m === 'sem_plano' || m === 'sem_conta' || m === 'fora' || m === 'invalido' ? m : 'indisponivel' };
  }
  const valor = lerRetorno(await res.json().catch(() => null));
  return valor === null ? { ok: false, motivo: 'indisponivel' } : { ok: true, valor };
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
  /** O modelo que respondeu (cabeçalho `x-ia-modelo`), para o 👍/👎. */
  modelo?: string;
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
    return { ok: false, motivo: motivoDaFalha(res.status, erro.code, erro.detalhes), status: res.status };
  }
  const valor = lerResumo(await res.json().catch(() => null));
  return valor === null
    ? { ok: false, motivo: 'indisponivel', status: res.status }
    : { ok: true, valor: { ...valor, ...modeloDaResposta(res) } };
}
