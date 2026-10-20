/**
 * TRABALHO DEPOIS DA RESPOSTA (Task 11 da Fase 2).
 *
 * Num Worker, uma promessa solta morre com o fim da requisição: o envelope do Sentry, o lote do
 * Langfuse e o recálculo de dificuldade depois da rodada seriam cortados no meio. `emSegundoPlano`
 * entrega a promessa ao `ctx.waitUntil` da requisição (achado pelo `AsyncLocalStorage` aberto por
 * `comContextoDoWorker`); fora dele — o Node de sempre — só não espera, e a falha vai para o log.
 *
 * Os três lados provados aqui:
 *  1. Node: promessa rejeitada é logada (`segundo_plano_falhou`) e NUNCA vira exceção nem rejeição solta;
 *  2. Worker: dentro do contexto, a promessa chega ao `waitUntil` do dublê, que a espera sem rejeitar;
 *  3. a rota de rodada (`POST /api/exercises/rodada`) entrega o recálculo ao `waitUntil`.
 */
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import type { NextFunction, Request } from 'express'
import express from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'

const recalcular = vi.fn<(userId: string, cardIds: string[]) => Promise<void>>()

vi.mock('../../server/db/repositories/exerciseResults', () => ({
  exerciseResultsRepo: { addRodada: vi.fn(async () => ({ gravados: 1 })) },
}))
vi.mock('../../server/db/repositories/vocab', () => ({
  vocabRepo: { recalcularDificuldade: (u: string, c: string[]) => recalcular(u, c) },
}))
vi.mock('../../server/db/repositories/versoes', () => ({ versoesRepo: {} }))

import { comContextoDoWorker, emSegundoPlano } from '../../server/lib/runtime'
import { exercisesRouter } from '../../server/routes/exercises'

const guardaDoEnv = process.env.BABEL_RUNTIME

afterEach(() => {
  vi.restoreAllMocks()
  recalcular.mockReset()
  if (guardaDoEnv === undefined) delete process.env.BABEL_RUNTIME
  else process.env.BABEL_RUNTIME = guardaDoEnv
})

/** As linhas JSON que o logger escreveu no `console.error`. */
function linhasDoLog(espiao: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> {
  return espiao.mock.calls
    .map((c) => {
      try {
        return JSON.parse(String(c[0])) as Record<string, unknown>
      } catch {
        return {}
      }
    })
    .filter((l) => typeof l.event === 'string')
}

describe('emSegundoPlano no Node (fora de contexto de Worker)', () => {
  it('promessa rejeitada é logada como segundo_plano_falhou e nunca lança', async () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rejeicoesSoltas: unknown[] = []
    const ouvinte = (e: unknown) => rejeicoesSoltas.push(e)
    process.on('unhandledRejection', ouvinte)
    try {
      expect(() => emSegundoPlano(Promise.reject(new Error('caiu no fundo')))).not.toThrow()
      await new Promise((r) => setTimeout(r, 20))
    } finally {
      process.off('unhandledRejection', ouvinte)
    }
    expect(rejeicoesSoltas).toEqual([])
    const linhas = linhasDoLog(espiao).filter((l) => l.event === 'segundo_plano_falhou')
    expect(linhas).toHaveLength(1)
    expect(linhas[0].level).toBe('error')
    expect(String(linhas[0].error)).toContain('caiu no fundo')
  })

  it('promessa que resolve não loga nada', async () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {})
    emSegundoPlano(Promise.resolve(42))
    await new Promise((r) => setTimeout(r, 10))
    expect(linhasDoLog(espiao).filter((l) => l.event === 'segundo_plano_falhou')).toEqual([])
  })
})

describe('emSegundoPlano dentro do contexto do Worker', () => {
  it('a promessa chega ao waitUntil, que a espera — e a falha não rejeita o waitUntil', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const entregues: Promise<unknown>[] = []
    const waitUntil = (p: Promise<unknown>) => void entregues.push(p)

    let terminou = false
    let soltar!: () => void
    const tarefa = new Promise<void>((ok) => (soltar = ok)).then(() => {
      terminou = true
    })
    comContextoDoWorker({ waitUntil }, () => {
      emSegundoPlano(tarefa)
      emSegundoPlano(Promise.reject(new Error('envelope perdido')))
    })

    expect(entregues).toHaveLength(2)
    expect(terminou).toBe(false)
    soltar()
    await Promise.all(entregues) // o waitUntil espera — e nenhuma das duas rejeita
    expect(terminou).toBe(true)
  })

  it('o contexto segue a cadeia assíncrona (depois de um await)', async () => {
    const entregues: Promise<unknown>[] = []
    await comContextoDoWorker({ waitUntil: (p) => void entregues.push(p) }, async () => {
      await new Promise((r) => setTimeout(r, 1))
      emSegundoPlano(Promise.resolve())
    })
    expect(entregues).toHaveLength(1)
  })

  it('fora do contexto, mesmo com BABEL_RUNTIME=worker, não lança (só não espera)', async () => {
    process.env.BABEL_RUNTIME = 'worker'
    expect(() => emSegundoPlano(Promise.resolve())).not.toThrow()
  })
})

