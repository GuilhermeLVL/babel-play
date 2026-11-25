/**
 * O MOTOR MOONSHINE DA LEITURA EM VOZ ALTA (openspec `leitura-ativa-com-moonshine`, 2.2 e 2.3), com captura e worker
 * FALSOS: parciais crescentes, final por pausa, erro fatal vira `aoFalhar('parou')`, `descartar` solta o buffer sem
 * fechar o microfone, a ordem dos motores e nenhuma requisição de rede.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { criarMotorMoonshineLocal, type DepsDoMoonshine } from '../src/lib/leituraAtiva/motorMoonshine'
import {
  abrirOuvinteLocal,
  definirMoonshineLocal,
  MOTORES_LOCAIS,
  ouvinteDisponivel,
} from '../src/lib/leituraAtiva/ouvinteLocal'

const TAXA = 16000
const bloco = (ms: number, amp: number) => new Float32Array(Math.round((TAXA * ms) / 1000)).fill(amp)
const tick = () => new Promise((r) => setTimeout(r, 0))

function cenario(o: { falha?: boolean; soPorPausa?: boolean } = {}) {
  let aoBloco: (b: Float32Array) => void = () => {}
  const estado = { encerrou: 0, parciais: [] as number[], finais: [] as number[] }
  const respostasParcial = ['at the', 'at the market', 'at the market six']
  const deps: DepsDoMoonshine = {
    capturar: async (cb) => {
      aoBloco = cb
      return { taxa: TAXA, encerrar: async () => void estado.encerrou++ }
    },
    parcial: async (pcm) => {
      estado.parciais.push(pcm.length)
      return respostasParcial.shift() ?? 'at the market six'
    },
    final: async (pcm) => {
      estado.finais.push(pcm.length)
      if (o.falha) throw new Error('worker caiu')
      return 'At the market six apples'
    },
  }
  const motor = criarMotorMoonshineLocal({
    disponivel: () => true,
    deps,
    cadenciaMs: 500,
    soPorPausa: o.soPorPausa,
  })
  return {
    motor,
    estado,
    alimentar: async (ms: number, amp: number) => {
      for (let i = 0; i < ms / 100; i++) aoBloco(bloco(100, amp))
      await tick()
    },
  }
}

afterEach(() => {
  definirMoonshineLocal(false)
  vi.unstubAllGlobals()
})

describe('motor moonshine-local', () => {
  it('parciais crescentes enquanto fala e final na pausa', async () => {
    const c = cenario()
    const textos: Array<[string, boolean]> = []
    const falhas: string[] = []
    const o = abrirOuvinteLocal({
      lang: 'en-US',
      aoParcial: (t, f) => textos.push([t, f]),
      aoFalhar: (f) => falhas.push(f),
      motores: [c.motor],
    })
    expect(o).not.toBeNull()
    await tick()
    await c.alimentar(300, 0.001)
    await c.alimentar(500, 0.1)
    await c.alimentar(500, 0.1)
    await c.alimentar(500, 0.1)
    expect(textos.length).toBeGreaterThanOrEqual(2)
    expect(textos.every(([, f]) => !f)).toBe(true)
    expect(c.estado.parciais[1]!).toBeGreaterThan(c.estado.parciais[0]!) // a janela cresce
    await c.alimentar(600, 0.001)
    await tick()
    expect(textos.at(-1)).toEqual(['At the market six apples', true])
    expect(falhas).toEqual([])
  })

  it('só silêncio: não decodifica nada', async () => {
    const c = cenario()
    abrirOuvinteLocal({ lang: 'en-US', aoParcial: () => {}, aoFalhar: () => {}, motores: [c.motor] })
    await tick()
    await c.alimentar(3000, 0.001)
    expect(c.estado.parciais).toHaveLength(0)
    expect(c.estado.finais).toHaveLength(0)
  })

  it('erro do worker é fatal: aoFalhar("parou"), microfone solto, nada mais é emitido', async () => {
    const c = cenario({ falha: true })
    const aoFalhar = vi.fn()
    const aoParcial = vi.fn()
    abrirOuvinteLocal({ lang: 'en-US', aoParcial, aoFalhar, motores: [c.motor] })
    await tick()
    await c.alimentar(1000, 0.1)
    await c.alimentar(600, 0.001)
    await tick()
    expect(aoFalhar).toHaveBeenCalledWith('parou')
    expect(c.estado.encerrou).toBe(1)
    aoParcial.mockClear()
    await c.alimentar(1000, 0.1)
    expect(aoParcial).not.toHaveBeenCalled()
  })

  it('descartar solta o buffer da frase e NÃO fecha o microfone; resultado em voo é ignorado', async () => {
    const c = cenario()
    const aoParcial = vi.fn()
    const o = abrirOuvinteLocal({ lang: 'en-US', aoParcial, aoFalhar: () => {}, motores: [c.motor] })!
    await tick()
    await c.alimentar(1000, 0.1)
    o.descartar()
    aoParcial.mockClear()
    expect(c.estado.encerrou).toBe(0)
    await tick()
    expect(aoParcial).not.toHaveBeenCalled()
    // a frase seguinte começa do zero: a primeira janela é curta de novo
    c.estado.parciais.length = 0
    await c.alimentar(1000, 0.1)
    expect(c.estado.parciais[0]!).toBeLessThan(TAXA * 1.5)
  })

  it('parar solta o microfone uma vez', async () => {
    const c = cenario()
    const o = abrirOuvinteLocal({ lang: 'en-US', aoParcial: () => {}, aoFalhar: () => {}, motores: [c.motor] })!
    await tick()
    o.parar()
    o.parar()
    await tick()
    expect(c.estado.encerrou).toBe(1)
  })

  it('microfone negado vira "negado"', async () => {
    const aoFalhar = vi.fn()
    const motor = criarMotorMoonshineLocal({
      disponivel: () => true,
      deps: { capturar: () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })) },
    })
    abrirOuvinteLocal({ lang: 'en-US', aoParcial: () => {}, aoFalhar, motores: [motor] })
    await tick()
    expect(aoFalhar).toHaveBeenCalledWith('negado')
  })

  it('modo "por pausa": nenhum parcial, só o final', async () => {
    const c = cenario({ soPorPausa: true })
    const textos: Array<[string, boolean]> = []
    abrirOuvinteLocal({
      lang: 'en-US',
      aoParcial: (t, f) => textos.push([t, f]),
      aoFalhar: () => {},
      motores: [c.motor],
    })
    await tick()
    await c.alimentar(1500, 0.1)
    expect(c.estado.parciais).toHaveLength(0)
    await c.alimentar(600, 0.001)
    await tick()
    expect(textos).toEqual([['At the market six apples', true]])
  })

  it('nenhum fetch em toda a sessão', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const c = cenario()
    abrirOuvinteLocal({ lang: 'en-US', aoParcial: () => {}, aoFalhar: () => {}, motores: [c.motor] })
    await tick()
    await c.alimentar(1500, 0.1)
    await c.alimentar(600, 0.001)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('ordem e disponibilidade dos motores', () => {
  it('Web Speech local primeiro, Moonshine depois; nenhum de nuvem', () => {
    expect(MOTORES_LOCAIS.map((m) => m.id)).toEqual(['web-speech-local', 'moonshine-local'])
  })

  it('o Moonshine só é disponível quando a tela o libera (flag desligada = nada muda)', () => {
    vi.stubGlobal('SpeechRecognition', class {})
    expect(ouvinteDisponivel()).toBe(false)
    definirMoonshineLocal(true)
    expect(ouvinteDisponivel()).toBe(true)
    definirMoonshineLocal(false)
    expect(ouvinteDisponivel()).toBe(false)
  })

  it('com Web Speech local E Moonshine, abre o Web Speech (o preferido)', () => {
    class ComLocal {}
    Object.defineProperty(ComLocal.prototype, 'processLocally', { value: false, writable: true })
    vi.stubGlobal('SpeechRecognition', ComLocal)
    definirMoonshineLocal(true)
    expect(MOTORES_LOCAIS.find((m) => m.disponivel())?.id).toBe('web-speech-local')
  })
})
