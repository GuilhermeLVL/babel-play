/**
 * O CLIENTE DA IA DE ESTUDO (planos v4, etapa 2): a explicação de uma frase (`POST /api/ai/explicar`, atrás
 * da flag `ia_de_estudo`).
 *
 * Irmão de `apiDaNuance.ts`, e fora da fachada pelo mesmo motivo: só a seção "Explicar esta frase" o
 * importa, e ela chega por `import()`. Não há espelho sem conta (`/api/ai` está em `SO_COM_CONTA`).
 *
 * `explicarFrase` NÃO lança: devolve `{ ok: false, motivo }`, e a tela escolhe a frase. O servidor decide
 * pelo `code` (não pelo texto); aqui só se traduz o `code` para um motivo que a tela entende. Nenhum motivo
 * carrega oferta: quem decide mostrar o link de Planos é a tela (adulto no Grátis, fim da amostra).
 */
import { apiFetch, lerErro } from './funil';

export type FalhaDoEstudo =
  | 'sem_conta'
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
  if (status === 401 || code === 'exige_conta' || code === 'sem_plano') return 'sem_conta';
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
