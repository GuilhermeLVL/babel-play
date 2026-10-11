import { expect, test } from '@playwright/test'

import { listarCartoes, perfil, semearCartoes } from './_fixtures'
import { abaDeCartoes, abrirTela } from './_helpers'

/**
 * OS CONTADORES DE VOCABULARIO BATEM COM O ACERVO.
 *
 * `/cartoes/palavras` (o Vocabulario de antes, hoje a aba "Palavras" da tela Cartoes) mostra o tamanho do baralho em dois lugares — o KPI do painel e a linha
 * "mostrando N de M" do catalogo — e os dois vem de caminhos diferentes (`/api/metrics/profile`
 * e `/api/vocab/pagina`). O que se prova aqui e que ambos descrevem o mesmo `GET /api/vocab`.
 */

test.beforeAll(async () => {
  await semearCartoes()
})

test.describe('Estatisticas do vocabulario', () => {
  test('o KPI do baralho e o catalogo contam o que GET /api/vocab devolve', async ({ page }) => {
    test.slow()
    const cartoes = await listarCartoes()
    const noBaralho = cartoes.filter((c) => c.inDeck == null || c.inDeck === 1).length
    expect(noBaralho).toBeGreaterThanOrEqual(12)
    const p = await perfil()
    expect(p.deckSize, 'deckSize do perfil deveria ser o total de cartoes no baralho').toBe(noBaralho)

    /* O Vocabulário é a aba "Palavras" da tela Cartões desde 10/10/2026 (o endereço de antes,
       `/vocabulario`, leva para cá: quem o prende é `cartoes.e2e.ts`). */
    await abrirTela(page, '/cartoes/palavras')
    await expect(abaDeCartoes(page, /^Palavras/)).toHaveAttribute('aria-selected', 'true')

    /* A LINHA "N de M" da aba Palavras (`.qv-quantas`, `cartoes/Palavras.tsx`): sem busca nem filtro e com o
       conteúdo em "Tudo", N e M são o acervo inteiro que `GET /api/vocab` devolve. Os quatro ladrilhos
       de fase ("Guardadas"…) saíram da tela em 11/10/2026 (protótipo `cartoes-enxuto`); a conta que
       eles provavam passou para esta linha e para o número da aba. */
    const linha = page.getByTestId('palavras-dos-cartoes').locator('.qv-quantas')
    await expect(linha).toHaveText(/^[\d.]+ de [\d.]+/, { timeout: 15_000 })
    const [, n, total] = ((await linha.textContent()) ?? '').match(/^([\d.]+) de ([\d.]+)/) ?? []
    const numero = (x: string | undefined) => Number((x ?? '').replace(/\./g, ''))
    /* Quem estuda mais de um idioma vê um por vez (o da ficha de conteúdo): o acervo que a linha conta é o
       desse idioma. `GET /api/vocab/conteudo` diz qual foi aplicado ('' = há um idioma só, vale tudo). */
    const conteudo = (await (await page.request.get('/api/vocab/conteudo?idioma=en')).json()) as { idioma: string }
    const doIdioma = cartoes.filter((c) => {
      const lingua = ((c as { srcLang?: string }).srcLang ?? '').toLowerCase().split('-')[0]
      return (c.inDeck == null || c.inDeck === 1) && (!conteudo.idioma || lingua === conteudo.idioma)
    }).length
    expect(doIdioma).toBeGreaterThanOrEqual(12)
    expect(numero(total), 'o total da aba Palavras deveria ser o do acervo do idioma').toBe(doIdioma)
    expect(numero(n), 'sem filtro, a lista mostra o acervo inteiro do idioma').toBe(doIdioma)
    // O número ao lado do nome da aba é o mesmo.
    await expect(abaDeCartoes(page, /^Palavras/)).toContainText(String(total))
  })
})
