import { expect, test } from '@playwright/test'

import { clicarRobusto, fecharSobreposicoes } from './_helpers'

/**
 * "COMO EU CONSIGO ISTO?" — a pergunta que o Inventário passou a responder (onda 1 de 08/09).
 *
 * O acervo mostrava só o que já era seu. Uma peça de conquista, ou de nível alto, não aparecia em
 * tela NENHUMA antes de ser obtida: a Loja lista o que se compra, e conquista e nível não se
 * compram. Agora a grade tem os dois estados e a peça trancada explica a rota.
 *
 * Este teste vai pelo caminho do usuário — abre `/loja/meu-visual`, liga o catálogo completo,
 * escolhe uma peça trancada — porque a parte que quebra num refactor é justamente a ligação: o
 * `verTudo` que deixa de filtrar, o cartão que some, o botão que não chega ao destino.
 */
test.describe('Rota de aquisição no Inventário', () => {
  test('o catálogo completo mostra o que ainda não é meu, com cadeado', async ({ page }) => {
    test.slow()
    await page.goto('/loja/meu-visual')
    await expect(page.getByRole('main')).toBeVisible()
    await fecharSobreposicoes(page)

    /* O SEGMENTADO DE DOIS BOTÕES virou UM link que alterna (redesign v4): ele competia com as
       abas de categoria logo acima, sendo um filtro de outro nível. O que o teste trava continua
       sendo o mesmo — os dois acervos existem, o padrão é o próprio, e o catálogo é maior. */
    const alternar = page.getByRole('button', { name: /^Ver (tudo que existe|só o meu acervo) \(\d+\)$/ })
    await expect(alternar).toBeVisible()

    /* O padrão é o acervo próprio: a pergunta mais frequente nesta tela continua sendo "o que eu
       tenho". Se o padrão inverter, a tela de Personalizar abre cheia de cadeado — e o link
       estaria oferecendo a volta em vez da ida. */
    await expect(alternar, 'a tela deveria abrir no acervo próprio').toHaveText(/^Ver tudo que existe/)

    /* O acervo próprio é contado na aba "Meu visual" (o protótipo tirou a legenda "mostrando as N
       peças" de junto do link); o catálogo, no próprio link. */
    const quantosExistem = Number((await alternar.textContent())!.match(/\((\d+)\)/)![1])
    const quantosMeus = Number(await page.locator('#aba-personalizar .n').textContent())
    expect(quantosMeus, 'a aba Meu visual deveria contar o acervo próprio').toBeGreaterThan(0)
    expect(quantosExistem, 'o catálogo tem de ser maior que o acervo de quem começa').toBeGreaterThan(quantosMeus)

    await clicarRobusto(page, alternar)
    await expect(alternar).toHaveText(`Ver só o meu acervo (${quantosMeus})`)
  })

  test('a peça trancada diz o canal e leva à tela que entrega', async ({ page }) => {
    test.slow()
    await page.goto('/loja/meu-visual')
    await expect(page.getByRole('main')).toBeVisible()
    await fecharSobreposicoes(page)
    await clicarRobusto(page, page.getByRole('button', { name: /^Ver tudo que existe \(\d+\)$/ }))

    /* O CARTÃO DIZ TUDO, sem painel lateral (redesign v4): o cadeado, o canal e a frase inteira
       de como se consegue moram na própria peça. Antes era preciso clicar no ladrilho para o
       painel da direita responder; agora a resposta já está na grade. */
    await expect(page.getByLabel('trancada').first()).toBeVisible()
    await expect(
      page.getByText(/Só por conquista|Prateleira paga|Nível ou atalho|Recompensa de estudo/).first(),
    ).toBeVisible()

    /* A FRASE COM A CONTA, que é o ponto do arquivo: "faltam N Seeds" / "não entra na Loja nem no
       Passe" dizem o que fazer; um resumo como "Nível 6 ou 130 Seeds" só diz o requisito. */
    await expect(
      page.getByText(/Chega de graça no nível|Recompensa da conquista|Custa \d+ Créditos|Sobe de nível/).first(),
    ).toBeVisible()

    /* O BOTÃO TEM DE CHEGAR. Um CTA que não navega é pior do que nenhum: ele gasta a intenção da
       pessoa e devolve a mesma tela. */
    const ir = page.getByRole('button', { name: /^(Ver em Conquistas|Ver na Loja|Ver na Temporada)$/ }).first()
    await expect(ir).toBeVisible()
    await clicarRobusto(page, ir)
    /* Loja e Passe viraram seções de Desafios em 12/09, então os três destinos publicam a mesma
       URL canônica — o que o teste trava é o CTA chegar, não qual aba ele abre. */
    await expect(page).toHaveURL(/\/loja\/desafios$/)
  })

  test('o cabeçalho de temporada escreve o nome da moeda e o custo do nível', async ({ page }) => {
    /* `/loja/passe` continua valendo como endereço (resolve para Desafios, onde o Passe virou
       seção), mas o cabeçalho de temporada é da aba — então o teste pede a aba pelo nome novo. */
    await page.goto('/loja/desafios')
    await expect(page.getByRole('main')).toBeVisible()
    await fecharSobreposicoes(page)

    /* O RÓTULO ESCRITO é o conserto: até aqui o que dizia qual moeda era qual era o `title`, que
       exige mouse parado e não existe no toque. */
    await expect(page.getByText('Seeds', { exact: true }).first()).toBeVisible()

    /* O NÍVEL DO CABEÇALHO É O DA TEMPORADA (recompensas v2, 27/09), e só existe durante ela:
       fora das datas a faixa diz quando vem a próxima e não há barra — nunca o nível da conta.
       Durante a temporada, a unidade na conta que falta ("faltam 1364" podia ser XP, Seeds ou
       palavras). A unidade de `CabecalhoDeTemporada` está em `cabecalho-de-temporada.test.tsx`. */
    const faixa = (await page.getByTestId('faixa-da-temporada').first().textContent()) ?? ''
    if (/Próxima temporada|ainda não tem data/.test(faixa)) {
      await expect(page.getByText(/faltam \d+ XP/)).toHaveCount(0)
    } else {
      await expect(page.getByText(/faltam \d+ XP/).first()).toBeVisible()
    }
  })
})
