/**
 * F4-02 — rate limit nas rotas de ESCRITA.
 *
 * O que a auditoria mediu: `express.raw` bufferiza o corpo inteiro antes do handler, cada upload
 * de áudio no teto custa 120,02 MB de RSS, e o container tem 1 GB. Oito requisições simultâneas
 * bastam — e `/api/sessions` não passava por limitador nenhum, porque a montagem só cobria
 * `/api/ai`, `/api/import` e `/api/tutor` (mais o alias antigo do tutor, removido desde então).
 *
 * Lê `server/http/app.ts`: a montagem saiu do `server.ts` quando a Fase 3 extraiu `criarApp()`.
 *
 * O que este teste trava, sem subir servidor: a CONFIGURAÇÃO. É o que estava errado — não a
 * implementação do `express-rate-limit`, que é de terceiros e já é exercitada pelas rotas caras.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

const servidor = readFileSync(path.resolve(import.meta.dirname, '..', '..', 'server', 'http', 'app.ts'), 'utf8')

/** As rotas de escrita que a auditoria listou como descobertas (F4-02 / D6). */
const ROTAS_DE_ESCRITA = [
  '/api/sessions', // upload de áudio de 120 MB e criação de sessão com até 5.000 falas
  '/api/vocab', // bulk-add
  '/api/settings',
  '/api/exercises',
  '/api/metrics',
  '/api/images', // faz fetch externo ao Openverse
  '/api/me', // DELETE apaga 17 tabelas; exportar lê a conta inteira
]

describe('F4-02 — rate limit cobre as rotas de escrita', () => {
  it('todas as rotas descobertas pela auditoria passam pelo writeLimiter', () => {
    // Ancorado no ARRAY que precede a montagem. Duas versões anteriores erraram aqui: uma exigia
    // `[` colado no `app.use(` e quebrou com um comentário no meio; a outra casava do primeiro
    // `app.use(` do arquivo até a DECLARAÇÃO do `writeLimiter`, não até a montagem.
    const bloco = /\[([^\]]*)\],\s*writeLimiter/.exec(servidor)
    expect(bloco, 'o writeLimiter não está montado sobre uma lista de rotas').not.toBeNull()
    for (const rota of ROTAS_DE_ESCRITA) {
      // ASPAS DE QUALQUER TIPO. A versao anterior exigia aspas DUPLAS, e o prettier da Fase 3
      // (`singleQuote` em `server/**`) reescreveu o arquivo — o teste passou a falhar por causa do
      // formatador, sobre uma montagem que continuava certa. O que ele cobra e a rota estar na
      // lista, nao o caractere que a envolve.
      expect(bloco![1], `${rota} ficou fora do writeLimiter`).toMatch(new RegExp(`['"\`]${rota}['"\`]`))
    }
  })

  it('o writeLimiter conta no BANCO e por tenant, não por IP e em memória', () => {
    // Foi o furo P1-2/P1-3 da auditoria v2 nas rotas caras: atrás de proxy reverso um usuário
    // esgotava a cota dos outros, e o teto virava por réplica. O limitador novo não pode repetir.
    const decl = /const writeLimiter = rateLimit\(\{([\s\S]*?)\}\)/.exec(servidor)
    expect(decl, 'writeLimiter não declarado').not.toBeNull()
    expect(decl![1]).toContain('keyGenerator: chaveDoRequest')
    expect(decl![1]).toMatch(/store: createDbRateLimitStore\(/)
  })

  /**
   * UM BALDE POR LIMITADOR (auditoria de 2026-09-07, achado A27).
   *
   * Os dois `rateLimit` criavam o store com a MESMA métrica, então contavam no mesmo balde: 60
   * salvamentos de transcrição esgotavam a cota de IA da pessoa, e o `RateLimit-Remaining` do
   * cabeçalho não correspondia a nenhum dos dois tetos.
   */
  it('cada limitador conta no próprio balde', () => {
    // `\n\s*\}\)` e nao `\n\}\)`: dentro do `criarApp()` as declaracoes sao indentadas.
    const caro = /const expensiveLimiter = rateLimit\(\{([\s\S]*?)\n\s*\}\)/.exec(servidor)
    const escrita = /const writeLimiter = rateLimit\(\{([\s\S]*?)\n\s*\}\)/.exec(servidor)
    expect(caro![1]).toContain('METRIC_RATELIMIT_CARO')
    expect(escrita![1]).toContain('METRIC_RATELIMIT_ESCRITA')
  })

  it('não penaliza leitura — GET e HEAD são pulados', () => {
    const decl = /const writeLimiter = rateLimit\(\{([\s\S]*?)\n\s*\}\)/.exec(servidor)
    expect(decl![1]).toMatch(/skip:.*GET.*HEAD/s)
  })

  it('só vale em modo público — no self-host o dono é o único usuário', () => {
    const trecho = servidor.slice(servidor.indexOf('F4-02: as rotas de escrita'))
    expect(trecho.slice(0, 200)).toContain('if (authRequired())')
  })
})

