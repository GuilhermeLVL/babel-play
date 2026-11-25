/**
 * A escolha do motor da prática de pronúncia (openspec `sombra-sem-web-speech` 2.1): matriz navegador x perfil x idioma.
 */
import { describe, expect, it } from 'vitest'

import { type EntradaDaSombra, motorDaSombra, motorEhLocal } from '../src/core/fala/motorDaSombra'

const base: EntradaDaSombra = {
  webSpeechExiste: true,
  webSpeechPermitido: true,
  idioma: 'en-US',
  aparelhoFraco: false,
  economiaDeDados: false,
  flag: true,
}
const com = (p: Partial<EntradaDaSombra>) => motorDaSombra({ ...base, ...p })

describe('motorDaSombra', () => {
  it('Chrome de adulto: Web Speech, com ou sem a flag (zero download)', () => {
    expect(com({}).motor).toBe('web-speech')
    expect(com({ flag: false }).motor).toBe('web-speech')
  })

  it('perfil protegido sem o responsável NUNCA usa o Web Speech: vai ao local com a flag, a nenhum sem ela', () => {
    expect(com({ webSpeechPermitido: false }).motor).toBe('local-moonshine-base')
    expect(com({ webSpeechPermitido: false, flag: false })).toEqual({ motor: 'nenhum', motivo: 'sem-flag' })
  })

  it('Firefox (sem Web Speech): local com a flag; sem ela, nenhum', () => {
    expect(com({ webSpeechExiste: false, webSpeechPermitido: true }).motor).toBe('local-moonshine-base')
    expect(com({ webSpeechExiste: false, flag: false }).motor).toBe('nenhum')
  })

  it('Quest, celular fraco e economia de dados pegam o tiny', () => {
    const sem = { webSpeechExiste: false }
    expect(com({ ...sem, aparelhoFraco: true })).toEqual({
      motor: 'local-moonshine-tiny',
      motivo: 'local-aparelho-leve',
    })
    expect(com({ ...sem, economiaDeDados: true }).motor).toBe('local-moonshine-tiny')
  })

  it('só inglês no começo: pt/es/fr sem Web Speech ficam sem nota', () => {
    for (const idioma of ['pt-BR', 'es-ES', 'fr-FR', 'de'])
      expect(com({ webSpeechExiste: false, idioma })).toEqual({ motor: 'nenhum', motivo: 'idioma-fora-do-local' })
    expect(com({ webSpeechExiste: false, idioma: 'EN' }).motor).toBe('local-moonshine-base')
  })

  it('nunca escolhe motor de nuvem: o resultado é web-speech, local-* ou nenhum', () => {
    const vistos = new Set<string>()
    for (const webSpeechExiste of [true, false])
      for (const webSpeechPermitido of [true, false])
        for (const flag of [true, false])
          for (const idioma of ['en', 'pt'])
            for (const aparelhoFraco of [true, false])
              vistos.add(com({ webSpeechExiste, webSpeechPermitido, flag, idioma, aparelhoFraco }).motor)
    for (const m of vistos) expect(m === 'web-speech' || m === 'nenhum' || motorEhLocal(m as never)).toBe(true)
  })
})
