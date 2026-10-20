import { expect, test } from '@playwright/test'

import { semearBaralhoAnki } from './_fixtures'
import {
  abrirOrganizar,
  abrirSeletor,
  baralhosNoServidor,
  chipDaFonte,
  clicarRobusto,
  irParaPraticar,
  lobby,
  voltarParaTudo,
} from './_helpers'

/**
 * Baralhos do Anki: a importação e a tela de baralhos, pelo caminho do usuário.
 *
 * COM A FICHA DE CONTEÚDO (10/10/2026) o caminho é: Jogar → "Buscar e organizar" → seção "Opções" →
 * "Gerenciar baralhos", que abre a tela "Baralhos do Anki" (abas Trazer, Levar embora, Gerenciar), cujo
 * "voltar" traz o nome da tela de origem ("Jogar"). Trazer um arquivo também está no catálogo de
 * conteúdo ("Trazer uma fonte"), e o baralho escolhido é um CONTEÚDO: a ficha do cabeçalho o nomeia.
 *
 * O BARALHO VEM DA FIXTURE (`semearBaralhoAnki`): num banco novo não há nenhum, e a parte que depende
 * de haver um ("Gerenciar", o saldo, "Jogar só com este") pulava sempre. Agora ela roda.
 */

test.beforeAll(async () => {
  await semearBaralhoAnki()
})

test.describe('Anki: importar', () => {
  test('a aba "Trazer" da tela do Anki abre a importação, e o voltar ("Jogar") retorna ao lobby', async ({ page }) => {
    test.slow()
    await irParaPraticar(page)

    const opcoes = await abrirOrganizar(page, 'Opções')
    const gerenciar = opcoes.getByRole('button', { name: /Gerenciar baralhos/ })
    await expect(gerenciar).toBeVisible({ timeout: 15_000 })
    await clicarRobusto(page, gerenciar)

    /* A tela do Anki: a área de soltar o arquivo, na aba "Trazer", e o voltar do cabeçalho com o nome da
       tela de origem. */
    await expect(page.getByRole('heading', { level: 1, name: 'Baralhos do Anki' })).toBeVisible()
    await clicarRobusto(page, page.getByRole('tab', { name: /^Trazer/ }))
    await expect(page.getByRole('tab', { name: /^Trazer/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Solte o arquivo aqui')).toBeVisible()

    await clicarRobusto(page, page.getByRole('main').getByRole('button', { name: 'Jogar', exact: true }))
    await expect(lobby(page)).toBeVisible()
    /* E a porta de trazer do catálogo continua lá. */
    await expect((await abrirSeletor(page)).getByRole('button', { name: /Trazer uma fonte/ })).toBeVisible()
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

    const painel = await abrirOrganizar(page, 'Opções')
    const botaoBaralhos = painel.getByRole('button', { name: /Gerenciar baralhos/ })
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
    /* O baralho vira o CONTEÚDO ESCOLHIDO: a ficha do cabeçalho passa a dizer o nome dele, e no catálogo
       a linha dele está "em uso". */
    await expect(chipDaFonte(page), 'a ficha de conteúdo deveria nomear o baralho escolhido').toContainText(nomeBaralho)
    const catalogo = await abrirSeletor(page)
    const emUso = catalogo.locator('[data-fx-fonte^="anki:"][data-em-uso="1"]')
    await expect(emUso).toContainText(nomeBaralho)
    await catalogo.locator('button.x').click()
    await expect(catalogo).toBeHidden()

    // Devolve o lobby a "Tudo": o "x" da ficha.
    await clicarRobusto(page, voltarParaTudo(page))
    await expect(chipDaFonte(page)).not.toContainText(nomeBaralho)
  })
})
