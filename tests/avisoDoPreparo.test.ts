/**
 * O AVISO DO PREPARO no intérprete: o painel de preparo da captura fica por baixo da tela do
 * intérprete, então o que ele diria vira a linha da faixa do meio.
 */
import { describe, expect, it } from 'vitest'

import type { ModelPrepState } from '../src/components/ModelPrepPanel'
import { avisoDoPreparo } from '../src/lib/captura/avisoDoPreparo'

const base: ModelPrepState = { whisper: null, mt: null, fromCache: false, error: null, done: false }

describe('avisoDoPreparo', () => {
  it('nada a esperar: nenhuma linha', () => {
    expect(avisoDoPreparo(null)).toBeNull()
    expect(avisoDoPreparo({ ...base, mt: 1, done: true })).toBeNull()
  })

  it('o tradutor dos dois lados carregando mostra a porcentagem', () => {
    expect(avisoDoPreparo({ ...base, mt: 0.42 })).toBe('Preparando a tradução dos dois lados · 42%')
  })

  it('o reconhecimento de voz vem antes da tradução', () => {
    expect(avisoDoPreparo({ ...base, whisper: 0.1, mt: 0.5 })).toBe('Baixando o reconhecimento de voz · 10%')
    expect(avisoDoPreparo({ ...base, mt: 0.5, nativos: { voz: null } })).toBe('Instalando o reconhecimento de voz…')
  })

  it('o erro vence tudo', () => {
    expect(avisoDoPreparo({ ...base, mt: 0.5, error: 'Sem espaço no aparelho' })).toBe('Sem espaço no aparelho')
  })

  it('nunca promete 100% antes de acabar', () => {
    expect(avisoDoPreparo({ ...base, mt: 0.999 })).toBe('Preparando a tradução dos dois lados · 99%')
  })
})
