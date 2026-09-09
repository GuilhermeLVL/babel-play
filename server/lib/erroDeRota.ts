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
import { cadeiaDeCausas } from './cadeiaDeCausas'
import { log } from './logger'

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
  const completa = err instanceof Error ? `${cadeiaDeCausas(err)}${err.stack ? `\n${err.stack}` : ''}` : String(err)

  /**
   * NIVEL PELO STATUS: 4xx e `warn`, 5xx e `error` (auditoria de 2026-09-07, achado A29).
   *
   * Tudo virava `error`, inclusive um 400 de corpo malformado — que e o cliente errando, nao o
   * servidor quebrando. Um diario onde a entrada mais comum e "alguem mandou JSON invalido" e um
   * diario que se aprende a ignorar, e foi assim que os 5xx de verdade ficaram invisiveis.
   *
   * Sem `status` declarado, continua `error`: quem nao disse o codigo pode estar respondendo 500,
   * e errar para o lado do ruido e melhor que errar para o lado do silencio.
   */
  const nivel = ctx.status !== undefined && ctx.status >= 400 && ctx.status < 500 ? 'warn' : 'error'
  // `log()` corta o campo `error` para manter a linha JSON legível; o texto integral vai
  // no console.error ao lado, que é o que um operador realmente lê ao investigar.
  /**
   * PRODUÇÃO NÃO GANHA O DUMP MULTILINHA — e a razão não é "stack vaza", é medida.
   *
   * O `console.error` ao lado imprimia a cadeia de causas e o stack inteiros, fora do logger e,
   * portanto, fora da allowlist. Medido em 2026-09-09 (ver `server/lib/redacao.ts`): o drizzle
   * escreve os VALORES VINCULADOS dentro de `message` e de `stack`, então esse dump despejava o
   * conteúdo do usuário — texto de transcrição, e-mail, o que a escrita carregasse — em texto
   * livre no diário.
   *
   * Duas coisas mudam, e as duas são necessárias:
   *   - o stack passa a ir DENTRO da linha JSON, no campo `stack`, redigido por `log()`. Um
   *     agregador consegue ler isso; um dump multilinha ao lado, não — ele quebra o contrato de uma
   *     linha por evento que este logger tem desde o M-01.
   *   - o dump legível ao lado fica só FORA de produção, onde quem lê é uma pessoa no terminal e o
   *     banco é de desenvolvimento.
   *
   * `NODE_ENV` é lido aqui, e não em `config.ts`, porque esta é uma decisão de FORMATO de saída, do
   * mesmo tipo que o `console` já embute — não é configuração de comportamento do produto.
   */
  const desenvolvimento = process.env.NODE_ENV !== 'production'
  log(nivel, {
    ...ctx,
    error: String(err).slice(0, 300),
    // Só no nível `error`: um 400 de corpo malformado não precisa de stack, e enchê-lo de stack
    // é como o diário voltava a ficar ilegível (achado A29, o mesmo que separou warn de error).
    stack: nivel === 'error' ? completa.slice(0, 1200) : undefined,
  })
  if (desenvolvimento) {
    if (nivel === 'error') console.error(`[${ctx.event}]`, completa)
    else console.warn(`[${ctx.event}]`, String(err).slice(0, 300))
  }

  return ctx.requestId ? `${MENSAGEM_PARA_O_CLIENTE} (req: ${ctx.requestId})` : MENSAGEM_PARA_O_CLIENTE
}
