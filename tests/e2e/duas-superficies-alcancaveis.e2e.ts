import { expect, test } from '@playwright/test'

import { clicarRobusto, fecharSobreposicoes } from './_helpers'

/**
 * AS SUPERFÍCIES DE PERSONALIZAR CONTINUAM TODAS ALCANÇÁVEIS — agora por DUAS portas.
 *
 * ESTE ARQUIVO SUBSTITUI `quatro-superficies-alcancaveis.e2e.ts`, e a substituição é deliberada.
 * O arquivo anterior travava a decisão da onda 2 (`openspec/audits/2026-09-08-gamificacao.md`):
 * Loja e Passe com porta própria na barra de cima, porque a organização que ele veio impedir as
 * deixava sem porta nenhuma — "a perda da única superfície onde Seeds e Créditos são gastos".
 *
 * Em 12/09 o dono reverteu a divisão em quatro: Loja e Passe viraram SEÇÕES dentro de Desafios.
 * O perigo que o teste antigo media continua sendo o certo — o que não pode acontecer é uma
 * superfície ficar inalcançável —, mas a forma mudou: o que antes era "cada uma tem a sua aba"
 * agora é "cada uma tem a sua âncora, e a URL antiga chega lá". É isso que este arquivo trava.
 *
 * O QUE ELE NÃO DEIXA REGREDIR, em ordem de gravidade:
 *  1. uma das três seções sumir da página de Desafios;
 *  2. um endereço público antigo (`/loja/itens`, `/loja/passe`) cair na aba padrão — mandaria
 *     para "Meu visual" quem pediu a prateleira;
 *  3. a barra perder uma das duas portas.
 */
const SECOES = [
  { id: '#secao-desafios', marca: /Como ganhar Seeds e XP/i },
  { id: '#secao-passe', marca: /Passe da temporada/i },
  { id: '#secao-loja', marca: /Seeds/ },
]

test.describe('As duas superfícies de Personalizar', () => {
  test('as duas URLs canônicas abrem a sua superfície', async ({ page }) => {
    test.slow()
    for (const s of [
      { url: '/loja/meu-visual', marca: /Perfil de exibição/i },
      { url: '/loja/desafios', marca: /Desafios/ },
    ]) {
      await page.goto(s.url)
      await expect(page.getByRole('main')).toBeVisible()
      await fecharSobreposicoes(page)
      await expect(page.getByText(s.marca).first(), `${s.url} não mostrou o conteúdo da sua superfície`).toBeVisible()
      /* E a URL sobrevive à navegação: um link salvo tem de voltar ao mesmo lugar. */
      await expect(page).toHaveURL(new RegExp(`${s.url.replace('/', '\\/')}$`))
    }
  })

  test('as três seções de recompensa existem dentro de Desafios', async ({ page }) => {
    test.slow()
    await page.goto('/loja/desafios')
    await expect(page.getByRole('main')).toBeVisible()
    await fecharSobreposicoes(page)
    for (const s of SECOES) {
      await expect(
        page.locator(s.id),
        `a seção ${s.id} sumiu de Desafios — alguma superfície ficou sem lugar`,
      ).toHaveCount(1)
      await expect(page.locator(s.id).getByText(s.marca).first()).toBeVisible()
    }
  })

  /* O ponto 2: endereço antigo tem de chegar onde o conteúdo FOI PARAR, e não na aba padrão. */
  test('os endereços das abas extintas caem em Desafios', async ({ page }) => {
    test.slow()
    for (const antigo of ['/loja/itens', '/loja/passe']) {
      await page.goto(antigo)
      await expect(page.getByRole('main')).toBeVisible()
      await fecharSobreposicoes(page)
      await expect(page, `${antigo} deveria republicar a URL canônica de Desafios`).toHaveURL(/\/loja\/desafios$/)
      await expect(page.locator('#secao-loja')).toHaveCount(1)
    }
  })

  test('a barra tem as duas portas, com o padrão na frente', async ({ page }) => {
    await page.goto('/loja/meu-visual')
    await expect(page.getByRole('main')).toBeVisible()
    await fecharSobreposicoes(page)
    /* `allTextContents()` NÃO espera: ele lê o DOM do instante e devolve `[]` se as abas ainda
       não renderizaram. Esperar uma delas primeiro é o que torna a leitura determinística. */
    await expect(page.getByRole('tab', { name: /^Desafios · \d+$/ })).toBeVisible()
    const rotulos = await page.getByRole('tab').allTextContents()
    const daTela = rotulos.filter((r) => /Meu visual|Desafios/.test(r))
    expect(daTela.map((r) => r.replace(/ · \d+$/, '').trim())).toEqual(['Meu visual', 'Desafios'])
  })

  test('dá para ir de uma à outra sem sair da tela', async ({ page }) => {
    test.slow()
    await page.goto('/loja/meu-visual')
    await expect(page.getByRole('main')).toBeVisible()
    await fecharSobreposicoes(page)

    await clicarRobusto(page, page.getByRole('tab', { name: /^Desafios · \d+$/ }))
    await expect(page).toHaveURL(/\/loja\/desafios$/)

    await clicarRobusto(page, page.getByRole('tab', { name: /^Meu visual · \d+$/ }))
    await expect(page).toHaveURL(/\/loja\/meu-visual$/)
  })
})