/**
 * O LOTE DA IMPORTAÇÃO DO ANKI FICA FORA DO `writeLimiter` (Fase 3 da migração, Task 3).
 *
 * Um import de 50.000 notas são 100 lotes de 500, mandados em sequência pelo navegador em bem menos
 * de um minuto — 120 escritas por minuto o cortariam no meio. Ele conta num balde PRÓPRIO
 * (`loteDeImportLimiter`, 200/min), além dos tetos da rota (500 por lote, 50.000 por import, corpo sob
 * `LIMITE_GRANDE`). Este caso sobe o app de verdade em modo público e mede: 200 lotes passam, o 201º
 * leva 429, e os lotes não gastam o balde da escrita — a outra escrita da mesma conta ainda tem os
 * 120 inteiros e só então leva 429.
 */
describe('writeLimiter × lote da importação do Anki', () => {
  let s: AppDeTeste
  beforeAll(async () => {
    s = await subirApp({ modo: 'publico', adultoPorPadrao: true })
  }, 60_000)
  afterAll(async () => {
    await s?.encerrar()
  })

  it('200 POSTs em /api/anki/imports/:id/notas passam e o 201º leva 429 do balde próprio; a escrita segue intacta', async () => {
    /* O balde é o MINUTO DO RELÓGIO (`rateLimitStore.ts`): perto da virada, espera o próximo — o
       teste mede o teto, não a sorte do relógio (mesmo cuidado de `limites-de-leitura.test.ts`). */
    const resta = 60_000 - (Date.now() % 60_000)
    if (resta < 40_000) await new Promise((r) => setTimeout(r, resta + 50))

    const token = await s.token('quem-importa-em-lotes')
    const abrir = await s.post(
      '/api/anki/imports',
      {
        arquivo: 'grande.apkg',
        bytes: 1,
        formato: 'collection.anki21b',
        campos: ['Front', 'Back'],
        totalNoArquivo: 201,
        truncado: false,
        amostra: [],
      },
      token,
    )
    expect(abrir.status).toBe(200)
    const { importId, deckId } = (await abrir.json()) as { importId: string; deckId: string }

    // 201 lotes: os 200 primeiros passam (o `writeLimiter` não os conta); o 201º bate no balde PRÓPRIO.
    const statusDosLotes: number[] = []
    for (let i = 0; i < 201; i++) {
      const r = await s.post(
        `/api/anki/imports/${importId}/notas`,
        {
          notas: [
            { guid: `g-${i}`, campos: [], camposBrutos: {}, frente: `palavra${i}`, verso: `tradução${i}`, tags: [] },
          ],
        },
        token,
      )
      await r.arrayBuffer()
      statusDosLotes.push(r.status)
    }
    expect(new Set(statusDosLotes.slice(0, 200))).toEqual(new Set([200]))
    expect(statusDosLotes[200], 'o lote não tem teto nenhum').toBe(429)

    // A outra escrita da mesma conta: o balde estava intacto (só o `abrir` contou) e acaba em 429.
    // E o balde dos lotes esgotado não a afeta: são baldes separados.
    let primeiro429 = 0
    for (let i = 0; i < 130 && !primeiro429; i++) {
      const r = await s.post(`/api/anki/decks/${deckId}/desativar`, {}, token)
      await r.arrayBuffer()
      if (r.status === 429) primeiro429 = i + 1
    }
    expect(primeiro429, 'a outra rota de escrita nunca foi barrada').toBeGreaterThan(0)
    expect(primeiro429, 'os lotes gastaram o balde da escrita').toBeGreaterThanOrEqual(119)
  }, 120_000)
})
