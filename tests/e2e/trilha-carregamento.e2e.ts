import { expect, test } from '@playwright/test'

import { semearCartoes } from './_fixtures'
import { abrirSeletor, chipDaFonte, devolverTudo, escolherConteudo, irParaPraticar, lobby } from './_helpers'

/**
 * A trilha carrega sob demanda. O modo de falha dessa mudança é SILENCIOSO: a contagem pisca zero,
 * ou um jogo anuncia "sem material" durante o carregamento — mensagem falsa, não só feia. Este teste
 * existe para que isso não passe despercebido.
 *
 * COM A FICHA DE CONTEÚDO (10/10/2026) a Trilha é uma linha do catálogo "Escolher o conteúdo" (grupo
 * "Trilha do app"), com a contagem das palavras prontas do idioma, que vem do índice. Escolhida, a ficha
 * do cabeçalho diz "Trilha" e a grade se refaz.
 *
 * O ponto de partida é o link `/jogar?fonte=baralho,sessao&idioma=en`: o idioma praticado é do perfil
 * (gravado no servidor), e num idioma sem trilha a linha nem existiria.
 */

test.beforeAll(async () => {
  await semearCartoes()
})

const ROTA = '/jogar?fonte=baralho,sessao&idioma=en'

test.afterEach(async ({ page }) => {
  /* A escolha de conteúdo é da conta: devolve "Tudo" para as suítes seguintes. */
  await devolverTudo(page)
})

test.describe('Trilha carregada sob demanda', () => {
  test('a contagem da Trilha no catálogo vem do índice, e escolher não passa por "sem material"', async ({ page }) => {
    test.slow()
    await irParaPraticar(page, ROTA)
    const painel = await abrirSeletor(page)
    const linha = painel.locator('[data-fx-fonte="trilha"]')
    await expect(linha).toBeVisible({ timeout: 15_000 })

    // A contagem já tem de estar certa ANTES de escolher: ela vem do índice, não do dado.
    const antes = ((await linha.locator('.fx-linha-conta').textContent()) ?? '').split('·')[0].replace(/\D/g, '')
    expect(Number(antes), 'a Trilha deve anunciar o tamanho antes de carregar').toBeGreaterThan(0)
    await painel.locator('button.x').click()
    await expect(painel).toBeHidden()

    /* Amostra a tela enquanto a fonte troca: nenhum quadro pode dizer que não há jogo nem material. */
    const mentiu: string[] = []
    const amostrar = setInterval(async () => {
      const texto = await lobby(page)
        .innerText()
        .catch(() => '')
      for (const frase of ['Nenhum jogo abre só com este material ainda', 'Conteúdo pequeno', 'Precisa de 4 palavras'])
        if (texto.includes(frase)) mentiu.push(frase)
    }, 120)

    await escolherConteudo(page, 'trilha')
    await expect(chipDaFonte(page)).toContainText('Trilha')
    await page.waitForTimeout(2500)
    clearInterval(amostrar)

    expect([...new Set(mentiu)], 'a tela anunciou falta de material durante o carregamento').toHaveLength(0)
  })

  test('com a Trilha escolhida, a Memória abre e a grade diz as palavras disponíveis', async ({ page }) => {
    test.slow()
    await irParaPraticar(page, ROTA)
    await escolherConteudo(page, 'trilha')

    const grade = page.locator('#grade-de-jogos')
    await expect(grade).toBeVisible()
    const memoria = grade.locator('.q-tile[data-jogo="memory"]')
    await expect(memoria).toBeEnabled()
    await expect(memoria.locator('.qj-conta')).toHaveText(/\d+ nesta rodada · [\d.]+ disponíveis/, { timeout: 15_000 })
    /* E a porta para trazer as próprias palavras só aparece para quem não tem nenhuma: a fixture tem. */
    await expect(lobby(page).locator('.fx-aviso-trilha')).toHaveCount(0)
  })
})
