/**
 * SSRF POR DNS REBINDING (auditoria de segurança 2026-09-26, CWE-918 / CWE-367).
 *
 * `assertPublicUrl` resolve o nome e recusa IP interno — e depois o `fetch` resolve o MESMO nome
 * de novo, por conta própria, na hora de conectar. Entre as duas resoluções o dono do domínio
 * troca a resposta (TTL 0): a guarda vê um IP público, a conexão vai para 127.0.0.1, para a rede
 * privada do Fly (6PN, `fdaa::/16`) ou para a porta interna de métricas. É a classe de bypass que
 * as correções do GAP-002 não fecharam, porque elas validam o NOME e não a CONEXÃO.
 *
 * A correção valida o IP no `lookup` do próprio socket (`despachanteSeguro` em
 * `server/ai/ssrf.ts`): o endereço conferido é, por construção, o endereço conectado.
 *
 * Os casos simulam o rebinding do jeito mais honesto possível sem DNS de laboratório: a guarda de
 * nome é neutralizada (é o que um rebinding bem-sucedido faz com ela) e o alvo é `localhost` — um
 * NOME, para o `lookup` do socket ser chamado, apontando para um servidor local.
 */
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../server/ai/ssrf', async (original) => {
  const real = await original<typeof import('../../server/ai/ssrf')>()
  /* A guarda de NOME deixa passar — como deixaria no instante em que o domínio do atacante ainda
     resolvia para um IP público. O resto do módulo (o despachante) é o real. */
  return { ...real, assertPublicUrl: vi.fn(async () => {}) }
})

import { despachanteSeguro, ehDestinoBloqueado, lookupSoPublico } from '../../server/ai/ssrf'
import { extractArticle } from '../../server/import/web'

let alvo: Server
let porta = 0
let visitas = 0

beforeAll(async () => {
  alvo = createServer((_req, res) => {
    visitas++
    res.setHeader('content-type', 'text/html')
    res.end('<html><body><article><p>segredo interno do servidor, que nao podia sair daqui</p></article></body></html>')
  })
  await new Promise<void>((ok) => alvo.listen(0, '127.0.0.1', () => ok()))
  const e = alvo.address()
  porta = typeof e === 'object' && e ? e.port : 0
})

afterAll(async () => {
  await new Promise<void>((ok) => alvo.close(() => ok()))
})

describe('o IP é conferido na CONEXÃO, não só no nome', () => {
  it('lookupSoPublico recusa um nome que resolve para loopback', async () => {
    const erro = await new Promise<unknown>((ok) => lookupSoPublico('localhost', {}, (err) => ok(err)))
    expect(ehDestinoBloqueado(erro)).toBe(true)
  })

  it('fetch com o despachante seguro não chega a um servidor em localhost', async () => {
    const antes = visitas
    const erro = await fetch(`http://localhost:${porta}/`, {
      dispatcher: despachanteSeguro,
    } as RequestInit).then(
      () => null,
      (e: unknown) => e,
    )
    expect(erro, 'a conexão com loopback deveria ter sido recusada').toBeTruthy()
    expect(ehDestinoBloqueado(erro), 'o motivo tem de ser a guarda de SSRF, não um erro de rede qualquer').toBe(true)
    expect(visitas, 'o servidor interno recebeu a requisição').toBe(antes)
  })

  it('importação de página: com a guarda de nome enganada, a conexão ainda é recusada', async () => {
    const antes = visitas
    await expect(extractArticle(`http://localhost:${porta}/artigo`)).rejects.toThrow()
    expect(visitas, 'o conteúdo interno foi buscado').toBe(antes)
  })
})

describe('todo fetch para URL escolhida pelo usuário usa o despachante', () => {
  /* Estrutural, e de propósito: as rotas BYOK têm dezenas de testes que trocam o `fetch` global
     por um dublê, e um dublê não conecta em nada. O que se trava aqui é a LIGAÇÃO — cada guarda de
     nome no arquivo tem o seu fetch com o despachante ao lado. */
  for (const arquivo of ['server/ai/proxy.ts', 'server/ai/sttProxy.ts', 'server/import/web.ts']) {
    it(arquivo, () => {
      const fonte = readFileSync(arquivo, 'utf8')
      const guardas = fonte.match(/await assertPublicUrl\(/g)?.length ?? 0
      const despachos = fonte.match(/dispatcher: despachanteSeguro/g)?.length ?? 0
      expect(guardas).toBeGreaterThan(0)
      expect(despachos, 'fetch depois de assertPublicUrl sem `dispatcher: despachanteSeguro`').toBe(guardas)
      /* E sem seguir redirect: um 302 para IP LITERAL (`http://169.254.169.254/`) não passa pelo
         `lookup` do socket, então só a recusa de seguir fecha esse caminho. O STT com credencial
         própria seguia (achado desta auditoria; o GAP-002 corrigiu só o proxy de chat). */
      const manuais = fonte.match(/redirect: 'manual'/g)?.length ?? 0
      expect(manuais, 'fetch para URL do usuário seguindo redirect').toBeGreaterThanOrEqual(guardas)
    })
  }
})
