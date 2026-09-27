// @vitest-environment jsdom
/**
 * TEMA COMPLETO (recompensas v2, onda 4, Task 4.1).
 *
 * "Pele sobre a mesma estrutura": o tema troca paleta (claro e escuro), fonte de título, textura,
 * fundo animado leve, pacote de sons, forma de partícula e a pele do HUD — e nada além disso.
 * Layout, ícones e componentes continuam os mesmos. Este arquivo trava as pontas que um tema novo
 * precisa amarrar em lugares diferentes do código (catálogo, seletor, partículas, som, CSS) e as
 * regras de economia e de aparelho que valem para todos eles.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { precoSeedsDoItem } from '../src/core/temporada'
import { THEME_OPTIONS } from '../src/lib/appearance'
import { EFEITOS_PADRAO, planoDeComemoracao } from '../src/lib/comemoracao'
import { FORMA_DO_TEMA, PARTICLE_PRESETS } from '../src/lib/effects'
import { PAR_DO_TEMA } from '../src/lib/galeria/parDoTema'
import { proximaRecompensa } from '../src/lib/galeria/progressao'
import { CATALOGO_DA_LOJA, estadoDoItem, soPorSeeds, vitrineDoProximoNivel } from '../src/lib/loja'
import { vozDoTema } from '../src/lib/soundFx'
import { coerceTheme } from '../src/lib/theme'

const TEMAS_NOVOS = ['radio', 'papel', 'neon', 'fliperama', 'jardim', 'observatorio'] as const
const TEMAS_ANTIGOS = ['babel', 'linear', 'vercel', 'mochi', 'notion', 'premium', 'aurora', 'custom'] as const

const raiz = process.cwd()
const cssTemas = readFileSync(path.join(raiz, 'src/styles/temas-v2.css'), 'utf8')
const cssBase = readFileSync(path.join(raiz, 'src/index.css'), 'utf8')
const cssPrototipo = readFileSync(path.join(raiz, 'src/styles/prototipo.css'), 'utf8')

/** O corpo do primeiro bloco cujo seletor começa exatamente assim. */
function bloco(css: string, seletor: string): string | null {
  const i = css.indexOf(seletor)
  if (i < 0) return null
  const a = css.indexOf('{', i)
  return css.slice(a + 1, css.indexOf('}', a))
}

describe('os seis temas novos existem em todas as pontas', () => {
  for (const id of TEMAS_NOVOS) {
    it(`${id}: catálogo, seletor, partículas, forma e som`, () => {
      const item = CATALOGO_DA_LOJA.find((i) => i.tipo === 'tema' && i.alvo === id)
      expect(item, `tema ${id} fora do catálogo`).toBeDefined()
      expect(THEME_OPTIONS.some((o) => o.id === id)).toBe(true)
      expect(coerceTheme(id)).toBe(id)
      expect(PARTICLE_PRESETS[id]).toBeDefined()
      expect(FORMA_DO_TEMA[id]).toBeDefined()
      // Pacote de sons próprio: não pode cair no timbre neutro do Customizado.
      expect(vozDoTema(id)).not.toBe(vozDoTema('custom'))
      expect(PAR_DO_TEMA[id]).toBeDefined()
    })
  }
})

describe('economia: o nível abre antes das Seeds, então os temas novos são só Seeds', () => {
  /* O Observatório virou exclusivo da Temporada 1 na onda 5: sem preço até um ano depois do fim da
     temporada (`tests/temporada.test.ts`). Os outros cinco continuam só de Seeds. */
  const todos = CATALOGO_DA_LOJA.filter((i) => i.tipo === 'tema' && (TEMAS_NOVOS as readonly string[]).includes(i.alvo))
  const novos = todos.filter((i) => !i.origemTemporada)

  it('o Observatório é da temporada e volta com preço de épico dentro da faixa', () => {
    const obs = todos.find((i) => i.alvo === 'observatorio')!
    expect(obs.origemTemporada?.temporada).toBe('t1')
    expect(precoSeedsDoItem(obs, Date.parse('2028-01-01'))).toBe(3000)
  })

  it('todo tema novo tem preço de raro ou épico dentro da faixa calibrada', () => {
    const faixa = { raro: [1000, 1300], epico: [2600, 3000] } as const
    for (const i of novos) {
      expect(['raro', 'epico'], i.id).toContain(i.raridade)
      const [min, max] = faixa[i.raridade as 'raro' | 'epico']
      expect(i.precoSeeds, i.id).toBeGreaterThanOrEqual(min)
      expect(i.precoSeeds, i.id).toBeLessThanOrEqual(max)
    }
  })

  it('nenhum tema novo destrava por nível (nem no nível 999)', () => {
    localStorage.clear()
    for (const i of novos) {
      expect(soPorSeeds(i), i.id).toBe(true)
      expect(estadoDoItem(i, 999, 0).estado, i.id).toBe('bloqueado')
      expect(estadoDoItem(i, 999, 0).motivo, i.id).toBe(`${i.precoSeeds} Seeds`)
      expect(estadoDoItem(i, 1, i.precoSeeds!).estado, i.id).toBe('compravel')
    }
  })

  it('a vitrine do próximo nível e a próxima recompensa não prometem item só de Seeds', () => {
    for (const n of [1, 5, 9, 10, 50]) {
      expect(vitrineDoProximoNivel(n).some(soPorSeeds)).toBe(false)
      expect(proximaRecompensa(n)?.itens.some(soPorSeeds) ?? false).toBe(false)
    }
  })
})

