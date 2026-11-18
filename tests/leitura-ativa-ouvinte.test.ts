/**
 * O OUVIDO DA LEITURA EM VOZ ALTA (spec `leitura-ativa-voz-alta`): só motor local, por construção. Sem motor local,
 * falha sem abrir nada (nunca a nuvem); a Web Speech só é aberta com `processLocally`; e `descartar()` solta a sessão
 * da frase que acabou e abre uma limpa.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  abrirOuvinteLocal,
  type MotorLocal,
  ouvinteDisponivel,
  WEB_SPEECH_LOCAL,
} from '../src/lib/leituraAtiva/ouvinteLocal'

function motorFalso(o: { disponivel?: boolean; lanca?: boolean } = {}) {
  const sessoes: Array<{ parada: boolean; cb: Parameters<MotorLocal['iniciar']>[1] }> = []
  const motor: MotorLocal = {
    id: 'falso',
    disponivel: () => o.disponivel ?? true,
    iniciar: (_lang, cb) => {
      if (o.lanca) throw new Error('sem reconhecimento no aparelho')
      const s = { parada: false, cb }
      sessoes.push(s)
      return { stop: () => (s.parada = true) }
    },
  }
  return { motor, sessoes }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ouvinteLocal', () => {
  it('a lista de motores só tem o local (a Web Speech com processLocally)', () => {
    expect(WEB_SPEECH_LOCAL.id).toBe('web-speech-local')
  })

  it('sem `processLocally` no navegador, a voz alta fica indisponível', () => {
    vi.stubGlobal('SpeechRecognition', class {})
    expect(ouvinteDisponivel()).toBe(false)
    class ComLocal {}
    Object.defineProperty(ComLocal.prototype, 'processLocally', { value: false, writable: true })
    vi.stubGlobal('SpeechRecognition', ComLocal)
    expect(ouvinteDisponivel()).toBe(true)
  })

  it('a falha local NÃO abre outro motor: avisa e devolve null', () => {
    const local = motorFalso({ lanca: true })
    const nuvem = motorFalso()
    const aoFalhar = vi.fn()
    const o = abrirOuvinteLocal({ lang: 'en-US', aoParcial: () => {}, aoFalhar, motores: [local.motor] })
    expect(o).toBeNull()
    expect(aoFalhar).toHaveBeenCalledWith('sem-motor-local')
    expect(nuvem.sessoes).toHaveLength(0)
  })

  it('a Web Speech é aberta com processLocally = true; sem a propriedade, lança e nada é ouvido', () => {
    const criados: Array<{ processLocally?: boolean; iniciou: boolean }> = []
    class Falso {
      lang = ''
      continuous = false
      interimResults = false
      maxAlternatives = 1
      onresult = null
      onerror = null
      onend = null
      registro = { iniciou: false } as { processLocally?: boolean; iniciou: boolean }
      constructor() {
        criados.push(this.registro)
      }
      start() {
        this.registro.iniciou = true
        this.registro.processLocally = (this as unknown as { processLocally: boolean }).processLocally
      }
      stop() {}
      abort() {}
    }
    Object.defineProperty(Falso.prototype, 'processLocally', { value: false, writable: true })
    vi.stubGlobal('window', { SpeechRecognition: Falso })
    vi.stubGlobal('SpeechRecognition', Falso)
    const o = abrirOuvinteLocal({ lang: 'en-US', aoParcial: () => {}, aoFalhar: () => {} })
    expect(o).not.toBeNull()
    expect(criados).toEqual([{ iniciou: true, processLocally: true }])
    o!.parar()

    class SemLocal {}
    vi.stubGlobal('window', { SpeechRecognition: SemLocal })
    vi.stubGlobal('SpeechRecognition', SemLocal)
    const aoFalhar = vi.fn()
    expect(abrirOuvinteLocal({ lang: 'en-US', aoParcial: () => {}, aoFalhar })).toBeNull()
    expect(aoFalhar).toHaveBeenCalledWith('sem-motor-local')
  })

  it('descartar() a cada fim de frase solta a sessão e abre uma limpa; parar() solta e não reabre', () => {
    const { motor, sessoes } = motorFalso()
    const parciais: Array<[string, boolean]> = []
    const o = abrirOuvinteLocal({
      lang: 'en-US',
      aoParcial: (t, f) => parciais.push([t, f]),
      aoFalhar: () => {},
      motores: [motor],
    })!
    sessoes[0].cb.onPartial('lia likes')
    sessoes[0].cb.onFinal({ text: 'lia likes apples' })
    o.descartar()
    o.descartar()
    expect(sessoes.map((s) => s.parada)).toEqual([true, true, false])
    expect(parciais).toEqual([
      ['lia likes', false],
      ['lia likes apples', true],
    ])
    o.parar()
    o.descartar()
    expect(sessoes).toHaveLength(3)
    expect(sessoes[2].parada).toBe(true)
  })

  it('erro fatal do motor (permissão negada) para e avisa; aviso não fatal é ignorado', () => {
    const { motor, sessoes } = motorFalso()
    const aoFalhar = vi.fn()
    abrirOuvinteLocal({ lang: 'en-US', aoParcial: () => {}, aoFalhar, motores: [motor] })
    sessoes[0].cb.onError?.(Object.assign(new Error('fale mais perto'), { codigo: 'no-speech' }))
    expect(aoFalhar).not.toHaveBeenCalled()
    sessoes[0].cb.onError?.(Object.assign(new Error('negado'), { codigo: 'not-allowed', fatal: true }))
    expect(aoFalhar).toHaveBeenCalledWith('negado')
  })
})
