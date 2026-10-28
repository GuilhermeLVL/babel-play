// @vitest-environment jsdom
import { act,renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { FonteDeAudio } from '../src/lib/avatar/amplitude'
import { fonteDeAudioDaVoz,prepararAnalisadorDaVoz } from '../src/lib/avatar/amplitude'
import { ligarAvatarAFala, PRAZO_SEM_SINAL_MS, useAvatarFalando } from '../src/lib/avatar/fala'
import type { SpeakOptions, TtsEngine } from '../src/lib/tts'

/** Motor falso: guarda a última fala e deixa o teste disparar os eventos como o navegador faria. */
function motorFalso() {
  const falas: Array<{ texto: string; opts: SpeakOptions }> = []
  const engine: TtsEngine & { cancelamentos: number } = {
    cancelamentos: 0,
    speak(texto, opts) {
      falas.push({ texto, opts: opts! })
    },
    cancel() {
      this.cancelamentos += 1
    },
    pause: vi.fn(),
    resume: vi.fn(),
    isSpeaking: () => false,
  }
  return { engine, falas, ultima: () => falas[falas.length - 1] }
}

function relogio() {
  let t = 1000
  return { agora: () => t, avancar: (ms: number) => (t += ms) }
}

describe('ligarAvatarAFala: eventos do motor', () => {
  it('start → boundary → end: falando só entre o start e o end; a boca segue a âncora', () => {
    const { engine, ultima } = motorFalso()
    const r = relogio()
    const lig = ligarAvatarAFala(engine, { agora: r.agora })
    const avisos: boolean[] = []
    lig.assinar(() => avisos.push(lig.falando()))

    const onStart = vi.fn()
    const onEnd = vi.fn()
    const onBoundary = vi.fn()
    lig.motor.speak('Bom dia, pessoal. Vamos começar.', { lang: 'pt-BR', onStart, onEnd, onBoundary })
    expect(lig.falando()).toBe(false) // pedir não é falar: a fonte da verdade é o onStart
    expect(lig.pose()).toBeNull()

    ultima().opts.onStart!()
    expect(lig.falando()).toBe(true)
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(lig.origem()).toBe('relogio')

    r.avancar(300)
    expect(lig.pose()!.abertura).toBeGreaterThanOrEqual(0)

    r.avancar(700)
    ultima().opts.onBoundary!(11)
    expect(onBoundary).toHaveBeenCalledWith(11)
    expect(lig.origem()).toBe('eventos')

    r.avancar(1500)
    ultima().opts.onEnd!()
    expect(lig.falando()).toBe(false)
    expect(lig.pose()).toBeNull()
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(avisos).toEqual([true, false])
  })

  it('a pose anda com o relógio: abre em sílabas e fecha nas pausas', () => {
    const { engine, ultima } = motorFalso()
    const r = relogio()
    const lig = ligarAvatarAFala(engine, { agora: r.agora })
    lig.motor.speak('pá, pá', { lang: 'pt-BR' })
    ultima().opts.onStart!()
    let abriu = false
    let fechou = false
    for (let i = 0; i < 80; i += 1) {
      r.avancar(10)
      const p = lig.pose()!
      if (p.abertura > 0.5) abriu = true
      if (p.abertura === 0) fechou = true
    }
    expect(abriu).toBe(true)
    expect(fechou).toBe(true)
  })

  it('cancelamento no meio: desliga na hora, cancela o motor e ignora o onEnd atrasado', () => {
    const { engine, ultima } = motorFalso()
    const lig = ligarAvatarAFala(engine, { agora: relogio().agora })
    const onEnd = vi.fn()
    lig.motor.speak('Uma frase longa o bastante', { lang: 'pt-BR', onEnd })
    const opts = ultima().opts
    opts.onStart!()
    expect(lig.falando()).toBe(true)
    lig.motor.cancel()
    expect(lig.falando()).toBe(false)
    expect(engine.cancelamentos).toBe(1)
    // O Chrome pode disparar onEnd/onError do cancelado depois: não religa nem desliga nada errado.
    opts.onEnd!()
    opts.onStart!()
    expect(lig.falando()).toBe(false)
    expect(onEnd).toHaveBeenCalledTimes(1) // quem chamou ainda é avisado
  })

  it('fala sobreposta: a nova vale; callbacks da antiga não mexem no avatar', () => {
    const { engine, falas } = motorFalso()
    const lig = ligarAvatarAFala(engine, { agora: relogio().agora })
    lig.motor.speak('primeira fala', { lang: 'pt-BR' })
    falas[0].opts.onStart!()
    expect(lig.falando()).toBe(true)

    lig.motor.speak('segunda fala', { lang: 'pt-BR' })
    expect(lig.falando()).toBe(false) // a primeira acabou para o avatar; a segunda ainda não começou
    falas[1].opts.onStart!()
    expect(lig.falando()).toBe(true)

    // o motor interrompe a primeira e avisa tarde
    falas[0].opts.onError!()
    falas[0].opts.onEnd!()
    falas[0].opts.onBoundary!(3)
    expect(lig.falando()).toBe(true)
    falas[1].opts.onEnd!()
    expect(lig.falando()).toBe(false)
  })

  it('erro do motor (onError e exceção síncrona) desliga e propaga', () => {
    const { engine, ultima } = motorFalso()
    const lig = ligarAvatarAFala(engine, { agora: relogio().agora })
    const onError = vi.fn()
    lig.motor.speak('quebra no meio', { lang: 'pt-BR', onError })
    ultima().opts.onStart!()
    ultima().opts.onError!()
    expect(lig.falando()).toBe(false)
    expect(onError).toHaveBeenCalledTimes(1)

    const ruim: TtsEngine = {
      speak() {
        throw new Error('sem voz')
      },
      cancel() {},
    }
    const lig2 = ligarAvatarAFala(ruim, { agora: relogio().agora })
    expect(() => lig2.motor.speak('oi', { lang: 'pt-BR' })).toThrow('sem voz')
    expect(lig2.falando()).toBe(false)
  })

  it('texto vazio vai direto ao motor e não muda nada', () => {
    const { engine, falas } = motorFalso()
    const lig = ligarAvatarAFala(engine, { agora: relogio().agora })
    lig.motor.speak('   ', { lang: 'pt-BR' })
    expect(falas).toHaveLength(1)
    expect(lig.falando()).toBe(false)
  })

  it('boundary fora de ordem e antes do start não quebram', () => {
    const { engine, ultima } = motorFalso()
    const r = relogio()
    const lig = ligarAvatarAFala(engine, { agora: r.agora })
    lig.motor.speak('Bom dia pessoal, vamos começar a aula de hoje', { lang: 'pt-BR' })
    ultima().opts.onBoundary!(5) // antes do start: ignorado
    expect(lig.origem()).toBe('nenhuma')
    ultima().opts.onStart!()
    r.avancar(1200)
    ultima().opts.onBoundary!(25)
    r.avancar(100)
    ultima().opts.onBoundary!(4) // para trás
    ultima().opts.onBoundary!(9999) // além do texto
    expect(lig.pose()).not.toBeNull()
    expect(Number.isFinite(lig.pose()!.abertura)).toBe(true)
  })

  it('pausa congela o relógio da boca', () => {
    const { engine, ultima } = motorFalso()
    const r = relogio()
    const lig = ligarAvatarAFala(engine, { agora: r.agora })
    lig.motor.speak('pá pá pá pá pá pá', { lang: 'pt-BR' })
    ultima().opts.onStart!()
    r.avancar(200)
    lig.motor.pause!()
    const antes = lig.pose()
    r.avancar(5000)
    expect(lig.pose()).toEqual(antes)
    lig.motor.resume!()
    expect(engine.pause).toHaveBeenCalled()
    expect(engine.resume).toHaveBeenCalled()
  })

  it('emoção muda ritmo e tom da fala, dentro dos limites; neutro não toca nas opções', () => {
    const { engine, ultima } = motorFalso()
    let emocao: 'feliz' | 'triste' | 'neutro' = 'feliz'
    const lig = ligarAvatarAFala(engine, { agora: relogio().agora, emocao: () => emocao })
    lig.motor.speak('oi', { lang: 'pt-BR', rate: 2.5, pitch: 1.5 })
    expect(ultima().opts.rate).toBe(2.5)
    expect(ultima().opts.pitch).toBe(1.5)
    emocao = 'triste'
    lig.motor.speak('oi', { lang: 'pt-BR' })
    expect(ultima().opts.rate).toBeCloseTo(0.9, 5)
    expect(ultima().opts.pitch).toBeCloseTo(0.92, 5)
    emocao = 'neutro'
    lig.motor.speak('oi', { lang: 'pt-BR' })
    expect(ultima().opts.rate).toBeUndefined()

    const nuvem = ligarAvatarAFala(engine, { agora: relogio().agora, emocao: () => 'feliz', temTom: false })
    nuvem.motor.speak('oi', { lang: 'pt-BR', pitch: 1.2 })
    expect(ultima().opts.rate).toBeCloseTo(1.05, 5)
    expect(ultima().opts.pitch).toBe(1.2) // a nuvem não tem tom: o valor da pessoa fica como veio
  })

  it('dispose desliga e esquece os ouvintes', () => {
    const { engine, ultima } = motorFalso()
    const lig = ligarAvatarAFala(engine, { agora: relogio().agora })
    const cb = vi.fn()
    lig.assinar(cb)
    lig.motor.speak('oi gente', { lang: 'pt-BR' })
    ultima().opts.onStart!()
    expect(cb).toHaveBeenCalledTimes(1)
    lig.dispose()
    expect(lig.falando()).toBe(false)
    ultima().opts.onStart!()
    expect(lig.falando()).toBe(false)
  })
})

describe('ligarAvatarAFala: voz em áudio (nuvem)', () => {
  function audioFalso(init: { rms: number | null; duracao?: number }) {
    const a = { rms: init.rms as number | null, duracao: init.duracao, tempo: 0 }
    const fonte: FonteDeAudio = {
      amplitude: () => a.rms,
      duracaoMs: () => a.duracao,
      tempoMs: () => a.tempo,
    }
    return { a, fonte }
  }

  it('a abertura segue a amplitude (com piso) e a vogal vem da linha do tempo', () => {
    const { engine, ultima } = motorFalso()
    const r = relogio()
    const { a, fonte } = audioFalso({ rms: 0.3, duracao: 3000 })
    const lig = ligarAvatarAFala(engine, { agora: r.agora, fonteDeAudio: () => fonte })
    lig.motor.speak('Muito obrigado pela ajuda', { lang: 'pt-BR' })
    ultima().opts.onStart!()
    r.avancar(100)
    a.tempo = 100
    const alta = lig.pose()!
    expect(lig.origem()).toBe('amplitude')
    expect(alta.abertura).toBeGreaterThan(0.9)
    expect(alta.vogal).not.toBe('F')
    a.rms = 0.01 // abaixo do piso
    expect(lig.pose()!.abertura).toBe(0)
    a.rms = 0.12
    const media = lig.pose()!.abertura
    expect(media).toBeGreaterThan(0.2)
    expect(media).toBeLessThan(alta.abertura)
  })

  it('analisador indisponível (null): cai na cadência pelo relógio do áudio', () => {
    const { engine, ultima } = motorFalso()
    const r = relogio()
    const { a, fonte } = audioFalso({ rms: null, duracao: 2000 })
    const lig = ligarAvatarAFala(engine, { agora: r.agora, fonteDeAudio: () => fonte })
    lig.motor.speak('pá pá', { lang: 'pt-BR' })
    ultima().opts.onStart!()
    a.tempo = 100
    expect(lig.pose()!.abertura).toBeGreaterThan(0)
    expect(lig.origem()).toBe('cadencia')
  })

  it('sinal sempre zero (áudio cross-origin sem CORS): depois do prazo cai na cadência', () => {
    const { engine, ultima } = motorFalso()
    const r = relogio()
    const { a, fonte } = audioFalso({ rms: 0, duracao: 4000 })
    const lig = ligarAvatarAFala(engine, { agora: r.agora, fonteDeAudio: () => fonte })
    lig.motor.speak('pá pá pá pá pá pá pá pá', { lang: 'pt-BR' })
    ultima().opts.onStart!()
    r.avancar(100)
    a.tempo = 100
    lig.pose()
    expect(lig.origem()).toBe('amplitude') // ainda dentro da tolerância
    r.avancar(PRAZO_SEM_SINAL_MS + 100)
    a.tempo = 800 + 100
    const p = lig.pose()!
    expect(lig.origem()).toBe('cadencia')
    expect(p.abertura).toBeGreaterThanOrEqual(0)
  })

  it('duração do áudio que chega depois do start refaz a linha', () => {
    const { engine, ultima } = motorFalso()
    const r = relogio()
    const { a, fonte } = audioFalso({ rms: null, duracao: undefined })
    const lig = ligarAvatarAFala(engine, { agora: r.agora, fonteDeAudio: () => fonte })
    lig.motor.speak('Olá, tudo bem?', { lang: 'pt-BR' })
    ultima().opts.onStart!()
    a.duracao = 6000
    a.tempo = 5900
    expect(lig.pose()!.acabou).toBe(false) // 5,9 s de 6 s: ainda dentro da linha esticada
  })
})

describe('useAvatarFalando', () => {
  it('reflete a ligação e volta a false sem ligação', () => {
    const { engine, ultima } = motorFalso()
    const lig = ligarAvatarAFala(engine, { agora: relogio().agora })
    const { result, rerender } = renderHook(({ l }) => useAvatarFalando(l), {
      initialProps: { l: lig as typeof lig | null },
    })
    expect(result.current).toBe(false)
    lig.motor.speak('oi gente', { lang: 'pt-BR' })
    act(() => ultima().opts.onStart!())
    expect(result.current).toBe(true)
    act(() => ultima().opts.onEnd!())
    expect(result.current).toBe(false)
    rerender({ l: null })
    expect(result.current).toBe(false)
  })
})

describe('analisador do elemento compartilhado', () => {
  function contextoFalso(estadoInicial: 'running' | 'suspended', resumeLeva: 'running' | 'suspended' = 'running') {
    const fonteCriada = vi.fn(() => ({ connect: vi.fn() }))
    const analisador = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      getByteTimeDomainData: (b: Uint8Array) => b.fill(128 + 64),
    }
    const ctx = {
      state: estadoInicial as string,
      destination: {},
      resume: vi.fn(async () => {
        ctx.state = resumeLeva
      }),
      close: vi.fn(async () => undefined),
      createMediaElementSource: fonteCriada,
      createAnalyser: () => analisador,
    }
    return { ctx: ctx as unknown as AudioContext, fonteCriada }
  }

  it('cria a fonte UMA vez por elemento, liga ao destino e mede o RMS', async () => {
    const el = document.createElement('audio')
    const { ctx, fonteCriada } = contextoFalso('suspended')
    const fabrica = vi.fn(() => ctx)
    expect(await prepararAnalisadorDaVoz(el, fabrica)).toBe(true)
    expect(await prepararAnalisadorDaVoz(el, fabrica)).toBe(true)
    expect(fonteCriada).toHaveBeenCalledTimes(1)
    expect(fabrica).toHaveBeenCalledTimes(1)
    const fonteLiga = (fonteCriada.mock.results[0].value as { connect: ReturnType<typeof vi.fn> }).connect
    // o som continua saindo: a fonte vai ao destino (e ao analisador)
    expect(fonteLiga).toHaveBeenCalledTimes(2)
    expect(fonteLiga.mock.calls[0][0]).toBe(ctx.destination)
    const rms = fonteDeAudioDaVoz(el)!.amplitude()!
    expect(rms).toBeCloseTo(0.5, 2)
  })

  it('contexto que não chega a `running` NÃO toma o elemento (o som nativo fica intacto)', async () => {
    const el = document.createElement('audio')
    const { ctx, fonteCriada } = contextoFalso('suspended', 'suspended')
    expect(await prepararAnalisadorDaVoz(el, () => ctx)).toBe(false)
    expect(fonteCriada).not.toHaveBeenCalled()
    expect(fonteDeAudioDaVoz(el)!.amplitude()).toBeNull()
  })

  it('sem Web Audio ou com exceção: false, sem lançar', async () => {
    const el = document.createElement('audio')
    expect(await prepararAnalisadorDaVoz(el, () => null)).toBe(false)
    const { ctx } = contextoFalso('running')
    ;(ctx as unknown as { createMediaElementSource: () => never }).createMediaElementSource = () => {
      throw new DOMException('já tem fonte', 'InvalidStateError')
    }
    const el2 = document.createElement('audio')
    expect(await prepararAnalisadorDaVoz(el2, () => ctx)).toBe(false)
    expect(await prepararAnalisadorDaVoz(null)).toBe(false)
    expect(fonteDeAudioDaVoz(null)).toBeNull()
  })
})
