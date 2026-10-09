import { expect, test } from '@playwright/test'

import { semearBaralhoAnki } from './_fixtures'
import { abrirSeletor, baralhosNoServidor, chipDaFonte, clicarRobusto, irParaPraticar, lobby } from './_helpers'

/**
 * Baralhos do Anki: a importação e a tela de baralhos, pelo caminho do usuário.
 *
 * NO DESENHO NOVO (09/10/2026) o caminho é: Jogar → chip "Trocar: …" do cabeçalho → painel "O que
 * você vai praticar" → cartão "Trazer ou gerenciar", com "Trazer do Anki" e "Gerenciar baralhos". Os
 * dois abrem a tela "Baralhos do Anki" (abas Trazer, Levar embora, Gerenciar), cujo "voltar" traz o
 * nome da tela de origem ("Jogar").
 *
 * O BARALHO VEM DA FIXTURE (`semearBaralhoAnki`): num banco novo não há nenhum, e a parte que depende
 * de haver um ("Gerenciar", o saldo, "Jogar só com este") pulava sempre. Agora ela roda.
 */

test.beforeAll(async () => {
  await semearBaralhoAnki()
})

test.describe('Anki: importar', () => {
  test('"Trazer do Anki" abre a importação, e o voltar ("Jogar") retorna ao lobby', async ({ page }) => {
    test.slow()
    await irParaPraticar(page)

    const painel = await abrirSeletor(page)
    const botaoAnki = painel.getByRole('button', { name: 'Trazer do Anki' })
    await expect(botaoAnki).toBeVisible({ timeout: 15_000 })
    await clicarRobusto(page, botaoAnki)

    /* A tela de importação: a área de soltar o arquivo, na aba "Trazer", e o voltar do cabeçalho com
       o nome da tela de origem. */
    await expect(page.getByRole('heading', { level: 1, name: 'Baralhos do Anki' })).toBeVisible()
    await expect(page.getByRole('tab', { name: /^Trazer/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Solte o arquivo aqui')).toBeVisible()

    await clicarRobusto(page, page.getByRole('main').getByRole('button', { name: 'Jogar', exact: true }))
    await expect(lobby(page)).toBeVisible()
    await expect((await abrirSeletor(page)).getByRole('button', { name: 'Trazer do Anki' })).toBeVisible()
  })
})

test.describe('Baralhos do Anki', () => {
  /**
   * UM TESTE, UMA IDA. Isto já foram DOIS testes — abrir a tela, e depois o recorte — e cada um
   * repetia a mesma navegação. Como a entrada em `/jogar` atravessa a sala da primeira visita e uma
   * fila de recompensas que animam em tempos variáveis, dobrar a navegação dobrava a chance de
   * tropeçar nelas. Uma ida cobre as duas coisas, porque a segunda começa onde a primeira termina.
   */
  test('abre a tela, mostra o saldo, e "Jogar só com este" volta ao lobby com o baralho na fonte', async ({ page }) => {
    test.slow()
    await irParaPraticar(page)

    /* QUEM DIZ SE HÁ BARALHO É O SERVIDOR: com a fixture, tem de haver. */
    const acervo = await baralhosNoServidor(page)
    expect(acervo.quantos, `a fixture deveria ter deixado um baralho — ${acervo.porque}`).toBeGreaterThan(0)

    const painel = await abrirSeletor(page)
    const botaoBaralhos = painel.getByRole('button', { name: 'Gerenciar baralhos' })
    await expect(
      botaoBaralhos,
      'o servidor tem baralho, então a porta "Gerenciar baralhos" deveria existir',
    ).toBeVisible({
      timeout: 10_000,
    })
    await clicarRobusto(page, botaoBaralhos)

    /* "Gerenciar" é uma ABA da tela do Anki, e a porta do painel abre nela. */
    const gerenciar = page.getByRole('tab', { name: /^Gerenciar/ })
    await expect(gerenciar).toHaveAttribute('aria-selected', 'true')
    const lista = page.getByRole('tabpanel', { name: /^Gerenciar/ })

    // O saldo é a promessa central da tela: "N de M notas ativadas", nunca um total bruto sozinho.
    await expect(lista.getByText(/[\d.]+\s+de\s+[\d.]+\s+notas ativadas/).first()).toBeVisible()

    /* `.first()`: com MAIS DE UM baralho importado o locator casa vários botões, e o modo estrito do
       Playwright estouraria. */
    const jogarSoComEste = lista.getByRole('button', { name: 'Jogar só com este' }).first()
    await expect(jogarSoComEste, 'o baralho tem notas ativadas, então dá para recortar por ele').toBeVisible()

    // Lê o nome ANTES de clicar, para conferir que é ele que aparece na fonte depois.
    const nomeBaralho = ((await lista.getByRole('heading', { level: 3 }).first().textContent()) ?? '').trim()
    expect(nomeBaralho, 'o cartão do baralho deveria dizer o nome dele').not.toBe('')

    await clicarRobusto(page, jogarSoComEste)
    await expect(lobby(page)).toBeVisible()
    /* O recorte é anunciado por escrito antes de a rodada começar: o chip da fonte passa a dizer o
       baralho, e no painel o chip dele está marcado. */
    await expect(chipDaFonte(page), 'o chip da fonte deveria nomear o baralho escolhido').toContainText(nomeBaralho)
    const reaberto = await abrirSeletor(page)
    const chipDoBaralho = reaberto
      .getByRole('group', { name: 'Quais baralhos' })
      .getByRole('button', { name: nomeBaralho })
    await expect(chipDoBaralho).toHaveAttribute('aria-pressed', 'true')
    await expect(reaberto.getByRole('button', { name: 'Trazer do Anki' })).toBeVisible()

    // Devolve o lobby sem recorte: o mesmo chip que ligou também desliga.
    await clicarRobusto(page, chipDoBaralho)
    await expect(chipDoBaralho).toHaveAttribute('aria-pressed', 'false')
  })
})
