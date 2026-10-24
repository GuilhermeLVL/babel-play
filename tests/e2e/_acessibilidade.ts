import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import type { Page } from '@playwright/test'

/**
 * A VARREDURA DE ACESSIBILIDADE que as suítes dividem: WCAG 2.2 AA, só o que o axe chama de sério ou
 * crítico. O `axe-core` é injetado direto — já é dependência, e o wrapper do Playwright
 * (`@axe-core/playwright`) seria um pacote a mais para a mesma coisa.
 *
 * Devolve uma linha por regra violada (`regra: seletor (cor sobre fundo = razão) | …`, até quatro nós),
 * para que a falha do teste já diga onde está o problema. Lista vazia = a tela passa.
 */
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

/** As tags da WCAG 2.2 AA (o axe separa por versão e nível; AA inclui A). */
export const TAGS_WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const

/** `incluir`: só esta parte da tela (seletores CSS); sem ele, a página inteira. */
export async function violacoesGraves(page: Page, incluir?: string[]): Promise<string[]> {
  /* Espera as animações de entrada terminarem: no meio de um fade o texto está semitransparente,
     e o axe mede a cor MISTURADA — acusava 4,17:1 num rótulo que, parado, passa com folga. */
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
  await page.addScriptTag({ content: AXE })
  return page.evaluate(
    async ([tags, dentro]) => {
      type No = { target: string[]; any: { data?: { fgColor?: string; bgColor?: string; contrastRatio?: number } }[] }
      const axe = (
        window as unknown as {
          axe: {
            run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; impact: string; nodes: No[] }[] }>
          }
        }
      ).axe
      /* A marca (logotipo) fica de fora: WCAG 1.4.3 isenta logotipos do contraste mínimo. */
      const contexto = dentro
        ? { include: dentro.map((s) => [s]), exclude: [['.font-marca']] }
        : { exclude: [['.font-marca']] }
      const r = await axe.run(contexto, { runOnly: { type: 'tag', values: tags } })
      return r.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map(
          (v) =>
            `${v.id}: ${v.nodes
              .slice(0, 4)
              .map((n) => {
                const x = n.any[0]?.data
                return (
                  n.target.join(' ') +
                  (x?.contrastRatio ? ` (${x.fgColor} sobre ${x.bgColor} = ${x.contrastRatio})` : '')
                )
              })
              .join(' | ')}`,
        )
    },
    [[...TAGS_WCAG_AA], incluir ?? null] as const,
  )
}
