/**
 * CHROME TRANSLATOR COM PRAZO E MEMÓRIA (auditoria de latência 2026-09-26, item 7).
 *
 * Medido no headless: `Translator.availability()` levou 6,0 s, e era chamada a CADA tradução sem
 * prazo — três legendas esperaram 6 s antes do opus-mt. Uma rejeição também não era lembrada.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChromeTranslatorMt, PRAZO_DA_DISPONIBILIDADE_MS } from '../src/gateway/adapters/chromeTranslator'

function instalar(availability: () => Promise<string>, traduzir = async (t: string) => `[${t}]`) {
  const api = {
    availability: vi.fn(availability),
    create: vi.fn(async () => ({ translate: traduzir })),
  }
  vi.stubGlobal('Translator', api)
  return api
}
/** O estado que `supports()` consulta (a API em si não existe no jsdom, então `supports` é sempre falso aqui). */
const estado = (mt: ChromeTranslatorMt, par: string) => (mt as unknown as { known: Map<string, string> }).known.get(par)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('ChromeTranslatorMt', () => {
  it('par disponível: traduz, e as próximas NÃO perguntam de novo', async () => {
    const api = instalar(async () => 'available')
    const mt = new ChromeTranslatorMt()
    await mt.translate('oi', 'pt', 'en')
    await mt.translate('tchau', 'pt', 'en')
    expect(api.availability).toHaveBeenCalledTimes(1)
  })

  it('consulta pendurada: desiste no prazo, o par sai da cascata e a espera não se repete', async () => {
    vi.useFakeTimers()
    let responder!: (s: string) => void
    const api = instalar(() => new Promise((r) => (responder = r)))
    const mt = new ChromeTranslatorMt()
    const p = mt.translate('oi', 'en', 'pt')
    const falha = expect(p).rejects.toThrow(/sem resposta/)
    await vi.advanceTimersByTimeAsync(PRAZO_DA_DISPONIBILIDADE_MS + 1)
    await falha
    expect(estado(mt, 'en|pt')).toBe('consultando') // fora da cascata: a próxima tradução vai direto ao opus-mt
    // A resposta atrasada chega: o par volta a valer, sem nova consulta.
    responder('available')
    await vi.advanceTimersByTimeAsync(0)
    expect(estado(mt, 'en|pt')).toBe('ready') // volta à cascata
    await mt.translate('oi', 'en', 'pt')
    expect(api.availability).toHaveBeenCalledTimes(1)
  })

  it('consulta que REJEITA: par marcado indisponível pela sessão', async () => {
    const api = instalar(async () => {
      throw new Error('NotSupportedError')
    })
    const mt = new ChromeTranslatorMt()
    await expect(mt.translate('oi', 'en', 'pt')).rejects.toThrow()
    expect(estado(mt, 'en|pt')).toBe('unavailable')
    expect(api.availability).toHaveBeenCalledTimes(1)
  })

  it('unavailable: lembrado', async () => {
    instalar(async () => 'unavailable')
    const mt = new ChromeTranslatorMt()
    await expect(mt.translate('oi', 'en', 'xx')).rejects.toThrow(/não cobre/)
    expect(estado(mt, 'en|xx')).toBe('unavailable')
  })
})
