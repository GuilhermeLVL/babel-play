/**
 * PARCIAL/FINAL DA WEB SPEECH → SEGMENTOS — o mesmo balão que o pipeline produz: o parcial cria e
 * reescreve um balão `isPartial`, o final o fecha NO MESMO id e pede a tradução. Compartilhado entre o
 * microfone (anti-eco, `falada`) e o áudio da aba/sistema (`source: 'system'`, sem `falada`).
 */
import { describe, expect, it, vi } from 'vitest'

import { segmentosDaWebSpeech } from '../src/lib/captura/segmentosDaWebSpeech'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'

function montar(extra: Record<string, unknown> = {}) {
  let segs: SpeechSegment[] = []
  const setSpeechSegments = (f: SpeechSegment[] | ((p: SpeechSegment[]) => SpeechSegment[])) => {
    segs = typeof f === 'function' ? f(segs) : f
  }
  const translateSegment = vi.fn()
  let relogio = 1000
  const s = segmentosDaWebSpeech({
    source: 'system',
    speakerId: 'system',
    idiomaDasPalavras: 'en',
    de: () => 'en',
    para: () => 'pt',
    falada: false,
    idDoParcialRef: { current: null },
    timerRef: { current: 5 },
    nowRel: () => relogio,
    setSpeechSegments,
    translateSegment,
    ...extra,
  })
  return { s, segs: () => segs, translateSegment, avancar: (ms: number) => (relogio += ms) }
}

describe('segmentosDaWebSpeech', () => {
  it('parcial cria UM balão e o reescreve; o final o fecha no mesmo id e traduz', () => {
    const m = montar()
    m.s.aoParcial('hello')
    m.s.aoParcial('hello every')
    expect(m.segs()).toHaveLength(1)
    expect(m.segs()[0]).toMatchObject({
      source: 'system',
      speakerId: 'system',
      isPartial: true,
      originalText: 'hello every',
      tStartMs: 1000,
    })
    const id = m.segs()[0].id
    m.avancar(800)
    m.s.aoFinal('hello everyone')
    expect(m.segs()).toHaveLength(1)
    expect(m.segs()[0]).toMatchObject({
      id,
      isPartial: false,
      originalText: 'hello everyone',
      tStartMs: 1000,
      tEndMs: 1800,
    })
    expect(m.segs()[0].words.length).toBeGreaterThan(0)
    expect(m.translateSegment).toHaveBeenCalledWith(id, 'hello everyone', 'en', 'pt', { falada: false })
  })

  it('final sem parcial antes: balão novo; o próximo parcial abre OUTRO balão', () => {
    const m = montar()
    m.s.aoFinal('one')
    m.s.aoParcial('two')
    expect(m.segs()).toHaveLength(2)
    expect(m.segs()[1].isPartial).toBe(true)
  })

  it('texto vazio não cria nada; `ignorar` (anti-eco) descarta e solta o parcial', () => {
    let ignorar = false
    const m = montar({ ignorar: () => ignorar })
    m.s.aoParcial('   ')
    m.s.aoFinal('')
    expect(m.segs()).toHaveLength(0)
    m.s.aoParcial('eco')
    ignorar = true
    m.s.aoFinal('eco do tts')
    expect(m.translateSegment).not.toHaveBeenCalled()
    ignorar = false
    m.s.aoFinal('minha fala')
    expect(m.segs().map((s) => s.originalText)).toEqual(['eco', 'minha fala'])
  })

  it('REDE DE SEGURANÇA: final igual ao anterior da mesma fonte (até 3 s) não abre outro balão', () => {
    const m = montar()
    m.s.aoFinal('olá tudo bem')
    m.avancar(500)
    m.s.aoFinal('Olá, tudo bem.')
    expect(m.segs()).toHaveLength(1)
    expect(m.translateSegment).toHaveBeenCalledTimes(1)
  })

  it('REDE DE SEGURANÇA: final que ESTENDE o anterior o substitui (mesmo id, retraduz), e o parcial aberto sai', () => {
    const m = montar()
    m.s.aoFinal('olá tudo')
    const id = m.segs()[0].id
    m.avancar(800)
    m.s.aoParcial('olá tudo bem com')
    m.s.aoFinal('olá tudo bem com você')
    expect(m.segs()).toHaveLength(1)
    expect(m.segs()[0]).toMatchObject({ id, originalText: 'olá tudo bem com você', isPartial: false, tEndMs: 1800 })
    expect(m.translateSegment).toHaveBeenLastCalledWith(id, 'olá tudo bem com você', 'en', 'pt', { falada: false })
  })

  it('fala nova, ou a mesma frase depois de 3 s: balão novo', () => {
    const m = montar()
    m.s.aoFinal('olá tudo bem')
    m.avancar(500)
    m.s.aoFinal('vamos embora')
    m.avancar(3100)
    m.s.aoFinal('vamos embora')
    expect(m.segs().map((s) => s.originalText)).toEqual(['olá tudo bem', 'vamos embora', 'vamos embora'])
  })
})
