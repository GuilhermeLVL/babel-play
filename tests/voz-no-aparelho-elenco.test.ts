/**
 * O ELENCO COM A VOZ NO APARELHO: as 10 vozes do Supertonic entram no `atribuirVozes` de sempre (determinístico, sem
 * gênero pelo nome); o narrador fica com a voz escolhida (padrão F1) e as personagens recebem vozes distintas.
 */
import { describe, expect, it } from 'vitest'

import { atribuirVozes } from '../src/core/avatar/elenco'
import { VOZ_PADRAO_DO_NARRADOR, VOZES_DO_SUPERTONIC } from '../src/core/voz/supertonic'

const vozes = VOZES_DO_SUPERTONIC.map((id) => ({ id, idioma: 'pt' }))
const personagens = ['Capitu', 'Bentinho', 'José Dias', 'Escobar', 'Prima Justina']

describe('elenco com a voz no aparelho', () => {
  it('narrador F1 por padrão; personagens com vozes F/M distintas, nenhuma igual à do narrador', () => {
    const d = atribuirVozes(personagens, vozes, { idioma: 'pt', vozPrincipal: VOZ_PADRAO_DO_NARRADOR })
    expect(d.narrador).toBe('F1')
    const usadas = personagens.map((p) => d.personagens[p])
    expect(new Set(usadas).size).toBe(personagens.length)
    expect(usadas).not.toContain('F1')
    for (const v of usadas) expect(VOZES_DO_SUPERTONIC).toContain(v)
    expect(d.repetidas).toEqual([])
  })

  it('determinístico: a ordem de entrada não muda nada; outra voz de narrador sai da piscina', () => {
    const a = atribuirVozes(personagens, vozes, { idioma: 'pt', vozPrincipal: 'M2' })
    const b = atribuirVozes([...personagens].reverse(), [...vozes].reverse(), { idioma: 'pt', vozPrincipal: 'M2' })
    expect(a).toEqual(b)
    expect(a.narrador).toBe('M2')
    expect(Object.values(a.personagens)).not.toContain('M2')
  })
})
