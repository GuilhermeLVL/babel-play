// @vitest-environment jsdom
/**
 * A COTA PERTO DO FIM (Fase 8): o contador mais cheio decide; sem teto não conta; e a rota de
 * consumo é perguntada no máximo uma vez por hora (cache no aparelho).
 */
import { beforeEach, expect, it, vi } from 'vitest'

const chamadas = vi.hoisted(() => ({ n: 0, uso: null as unknown }))
vi.mock('../src/lib/uso', async (original) => {
  const real = await original<typeof import('../src/lib/uso')>()
  return {
    ...real,
    carregarUso: async () => {
      chamadas.n += 1
      return chamadas.uso
    },
  }
})

const { estadoDaCota, verificarCota, VALIDADE_DO_CACHE_DA_COTA_MS } = await import('../src/lib/ofertas/cota')

const uso = (usado: number, teto: number | null) => ({
  plano: 'premium' as const,
  janela: '2026-09',
  chamadas: { usado: 0, teto: 1000 },
  segundosDeAudio: { usado, teto },
  tokensDeLlm: { usado: 0, teto: null },
})

beforeEach(() => {
  localStorage.clear()
  chamadas.n = 0
})

it('≥ 80% de qualquer contador = perto; 100% = esgotada; abaixo ou sem teto = nada', () => {
  expect(estadoDaCota(uso(79, 100))).toBeNull()
  expect(estadoDaCota(uso(80, 100))).toBe('perto')
  expect(estadoDaCota(uso(100, 100))).toBe('esgotada')
  expect(estadoDaCota(uso(10_000, null))).toBeNull()
  expect(estadoDaCota(null)).toBeNull()
})

it('uma chamada por hora, no máximo', async () => {
  chamadas.uso = uso(90, 100)
  const agora = Date.now()
  expect(await verificarCota(agora)).toBe('perto')
  expect(await verificarCota(agora + 1000)).toBe('perto')
  expect(chamadas.n).toBe(1)
  await verificarCota(agora + VALIDADE_DO_CACHE_DA_COTA_MS + 1)
  expect(chamadas.n).toBe(2)
})

it('rota fora do ar: nada (não se avisa no escuro) e nada no cache', async () => {
  chamadas.uso = null
  expect(await verificarCota()).toBeNull()
  expect(localStorage.getItem('babel.ofertas.cota')).toBeNull()
})
