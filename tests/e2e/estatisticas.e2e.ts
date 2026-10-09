import { expect, test } from '@playwright/test'

import { listarCartoes, perfil, semearCartoes } from './_fixtures'
import { abrirTela } from './_helpers'

/**
 * OS CONTADORES DE VOCABULARIO BATEM COM O ACERVO.
 *
 * `/vocabulario` mostra o tamanho do baralho em dois lugares — o KPI do painel e a linha
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

    await abrirTela(page, '/vocabulario')

    /* O NÚMERO "Guardadas" (aba Minhas palavras, a primeira das quatro fases do baralho —
       `data-testid="fases-do-baralho"`, `VocabularioDoQuest`) conta o baralho que `GET /api/vocab`
       devolve. Enquanto o baralho chega a tela mostra "—", nunca um zero falso: daí a espera. */
    const guardadas = page.getByTestId('fases-do-baralho').locator('.q-num', { hasText: 'Guardadas' }).locator('b')
    await expect(guardadas).toHaveText(/^[\d.]+$/, { timeout: 15_000 })
    const texto = (await guardadas.textContent()) ?? ''
    const numeroGrande = Number(texto.replace(/\./g, '').replace(/\D/g, ''))
    expect(numeroGrande, `"Guardadas" diz "${texto.trim()}" e o servidor tem ${cartoes.length} cartoes`).toBe(
      cartoes.length,
    )

    /* O catalogo (F5) pagina no servidor e anuncia o total. Ele mora na aba das palavras desde o
       redesign v4 — o painel de analise e a lista deixaram de dividir a mesma tela —, entao o
       teste volta para la. As duas contagens continuam vindo de caminhos diferentes, que e o
       ponto do arquivo; o que mudou foi so em qual aba cada uma aparece. */
    /* "N de M no caderno", ao lado do titulo "Todas as palavras" (prototipo). Sem filtro, N e o
       total que o servidor achou para a pagina — e e ele que tem de bater com o acervo. */
    const linha = page.getByText(/^[\d.]+ de [\d.]+ no caderno$/)
    await expect(linha).toBeVisible({ timeout: 15_000 })
    const total = Number(((await linha.textContent()) ?? '').match(/^([\d.]+) de/)?.[1].replace(/\./g, ''))
    expect(total, 'o total do catalogo deveria ser o do acervo').toBe(cartoes.length)
  })
})
