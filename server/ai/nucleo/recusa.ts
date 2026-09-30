/**
 * A RECUSA DO NÚCLEO DE IA — o "não" que não conhece o Express (Fase F, ganchos para API e MCP).
 *
 * Até a Fase F cada função de IA recusava ESCREVENDO na resposta: `responderNuvemOcupada(res, …)`,
 * `res.status(402).json(…)`. Isso prendia a regra ao HTTP do app: uma rota `/v1` com chave de API, ou
 * um servidor MCP, teria de reescrever a ordem das recusas — e a cópia é onde a regra diverge. Agora o
 * núcleo DEVOLVE a recusa como dado: o status HTTP equivalente, o código estável, a espera sugerida e
 * o corpo EXATO que o app responde hoje. Quem traduz para o transporte é o adaptador
 * (`server/ai/respostaDoNucleo.ts` no Express); o MCP, amanhã, traduz o mesmo objeto em erro de
 * ferramenta.
 *
 * O CORPO VAI PRONTO, e não reconstruído no adaptador, de propósito: as recusas de hoje têm formas
 * diferentes (o envelope `{ error, code, detalhes }`, o 402 com `entitlement` no topo, o 404 do bloco
 * com `blocos`), e os clientes já leem cada uma. Um adaptador que remontasse o corpo a partir do
 * `code` seria a décima forma.
 */
import type { Portao } from '../../lib/orcamentoDeIa'
import { envelopeDeErro } from '../../lib/respostaDeErro'
import type { Recusa } from '../admissao'

/** O corpo JSON da recusa: sempre um `error` em texto, às vezes um `code` e campos da própria rota. */
export type CorpoDaRecusa = { error: string; code?: string } & Record<string, unknown>

export interface RecusaDeIa {
  ok: false
  /** O status HTTP equivalente. A API `/v1` o usa como está; o MCP o mapeia para erro de ferramenta. */
  status: number
  /** O código estável (`corpo.code`), quando a recusa tem um. É ele que o cliente decide. */
  code?: string
  /** Segundos até valer tentar de novo — no HTTP vira o cabeçalho `Retry-After`. */
  retryAfterS?: number
  /** O corpo exatamente como a rota do app responde hoje. */
  corpo: CorpoDaRecusa
}

/** Monta a recusa. O `code` de cima é sempre o do corpo: um lugar só para o discriminador. */
export function recusar(status: number, corpo: CorpoDaRecusa, retryAfterS?: number): RecusaDeIa {
  return {
    ok: false,
    status,
    ...(typeof corpo.code === 'string' ? { code: corpo.code } : {}),
    ...(retryAfterS !== undefined ? { retryAfterS } : {}),
    corpo,
  }
}

/** A recusa no envelope padrão (`respostaDeErro.ts`): `{ error, code?, detalhes? }`. */
export function recusaDeErro(
  status: number,
  error: string,
  code?: string,
  detalhes?: Record<string, unknown>,
  retryAfterS?: number,
): RecusaDeIa {
  return recusar(status, envelopeDeErro(error, code, detalhes) as CorpoDaRecusa, retryAfterS)
}

/**
 * 429 `nuvem_ocupada` (ADR 0007): a admissão, ou o provedor, disse "agora não". O corpo é o que o
 * `responderNuvemOcupada` de antes da Fase F respondia — `tests/integration/nucleo-de-ia.test.ts` o
 * confere literal, cabeçalho incluído.
 */
export function recusaNuvemOcupada(recusa: Recusa): RecusaDeIa {
  return recusar(
    429,
    {
      error: 'A nuvem está cheia agora; o app segue com o motor local e volta à nuvem sozinho.',
      code: 'nuvem_ocupada',
      detalhes: { motivo: recusa.motivo, retryAfter: recusa.retryAfterS },
    },
    recusa.retryAfterS,
  )
}

/** 503 do portão da nuvem (chave de emergência, orçamento): o corpo de `responderPortaoFechado` (o mesmo teste). */
export function recusaPortaoFechado(portao: Portao): RecusaDeIa {
  return recusar(503, { error: portao.mensagem as string, code: portao.motivo })
}
