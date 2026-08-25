/**
 * Rastreabilidade — ID de correlação por request (auditoria Fase 5).
 * Ver docs/audit/05-traceability.md.
 */
import { describe, it, expect, vi } from 'vitest'
import { makeRequestId, requestIdMiddleware } from '../../server/lib/requestId'

describe('makeRequestId', () => {
  it('reaproveita um id externo bem formado (encadeia com proxy/CDN)', () => {
    expect(makeRequestId('abc-123_XY.z')).toBe('abc-123_XY.z')
  })

  it('gera um UUID quando não vem header', () => {
    const id = makeRequestId(undefined)
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('descarta id com caractere de controle (injeção de log) e gera um novo', () => {
    const id = makeRequestId('quebra\nlinha: {"level":"error"}')
    expect(id).not.toContain('\n')
    expect(id).toHaveLength(36)
  })

  it('descarta id longo demais para não inflar a linha de log', () => {
    expect(makeRequestId('x'.repeat(65))).toHaveLength(36)
  })

  it('usa o primeiro valor quando o header vem repetido', () => {
    expect(makeRequestId(['primeiro', 'segundo'])).toBe('primeiro')
  })
})

describe('requestIdMiddleware', () => {
  it('anexa o id ao request e devolve no header da resposta', () => {
    const req: any = { headers: {} }
    const res: any = { setHeader: vi.fn() }
    const next = vi.fn()

    requestIdMiddleware(req, res, next)

    expect(req.requestId).toHaveLength(36)
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', req.requestId)
    expect(next).toHaveBeenCalledOnce()
  })

  it('propaga o id de entrada quando ele é seguro', () => {
    const req: any = { headers: { 'x-request-id': 'trace-42' } }
    const res: any = { setHeader: vi.fn() }
    requestIdMiddleware(req, res, vi.fn())

    expect(req.requestId).toBe('trace-42')
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'trace-42')
  })
})
