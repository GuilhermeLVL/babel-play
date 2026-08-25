/**
 * Achata a cadeia de `cause`. A mensagem útil do driver quase nunca está em `message`:
 * o drizzle põe "Failed query: insert into…" ali e a causa real (`SQLITE_BUSY`) em `cause`.
 * `Set` de visitados porque `cause` pode ser circular.
 */
export function cadeiaDeCausas(err: unknown, separador = '\n  causado por: '): string {
  const partes: string[] = []
  const vistos = new Set<unknown>()
  let atual: unknown = err
  while (atual && !vistos.has(atual)) {
    vistos.add(atual)
    if (atual instanceof Error) {
      partes.push(atual.message)
      atual = (atual as Error & { cause?: unknown }).cause
    } else {
      partes.push(String(atual))
      break
    }
  }
  return partes.join(separador)
}
