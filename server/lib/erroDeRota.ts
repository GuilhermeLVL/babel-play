/**
 * Erro de rota: LOGA inteiro, RESPONDE genérico.
 *
 * Os handlers faziam `String(err).slice(0, 200)` direto na resposta, sem logar nada. A
 * mensagem do drizzle começa com `Failed query: insert into "sessions" ("id", "created_at", …`
 * e o nome das colunas consome os 200 caracteres — a causa real (`SQLITE_BUSY: database is
 * locked`) ficava DE FORA. Na auditoria foi preciso sair do HTTP e instrumentar o driver
 * para descobrir por que 50% das escritas falhavam.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * F11-02 — POR QUE TRUNCAR NÃO BASTAVA, E O CABEÇALHO ANTERIOR ESTAVA ERRADO.
 *
 * Este arquivo afirmava que truncar servia para "não vazar schema/caminho para o cliente".
 * Medido em `audit/evidence/fase-11/vazamento-de-erro.json`, o oposto: dos 369 caracteres da
 * mensagem real, os 200 que sobreviviam continham a tabela e **12 das 15 colunas**, enquanto a
 * causa (`no such table`) — que fica no FIM — era exatamente a parte descartada.
 *
 * O corte protegia contra o *stack trace*, nunca contra o schema. Truncar pelo começo preserva
 * justamente o que não deve sair e joga fora o que seria útil.
 *
 * O conserto não é truncar mais: é parar de derivar a resposta da mensagem do erro. O cliente
 * recebe um texto estável mais o `requestId`, que é o que permite correlacionar com o log; o
 * log continua guardando tudo, inclusive a cadeia de causas e o stack.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
import { log } from './logger'
import { cadeiaDeCausas } from './cadeiaDeCausas'

export interface ContextoDeErro {
  /** Nome do evento, no padrão do logger (ex.: 'sessions_create_error'). */
  event: string
  route?: string
  status?: number
  requestId?: string
}

/** O que o cliente recebe. Estável por desenho: não deriva do erro, então não vaza com ele. */
const MENSAGEM_PARA_O_CLIENTE = 'erro interno'

/**
 * Registra o erro COMPLETO e devolve a mensagem que pode ir na resposta HTTP.
 * O logger tem allowlist de campos, então nada do usuário vaza junto.
 *
 * O `requestId` vai na resposta quando existe — é ele que liga o que o usuário viu à linha de
 * log que tem a causa. Sem esse elo, "erro interno" seria informação zero para os dois lados.
 */
export function erroDeRota(err: unknown, ctx: ContextoDeErro): string {
  const completa = err instanceof Error
    ? `${cadeiaDeCausas(err)}${err.stack ? `\n${err.stack}` : ''}`
    : String(err)

  // `log()` corta o campo `error` para manter a linha JSON legível; o texto integral vai
  // no console.error ao lado, que é o que um operador realmente lê ao investigar.
  log('error', { ...ctx, error: String(err).slice(0, 300) })
  console.error(`[${ctx.event}]`, completa)

  return ctx.requestId ? `${MENSAGEM_PARA_O_CLIENTE} (req: ${ctx.requestId})` : MENSAGEM_PARA_O_CLIENTE
}
