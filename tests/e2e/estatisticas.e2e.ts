import { expect, test } from '@playwright/test'

import { listarCartoes, perfil, semearCartoes } from './_fixtures'
import { clicarRobusto, fecharSobreposicoes } from './_helpers'

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

    await page.goto('/vocabulario')
    await expect(page.getByRole('main')).toBeVisible()
    await fecharSobreposicoes(page)

    /* A TELA ABRE NAS PALAVRAS, nao no painel (redesign v4): quem entra em Vocabulario vem ver as
       palavras, e o painel de analise virou uma aba ao lado. O KPI do volume lexical mora nessa
       aba, entao o teste passa por ela — antes ela era a aba inicial e o `goto` bastava. */
    await clicarRobusto(page, page.getByRole('tab', { name: /Visão geral|Resumo/ }))

    const kpi = page.getByRole('button', { name: 'Abrir o detalhamento do volume lexical' })
    await expect(kpi).toBeVisible({ timeout: 15_000 })
    /* O numero grande do KPI e o elemento `text-4xl`; o texto do cartao inteiro emenda o rotulo
       e o "N novos • M p/ revisar" sem espaco ("Palavras guardadas1515 novos"). */
    const grande = kpi.locator('.text-4xl').first()
    await expect(grande).toContainText(/\d/)
    const texto = (await grande.textContent()) ?? ''
    const numeroGrande = Number(texto.replace(/\./g, '').replace(/\D/g, ''))
    expect(numeroGrande, `o KPI diz "${texto.trim()}" e o servidor tem ${noBaralho} cartoes`).toBe(noBaralho)

    /* O catalogo (F5) pagina no servidor e anuncia o total. Ele mora na aba das palavras desde o
       redesign v4 — o painel de analise e a lista deixaram de dividir a mesma tela —, entao o
       teste volta para la. As duas contagens continuam vindo de caminhos diferentes, que e o
       ponto do arquivo; o que mudou foi so em qual aba cada uma aparece. */
    await clicarRobusto(page, page.getByRole('tab', { name: /Minhas palavras|Minhas cartas/ }))
    const linha = page.getByText(/mostrando \d+ de \d+/)
    await expect(linha).toBeVisible({ timeout: 15_000 })
    const total = Number(((await linha.textContent()) ?? '').match(/de (\d+)/)?.[1])
    expect(total, 'o total do catalogo deveria ser o do acervo').toBe(cartoes.length)
  })
})
