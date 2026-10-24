import { expect, type Page, test } from '@playwright/test'

import { abrirTela, fecharSobreposicoes, trilho } from './_helpers'

/**
 * A ENTRADA DAS TELAS (B1, B2 e B3 da auditoria de 23/10/2026, `docs/auditoria/2026-10-23-trilho-e-animacoes.md`).
 *
 * Antes: ao abrir o Intérprete pelo trilho, a tela inteira entrava com escala e desfoque e a conversa (que
 * era `position: fixed; left: 108px`) ficava 108 px à direita durante 600 ms e pulava para o lugar no fim
 * (B1); a conversa rodava a entrada dela ao mesmo tempo (B2); e, na primeira visita, ~350 ms de tela
 * vazia, porque o `lazy` suspendia mesmo com o pedaço já baixado (B3).
 *
 * Aqui, em 1440×900, amostrando por quadro (rAF) por 800 ms depois do clique:
 *   · o x da conversa nunca difere do final em mais de 12 px;
 *   · nenhum trecho com a área da tela vazia (opacidade ~0 ou sem a tela nova) passa de 100 ms, com o
 *     pedaço da tela pré-carregado (o toque no item pede o pedaço; aqui o pedido vem antes do clique);
 *   · com `prefers-reduced-motion: reduce`, nenhuma animação nem transição dentro da tela na entrada.
 *
 * Troca o tamanho sozinho: roda só no projeto de 1280.
 */

interface Quadro {
  t: number
  x: number | null
  opacidade: number
  temConteudo: boolean
  animacoes: string[]
}

/** Começa a amostrar a cada quadro, por `ms`; o resultado fica em `window.__quadros`. */
async function amostrar(page: Page, ms: number) {
  await page.evaluate((duracao) => {
    const w = window as unknown as { __quadros: unknown[] }
    w.__quadros = []
    const t0 = performance.now()
    const passo = () => {
      const tela = document.querySelector<HTMLElement>('.px-tela')
      const int = document.querySelector<HTMLElement>('.int[data-pagina]')
      const filho = tela?.firstElementChild
      w.__quadros.push({
        t: performance.now() - t0,
        x: int ? int.getBoundingClientRect().x : null,
        opacidade: tela ? Number(getComputedStyle(tela).opacity) : 0,
        /* Conteúdo: a tela de antes (o palco do Início) ou a conversa. A captura sem a conversa (a página
           do Intérprete ainda suspensa) e o fallback do `Suspense` são a área vazia. */
        temConteudo: !!filho && !filho.classList.contains('carregando-da-tela') && (filho.matches('.q-palco') || !!int),
        animacoes: document
          .getAnimations()
          .filter((a) => {
            const alvo = (a.effect as KeyframeEffect | null)?.target
            return a.playState === 'running' && !!alvo && !!tela && tela.contains(alvo as Node)
          })
          .map((a) => {
            const alvo = (a.effect as KeyframeEffect).target as Element
            const nome = (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? 'waapi'
            return `${alvo.className?.toString().slice(0, 30)}:${nome}`
          }),
      })
      if (performance.now() - t0 < duracao) requestAnimationFrame(passo)
    }
    requestAnimationFrame(passo)
  }, ms)
}

const quadros = (page: Page) => page.evaluate(() => (window as unknown as { __quadros: Quadro[] }).__quadros)

/** O maior trecho contínuo, em ms, em que a área da tela fica vazia. */
function maiorVazio(qs: Quadro[]): number {
  let maior = 0
  let inicio: number | null = null
  for (const q of qs) {
    const vazio = q.opacidade < 0.05 || !q.temConteudo
    if (vazio && inicio === null) inicio = q.t
    if (!vazio && inicio !== null) {
      maior = Math.max(maior, q.t - inicio)
      inicio = null
    }
  }
  if (inicio !== null) maior = Math.max(maior, qs[qs.length - 1].t - inicio)
  return maior
}

const itemDoInterprete = (page: Page) => trilho(page).locator('.q-item[data-px-rota="interprete"]')

/** Abre o Início e pede o pedaço do Intérprete como o toque pede (`precarga.ts`), sem navegar ainda. */
async function prepararNoInicio(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await abrirTela(page, '/')
  await fecharSobreposicoes(page)
  await expect(itemDoInterprete(page)).toBeVisible()
  await itemDoInterprete(page).dispatchEvent('pointerdown')
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(800)
  await fecharSobreposicoes(page)
  /* CPU_LENTA=4 imita a máquina da CI (4x mais lenta): a tela não pode esvaziar nem aí. */
  const lenta = Number(process.env.CPU_LENTA || 1)
  if (lenta > 1) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: lenta })
  }
}

