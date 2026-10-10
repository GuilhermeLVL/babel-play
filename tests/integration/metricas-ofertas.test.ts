/**
 * `POST /api/metricas/ofertas` — o funil ANÔNIMO das ofertas de planos (Fase 8).
 *
 * O evento chega, vira contador Prometheus (`oferta_eventos_total{evento,gatilho,componente}`) e
 * nada é gravado. Corpo fora do contrato é 400; gatilho que não existe vira `outro` (o cliente não
 * cria série nova inventando id). Sobe no modo PÚBLICO: sem token tem de continuar 204.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { validarLoteDeOfertas } from '../../server/routes/metricasOfertas'
import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

const evento = (p: Record<string, unknown> = {}) => ({
  evento: 'oferta_exibida',
  gatilho: 'premium',
  componente: 'comparacao',
  plano_atual: 'free',
  plano_sugerido: 'premium',
  variante: 'padrao',
  ...p,
})

const conhecidos = { gatilhos: new Set(['premium', 'nenhum']), variantes: new Set(['padrao', 'nenhum']) }

describe('validarLoteDeOfertas (o contrato do corpo)', () => {
  it('aceita o lote do contrato', () => {
    expect(validarLoteDeOfertas({ v: 1, eventos: [evento()] }, conhecidos)).toEqual([evento()])
  })

  it('a aba aberta com o bundle anterior manda o nome antigo (`pro`), e o evento conta como Premium', () => {
    const lote = [evento({ plano_atual: 'pro', plano_sugerido: 'pro' })]
    expect(validarLoteDeOfertas({ v: 1, eventos: lote }, conhecidos)).toEqual([
      evento({ plano_atual: 'premium', plano_sugerido: 'premium' }),
    ])
  })

  /* Matriz v3: o plano ATUAL de quem viu a oferta é o dele (o Essencial e o Ao Vivo são planos, com
     série própria); o SUGERIDO continua um rótulo só para qualquer plano pago, até a venda dos novos
     abrir e o funil ser separado por plano. */
  it('matriz v3: o plano atual é o da pessoa; o sugerido é o rótulo único de plano pago', () => {
    const lote = [evento({ plano_atual: 'essencial', plano_sugerido: 'essencial' }), evento({ plano_atual: 'aovivo' })]
    expect(validarLoteDeOfertas({ v: 1, eventos: lote }, conhecidos)).toEqual([
      evento({ plano_atual: 'essencial', plano_sugerido: 'premium' }),
      evento({ plano_atual: 'aovivo' }),
    ])
  })

  it('recusa versão, lista vazia, lista grande e campo fora do alfabeto', () => {
    expect(validarLoteDeOfertas({ v: 2, eventos: [evento()] }, conhecidos)).toBeNull()
    expect(validarLoteDeOfertas({ v: 1, eventos: [] }, conhecidos)).toBeNull()
    expect(validarLoteDeOfertas({ v: 1, eventos: Array(21).fill(evento()) }, conhecidos)).toBeNull()
    expect(validarLoteDeOfertas({ v: 1, eventos: [evento({ evento: 'compra' })] }, conhecidos)).toBeNull()
    expect(validarLoteDeOfertas({ v: 1, eventos: [evento({ componente: 'popup' })] }, conhecidos)).toBeNull()
    expect(validarLoteDeOfertas({ v: 1, eventos: [evento({ plano_atual: 'ouro' })] }, conhecidos)).toBeNull()
    expect(validarLoteDeOfertas({ v: 1, eventos: [evento({ gatilho: '<script>' })] }, conhecidos)).toBeNull()
    expect(validarLoteDeOfertas(null, conhecidos)).toBeNull()
  })

  it('gatilho e variante bem formados mas desconhecidos viram "outro"', () => {
    const [e] = validarLoteDeOfertas({ v: 1, eventos: [evento({ gatilho: 'inventado', variante: 'z9' })] }, conhecidos)!
    expect(e.gatilho).toBe('outro')
    expect(e.variante).toBe('outro')
  })

  it('não aceita campo de identidade escondido no evento: ele simplesmente não passa adiante', () => {
    const [e] = validarLoteDeOfertas({ v: 1, eventos: [evento({ userId: 'u-1', email: 'a@b.c' })] }, conhecidos)!
    expect(Object.keys(e).sort()).toEqual([
      'componente',
      'evento',
      'gatilho',
      'plano_atual',
      'plano_sugerido',
      'variante',
    ])
  })
})

describe('POST /api/metricas/ofertas na montagem real (modo público)', () => {
  let s: AppDeTeste
  const salvos: Record<string, string | undefined> = {}

  beforeAll(async () => {
    for (const k of ['METRICS_ENABLED', 'METRICS_TOKEN']) salvos[k] = process.env[k]
    process.env.METRICS_ENABLED = '1'
    delete process.env.METRICS_TOKEN
    s = await subirApp({ modo: 'publico' })
  }, 60_000)
  afterAll(async () => {
    await s.encerrar()
    const { esquecerMetricas } = await import('../../server/http/metricas')
    esquecerMetricas()
    for (const [k, v] of Object.entries(salvos)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('sem token: 204, e o funil aparece no /metrics (gatilho da semente da flag reconhecido)', async () => {
    const r = await s.post('/api/metricas/ofertas', {
      v: 1,
      eventos: [
        evento(),
        evento({ evento: 'oferta_clicada' }),
        evento({ evento: 'checkout_iniciado' }),
        evento({
          evento: 'oferta_exibida',
          gatilho: 'funcional_fim_de_cota',
          componente: 'aviso_cota',
          variante: 'embutida',
        }),
        evento({ gatilho: 'inventado' }),
      ],
    })
    expect(r.status).toBe(204)
    const corpo = await (await s.get('/metrics')).text()
    expect(corpo).toMatch(/oferta_eventos_total\{evento="oferta_exibida",gatilho="premium",componente="comparacao"\} 1/)
    expect(corpo).toMatch(/oferta_eventos_total\{evento="oferta_clicada",gatilho="premium",componente="comparacao"\} 1/)
    expect(corpo).toMatch(
      /oferta_eventos_total\{evento="checkout_iniciado",gatilho="premium",componente="comparacao"\} 1/,
    )
    expect(corpo).toMatch(
      /oferta_eventos_total\{evento="oferta_exibida",gatilho="funcional_fim_de_cota",componente="aviso_cota"\} 1/,
    )
    expect(corpo).toMatch(/oferta_eventos_total\{evento="oferta_exibida",gatilho="outro",componente="comparacao"\} 1/)
    expect(corpo).toMatch(
      /oferta_eventos_por_plano_total\{evento="oferta_exibida",plano_atual="free",plano_sugerido="premium",variante="padrao"\} 2/,
    )
  })

  it('corpo fora do contrato: 400', async () => {
    const r = await s.post('/api/metricas/ofertas', { v: 1, eventos: [evento({ evento: 'x' })] })
    expect(r.status).toBe(400)
  })

  it('com sessão aberta também 204 — a rota não lê identidade', async () => {
    const token = await s.token('usuario-ofertas')
    const r = await s.post('/api/metricas/ofertas', { v: 1, eventos: [evento()] }, token)
    expect(r.status).toBe(204)
  })
})
