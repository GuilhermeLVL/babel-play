/**
 * AS FALAS EM VOO ENTRAM NA SESSÃO (relato do dono, 2026-09-28).
 *
 * Ao apertar "Salvar", uma frase que acabou de terminar ainda está sendo transcrita (o balão está
 * na tela, `isPartial`). O salvamento pegava a lista daquele instante e a frase chegava depois —
 * fora da sessão. Agora ele espera as finais em voo por um prazo curto (~3 s) e as inclui; o que
 * não chegar no prazo entra com o texto parcial que já tinha, e balão vazio não vira fala.
 */
import { describe, expect, it } from 'vitest'

import { aguardarFinaisEmVoo, falasParaSalvar, PRAZO_DAS_FINAIS_MS, prazoDaMistura } from '../src/lib/captura/finaisEmVoo'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'

const fala = (id: string, texto: string, isPartial = false): SpeechSegment => ({
  id, speakerId: 'system', source: 'system', timestamp: '', originalText: texto, translatedText: '', words: [], isPartial,
})

describe('aguardarFinaisEmVoo', () => {
  it('espera a final que estava em voo e a inclui', async () => {
    let lista = [fala('a', 'primeira'), fala('b', '', true)]
    setTimeout(() => (lista = [fala('a', 'primeira'), fala('b', 'a que chegou depois')]), 30)
    const r = await aguardarFinaisEmVoo(() => lista, 1000, 5)
    expect(r.map((s) => s.originalText)).toEqual(['primeira', 'a que chegou depois'])
  })

  it('no prazo, segue com o que tem: parcial com texto entra, balão vazio não', async () => {
    const lista = [fala('a', 'ok'), fala('b', 'meia frase', true), fala('c', '', true)]
    const t0 = Date.now()
    const r = await aguardarFinaisEmVoo(() => lista, 40, 5)
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(r.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('sem nada em voo, não espera', async () => {
    const t0 = Date.now()
    await aguardarFinaisEmVoo(() => [fala('a', 'x')], 3000, 5)
    expect(Date.now() - t0).toBeLessThan(200)
    expect(PRAZO_DAS_FINAIS_MS).toBe(3000)
  })
})

describe('falasParaSalvar', () => {
  it('tira os balões sem texto', () => {
    expect(falasParaSalvar([fala('a', '  '), fala('b', 'b')]).map((s) => s.id)).toEqual(['b'])
  })
})

describe('prazoDaMistura', () => {
  it('cresce com a duração e tem teto', () => {
    expect(prazoDaMistura(0)).toBe(5000)
    expect(prazoDaMistura(60)).toBeGreaterThan(prazoDaMistura(10))
    expect(prazoDaMistura(10 * 3600)).toBe(30_000)
  })
})
