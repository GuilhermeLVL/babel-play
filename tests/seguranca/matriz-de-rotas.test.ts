/**
 * MATRIZ ROTA × GUARDA (Fase 4 da rodada de saneamento).
 *
 * A pergunta que este arquivo responde é a que a auditoria de 2026-09-07 não conseguia responder
 * sem ler o `app.ts` inteiro de cabo a rabo: QUAL rota deste servidor está aberta, e QUAL rota de
 * escrita não tem teto. As duas respostas moram na ORDEM da montagem, não no arquivo do router — e
 * por isso a leitura é do `app._router.stack` em tempo de execução (ver `_matriz.ts` para o porquê
 * de a versão estática ter sido descartada).
 *
 * O teste cobra três coisas:
 *   1. toda rota PÚBLICA está na allowlist abaixo, com a razão escrita;
 *   2. toda rota PRIVADA de ESCRITA passa por um limitador (modo público), ou tem exceção escrita;
 *   3. a matriz sai em Markdown com `MATRIZ=1`, para o relatório.
 *
 * Rodar a tabela:  MATRIZ=1 npx vitest run tests/seguranca/matriz-de-rotas.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'
import { imprimirSePedido, lerMatriz, type Matriz } from './_matriz'

/**
 * AS ROTAS PÚBLICAS POR DESENHO — e o motivo de cada uma.
 *
 * A lista é NOMEADA aqui, e não derivada da montagem, porque o valor do teste está justamente em
 * ela discordar do código: uma rota que sai de trás do `authMiddleware` por descuido não vira
 * "comportamento novo", vira falha com o nome dela na mensagem.
 */
const PUBLICAS_POR_DESENHO: Record<string, string> = {
  'GET /api/health':
    'probe de deploy. Precisa responder antes de existir identidade — e responde só status do processo e conectividade do banco, sem dado de ninguém.',
  'POST /api/billing/webhook/asaas':
    'o Asaas não tem JWT de usuário nenhum. A autenticação é própria (header `asaas-access-token`, comparação em tempo constante) e sem o segredo configurado ela recusa tudo.',
  'GET /api/rank/:jogo':
    'placar global, anônimo por desenho: sai apelido, pontos e combo, e precisa funcionar igual com e sem conta. Exigir token o quebraria no modo para o qual ele foi feito.',
  'POST /api/rank/:jogo':
    'o envio do mesmo placar anônimo. Sem identidade para checar, as guardas são as de um fliperama (teto de pontos, apelido saneado, um envio por minuto por origem) — elas não impedem trapaça, impedem que a trapaça quebre a tabela.',
}

/**
 * ESCRITA PRIVADA SEM LIMITADOR — as exceções, com razão.
 *
 * Está VAZIA, e isso é o resultado da Fase 4: `/api/admin` e `/api/audio` eram os dois mounts
 * privados fora de qualquer limitador, e entraram no `writeLimiter` do `app.ts`. Uma entrada nova
 * aqui é uma decisão registrada; a lista vazia é o estado que se quer manter.
 */
const ESCRITA_SEM_LIMITADOR: Record<string, string> = {}

describe('matriz rota x guarda (lida do Express em tempo de execucao)', () => {
  let s: AppDeTeste
  let m: Matriz

  beforeAll(async () => {
    s = await subirApp({ modo: 'publico' })
    /* Um SEGUNDO app, só para ler a montagem: `subirApp` não devolve o objeto do Express, e mexer
       no harness para expô-lo mudaria uma peça de que 300 testes dependem. `criarApp()` é puro do
       ponto de vista da pilha — o que ele monta depende só do ambiente, que o `subirApp` já fixou
       em modo público. Este app não escuta em porta nenhuma. */
    const { criarApp } = await s.load('../../server/http/app')
    m = lerMatriz(criarApp({}))
    imprimirSePedido(m)
  })
  afterAll(async () => {
    await s.encerrar()
  })

  it('a leitura da pilha encontrou o authMiddleware e um numero plausivel de rotas', () => {
    /* Sem esta âncora, uma mudança no formato interno do Express faria a matriz vir vazia e TODAS
       as outras asserções passariam por vacuidade — o gate que nasce verde. */
    expect(m.ordemDoAuth, 'authMiddleware não encontrado na pilha').toBeGreaterThan(0)
    expect(m.rotas.length).toBeGreaterThan(50)
    expect(m.limitadores.length).toBeGreaterThan(0)
    expect(m.rotas.every((r) => r.caminho.startsWith('/api/'))).toBe(true)
  })

  it('toda rota publica esta na allowlist, com a razao escrita', () => {
    const publicas = m.rotas
      .filter((r) => !r.privada)
      .map((r) => r.chave)
      .sort()
    const naoPrevistas = publicas.filter((c) => !(c in PUBLICAS_POR_DESENHO))
    expect(naoPrevistas, 'rota alcançável sem token e fora da allowlist de `matriz-de-rotas.test.ts`').toEqual([])
    /* O outro sentido: uma entrada que virou privada (ou sumiu) tem de sair da lista, senão a
       allowlist vira um documento que descreve um servidor que não existe mais. */
    const orfas = Object.keys(PUBLICAS_POR_DESENHO).filter((c) => !publicas.includes(c))
    expect(orfas, 'na allowlist e não é mais pública: apague a entrada').toEqual([])
  })

  it('as razoes da allowlist sao razoes, e nao rotulos', () => {
    for (const [chave, razao] of Object.entries(PUBLICAS_POR_DESENHO)) {
      expect(razao.trim().length, `${chave} sem razão escrita`).toBeGreaterThan(40)
    }
  })

  it('toda rota privada de ESCRITA passa por um limitador', () => {
    const descobertas = m.rotas
      .filter((r) => r.privada && r.escrita && r.limitadores.length === 0)
      .map((r) => r.chave)
      .filter((c) => !(c in ESCRITA_SEM_LIMITADOR))
    expect(
      descobertas,
      'escrita autenticada sem teto: monte no writeLimiter em `server/http/app.ts` ou registre a exceção com a razão',
    ).toEqual([])
  })

  it('as excecoes registradas ainda existem e ainda estao sem limitador', () => {
    for (const chave of Object.keys(ESCRITA_SEM_LIMITADOR)) {
      const r = m.rotas.find((x) => x.chave === chave)
      expect(r, `exceção para rota que não existe mais: ${chave}`).toBeTruthy()
      expect(r!.limitadores, `${chave} ganhou limitador: apague a exceção`).toEqual([])
    }
  })

  /**
   * O ACHADO QUE ORIGINOU A CORREÇÃO, travado como regressão.
   *
   * `/api/admin` são nove rotas cross-tenant e `/api/audio` é capacidade local; os dois estavam
   * fora de todo limitador. Este caso falha se alguém os tirar do `writeLimiter` de novo.
   */
  it('/api/admin e /api/audio estao cobertos (era o furo da auditoria)', () => {
    const admin = m.rotas.filter((r) => r.caminho.startsWith('/api/admin') && r.escrita)
    expect(
      admin.length,
      'nenhuma rota de escrita em /api/admin foi encontrada — a leitura quebrou',
    ).toBeGreaterThanOrEqual(4)
    for (const r of admin) expect(r.limitadores, `${r.chave} sem limitador`).not.toEqual([])
    const coberturaDeAudio = m.limitadores.some((l) => l.prefixos.includes('/api/audio'))
    expect(coberturaDeAudio, '/api/audio fora de todo limitador').toBe(true)
  })
})