describe('POST /api/exercises/rodada no Worker', () => {
  it('entrega o recálculo de dificuldade ao waitUntil da requisição', async () => {
    process.env.BABEL_RUNTIME = 'worker'
    let soltar!: () => void
    recalcular.mockImplementation(() => new Promise<void>((ok) => (soltar = ok)))
    const entregues: Promise<unknown>[] = []

    const app = express()
    app.use(express.json())
    app.use((req: Request, _res: unknown, next: NextFunction) => {
      ;(req as unknown as { userId: string }).userId = 'u-1'
      comContextoDoWorker({ waitUntil: (p) => void entregues.push(p) }, next)
    })
    app.use('/api/exercises', exercisesRouter)

    const servidor = await new Promise<Server>((ok) => {
      const s = app.listen(0, '127.0.0.1', () => ok(s))
    })
    const { port } = servidor.address() as AddressInfo
    let status: number
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/exercises/rodada`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roundId: 'r-1',
          exerciseKind: 'quiz',
          itens: [{ cardId: 'c-1', itemRef: 'casa', correct: 1 }],
        }),
      })
      status = r.status
    } finally {
      await new Promise<void>((ok) => servidor.close(() => ok()))
    }
    expect(status).toBe(200)
    expect(recalcular).toHaveBeenCalledWith('u-1', ['c-1'])
    expect(entregues, 'o recálculo não foi entregue ao waitUntil').toHaveLength(1)

    let resolvida = false
    void entregues[0].then(() => (resolvida = true))
    await new Promise((r) => setTimeout(r, 5))
    expect(resolvida, 'o waitUntil deveria esperar o recálculo terminar').toBe(false)
    soltar()
    await entregues[0]
    expect(resolvida).toBe(true)
  })
})

describe('telemetria depois da resposta no Worker', () => {
  it('Sentry: o POST do envelope vai para o waitUntil (e a falha de rede continua silenciosa)', async () => {
    const { sinkDoSentry } = await import('../../server/lib/sentry')
    let soltar!: (r: Response) => void
    const buscar = vi.fn(() => new Promise<Response>((ok) => (soltar = ok)))
    const sink = sinkDoSentry({ dsn: 'https://chave@o1.ingest.sentry.io/123', buscar: buscar as never })!
    const entregues: Promise<unknown>[] = []
    comContextoDoWorker({ waitUntil: (p) => void entregues.push(p) }, () => {
      sink({ level: 'error', event: 'teste_de_sentry', error: 'x' } as never)
    })
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(entregues, 'o envelope não foi entregue ao waitUntil').toHaveLength(1)
    soltar(new Response('', { status: 200 }))
    await entregues[0]

    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {})
    const falho = sinkDoSentry({
      dsn: 'https://chave@o1.ingest.sentry.io/123',
      buscar: (async () => Promise.reject(new Error('rede'))) as never,
    })!
    const outros: Promise<unknown>[] = []
    comContextoDoWorker({ waitUntil: (p) => void outros.push(p) }, () => {
      falho({ level: 'error', event: 'teste_de_sentry', error: 'y' } as never)
    })
    await Promise.all(outros)
    expect(linhasDoLog(espiao)).toEqual([])
  })

  it('Langfuse: sem relógio no Worker, e cada envio descarrega pelo waitUntil', async () => {
    process.env.BABEL_RUNTIME = 'worker'
    const { ClienteLangfuse } = await import('../../server/lib/langfuse')
    const relogio = vi.spyOn(globalThis, 'setInterval')
    const buscar = vi.fn(async () => new Response('', { status: 200 }))
    const c = new ClienteLangfuse({ chavePublica: 'pk', chaveSecreta: 'sk', buscar: buscar as never })
    expect(relogio, 'no Worker o setInterval não sobrevive entre requisições').not.toHaveBeenCalled()

    const entregues: Promise<unknown>[] = []
    comContextoDoWorker({ waitUntil: (p) => void entregues.push(p) }, () => {
      c.enviar({ id: 'a'.repeat(32), nome: 'stt', inicio: 1, fim: 2, tags: [], metadados: {}, geracoes: [] })
    })
    expect(entregues.length, 'o descarregamento não foi entregue ao waitUntil').toBeGreaterThan(0)
    await Promise.all(entregues)
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(c.pendentes()).toBe(0)
  })

  it('Langfuse: no Node o relógio continua (comportamento de sempre)', async () => {
    const { ClienteLangfuse } = await import('../../server/lib/langfuse')
    const relogio = vi.spyOn(globalThis, 'setInterval')
    const c = new ClienteLangfuse({
      chavePublica: 'pk',
      chaveSecreta: 'sk',
      buscar: (async () => new Response()) as never,
    })
    expect(relogio).toHaveBeenCalledTimes(1)
    await c.encerrar()
  })

  it('Langfuse: o fechamento do rastro (depois da resposta) também vai para o waitUntil', async () => {
    const { registrarFechamento, aguardarRastrosPendentes } = await import('../../server/lib/langfuse')
    let soltar!: () => void
    const p = new Promise<void>((ok) => (soltar = ok))
    const entregues: Promise<unknown>[] = []
    comContextoDoWorker({ waitUntil: (x) => void entregues.push(x) }, () => registrarFechamento(p))
    expect(entregues).toHaveLength(1)
    soltar()
    await Promise.all(entregues)
    await aguardarRastrosPendentes()
  })
})
