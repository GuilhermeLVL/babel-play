/**
 * O CLIENTE DO ASSISTENTE AO VIVO (`POST /api/ai/assistente/*`; spec `docs/specs/2026-10-25-assistente-ao-vivo.md`),
 * atrás da flag `assistente_ao_vivo` e só nos planos pagos. Sem tela: a Fase C2 (a aba "Assistente" da janela
 * flutuante) importa daqui por `import()`, como `apiDoEstudo.ts`.
 *
 * NENHUMA FUNÇÃO LANÇA: devolvem `{ ok: false, motivo }`, e a tela escolhe a frase. O servidor decide pelo `code`;
 * aqui só se traduz o `code` num motivo (`motivoDeCota` para as recusas de cota). Nenhum motivo carrega oferta: quem
 * decide mostrar Planos é a tela, e nunca no instante da recusa (`copy-br-etica`).
 *
 * O CACHE das glosas automáticas (expressões e termos) é SÓ EM MEMÓRIA desta aba, nunca gravado (retenção zero): a
 * mesma linha de legenda (um refrão, uma fala repetida) ou a mesma sigla não custa outra chamada na sessão. O servidor
 * não guarda nada. "Como respondo?" e a correção da fala não têm cache: são pedidos explícitos e mudam a cada vez.
 */
import { apiFetch, comTeto, lerErro } from './funil';
import { motivoDeCota } from './motivoDeCota';

export type FalhaDoAssistente =
  | 'sem_conta'
  /** 402 `sem_plano`: o plano não tem o assistente de nuvem (Grátis, convidado). */
  | 'sem_plano'
  | 'cota_do_mes'
  /** O uso justo de hoje (inclui o teto do dia do assistente, 429 `teto_do_assistente`): volta amanhã. */
  | 'uso_justo'
  /** 429 sem código de cota (`nuvem_ocupada`, `assistente_demais`, limite do provedor): tente em instantes. */
  | 'nuvem_ocupada'
  /** 404 `recurso_indisponivel`: a flag está desligada no servidor. */
  | 'fora'
  | 'invalido'
  | 'indisponivel';

export type ResultadoDoAssistente<T> =
  | {
      ok: true;
      /**
       * `restanteHoje`: quantas chamadas sobram hoje (`null` = sem teto, self-host). Numa resposta do CACHE (nada foi
       * gasto) vem o último valor conhecido nesta aba, ou nada — nunca um `null` que a tela leria como "sem teto".
       */
      valor: T & { restanteHoje?: number | null; modelo?: string };
    }
  | { ok: false; motivo: FalhaDoAssistente; status: number };

export type TipoDeExpressao = 'idiomatica' | 'giria' | 'phrasal';
export type TomDaSugestao = 'neutro' | 'informal' | 'formal';

export interface ExpressaoDestacada {
  /** O trecho EXATO da linha (o servidor já conferiu que está nela). */
  trecho: string;
  sentido: string;
  tipo: TipoDeExpressao;
}
export interface TermoExplicado {
  termo: string;
  explicacao: string;
}
export interface SugestaoDeResposta {
  texto: string;
  traducao: string;
  tom: TomDaSugestao;
}
export interface CorrecaoDaFala {
  ok: boolean;
  corrigida: string;
  dica: string;
}

/** Os idiomas de todo pedido: o da frase e o da pessoa (explicações e traduções vêm nele). */
interface Idiomas {
  lang: string;
  langDaPessoa: string;
}

/**
 * Quanto a tela espera: 12 s, DEPOIS do prazo da cascata no servidor (10 s, `PRAZO_TOTAL_MS` em
 * `server/ai/nucleo/assistenteAoVivo.ts`). Esgotado, `indisponivel`.
 */
export const TEMPO_DO_ASSISTENTE_MS = 12_000;

function motivoDaFalha(status: number, code: string | undefined, detalhes?: Record<string, unknown>): FalhaDoAssistente {
  if (status === 404 && code === 'recurso_indisponivel') return 'fora';
  if (code === 'sem_plano') return 'sem_plano';
  if (status === 401 || code?.toLowerCase() === 'exige_conta') return 'sem_conta';
  const cota = motivoDeCota(status, code, detalhes);
  if (cota) return cota;
  if (status === 400) return 'invalido';
  return 'indisponivel';
}

