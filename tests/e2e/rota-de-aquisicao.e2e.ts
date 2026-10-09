import { expect, type Page, test } from '@playwright/test'

import { abrirTela, clicarRobusto, verSemSobreposicao } from './_helpers'

/**
 * "COMO EU CONSIGO ISTO?" — a pergunta que o Inventário passou a responder (onda 1 de 08/09).
 *
 * O acervo mostrava só o que já era seu. Uma peça de conquista, ou de nível alto, não aparecia em
 * tela NENHUMA antes de ser obtida: a Loja lista o que se compra, e conquista e nível não se
 * compram. Agora a grade tem os dois estados e a peça trancada explica a rota.
 *
 * NO DESENHO NOVO (09/10/2026) a resposta mora em dois lugares, e o teste vai pelos dois caminhos do
 * usuário:
 *  - a COLEÇÃO (`/loja/colecao`) lista todos os temas; o que não é seu traz o cadeado e a origem
 *    escrita ("Chega no nível N", "Na Loja", "Em Conquistas", "Na Temporada N"). Tocar prova o tema na
 *    vitrine, e o botão da vitrine leva à aba que o entrega;
 *  - a folha "Meu visual" (aberta pelos atalhos Tema/Partículas/Fonte/Menu da Coleção) é o inventário
 *    inteiro, com o link "Ver tudo que existe (N)" e, em cada peça trancada, a frase de como se consegue.
 */

/** Abre a folha "Meu visual" pelo atalho "Tema" da Coleção. */
async function abrirMeuVisual(page: Page) {
  await abrirTela(page, '/loja/colecao')
  /* Os quatro atalhos (`button.q-linha`: Tema, Partículas, Fonte, Menu) ficam abaixo da grade de temas;
     o primeiro é o do tema. Não pelo nome: há temas chamados "Tema …" na grade. */
  await clicarRobusto(page, page.getByRole('main').locator('button.q-linha').filter({ hasText: 'Tema' }).first())
  const folha = page.getByRole('dialog', { name: 'Meu visual' })
  await verSemSobreposicao(page, folha)
  return folha
}