describe('CSS do tema completo', () => {
  it('os 8 temas de antes ganham os tokens neutros (sem textura, sem fundo animado, HUD padrão)', () => {
    const raizDoCss = bloco(cssBase, ':root {')!
    expect(raizDoCss).toMatch(/--textura:\s*none;/)
    expect(raizDoCss).toMatch(/--fundo-animado:\s*none;/)
    expect(raizDoCss).toMatch(/--hud-barra:/)
    expect(raizDoCss).toMatch(/--hud-combo-quente:/)
    for (const t of TEMAS_ANTIGOS) expect(cssTemas).not.toContain(`[data-theme="${t}"]`)
  })

  it('o HUD dos jogos lê os tokens --hud-* (com o desenho de hoje como reserva)', () => {
    expect(cssPrototipo).toMatch(/\.hud-progresso span\{[^}]*var\(--hud-barra/)
    expect(cssPrototipo).toMatch(/\.combo\{[^}]*var\(--hud-combo/)
    expect(cssPrototipo).toMatch(/\.combo\.quente\{[^}]*var\(--hud-combo-quente/)
    // A chama da sequência quente é o ícone lucide `Flame` no HUD, não um emoji em `content`.
    expect(cssPrototipo).not.toMatch(/content:\s*"\p{Extended_Pictographic}/u)
  })

  for (const id of TEMAS_NOVOS) {
    it(`${id}: bloco claro e escuro com fonte, textura, fundo animado e HUD`, () => {
      const claro = bloco(cssTemas, `[data-theme="${id}"] {`)
      const escuro = bloco(cssTemas, `[data-theme="${id}"].dark,`)
      expect(claro, `${id} sem bloco claro`).not.toBeNull()
      expect(escuro, `${id} sem bloco escuro`).not.toBeNull()
      for (const token of ['--font-display-val', '--textura', '--fundo-animado', '--hud-barra', '--hud-combo-quente', '--canvas', '--accent'])
        expect(claro, `${id} claro sem ${token}`).toContain(`${token}:`)
      for (const token of ['--canvas', '--surface', '--ink', '--accent', '--accent-contrast'])
        expect(escuro, `${id} escuro sem ${token}`).toContain(`${token}:`)
    })
  }

  it('a fonte de título do tema cede à letra escolhida em Acessibilidade (fica numa camada)', () => {
    // As regras [data-fonte] de index.css ficam fora de camada; o tema, dentro de @layer base.
    expect(cssTemas).toMatch(/@layer base\s*\{/)
  })

  it('modo leve e movimento reduzido zeram o fundo animado', () => {
    expect(cssTemas).toMatch(/html\[data-modo-leve='true'\]\s*\{[^}]*--fundo-animado:\s*none\s*!important/)
    expect(cssTemas).toMatch(/html\[data-modo-leve='true'\][^{]*::before\s*\{[^}]*animation:\s*none/)
    const reduzido = cssTemas.slice(cssTemas.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduzido).toMatch(/--fundo-animado:\s*none\s*!important/)
    expect(reduzido).toMatch(/animation:\s*none/)
  })

  it('o fundo animado é CSS puro e leve: nada de canvas, imagem ou arquivo externo', () => {
    expect(cssTemas).not.toMatch(/url\(/)
    expect(cssTemas).not.toMatch(/<canvas|(^|[\s,>}])canvas\s*[{,]/im)
    expect(Buffer.byteLength(cssTemas, 'utf8')).toBeLessThan(40_000)
    // Anima só transform/opacity (camada do compositor), nunca background-position da tela inteira.
    for (const kf of cssTemas.matchAll(/@keyframes\s+[\w-]+\s*\{([\s\S]*?)\}\s*\}/g))
      expect(kf[1]).not.toMatch(/background-position|width|height|top|left/)
  })
})

describe('o tema entrega a forma de partícula ao motor de comemoração', () => {
  const CTX = { leve: false, semSom: false, efeitos: EFEITOS_PADRAO }

  it('sem forma própria no efeito, o acerto e o combo saem na forma do tema', () => {
    const acerto = planoDeComemoracao({ tipo: 'acerto', combo: 1 }, { ...CTX, formaDoTema: 'pixel' })
    expect(acerto.rajadas[0].forma).toBe('pixel')
    const combo = planoDeComemoracao({ tipo: 'combo', multiplicador: 2 }, { ...CTX, formaDoTema: 'pixel' })
    expect(combo.rajadas[0].forma).toBe('pixel')
  })

  it('o erro e a finalização com forma própria não mudam', () => {
    const erro = planoDeComemoracao({ tipo: 'erro' }, { ...CTX, formaDoTema: 'pixel' })
    expect(erro.rajadas[0].forma).toBeUndefined()
    const fim = planoDeComemoracao({ tipo: 'rodada', estrelas: 3, jogo: 'termo' }, { ...CTX, formaDoTema: 'pixel' })
    expect(fim.rajadas[0].forma).toBe('confete')
  })

  it('sem tema com forma, o plano é o de sempre', () => {
    expect(planoDeComemoracao({ tipo: 'acerto', combo: 1 }, CTX).rajadas[0].forma).toBeUndefined()
  })
})