async function postar<T>(
  caminho: string,
  corpo: Record<string, unknown>,
  ler: (c: Record<string, unknown>) => T | null,
): Promise<ResultadoDoAssistente<T>> {
  let res: Response;
  try {
    res = await apiFetch(caminho, {
      method: 'POST',
      timeoutMs: TEMPO_DO_ASSISTENTE_MS,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
  } catch {
    return { ok: false, motivo: 'indisponivel', status: 0 };
  }
  if (!res.ok) {
    const erro = await lerErro(res);
    return { ok: false, motivo: motivoDaFalha(res.status, erro.code, erro.detalhes), status: res.status };
  }
  return lerCorpoDeSucesso(res, ler);
}

/** O corpo JSON de sucesso (o contrato de sempre): o valor lido, o `restanteHoje` e o modelo do cabeçalho. */
async function lerCorpoDeSucesso<T>(
  res: Response,
  ler: (c: Record<string, unknown>) => T | null,
): Promise<ResultadoDoAssistente<T>> {
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const valor = json && typeof json === 'object' ? ler(json) : null;
  if (valor === null) return { ok: false, motivo: 'indisponivel', status: res.status };
  const modelo = res.headers?.get?.('x-ia-modelo');
  const restanteHoje = typeof json?.restanteHoje === 'number' ? json.restanteHoje : null;
  ultimoRestanteHoje = restanteHoje;
  return { ok: true, valor: { ...valor, restanteHoje, ...(modelo ? { modelo } : {}) } };
}

/** O último `restanteHoje` que o servidor disse nesta aba (`undefined` = nenhum ainda). */
let ultimoRestanteHoje: number | null | undefined;

/** O que vai numa resposta do cache: o último valor conhecido, ou nada. */
const restanteDoCache = () => (ultimoRestanteHoje === undefined ? {} : { restanteHoje: ultimoRestanteHoje });

/* ─────────────────────────────── a leitura defensiva ─────────────────────────────── */

const ehTexto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const lista = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];

function lerExpressoes(c: Record<string, unknown>): { expressoes: ExpressaoDestacada[] } | null {
  if (!Array.isArray(c.expressoes)) return null;
  return {
    expressoes: lista(c.expressoes).flatMap((x) =>
      ehTexto(x.trecho) && ehTexto(x.sentido) && (x.tipo === 'idiomatica' || x.tipo === 'giria' || x.tipo === 'phrasal')
        ? [{ trecho: x.trecho, sentido: x.sentido, tipo: x.tipo }]
        : [],
    ),
  };
}

function lerTermos(c: Record<string, unknown>): { termos: TermoExplicado[] } | null {
  if (!Array.isArray(c.termos)) return null;
  return {
    termos: lista(c.termos).flatMap((x) =>
      ehTexto(x.termo) && ehTexto(x.explicacao) ? [{ termo: x.termo, explicacao: x.explicacao }] : [],
    ),
  };
}

const lerUmaSugestao = (x: Record<string, unknown>): SugestaoDeResposta[] =>
  ehTexto(x.texto) && ehTexto(x.traducao) && (x.tom === 'neutro' || x.tom === 'informal' || x.tom === 'formal')
    ? [{ texto: x.texto, traducao: x.traducao, tom: x.tom }]
    : [];

function lerSugestoes(c: Record<string, unknown>): { sugestoes: SugestaoDeResposta[] } | null {
  const sugestoes = lista(c.sugestoes).flatMap<SugestaoDeResposta>(lerUmaSugestao);
  return sugestoes.length >= 2 ? { sugestoes } : null;
}

function lerCorrecao(c: Record<string, unknown>): { correcao: CorrecaoDaFala } | null {
  const x = c.correcao as Record<string, unknown> | undefined;
  if (!x || typeof x.ok !== 'boolean' || !ehTexto(x.corrigida) || typeof x.dica !== 'string') return null;
  return { correcao: { ok: x.ok, corrigida: x.corrigida, dica: x.dica } };
}

/* ─────────────────────────────── o cache da aba ─────────────────────────────── */

/** Quantas entradas o cache de cada glosa guarda (as mais antigas saem primeiro). Só memória. */
export const TETO_DO_CACHE = 300;

function cacheLimitado<V>() {
  const m = new Map<string, V>();
  return {
    get: (k: string) => m.get(k),
    set: (k: string, v: V) => {
      if (m.has(k)) m.delete(k);
      m.set(k, v);
      while (m.size > TETO_DO_CACHE) m.delete(m.keys().next().value as string);
    },
    limpar: () => m.clear(),
  };
}

const chave = (...partes: string[]) => partes.map((p) => p.replace(/\s+/g, ' ').trim().toLowerCase()).join('|');
const cacheDeExpressoes = cacheLimitado<ExpressaoDestacada[]>();
const cacheDeTermos = cacheLimitado<string>();

/** Esquece as glosas guardadas (ao sair da conta ou trocar de idioma). */
export function esquecerCacheDoAssistente(): void {
  ultimoRestanteHoje = undefined;
  cacheDeExpressoes.limpar();
  cacheDeTermos.limpar();
}

/* ─────────────────────────────── as quatro chamadas ─────────────────────────────── */

/**
 * (1) As expressões idiomáticas e gírias da linha da legenda. Linha já vista nesta aba volta do cache, sem rede (e
 * com o último `restanteHoje` conhecido, porque não gastou nada).
 */
export async function destacarExpressoes(
  p: Idiomas & { frase: string },
): Promise<ResultadoDoAssistente<{ expressoes: ExpressaoDestacada[] }>> {
  const k = chave(p.lang, p.langDaPessoa, p.frase);
  const guardadas = cacheDeExpressoes.get(k);
  if (guardadas) return { ok: true, valor: { expressoes: guardadas, ...restanteDoCache() } };
  const r = await postar(
    '/api/ai/assistente/expressoes',
    { frase: p.frase, lang: p.lang, langDaPessoa: p.langDaPessoa },
    lerExpressoes,
  );
  if (r.ok) cacheDeExpressoes.set(k, r.valor.expressoes);
  return r;
}

/**
 * (3) O termo técnico ou a sigla da linha, em uma linha. Com `termos` (até 3, presentes na frase — a detecção local é
 * `candidatosATermo` em `src/core/assistente/termosCandidatos.ts`), só os que ainda não estão no cache vão à rede; sem
 * `termos`, o modelo escolhe até 2 na linha.
 */
export async function explicarTermos(
  p: Idiomas & { frase: string; termos?: ReadonlyArray<string> },
): Promise<ResultadoDoAssistente<{ termos: TermoExplicado[] }>> {
  const pedidos = (p.termos ?? []).slice(0, 3);
  const doCache = (t: string) => cacheDeTermos.get(chave(p.lang, p.langDaPessoa, t));
  const guardados = pedidos.flatMap((t) => {
    const explicacao = doCache(t);
    return explicacao ? [{ termo: t, explicacao }] : [];
  });
  const faltam = pedidos.filter((t) => !doCache(t));
  if (pedidos.length && !faltam.length) return { ok: true, valor: { termos: guardados, ...restanteDoCache() } };
  const r = await postar(
    '/api/ai/assistente/termos',
    {
      frase: p.frase,
      ...(faltam.length ? { termos: faltam } : {}),
      lang: p.lang,
      langDaPessoa: p.langDaPessoa,
    },
    lerTermos,
  );
  if (!r.ok) return r;
  for (const t of r.valor.termos) cacheDeTermos.set(chave(p.lang, p.langDaPessoa, t.termo), t.explicacao);
  return { ok: true, valor: { ...r.valor, termos: [...guardados, ...r.valor.termos] } };
}

/** O tipo do "Como respondo?" em fluxo (NDJSON, um evento por linha; `server/ai/assistente.ts`). */
export const TIPO_DO_FLUXO = 'application/x-ndjson';

/** Como o "Como respondo?" chega aos pedaços: quem pede recebe a lista a cada sugestão nova, e pode cancelar. */
export interface OpcoesDoFluxo {
  /** A lista até agora (cresce: 1, 2, 3), a cada sugestão que chega. Com ele, o pedido vai em fluxo. */
  aoSugerir?: (sugestoes: SugestaoDeResposta[]) => void;
  /** Cancela o pedido (e o fluxo): a conexão fecha e o servidor aborta a chamada ao provedor. */
  sinal?: AbortSignal;
}

/**
 * Lê o NDJSON do fluxo: cada `sugestao` vai para `aoSugerir`; o `fim` traz a lista final (a que vale); o `erro`, a
 * falha DEPOIS da primeira sugestão (o servidor não tem mais como mudar o status). Fluxo que acaba sem `fim` (a
 * conexão caiu) é `indisponivel`.
 */
async function lerFluxoDeSugestoes(
  res: Response,
  aoSugerir: (sugestoes: SugestaoDeResposta[]) => void,
): Promise<ResultadoDoAssistente<{ sugestoes: SugestaoDeResposta[] }>> {
  const falhou = (code?: string) => ({ ok: false as const, motivo: motivoDaFalha(502, code), status: res.status });
  const modelo = res.headers?.get?.('x-ia-modelo');
  const chegaram: SugestaoDeResposta[] = [];
  let final: ResultadoDoAssistente<{ sugestoes: SugestaoDeResposta[] }> | null = null;
  const lerLinha = (linha: string) => {
    if (!linha.trim() || final) return;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(linha) as Record<string, unknown>;
    } catch {
      return;
    }
    if (ev.tipo === 'sugestao' && ev.sugestao && typeof ev.sugestao === 'object') {
      const lida = lerUmaSugestao(ev.sugestao as Record<string, unknown>);
      if (lida.length && chegaram.length < 3) {
        chegaram.push(lida[0]);
        aoSugerir([...chegaram]);
      }
    } else if (ev.tipo === 'fim') {
      const lidas = lerSugestoes(ev);
      if (!lidas) {
        final = falhou();
        return;
      }
      const restanteHoje = typeof ev.restanteHoje === 'number' ? ev.restanteHoje : null;
      ultimoRestanteHoje = restanteHoje;
      final = { ok: true, valor: { ...lidas, restanteHoje, ...(modelo ? { modelo } : {}) } };
    } else if (ev.tipo === 'erro') {
      final = falhou(typeof ev.code === 'string' ? ev.code : undefined);
    }
  };
  try {
    const leitor = res.body?.getReader();
    if (!leitor) return falhou();
    const decodificador = new TextDecoder();
    let pendente = '';
    while (!final) {
      const { done, value } = await leitor.read();
      if (done) break;
      pendente += decodificador.decode(value, { stream: true });
      let i: number;
      while (!final && (i = pendente.indexOf('\n')) >= 0) {
        lerLinha(pendente.slice(0, i));
        pendente = pendente.slice(i + 1);
      }
    }
    if (!final) lerLinha(pendente);
    if (final) void leitor.cancel().catch(() => undefined);
  } catch {
    return { ok: false, motivo: 'indisponivel', status: 0 };
  }
  return final ?? falhou();
}

