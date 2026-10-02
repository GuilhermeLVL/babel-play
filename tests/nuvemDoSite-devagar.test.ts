/**
 * O 429 `devagar` DA NUVEM DO SITE NO CLIENTE (`functions/quest/stt.js`, o ritmo por minuto).
 *
 * `devagar` é "tente de novo daqui a pouco", não "a nuvem de hoje acabou". O contrato que o servidor
 * espera do cliente, travado aqui:
 *  - a transcrição pausa só pelo `Retry-After`, a fala daquele instante vai ao modelo local, e a nuvem
 *    volta sozinha;
 *  - a faixa "A nuvem de hoje acabou" NÃO aparece (ela é só de `cota_do_dia` e `cota_do_site`);
 *  - a tradução avulsa e a voz seguem a mesma regra.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../src/lib/nuvemDoQuest', async (original) => ({
  ...(await original<typeof import('../src/lib/nuvemDoQuest')>()),
  nuvemDoQuestAtiva: () => true,
}))

import { GroqWhisperStt } from '../src/gateway/adapters/groqWhisper'
import { ServerLlmMt } from '../src/gateway/adapters/serverLlmMt'
import { cotaDaNuvemDoQuestAcabou, marcarCotaDaNuvemDoQuest } from '../src/lib/nuvemDoQuest'

const recusa = (code: string, retryAfter: string) =>
  new Response(JSON.stringify({ code }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': retryAfter },
  })
const buscar = vi.fn()
const fala = new Float32Array(16000)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-02T12:00:00Z'))
  buscar.mockReset()
  vi.stubGlobal('fetch', buscar)
  marcarCotaDaNuvemDoQuest(false)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('429 `devagar` da nuvem do site', () => {
  it('transcrição: pausa pelo Retry-After, não marca a cota do dia, e volta sozinha', async () => {
    const stt = new GroqWhisperStt({ model: 'whisper-large-v3-turbo' })
    buscar.mockResolvedValueOnce(recusa('devagar', '5'))
    await expect(stt.transcribePcm(fala, 16000)).rejects.toMatchObject({
      status: 429,
      code: 'devagar',
      retryAfterMs: 5000,
    })
    expect(cotaDaNuvemDoQuestAcabou()).toBe(false)
    expect(stt.isAvailable()).toBe(false)
    vi.advanceTimersByTime(5001)
    expect(stt.isAvailable()).toBe(true)
  })

  it('o contraste: `cota_do_dia` marca a nuvem de hoje como acabada', async () => {
    const stt = new GroqWhisperStt({ model: 'whisper-large-v3-turbo' })
    buscar.mockResolvedValueOnce(recusa('cota_do_dia', '3600'))
    await expect(stt.transcribePcm(fala, 16000)).rejects.toMatchObject({ code: 'cota_do_dia' })
    expect(cotaDaNuvemDoQuestAcabou()).toBe(true)
  })

  it('tradução avulsa: pausa pelo Retry-After e volta', async () => {
    const mt = new ServerLlmMt()
    buscar.mockResolvedValueOnce(recusa('devagar', '3'))
    await expect(mt.translate('hello', 'en', 'pt')).rejects.toMatchObject({ status: 429 })
    expect(mt.supports('en', 'pt')).toBe(false)
    vi.advanceTimersByTime(3001)
    expect(mt.supports('en', 'pt')).toBe(true)
  })
})
