/**
 * C0 — O SELETOR DE TEMAS NÃO PODE OFERECER O QUE O APP RECUSA.
 *
 * Achado por MEDIÇÃO, não por leitura. Ao estender a matriz de contraste para o sétimo tema, o
 * coletor recusou-se a registrar a medição de `premium` e declarou o motivo:
 *
 *     tema pedido "premium" mas o DOM aplicou "babel" — medição descartada
 *
 * A cadeia é esta:
 *  · `THEME_OPTIONS` (appearance.ts) OFERECE `premium` no seletor, com nome e amostras de cor;
 *  · `ThemeType` (appearance.ts:8) ACEITA `'premium'`;
 *  · `src/index.css` TEM a paleta completa, inclusive as regras de modo escuro;
 *  · mas `VALID_THEMES` (theme.ts:28) NÃO inclui `premium`, então `coerceTheme()` cai no
 *    `?? DEFAULT_THEME` e devolve `babel`.
 *
 * Resultado: quem escolhe "premium" recebe "babel", sem erro, sem aviso, sem nada. É um controle
 * que aparenta funcionar e não funciona — e a única razão de ninguém ter notado é que o tema
 * substituto é plausível.
 *
 * O teste trava a INVARIANTE, não o caso: toda opção oferecida no seletor tem de sobreviver à
 * normalização. Assim, um tema novo adicionado só num dos dois lugares falha aqui em vez de
 * virar outro silêncio destes.
 */
import { describe, it, expect } from 'vitest'
import { THEME_OPTIONS } from '../src/lib/appearance'
import { coerceTheme, DEFAULT_THEME } from '../src/lib/theme'

describe('todo tema oferecido no seletor sobrevive à normalização', () => {
  for (const opt of THEME_OPTIONS) {
    it(`"${opt.id}" (${opt.name}) não é rebaixado`, () => {
      expect(coerceTheme(opt.id)).toBe(opt.id)
    })
  }

  it('o seletor e a lista de temas válidos não divergem', () => {
    const rebaixados = THEME_OPTIONS.filter((o) => coerceTheme(o.id) !== o.id).map((o) => o.id)
    expect(rebaixados).toEqual([])
  })
})

describe('a normalização continua protegendo contra entrada inválida', () => {
  it('string desconhecida cai no tema padrão', () => {
    expect(coerceTheme('tema-que-nao-existe')).toBe(DEFAULT_THEME)
  })

  it('valor que não é string cai no tema padrão', () => {
    expect(coerceTheme(null)).toBe(DEFAULT_THEME)
    expect(coerceTheme(undefined)).toBe(DEFAULT_THEME)
    expect(coerceTheme(42)).toBe(DEFAULT_THEME)
  })

  it('os aliases legados continuam sendo traduzidos', () => {
    expect(coerceTheme('rams')).toBe('babel')
    expect(coerceTheme('obs')).toBe('notion')
    expect(coerceTheme('brutal')).toBe('vercel')
  })
})
