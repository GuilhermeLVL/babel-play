import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PAR_DO_TEMA } from '../src/lib/galeria/parDoTema'

/* A prévia claro/escuro dos cartões de tema (Personalizar) repete cores de `src/index.css`.
   Se alguém mexer num tema lá, esta tabela tem de acompanhar — senão o cartão mente sobre o tema. */
const css = readFileSync(join(__dirname, '..', 'src', 'index.css'), 'utf8')
const bloco = (sel: string) => {
  const i = css.indexOf(sel)
  if (i < 0) return null
  const a = css.indexOf('{', i)
  return css.slice(a + 1, css.indexOf('}', a))
}
const v = (b: string | null, k: string) => b?.match(new RegExp(`--${k}:\\s*([^;]+);`))?.[1]?.trim()

describe('par claro/escuro dos temas', () => {
  for (const [tema, par] of Object.entries(PAR_DO_TEMA)) {
    it(`${tema} bate com o index.css`, () => {
      const claro = bloco(`[data-theme="${tema}"] {`) ?? bloco(`[data-theme="${tema}"],`)
      const escuro = bloco(`[data-theme="${tema}"].dark,`) ?? claro
      expect(par.claro).toEqual([v(claro, 'surface'), v(claro, 'canvas'), v(claro, 'accent')])
      expect(par.escuro).toEqual([v(escuro, 'surface'), v(escuro, 'canvas'), v(escuro, 'accent')])
    })
  }
})
