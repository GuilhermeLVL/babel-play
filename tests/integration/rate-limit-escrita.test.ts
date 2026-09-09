/**
 * F4-02 — rate limit nas rotas de ESCRITA.
 *
 * O que a auditoria mediu: `express.raw` bufferiza o corpo inteiro antes do handler, cada upload
 * de áudio no teto custa 120,02 MB de RSS, e o container tem 1 GB. Oito requisições simultâneas
 * bastam — e `/api/sessions` não passava por limitador nenhum, porque a montagem só cobria
 * `/api/ai`, `/api/import` e `/api/gemini`.
 *
 * Lê `server/http/app.ts`: a montagem saiu do `server.ts` quando a Fase 3 extraiu `criarApp()`.
 *
 * O que este teste trava, sem subir servidor: a CONFIGURAÇÃO. É o que estava errado — não a
 * implementação do `express-rate-limit`, que é de terceiros e já é exercitada pelas rotas caras.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect,it } from 'vitest'

const servidor = readFileSync(path.resolve(import.meta.dirname, '..', '..', 'server', 'http', 'app.ts'), 'utf8')

/** As rotas de escrita que a auditoria listou como descobertas (F4-02 / D6). */
const ROTAS_DE_ESCRITA = [
  '/api/sessions',   // upload de áudio de 120 MB e criação de sessão com até 5.000 falas
  '/api/vocab',      // bulk-add
  '/api/settings',
  '/api/exercises',
  '/api/metrics',
  '/api/images',     // faz fetch externo ao Openverse
  '/api/me',         // DELETE apaga 17 tabelas; exportar lê a conta inteira
]

describe('F4-02 — rate limit cobre as rotas de escrita', () => {
  it('todas as rotas descobertas pela auditoria passam pelo writeLimiter', () => {
    // Ancorado no ARRAY que precede a montagem. Duas versões anteriores erraram aqui: uma exigia
    // `[` colado no `app.use(` e quebrou com um comentário no meio; a outra casava do primeiro
    // `app.use(` do arquivo até a DECLARAÇÃO do `writeLimiter`, não até a montagem.
    const bloco = /\[([^\]]*)\],\s*writeLimiter/.exec(servidor)
    expect(bloco, 'o writeLimiter não está montado sobre uma lista de rotas').not.toBeNull()
    for (const rota of ROTAS_DE_ESCRITA) {
      expect(bloco![1], `${rota} ficou fora do writeLimiter`).toContain(`"${rota}"`)
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
