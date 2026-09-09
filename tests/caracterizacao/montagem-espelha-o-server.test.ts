/**
 * TODO ROUTER PRIVADO DO SERVIDOR É CONHECIDO PELA CARACTERIZAÇÃO — ou a suíte cai.
 *
 * Até a Fase 3 este teste comparava duas MONTAGENS: o harness repetia o `server.ts` linha a linha e
 * ele cobrava que as duas listas não divergissem. A duplicação acabou — o harness chama o mesmo
 * `criarApp()` que produção chama —, então a pergunta mudou de "as montagens são iguais?" para a
 * que continua valendo: "a rede de caracterização SABE de todos os routers?".
 *
 * Lê `server/http/app.ts` como texto e extrai cada `app.use("/api/...", capturarAssincrono(x))`;
 * compara com `ROUTERS_PRIVADOS`. Um router novo no servidor sem entrada na lista falha aqui, e
 * não numa suíte que passa por não testar o que não conhece.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { ROUTERS_PRIVADOS } from './_app'

describe('montagem do app x routers declarados na caracterizacao', () => {
  it('os routers privados sao os mesmos, na mesma ordem', () => {
    const fonte = readFileSync('server/http/app.ts', 'utf8')
    const doServidor: Array<[string, string]> = []
    // ASPAS DE QUALQUER TIPO — ver rate-limit-escrita.test.ts. Este teste le `app.ts` como
    // TEXTO, e o prettier da Fase 3 (`singleQuote` em `server/**`) reescreveu o arquivo: a
    // regex com aspas duplas passou a casar com ZERO mounts, e o teste caiu comparando os 14
    // routers do harness com uma lista vazia. Um teste de texto nao pode depender do formatador.
    for (const m of fonte.matchAll(/app\.use\(['"`](\/api\/[a-z-]+)['"`],\s*capturarAssincrono\((\w+)\)\)/g)) {
      doServidor.push([m[1], m[2]])
    }
    // Os públicos (webhook e rank) ficam antes do auth e o harness os monta à parte.
    const privados = doServidor.filter(([c]) => c !== '/api/billing/webhook/asaas' && c !== '/api/rank')
    const doHarness = ROUTERS_PRIVADOS.map(([caminho, , nome]) => [caminho, nome])
    expect(doHarness).toEqual(privados)
  })
})