test.describe('entrada das telas', () => {
  test.beforeEach(({ browserName: _ }, info) => {
    test.skip(info.project.name !== 'desktop-1280', 'troca o tamanho sozinho')
  })

  test('Intérprete pelo trilho: sem deslocamento e sem tela vazia', async ({ page }) => {
    await prepararNoInicio(page)
    await amostrar(page, 800)
    await itemDoInterprete(page).click()
    // O final é medido com tudo parado (a entrada de antes durava até ~1,2 s depois do clique).
    await page.waitForTimeout(1800)
    const qs = await quadros(page)
    const comX = qs.filter((q) => q.x !== null)
    expect(comX.length, 'a conversa montou dentro dos 800 ms').toBeGreaterThan(0)
    const final = await page.locator('.int[data-pagina]').evaluate((el) => el.getBoundingClientRect().x)
    const deriva = Math.max(...comX.map((q) => Math.abs((q.x as number) - final)))
    expect
      .soft(deriva, `x por quadro: ${comX.map((q) => Math.round(q.x as number)).join(',')} (final ${final})`)
      .toBeLessThanOrEqual(12)
    // A conversa ocupa a área da tela, à direita do trilho (seja qual for a largura dele).
    const tela = await page.locator('.px-tela').evaluate((el) => el.getBoundingClientRect().x)
    expect.soft(Math.abs(final - tela)).toBeLessThanOrEqual(1)
    const linha = qs.map((q) => `${Math.round(q.t)}:${q.opacidade.toFixed(2)}${q.temConteudo ? '+' : '-'}`).join(' ')
    expect.soft(maiorVazio(qs), `maior trecho com a tela vazia (ms); quadros ${linha}`).toBeLessThanOrEqual(100)
  })

  test('com o "Mais" aberto por cima do Intérprete, a conversa não sai do lugar', async ({ page }) => {
    await prepararNoInicio(page)
    await itemDoInterprete(page).click()
    await expect(page.locator('.int[data-pagina]')).toBeVisible()
    await page.waitForTimeout(1200)
    const antes = await page.locator('.int[data-pagina]').evaluate((el) => el.getBoundingClientRect().x)
    const tela = await page.locator('.px-tela').evaluate((el) => el.getBoundingClientRect())
    await trilho(page).locator('.q-mais-botao').click()
    await expect(page.getByRole('dialog', { name: 'Mais destinos' })).toBeVisible()
    await page.waitForTimeout(800)
    // A tela de trás recua como um cartão (escala), e a conversa recua JUNTO, dentro dela: o x dela segue
    // o da tela, nunca os 108 px a mais de antes.
    const depois = await page.locator('.int[data-pagina]').evaluate((el) => el.getBoundingClientRect().x)
    const telaDepois = await page.locator('.px-tela').evaluate((el) => el.getBoundingClientRect().x)
    expect(Math.abs(antes - tela.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(depois - telaDepois)).toBeLessThanOrEqual(1)
  })

  test('com movimento reduzido, a tela entra sem animação', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await prepararNoInicio(page)
    await amostrar(page, 800)
    await itemDoInterprete(page).click()
    await page.waitForTimeout(1000)
    const qs = await quadros(page)
    // Só os quadros com a tela nova: o que roda no Início antes de ele sair não é da entrada.
    const animadas = [...new Set(qs.filter((q) => q.x !== null).flatMap((q) => q.animacoes))]
    expect(animadas, 'animações ou transições dentro da tela na entrada').toEqual([])
    expect(qs.some((q) => q.x !== null)).toBe(true)
  })
})
