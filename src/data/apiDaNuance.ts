/**
 * O CLIENTE DA TRADUÇÃO NUANCE (Fase D): a tradução no nível `nuance` ao tocar numa frase, as
 * "Outras formas" e o glossário pessoal.
 *
 * Arquivo IRMÃO de `src/data/api.ts`, como `apiAnki.ts`, e FORA da fachada de propósito: só as telas
 * da Nuance o importam, e elas chegam por `import()` — o JS inicial não paga por ele. Não há espelho
 * sem conta (`/api/ai` está em `SO_COM_CONTA`, `tests/contratos/rotas-espelhadas.test.ts`): sem conta
 * a rota responde que exige conta, e a tela diz isso.
 *
 * As funções NÃO lançam: devolvem `{ ok: false, motivo }`, e a tela decide a frase. "Sem a Nuance",
 * "nuvem ocupada" e "fora do ar" pedem reações diferentes (o convite, o "tente em instantes", o aviso).
 *
 * Rotas: POST `/api/ai/mt` (com `nivel: 'nuance'`), POST `/api/ai/mt/alternativas`,
 * GET/POST `/api/ai/glossario`, DELETE `/api/ai/glossario/:id`.
 */
import type { RegistroDaTraducao, VarianteDaTraducao } from '../lib/traducao/promptComunicativo';
import { apiFetch, lerErro } from './funil';

export type FalhaDaNuance =
  | 'exige_nuance'
  | 'sem_conta'
  | 'nuvem_ocupada'
  | 'glossario_cheio'
  | 'invalido'
  | 'indisponivel';

export type ResultadoDaNuance<T> = { ok: true; valor: T } | { ok: false; motivo: FalhaDaNuance; status: number };

function motivoDaFalha(status: number, code: string | undefined): FalhaDaNuance {
  if (status === 402) return 'exige_nuance';
  if (status === 401 || status === 403 || code === 'exige_conta') return 'sem_conta';
  if (status === 429) return 'nuvem_ocupada';
  if (status === 409 && code === 'glossario_cheio') return 'glossario_cheio';
  if (status === 400) return 'invalido';
  return 'indisponivel';
}

async function chamar<T>(caminho: string, init: RequestInit, ler: (corpo: unknown) => T | null): Promise<ResultadoDaNuance<T>> {
  let res: Response;
  try {
    res = await apiFetch(caminho, init);
  } catch {
    return { ok: false, motivo: 'indisponivel', status: 0 };
  }
  if (!res.ok) {
    const erro = await lerErro(res);
    return { ok: false, motivo: motivoDaFalha(res.status, erro.code), status: res.status };
  }
  const valor = ler(await res.json().catch(() => null));
  return valor === null ? { ok: false, motivo: 'indisponivel', status: res.status } : { ok: true, valor };
}

const json = (corpo: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corpo),
});

export interface PedidoDeNuance {
  texto: string;
  src?: string | null;
  tgt: string;
  registro?: RegistroDaTraducao;
  variante?: VarianteDaTraducao;
  /** As falas anteriores (≤ 3), para pronome e tempo. */
  contexto?: ReadonlyArray<string>;
  /** Fala do microfone (o prompt do intérprete) ou texto (o tradutor fiel). */
  falada?: boolean;
}

/** A tradução no nível `nuance` — o servidor rebaixa para a rápida quem não tem a capacidade. */
export function traduzirComNuance(p: PedidoDeNuance): Promise<ResultadoDaNuance<{ texto: string }>> {
  return chamar(
    '/api/ai/mt',
    json({
      text: p.texto,
      src: p.src || undefined,
      tgt: p.tgt,
      nivel: 'nuance',
      registro: p.registro,
      variante: p.variante,
      contexto: p.contexto?.slice(-3),
      falada: p.falada === true,
    }),
    (c) => {
      const texto = (c as { text?: unknown } | null)?.text;
      return typeof texto === 'string' && texto ? { texto } : null;
    },
  );
}

export interface AlternativasDaFrase {
  /** Até 3 formas de dizer, diferentes da tradução atual. */
  opcoes: string[];
  /** Uma nota curta sobre a diferença entre elas (pode vir vazia). */
  nota: string;
}

/** "Outras formas" (D4): até 3 opções e uma nota. Só com a Tradução Nuance (402 sem ela). */
export function pedirAlternativas(
  p: PedidoDeNuance & { traducaoAtual?: string },
): Promise<ResultadoDaNuance<AlternativasDaFrase>> {
  return chamar(
    '/api/ai/mt/alternativas',
    json({
      text: p.texto,
      src: p.src || undefined,
      tgt: p.tgt,
      traducaoAtual: p.traducaoAtual || undefined,
      registro: p.registro,
      variante: p.variante,
      contexto: p.contexto?.slice(-3),
    }),
    (c) => {
      const o = (c ?? {}) as { opcoes?: unknown; nota?: unknown };
      const opcoes = Array.isArray(o.opcoes) ? o.opcoes.filter((x): x is string => typeof x === 'string' && !!x) : [];
      return opcoes.length ? { opcoes: opcoes.slice(0, 3), nota: typeof o.nota === 'string' ? o.nota : '' } : null;
    },
  );
}

export interface EntradaDoGlossario {
  id: string;
  termo: string;
  traducao: string;
  origem: string;
  destino: string;
  atualizadoEm: number;
}

const ehEntrada = (e: unknown): e is EntradaDoGlossario => {
  const o = (e ?? {}) as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.termo === 'string' && typeof o.traducao === 'string';
};

export function listarGlossario(): Promise<ResultadoDaNuance<{ entradas: EntradaDoGlossario[]; limite: number }>> {
  return chamar('/api/ai/glossario', { method: 'GET' }, (c) => {
    const o = (c ?? {}) as { entradas?: unknown; limite?: unknown };
    if (!Array.isArray(o.entradas)) return null;
    return { entradas: o.entradas.filter(ehEntrada), limite: typeof o.limite === 'number' ? o.limite : 500 };
  });
}

/** "Sempre traduzir assim". */
export function fixarNoGlossario(e: {
  termo: string;
  traducao: string;
  origem: string;
  destino: string;
}): Promise<ResultadoDaNuance<EntradaDoGlossario>> {
  return chamar('/api/ai/glossario', json(e), (c) => {
    const entrada = (c as { entrada?: unknown } | null)?.entrada;
    return ehEntrada(entrada) ? entrada : null;
  });
}

export function apagarDoGlossario(id: string): Promise<ResultadoDaNuance<true>> {
  return chamar(`/api/ai/glossario/${encodeURIComponent(id)}`, { method: 'DELETE' }, () => true as const);
}