test.describe('Rota de aquisição no Inventário', () => {
  test('o catálogo completo mostra o que ainda não é meu, com cadeado', async ({ page }) => {
    test.slow()
    const folha = await abrirMeuVisual(page)

    /* UM link que alterna (redesign v4): os dois acervos existem, o padrão é o próprio, e o catálogo
       é maior. */
    const alternar = folha.getByRole('button', { name: /^Ver (tudo que existe|só o meu acervo) \(\d+\)$/ })
    await expect(alternar).toBeVisible()

    /* O padrão é o acervo próprio: a pergunta mais frequente nesta tela continua sendo "o que eu
       tenho". Se o padrão inverter, a folha abre cheia de cadeado — e o link estaria oferecendo a
       volta em vez da ida. */
    await expect(alternar, 'a folha deveria abrir no acervo próprio').toHaveText(/^Ver tudo que existe/)
    await expect(folha.getByLabel('trancada')).toHaveCount(0)

    const quantosExistem = Number((await alternar.textContent())!.match(/\((\d+)\)/)![1])
    await clicarRobusto(page, alternar)
    await expect(alternar).toHaveText(/^Ver só o meu acervo \(\d+\)$/)
    const quantosMeus = Number((await alternar.textContent())!.match(/\((\d+)\)/)![1])
    expect(quantosMeus, 'quem começa já tem algum acervo').toBeGreaterThan(0)
    expect(quantosExistem, 'o catálogo tem de ser maior que o acervo de quem começa').toBeGreaterThan(quantosMeus)
    await expect(folha.getByLabel('trancada').first()).toBeVisible()
  })

  test('a peça trancada diz o canal e a frase de como se consegue', async ({ page }) => {
    test.slow()
    const folha = await abrirMeuVisual(page)
    await clicarRobusto(page, folha.getByRole('button', { name: /^Ver tudo que existe \(\d+\)$/ }))

    /* O CARTÃO DIZ TUDO (redesign v4): o cadeado, o canal e a frase inteira de como se consegue moram
       na própria peça. */
    await expect(folha.getByLabel('trancada').first()).toBeVisible()
    await expect(
      folha.getByText(/Só por conquista|Prateleira paga|Nível ou atalho|Recompensa de estudo/).first(),
    ).toBeVisible()

    /* A FRASE COM A CONTA, que é o ponto do arquivo: "faltam N Seeds" / "não entra na Loja nem no
       Passe" dizem o que fazer; um resumo como "Nível 6 ou 130 Seeds" só diz o requisito. */
    await expect(
      folha.getByText(/Chega de graça no nível|Recompensa da conquista|Custa \d+ Créditos|Sobe de nível/).first(),
    ).toBeVisible()
  })

  test('na Coleção, o tema trancado diz a origem e o botão da vitrine leva à aba que o entrega', async ({ page }) => {
    test.slow()
    await abrirTela(page, '/loja/colecao')
    const grade = page.locator('.px-temas-grade')
    const equipado = grade.locator('button[aria-pressed="true"]')
    await expect(equipado).toHaveCount(1)
    await expect(equipado).toContainText('Equipado')

    /* O BOTÃO TEM DE CHEGAR. Um CTA que não navega é pior do que nenhum: ele gasta a intenção da
       pessoa e devolve a mesma tela. Um tema de cada origem, com a aba e a URL que o entregam. */
    for (const [origem, aba, url] of [
      [/Na Loja/, /^Loja/, /\/loja\/loja$/],
      [/Em Conquistas/, /^Conquistas/, /\/loja\/desafios$/],
      [/Na Temporada \d+/, /^Temporada/, /\/loja\/temporada$/],
    ] as const) {
      const tema = grade.locator('button').filter({ hasText: origem }).first()
      await expect(tema, `a Coleção deveria ter um tema com a origem ${origem}`).toBeVisible()
      await clicarRobusto(page, tema)
      await expect(tema).toHaveAttribute('aria-pressed', 'true')
      const levar = page.getByTestId('vitrine-da-colecao').locator('[data-px="ver-na-loja"]')
      await expect(levar).toHaveText(origem)
      await clicarRobusto(page, levar)
      await expect(page.getByRole('tablist', { name: 'Personalizar' }).getByRole('tab', { selected: true })).toHaveText(
        aba,
      )
      await expect(page).toHaveURL(url)
      await clicarRobusto(page, page.getByRole('tab', { name: /^Coleção/ }))
      await expect(grade).toBeVisible()
    }
  })

  test('o cabeçalho de temporada escreve o nome da moeda e o custo do nível', async ({ page }) => {
    await abrirTela(page, '/loja/temporada')

    /* O RÓTULO ESCRITO é o conserto: até aqui o que dizia qual moeda era qual era o `title`, que
       exige mouse parado e não existe no toque. */
    await expect(page.getByTestId('saldo-de-seeds')).toHaveText(/^\s*[\d.]+\s*Seeds$/)

    /* O NÍVEL DO CABEÇALHO É O DA TEMPORADA (recompensas v2, 27/09), e só existe durante ela:
       fora das datas a faixa diz quando vem a próxima e não há barra — nunca o nível da conta.
       Durante a temporada, a unidade na conta que falta ("faltam 1364" podia ser XP, Seeds ou
       palavras). */
    const faixa = (await page.getByTestId('faixa-da-temporada').first().textContent()) ?? ''
    if (/Próxima temporada|ainda não tem data/.test(faixa)) {
      await expect(page.getByText(/faltam \d+ XP/)).toHaveCount(0)
    } else {
      await expect(page.getByText(/faltam [\d.]+ XP/).first()).toBeVisible()
    }
  })
})
