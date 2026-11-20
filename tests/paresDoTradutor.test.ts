import { describe, expect, it } from 'vitest'

import { paresDoTradutor } from '../src/lib/captura/salvarSessao'

/** O sentido que importa é conteúdo → você; o seu só com microfone (22/10/2026). */
describe('paresDoTradutor', () => {
  it('sem microfone: só o sentido do conteúdo para você', () => {
    expect(paresDoTradutor('pt', 'en', false)).toEqual([['en', 'pt']])
  })
  it('com microfone: os dois sentidos, o do conteúdo primeiro', () => {
    expect(paresDoTradutor('pt', 'en', true)).toEqual([
      ['en', 'pt'],
      ['pt', 'en'],
    ])
  })
})
