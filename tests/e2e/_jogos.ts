import { expect, type Locator, type Page } from '@playwright/test'

import { fecharSobreposicoes, irParaPraticar } from './_helpers'

/**
 * O CAMINHO ATÉ UM JOGO E ATÉ O FIM DA RODADA, no desenho novo (09/10/2026) — o que as suítes que
 * jogam contra o servidor têm em comum. É o mesmo caminho de `tests/e2e-estatica/_jogos.ts`, sem o
 * dicionário da Trilha embutida: aqui as palavras são as do CADERNO do usuário, lidas do servidor.
 *
 *  - JOGO: cada cartão da grade é `.q-tile[data-jogo=<id>]`; o toque abre a partida direto, no palco
 *    `section.palco-jogo.px-partida[data-qj=<id>]` (`#palco`), que fica `aria-busy` até poder jogar.
 *  - EXPLICAÇÃO: na primeira partida de cada jogo abre uma explicação em três telas, antes de a rodada
 *    andar. `semExplicacao` a dispensa pelo `localStorage['babel_tour_<jogo>']`, como quem já jogou.
 *  - PAUSA: não há botão; é a tecla Esc (ou P). O "voltar" do cabeçalho pergunta antes de sair.
 *  - FIM: `casca/FimDaRodada` mora dentro do palco (`[data-fim-da-rodada=<id>]`), com "Jogar de novo"
 *    e "Voltar aos jogos". As recompensas (baú, conquista, nível) são diálogos por cima: um por vez.
 */

/** Quem já jogou não vê a explicação em três telas: marca os jogos como já explicados. */
export async function semExplicacao(page: Page, jogos: readonly string[]) {
  await page.addInitScript((jogos: readonly string[]) => {
    try {
      for (const j of jogos) localStorage.setItem(`babel_tour_${j}`, '1')
    } catch {
      /* storage bloqueado */
    }
  }, jogos)
}

export const cartaoDoJogo = (page: Page, jogo: string) => page.locator(`#grade-de-jogos .q-tile[data-jogo="${jogo}"]`)
export const palco = (page: Page) => page.locator('#palco')

/** O lobby com as palavras do CADERNO (as que a fixture semeou), em inglês. */
export async function abrirLobbyDoCaderno(page: Page) {
  await irParaPraticar(page, '/jogar?fonte=baralho&idioma=en')
}

/** Da grade para a partida: toca no cartão e espera o palco aceitar jogada. */
export async function entrarNoJogo(page: Page, jogo: string) {
  const cartao = cartaoDoJogo(page, jogo)
  await expect(cartao, `o cartão de ${jogo} deveria estar na grade`).toBeVisible({ timeout: 15_000 })
  await expect(cartao, `${jogo} deveria abrir com as palavras do caderno`).toBeEnabled({ timeout: 15_000 })
  await cartao.scrollIntoViewIfNeeded()
  for (let i = 0; i < 5; i++) {
    await fecharSobreposicoes(page)
    if (
      await cartao
        .click({ timeout: 3000 })
        .then(() => true)
        .catch(() => false)
    )
      break
  }
  await expect(page.locator(`#palco[data-qj="${jogo}"]`)).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 })
}

/** A tela de fim de rodada (comum a todos os jogos), dentro do palco. */
export const fimDaRodada = (page: Page) => page.locator('#palco [data-fim-da-rodada]')

/** A rodada acabou: a tela de fim está no palco, ou uma recompensa abriu por cima dela. */
export async function terminou(page: Page) {
  return (
    (await fimDaRodada(page)
      .isVisible()
      .catch(() => false)) ||
    (await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Resgatar e continuar' })
      .first()
      .isVisible()
      .catch(() => false))
  )
}

/**
 * O fim de rodada comum: espera a tela de fim, dispensa as recompensas que abrirem e confere as duas
 * saídas ("Jogar de novo" e "Voltar aos jogos"). Devolve a tela de fim.
 */
export async function chegarAoFim(page: Page, jogo: string, espera = 30_000): Promise<Locator> {
  const fim = page.locator(`#palco [data-fim-da-rodada="${jogo}"]`)
  await expect(fim, 'a rodada deveria terminar no fim de rodada comum').toBeVisible({ timeout: espera })
  await fecharSobreposicoes(page)
  await expect(page.locator('#palco')).toHaveClass(/pj-acabou/)
  await expect(fim.getByRole('button', { name: /Jogar de novo/ })).toBeVisible()
  await expect(fim.getByRole('button', { name: /Voltar aos jogos/ })).toBeVisible()
  return fim
}

/** "Voltar aos jogos", do fim da rodada até a grade. */
export async function voltarAoLobby(page: Page) {
  const voltar = fimDaRodada(page).getByRole('button', { name: /Voltar aos jogos/ })
  for (let i = 0; i < 5; i++) {
    await fecharSobreposicoes(page)
    if (
      await voltar
        .click({ timeout: 3000 })
        .then(() => true)
        .catch(() => false)
    )
      break
  }
  await fecharSobreposicoes(page)
  await expect(page.locator('#grade-de-jogos')).toBeVisible({ timeout: 15_000 })
}

/** As cartas da Memória: cada uma traz o texto em `data-texto` (mesmo virada) e a marca do par. */
export const cartasDaMemoria = (page: Page) => palco(page).locator('.tabuleiro .carta')