/**
 * (4) "Como respondo?": 3 respostas curtas no idioma da conversa, com a tradução. É ajuda de IDIOMA, sob demanda (a
 * tela nunca o apresenta como modo oculto ou para entrevistas). `contexto` (até 2 linhas anteriores da legenda) é
 * ignorado pelo servidor no perfil protegido.
 *
 * EM FLUXO (com `aoSugerir`): pede NDJSON e entrega cada sugestão assim que chega; o resultado é o mesmo de sempre (a
 * lista final). Um servidor que responde o JSON inteiro (o contrato antigo) também serve: a lista chega de uma vez.
 */
export async function comoRespondo(
  p: Idiomas & { frase: string; contexto?: ReadonlyArray<string> },
  opcoes: OpcoesDoFluxo = {},
): Promise<ResultadoDoAssistente<{ sugestoes: SugestaoDeResposta[] }>> {
  const contexto = (p.contexto ?? []).map((l) => l.trim()).filter(Boolean).slice(-2);
  const corpo = { frase: p.frase, ...(contexto.length ? { contexto } : {}), lang: p.lang, langDaPessoa: p.langDaPessoa };
  const { aoSugerir, sinal } = opcoes;
  if (!aoSugerir && !sinal) return postar('/api/ai/assistente/como-respondo', corpo, lerSugestoes);
  let res: Response;
  try {
    res = await apiFetch('/api/ai/assistente/como-respondo', {
      method: 'POST',
      ...(sinal ? { signal: comTeto(sinal, TEMPO_DO_ASSISTENTE_MS) } : { timeoutMs: TEMPO_DO_ASSISTENTE_MS }),
      headers: {
        'Content-Type': 'application/json',
        ...(aoSugerir ? { Accept: `${TIPO_DO_FLUXO}, application/json` } : {}),
      },
      body: JSON.stringify(corpo),
    });
  } catch {
    return { ok: false, motivo: 'indisponivel', status: 0 };
  }
  if (!res.ok) {
    const erro = await lerErro(res);
    return { ok: false, motivo: motivoDaFalha(res.status, erro.code, erro.detalhes), status: res.status };
  }
  if (aoSugerir && (res.headers?.get?.('content-type') ?? '').includes(TIPO_DO_FLUXO))
    return lerFluxoDeSugestoes(res, aoSugerir);
  return lerCorpoDeSucesso(res, lerSugestoes);
}

/** (5) A correção gentil do que a PRÓPRIA pessoa falou (a tela só chama com o opt-in ligado). */
export async function corrigirMinhaFala(
  p: Idiomas & { minhaFala: string },
): Promise<ResultadoDoAssistente<{ correcao: CorrecaoDaFala }>> {
  return postar(
    '/api/ai/assistente/correcao',
    { minhaFala: p.minhaFala, lang: p.lang, langDaPessoa: p.langDaPessoa },
    lerCorrecao,
  );
}
