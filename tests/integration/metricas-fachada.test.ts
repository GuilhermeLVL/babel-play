/**
 * A FACHADA DE MÉTRICAS tem um backend por runtime (Task 10 da Fase 2).
 *
 * `server/http/metricas.ts` mantém a API de sempre (`contar*`, `observar*`, `middlewareDeMetricas`,
 * `handlerDeMetricas`), mas num Worker o `prom-client` não pode existir (usa `node:cluster` e
 * `perf_hooks`). Aqui o Node faz o papel do Worker pelo gancho `BABEL_RUNTIME=worker` e prova duas coisas:
 *
 *  1. com ele, o `prom-client` NUNCA é carregado (conferido no `require.cache`, que o teste esvazia antes);
 *  2. os ganchos não lançam e as contagens ficam num `Map` em memória.
 *
 * E o contrário: sem o gancho, o `prom-client` é carregado só no primeiro uso, e o `Map` fica vazio.
 */
import { createRequire } from 'node:module'

import type { NextFunction, Request, Response } from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const exigir = createRequire(import.meta.url)
const caminhoDoProm = exigir.resolve('prom-client')
const promNoCache = (): boolean => Object.keys(exigir.cache).includes(caminhoDoProm)

const guardaDoEnv = process.env.BABEL_RUNTIME

beforeEach(() => {
  vi.resetModules()
  delete exigir.cache[caminhoDoProm]
})
afterEach(() => {
  if (guardaDoEnv === undefined) delete process.env.BABEL_RUNTIME
  else process.env.BABEL_RUNTIME = guardaDoEnv
})

function respostaFalsa() {
  const r = { statusCode: 200, cabecalhos: {} as Record<string, string>, corpo: '' }
  const res = {
    setHeader: (k: string, v: string) => void (r.cabecalhos[k.toLowerCase()] = v),
    status: (c: number) => ((r.statusCode = c), res),
    json: (b: unknown) => ((r.corpo = JSON.stringify(b)), res),
    end: (c?: string) => ((r.corpo = c ?? ''), res),
    on: () => res,
  }
  return { res: res as unknown as Response, r }
}

describe('fachada de métricas no Worker (BABEL_RUNTIME=worker)', () => {
  it('não carrega o prom-client, não lança e soma as contagens em memória', async () => {
    process.env.BABEL_RUNTIME = 'worker'
    expect(promNoCache(), 'pré-condição: o cache foi esvaziado').toBe(false)
    const m = await import('../../server/http/metricas')

    expect(() => {
      m.contarCacheDeTraducao(true)
      m.contarCacheDeTraducao(false)
      m.contarNivelDoCacheDeTraducao('l1', true)
      m.contarUploadRecusado('usuario')
      m.contarGastoAnomalo('teto')
      m.contarCustoPorPlano('premium', 0.02)
      m.contarAdmissaoRecusada('minuto', 'free')
      m.contarDependenciaDegradada('armazenamento')
      m.contarDescartesDoStt('sem_fala', 2)
      m.medirUsoDoR2('ops_a', 0.5)
      m.observarBackup({ ok: true, bytes: 10 })
      m.observarChamadaDeProvedor({ provedor: 'groq', funcao: 'stt', ms: 120, custoUsd: 0.001 })
      m.observarCaptura({
        sttFinalMs: [100],
        primeiroParcialMs: [50],
        mtMs: [80],
        rtf: [0.5],
        descartesAlucinacao: 1,
        fallbacks: { local: 1 },
        motorStt: 'whisper',
        motorMt: 'opus',
      })
      m.registrarLeitorDeUploads(() => ({ emVoo: 0, limite: 2 }))
    }).not.toThrow()
    // Sem `metricas()` (nada ligou a observabilidade) os ganchos nem contam: é o default de sempre.
    expect(m.contagensEmMemoria().size).toBe(0)

    /* Ligar a observabilidade (como `criarApp()` faz com METRICS_ENABLED=1) cria o backend do runtime. */
    const medir = m.middlewareDeMetricas()
    m.contarCacheDeTraducao(true)
    m.contarCacheDeTraducao(false)
    m.contarUploadRecusado('usuario')
    expect(m.contagensEmMemoria().get('cacheDeTraducao')).toBe(2)
    expect(m.contagensEmMemoria().get('uploadsRecusados')).toBe(1)

    /* O middleware também roda sem backend: o `finish` observa a duração no Map. */
    const { res } = respostaFalsa()
    let fim: (() => void) | undefined
    res.on = ((ev: string, cb: () => void) => (ev === 'finish' && (fim = cb), res)) as Response['on']
    const proximo = vi.fn() as unknown as NextFunction
    medir({ method: 'GET', route: undefined, baseUrl: '' } as unknown as Request, res, proximo)
    fim?.()
    expect(proximo).toHaveBeenCalled()
    expect(m.contagensEmMemoria().has('duracao')).toBe(true)

    /* O /metrics responde texto, sem prom-client. */
    const { res: resMetricas, r } = respostaFalsa()
    await m.handlerDeMetricas()({ header: () => undefined } as unknown as Request, resMetricas, vi.fn())
    expect(r.statusCode).toBe(200)
    expect(r.cabecalhos['content-type']).toContain('text/plain')
    expect(r.corpo).toContain('Worker')

    expect(promNoCache(), 'o prom-client foi carregado num runtime Worker').toBe(false)
  })
})

describe('fachada de métricas no Node (sem o gancho)', () => {
  it('carrega o prom-client só no primeiro uso e deixa o Map vazio', async () => {
    delete process.env.BABEL_RUNTIME
    const m = await import('../../server/http/metricas')
    expect(promNoCache(), 'importar a fachada não pode carregar o prom-client').toBe(false)

    m.middlewareDeMetricas()
    expect(promNoCache()).toBe(true)
    m.contarCacheDeTraducao(true)
    expect(m.contagensEmMemoria().size).toBe(0)
    m.esquecerMetricas()
  })
})
