// @vitest-environment jsdom
/**
 * A INSTRUMENTAÇÃO DO FUNIL DAS OFERTAS (Fase 8), no cliente.
 *
 * Os eventos saem em lote para `POST /api/metricas/ofertas` com o contrato do servidor e SEM nada
 * que identifique a pessoa; o checkout herda os rótulos da última oferta clicada (ou `nenhum`);
 * a assinatura concluída conta uma vez só; e "Métricas de uso anônimas" desligada cala tudo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  chamadas: [] as Array<{ url: string; corpo: { v: number; eventos: Array<Record<string, string>> } }>,
  metricas: true,
}))

vi.mock('../src/data/funil', () => ({
  apiFetch: async (url: string, init: { body: string }) => {
    estado.chamadas.push({ url, corpo: JSON.parse(init.body) })
    return new Response(null, { status: 204 })
  },
}))
vi.mock('../src/lib/preferencias', () => ({
  lerPreferencias: () => ({ consentimentos: { metricas: estado.metricas } }),
}))
vi.mock('../src/lib/protecaoDoMenor', () => ({ estadoDaProtecao: () => null }))
vi.mock('../src/lib/ofertas/plano', () => ({ planoDaOferta: () => 'free' }))

const I = await import('../src/lib/ofertas/instrumentacao')
const { validarLoteDeOfertas } = await import('../server/routes/metricasOfertas')

const rotulos = I.rotulosDaOferta({
  gatilho: 'premium',
  componente: 'comparacao',
  planoAtual: 'free',
  planoSugerido: 'premium',
  variante: 'padrao',
})

beforeEach(() => {
  estado.chamadas = []
  estado.metricas = true
  I._esquecerInstrumentacao()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('envio', () => {
  it('junta eventos próximos num lote, na rota certa, no contrato que o servidor aceita', () => {
    I.registrarEventoDeOferta('oferta_exibida', rotulos)
    I.registrarEventoDeOferta('oferta_clicada', rotulos)
    expect(estado.chamadas).toHaveLength(0)
    vi.advanceTimersByTime(I.ESPERA_DO_LOTE_MS)
    expect(estado.chamadas).toHaveLength(1)
    const { url, corpo } = estado.chamadas[0]
    expect(url).toBe('/api/metricas/ofertas')
    expect(corpo.eventos.map((e) => e.evento)).toEqual(['oferta_exibida', 'oferta_clicada'])
    // O contrato é o MESMO dos dois lados: o validador do servidor aceita o que o cliente manda.
    const conhecidos = { gatilhos: new Set(['premium']), variantes: new Set(['padrao']) }
    expect(validarLoteDeOfertas(corpo, conhecidos)).toHaveLength(2)
  })

  it('nenhum campo de identidade vai junto', () => {
    I.registrarEventoDeOferta('oferta_exibida', rotulos)
    vi.advanceTimersByTime(I.ESPERA_DO_LOTE_MS)
    expect(Object.keys(estado.chamadas[0].corpo.eventos[0]).sort()).toEqual([
      'componente',
      'evento',
      'gatilho',
      'plano_atual',
      'plano_sugerido',
      'variante',
    ])
  })

  it('"Métricas de uso anônimas" desligada: nada sai', () => {
    estado.metricas = false
    I.registrarEventoDeOferta('oferta_exibida', rotulos)
    vi.advanceTimersByTime(I.ESPERA_DO_LOTE_MS)
    expect(estado.chamadas).toHaveLength(0)
  })

  it('lote grande é partido em lotes de até 20', () => {
    for (let i = 0; i < 25; i++) I.registrarEventoDeOferta('oferta_exibida', rotulos)
    vi.advanceTimersByTime(I.ESPERA_DO_LOTE_MS * 2)
    expect(estado.chamadas.map((c) => c.corpo.eventos.length)).toEqual([20, 5])
  })
})

describe('atribuição: oferta → checkout → assinatura', () => {
  it('o checkout herda a última oferta clicada, e a assinatura conta uma vez só', () => {
    I.lembrarAtribuicao(rotulos)
    I.registrarCheckoutIniciado('premium')
    I.registrarAssinaturaConcluida()
    I.registrarAssinaturaConcluida() // recarregar a tela de confirmação
    vi.advanceTimersByTime(I.ESPERA_DO_LOTE_MS)
    const eventos = estado.chamadas.flatMap((c) => c.corpo.eventos)
    expect(eventos.map((e) => [e.evento, e.gatilho])).toEqual([
      ['checkout_iniciado', 'premium'],
      ['assinatura_concluida', 'premium'],
    ])
  })

  it('checkout sem oferta clicada é orgânico (`nenhum`)', () => {
    I.registrarCheckoutIniciado('premium')
    vi.advanceTimersByTime(I.ESPERA_DO_LOTE_MS)
    expect(estado.chamadas[0].corpo.eventos[0]).toMatchObject({
      evento: 'checkout_iniciado',
      gatilho: 'nenhum',
      componente: 'nenhum',
      plano_sugerido: 'premium',
    })
  })

  it('atribuição vence em 24 h', () => {
    I.lembrarAtribuicao(rotulos, Date.now() - 25 * 60 * 60_000)
    expect(I.atribuicaoDoCheckout('premium').gatilho).toBe('nenhum')
  })

  it('assinatura sem checkout iniciado neste aparelho não conta', () => {
    I.registrarAssinaturaConcluida()
    vi.advanceTimersByTime(I.ESPERA_DO_LOTE_MS)
    expect(estado.chamadas).toHaveLength(0)
  })
})
