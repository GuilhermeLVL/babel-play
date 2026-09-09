/**
 * O HARNESS DE CARACTERIZAÇÃO REPETE A MONTAGEM DO `server.ts` — e este teste cobra que as duas
 * não divirjam até a Fase 3 extrair `criarApp()`.
 *
 * Lê o `server.ts` como texto e extrai cada `app.use("/api/...", capturarAssincrono(xRouter))`;
 * compara com `ROUTERS_PRIVADOS` do harness. Um router novo no servidor sem par no harness (ou o
 * contrário) falha aqui, e não numa suíte que passa por não testar o que não conhece.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ROUTERS_PRIVADOS } from './_app'

describe('montagem do harness x server.ts', () => {
  it('os routers privados sao os mesmos, na mesma ordem', () => {
    const fonte = readFileSync('server.ts', 'utf8')
    const doServidor: Array<[string, string]> = []
    for (const m of fonte.matchAll(/app\.use\("(\/api\/[a-z-]+)",\s*capturarAssincrono\((\w+)\)\)/g)) {
      doServidor.push([m[1], m[2]])
    }
    // Os públicos (webhook e rank) ficam antes do auth e o harness os monta à parte.
    const privados = doServidor.filter(([c]) => c !== '/api/billing/webhook/asaas' && c !== '/api/rank')
    const doHarness = ROUTERS_PRIVADOS.map(([caminho, , nome]) => [caminho, nome])
    expect(doHarness).toEqual(privados)
  })
})
