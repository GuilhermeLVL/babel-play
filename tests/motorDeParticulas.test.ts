/**
 * O MOTOR DAS PARTÍCULAS fora do componente (auditoria de performance do frontend, 26/09/2026):
 * o laço que roda no Worker (`OffscreenCanvas`) e, sem ele, na página. Aqui ele é exercitado com um
 * contexto 2D falso e um relógio de quadros manual — o que importa travar é o CONTRATO das
 * mensagens (tamanho, ambiente, cor, rajada, pausa) e o sono do laço, que é o que poupa CPU.
 */
import { describe, expect, it } from 'vitest'

import { BURST_SPECS, resolveParticleStyle } from '../src/lib/effects'
import { criarLacoDeParticulas, type PedidoDeRajada } from '../src/lib/motorDeParticulas'

function montar() {
  const chamadas: Record<string, number> = {}
  const conta = (n: string) => () => {
    chamadas[n] = (chamadas[n] ?? 0) + 1
  }
  const ctx = new Proxy(
    { globalAlpha: 1, shadowBlur: 0, fillStyle: '', globalCompositeOperation: 'source-over', shadowColor: '' } as Record<string, unknown>,
    {
      get: (alvo, p: string) => (p in alvo ? alvo[p] : conta(p)),
      set: (alvo, p: string, v) => {
        alvo[p] = v
        return true
      },
    },
  ) as unknown as CanvasRenderingContext2D
  const canvas = { width: 0, height: 0 }
  const fila: Array<(ts: number) => void> = []
  let cancelados = 0
  const laco = criarLacoDeParticulas({
    canvas,
    ctx,
    pedirQuadro: (fn) => fila.push(fn),
    cancelarQuadro: () => {
      cancelados++
      fila.length = 0
    },
    criarCanvas: () => ({ width: 10, height: 10, getContext: () => ctx }) as unknown as HTMLCanvasElement,
  })
  let t = 0
  /** Roda um quadro pendente (avança o relógio em `ms`). Devolve se havia quadro. */
  const quadro = (ms = 16.7) => {
    const fn = fila.shift()
    if (!fn) return false
    t += ms
    fn(t)
    return true
  }
  return { laco, canvas, chamadas, quadro, fila, cancelados: () => cancelados }
}

const rajada = (extra: Partial<PedidoDeRajada> = {}): PedidoDeRajada => ({
  x: 50,
  y: 50,
  spec: BURST_SPECS.xp,
  countMul: 1,
  sizeMul: 1,
  cor: '#0f0',
  pack: ['⭐'],
  skin: null,
  modoPixel: false,
  ...extra,
})

describe('laço das partículas', () => {
  it('o tamanho vira o bitmap do canvas na densidade de pixels pedida', () => {
    const { laco, canvas, chamadas } = montar()
    laco.receber({ tipo: 'tamanho', largura: 400, altura: 800, dpr: 2 })
    expect(canvas).toEqual({ width: 800, height: 1600 })
    expect(chamadas.setTransform).toBe(1)
  })

  it('o ambiente do tema nasce e desenha a cada quadro, sem dormir', () => {
    const { laco, chamadas, quadro, fila } = montar()
    const preset = resolveParticleStyle('babel', false)
    laco.receber({ tipo: 'tamanho', largura: 400, altura: 800, dpr: 1 })
    laco.receber({ tipo: 'ambiente', preset, cor: '#f00', ambient: true })
    expect(quadro()).toBe(true)
    expect(chamadas.arc).toBe(preset.ambientCount)
    expect(fila.length).toBe(1) // pediu o próximo quadro
  })

  it('sem ambiente, a rajada vive o tempo dela e o laço DORME depois', () => {
    const { laco, chamadas, quadro, fila } = montar()
    laco.receber({ tipo: 'tamanho', largura: 400, altura: 800, dpr: 1 })
    laco.receber({ tipo: 'ambiente', preset: resolveParticleStyle('babel', false), cor: '#f00', ambient: false })
    quadro() // limpa e dorme: não há partícula
    expect(fila.length).toBe(0)
    laco.receber({ tipo: 'rajada', pedido: rajada() })
    expect(fila.length).toBe(1) // a rajada acorda o laço
    quadro()
    expect(chamadas.arc).toBe(BURST_SPECS.xp.count)
    // 700 ms de vida no máximo: em ~1 s de quadros ela some e o laço para de pedir quadro.
    for (let i = 0; i < 80 && quadro(); i++);
    expect(fila.length).toBe(0)
  })

  it('a intensidade da loja multiplica a quantidade', () => {
    const { laco, chamadas, quadro } = montar()
    laco.receber({ tipo: 'tamanho', largura: 400, altura: 800, dpr: 1 })
    laco.receber({ tipo: 'ambiente', preset: resolveParticleStyle('babel', false), cor: '#f00', ambient: false })
    quadro()
    laco.receber({ tipo: 'rajada', pedido: rajada({ countMul: 2 }) })
    quadro()
    expect(chamadas.arc).toBe(BURST_SPECS.xp.count * 2)
  })

  it('pausar (aba escondida) cancela o quadro pedido; retomar volta a desenhar', () => {
    const { laco, quadro, fila, cancelados } = montar()
    laco.receber({ tipo: 'tamanho', largura: 400, altura: 800, dpr: 1 })
    laco.receber({ tipo: 'ambiente', preset: resolveParticleStyle('babel', false), cor: '#f00', ambient: true })
    quadro()
    laco.receber({ tipo: 'pausar' })
    expect(cancelados()).toBe(1)
    expect(fila.length).toBe(0)
    laco.receber({ tipo: 'retomar' })
    expect(fila.length).toBe(1)
  })

  it('a troca de cor do token repinta o ambiente sem recomeçar', () => {
    const { laco, quadro } = montar()
    laco.receber({ tipo: 'tamanho', largura: 400, altura: 800, dpr: 1 })
    laco.receber({ tipo: 'ambiente', preset: resolveParticleStyle('babel', false), cor: '#f00', ambient: true })
    quadro()
    expect(() => laco.receber({ tipo: 'cor', cor: '#00f' })).not.toThrow()
    expect(quadro()).toBe(true)
  })
})
