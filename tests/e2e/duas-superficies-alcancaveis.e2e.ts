import { expect, type Page, test } from '@playwright/test'

import { abrirTela, clicarRobusto } from './_helpers'

/**
 * AS SUPERFÍCIES DE PERSONALIZAR CONTINUAM TODAS ALCANÇÁVEIS — agora por CINCO abas.
 *
 * A história deste arquivo: ele nasceu como `quatro-superficies-alcancaveis` (onda 2 de 08/09: Loja e
 * Passe com porta própria, porque a organização anterior as deixava sem porta nenhuma — "a perda da
 * única superfície onde Seeds e Créditos são gastos"), virou "duas" em 12/09 (Loja e Passe como seções
 * de Desafios) e, no desenho que é o único desde 09/10/2026, a tela tem cinco abas: Coleção, Maestria,
 * Temporada, Conquistas e Loja (`PersonalizarDoPrototipo`). O nome do arquivo ficou; o perigo medido é
 * o mesmo — o que não pode acontecer é uma superfície ficar inalcançável.
 *
 * O QUE ELE NÃO DEIXA REGREDIR, em ordem de gravidade:
 *  1. uma das cinco superfícies sumir, ou a sua URL não abrir nela;
 *  2. um endereço público antigo (`/loja/meu-visual`, `/loja/desafios`, `/loja/itens`, `/loja/passe`)
 *     cair numa aba que não é a que guarda aquele conteúdo;
 *  3. a barra perder uma das portas, ou a ordem mudar sem ninguém decidir.
 *
 * SAÍRAM COM O DESENHO DE ANTES: as âncoras `#secao-desafios`, `#secao-passe` e `#secao-loja` (as
 * seções viraram abas) e as abas "Meu visual"/"Desafios" (viraram Coleção e Conquistas).
 */
const ABAS = [
  { url: '/loja/colecao', nome: /^Coleção/, marca: /Toque para experimentar no app inteiro/ },
  { url: '/loja/maestria', nome: /^Maestria/, marca: /Cada jogo tem cinco níveis/ },
  { url: '/loja/temporada', nome: /^Temporada/, marca: /Trilha de recompensas|Próxima temporada|ainda não tem data/ },
  { url: '/loja/desafios', nome: /^Conquistas/, marca: /Conquista não se compra/ },
  { url: '/loja/loja', nome: /^Loja/, marca: /Ganhar jogando/ },
]

const barra = (page: Page) => page.getByRole('tablist', { name: 'Personalizar' })
const abas = (page: Page) => barra(page).getByRole('tab')
const selecionada = (page: Page) => barra(page).getByRole('tab', { selected: true })

test.describe('As superfícies de Personalizar', () => {
  test('cada URL canônica abre a sua aba, com o conteúdo dela', async ({ page }) => {
    test.slow()
    for (const s of ABAS) {
      await abrirTela(page, s.url)
      await expect(selecionada(page), `${s.url} não abriu na sua aba`).toHaveText(s.nome)
      await expect(
        page.getByRole('main').getByText(s.marca).first(),
        `${s.url} não mostrou o conteúdo da sua superfície`,
      ).toBeVisible()
      /* E a URL sobrevive à navegação: um link salvo tem de voltar ao mesmo lugar. */
      await expect(page).toHaveURL(new RegExp(`${s.url}$`))
    }
  })

  /* O ponto 2: endereço antigo tem de chegar onde o conteúdo FOI PARAR, e não noutra aba. */
  test('os endereços de antes chegam à aba que guarda aquele conteúdo', async ({ page }) => {
    test.slow()
    for (const [antigo, aba] of [
      ['/loja', /^Coleção/],
      ['/loja/meu-visual', /^Coleção/],
      ['/loja/desafios', /^Conquistas/],
      // A prateleira (`itens`) hoje é a aba Loja, e o Passe é a Temporada (`APELIDO_DE_ABA_V2`, `rotas.ts`).
      ['/loja/itens', /^Loja/],
      ['/loja/passe', /^Temporada/],
    ] as const) {
      await abrirTela(page, antigo)
      await expect(abas(page)).toHaveCount(5)
      // `soft`: o laço segue para dizer todos os que erram, e não só o primeiro.
      await expect.soft(selecionada(page), `${antigo} deveria abrir na aba do seu conteúdo`).toHaveText(aba)
    }
  })

  test('a barra tem as cinco portas, com a padrão na frente', async ({ page }) => {
    await abrirTela(page, '/loja')
    /* `allTextContents()` NÃO espera: ele lê o DOM do instante. Esperar a contagem primeiro é o que
       torna a leitura determinística. */
    await expect(abas(page)).toHaveCount(5)
    const rotulos = (await abas(page).allTextContents()).map((r) => r.replace(/[\d/\s]+$/, '').trim())
    expect(rotulos).toEqual(['Coleção', 'Maestria', 'Temporada', 'Conquistas', 'Loja'])
  })

  test('dá para ir de uma à outra sem sair da tela, e a URL acompanha', async ({ page }) => {
    test.slow()
    await abrirTela(page, '/loja')
    for (const s of [...ABAS].reverse()) {
      await clicarRobusto(page, abas(page).filter({ hasText: s.nome }))
      await expect(selecionada(page)).toHaveText(s.nome)
      await expect(page).toHaveURL(new RegExp(`${s.url}$`))
      await expect(page.getByRole('main').getByText(s.marca).first()).toBeVisible()
    }
  })
})
