/**
 * O RESUMO DO PREPARO NA FAIXA DO MEIO do modo intérprete. O preparo dos dois lados (o pacote de voz
 * do navegador, o modelo de fala do app, o tradutor dos dois sentidos) já existe no estado da captura
 * (`ModelPrepState`); a tela do intérprete só precisa de uma frase e, quando houver, uma porcentagem —
 * a barra detalhada é a da captura, que está por baixo.
 */
import { describe, expect, it } from 'vitest'

import type { ModelPrepState } from '../src/components/ModelPrepPanel'
import { resumoDoPreparo } from '../src/lib/captura/preparoDoInterprete'

const base: ModelPrepState = { whisper: null, mt: null, fromCache: false, error: null, done: false }

describe('resumoDoPreparo', () => {
  it('sem preparo em curso: nada a mostrar', () => {
    expect(resumoDoPreparo(null)).toBeNull()
    expect(resumoDoPreparo({ ...base, whisper: 1, mt: 1, done: true })).toBeNull()
  })

  it('o tradutor dos dois sentidos: a porcentagem somada', () => {
    expect(resumoDoPreparo({ ...base, mt: 0.25 })).toEqual({ texto: 'Preparando a tradução…', pct: 25 })
    expect(resumoDoPreparo({ ...base, mt: 0.75 })).toEqual({ texto: 'Preparando a tradução…', pct: 75 })
  })

  it('o pacote de voz do navegador não informa porcentagem', () => {
    expect(resumoDoPreparo({ ...base, nativos: { voz: null } })).toEqual({
      texto: 'Preparando o reconhecimento de voz…',
      pct: null,
    })
  })

  it('o modelo de fala do app vem antes da tradução (é o que impede de falar)', () => {
    expect(resumoDoPreparo({ ...base, whisper: 0.5, mt: 0.1 })).toEqual({
      texto: 'Preparando o modelo de voz…',
      pct: 50,
    })
  })

  it('o pacote de voz vem antes de todos', () => {
    expect(resumoDoPreparo({ ...base, nativos: { voz: null }, whisper: 0.5, mt: 0.1 })?.texto).toBe(
      'Preparando o reconhecimento de voz…',
    )
  })

  it('o que já está pronto não conta: só falta a tradução', () => {
    expect(resumoDoPreparo({ ...base, whisper: 1, mt: 0.4, nativos: { voz: 1 } })).toEqual({
      texto: 'Preparando a tradução…',
      pct: 40,
    })
  })

  it('erro: a frase do erro, sem porcentagem', () => {
    expect(resumoDoPreparo({ ...base, error: 'sem rede' })).toEqual({
      texto: 'Não foi possível preparar o modelo. Saia e tente de novo.',
      pct: null,
    })
  })
})
