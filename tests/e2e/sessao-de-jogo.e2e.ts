import { expect, test } from '@playwright/test'

import { mapaDoBaralho, perfil, semearCartoes } from './_fixtures'
import { clicarRobusto, lobby } from './_helpers'
import {
  abrirLobbyDoCaderno,
  cartasDaMemoria,
  chegarAoFim,
  entrarNoJogo,
  palco,
  semExplicacao,
  terminou,
  voltarAoLobby,
} from './_jogos'

/**
 * UMA SESSÃO DE JOGO INTEIRA, do lobby ao fim da rodada — três jogos, três mecânicas.
 *
 * O que nenhuma outra suíte cobre: o toque no cartão do lobby chegar a um jogo montado com o CADERNO
 * de verdade (as palavras que o servidor guarda), o jogo produzir um `RoundReport`, o servidor gravar
 * a rodada e a tela de fim de rodada (`casca/FimDaRodada`: estrelas, "Acertos N de N", "Voltar aos
 * jogos") aparecer. Os testes unitários provam cada peça; este prova a costura, e nos três viewports.
 *
 * DETERMINISMO. A Memória embaralha, mas cada carta carrega o texto em `data-texto` (mesmo virada
 * para baixo), e o teste conhece o caderno — então ele lê a mesa e fecha os pares sem errar. No Termo
 * a pista de cada tabuleiro é a tradução, e o teste digita a palavra que corresponde. A explicação da
 * primeira partida de cada jogo é marcada como vista ANTES de abrir a tela (`babel_tour_<jogo>`).
 *
 * SAÍRAM COM O DESENHO DE ANTES: o botão "Pausar" (a pausa é a tecla Esc), a raspadinha do fim de
 * rodada ("Revelar sem raspar") e os tabuleiros `data-tour="mesa"`/`data-tour="tabuleiro"`.
 */

/* Lidos do SERVIDOR, não da fixture: o caderno pode ter mais do que os cartões semeados (outras
   suítes ficham palavras no mesmo banco), e todos entram nas rodadas (ver `mapaDoBaralho`). */
let MAPA = new Map<string, string>()
let POR_TRADUCAO = new Map<string, string>()

test.beforeAll(async () => {
  await semearCartoes()
  ;({ traducaoDe: MAPA, palavraDe: POR_TRADUCAO } = await mapaDoBaralho())
})

test.beforeEach(async ({ page }) => {
  await semExplicacao(page, ['memory', 'termo', 'bao'])
})

test.describe('Sessão de jogo', () => {
  test('Memória: abre com o caderno, fecha todos os pares, o servidor grava e chega ao fim da rodada', async ({
    page,
  }) => {
    test.slow()
    const antes = await perfil()
    await abrirLobbyDoCaderno(page)
    await entrarNoJogo(page, 'memory')

    /* A casca comum (`casca/CascaDaRodada`): o placar é o de toda rodada. */
    await expect(page.getByRole('group', { name: 'Placar da rodada' })).toBeVisible({ timeout: 10_000 })

    const cartas = cartasDaMemoria(page)
    await expect(cartas.first()).toBeVisible()
    const total = await cartas.count()
    expect(total % 2, 'a mesa tem de ter um número par de cartas').toBe(0)
    expect(total).toBeGreaterThanOrEqual(8)

    /* LER A MESA: cada carta guarda o próprio texto em `data-texto`, mesmo virada para baixo. */
    const titulos = await cartas.evaluateAll((els) => els.map((el) => (el.getAttribute('data-texto') ?? '').trim()))
    const palavrasNaMesa = titulos.filter((t) => MAPA.has(t))
    expect(
      palavrasNaMesa.length,
      `a mesa deveria ser feita das palavras do caderno; títulos: ${titulos.join(' | ')}`,
    ).toBe(total / 2)

    for (const palavra of palavrasNaMesa) {
      const idxPalavra = titulos.indexOf(palavra)
      const traducao = MAPA.get(palavra)!
      const idxTraducao = titulos.findIndex((t, i) => i !== idxPalavra && t.toLowerCase() === traducao.toLowerCase())
      expect(idxTraducao, `não achei a carta da tradução "${traducao}" de "${palavra}" na mesa`).toBeGreaterThanOrEqual(
        0,
      )
      await cartas.nth(idxPalavra).click()
      await cartas.nth(idxTraducao).click()
      // A mesa não aceita outra carta enquanto compara: espera o par fechar.
      await expect(cartas.nth(idxTraducao), `o par ${palavra}/${traducao} fecha`).toHaveClass(/(^| )par( |$)/, {
        timeout: 5000,
      })
    }

    const fim = await chegarAoFim(page, 'memory')
    const pares = total / 2
    await expect(fim.locator('.fim-numeros').getByText(`${pares} de ${pares}`)).toBeVisible()
    await expect(fim.locator('[data-rodada-nao-creditada]'), 'a rodada tem de ter sido salva').toHaveCount(0)
    /* O SERVIDOR É A FONTE: a rodada jogada na tela entra no perfil — como revisão (o par que gravou
       nota no agendador) ou como item de jogo. A soma, porque um item nunca conta nas duas colunas. */
    const gravados = (p: { reviews: number; drillItems: number }) => p.reviews + p.drillItems
    await expect
      .poll(async () => gravados(await perfil()), { timeout: 10_000, message: 'o servidor deveria gravar a rodada' })
      .toBeGreaterThan(gravados(antes))
    await voltarAoLobby(page)
    await expect(lobby(page)).toBeVisible()
  })

  test('Termo: abre com a escada, aceita a palavra digitada e chega ao fim da rodada', async ({ page }) => {
    test.slow()
    await abrirLobbyDoCaderno(page)
    await entrarNoJogo(page, 'termo')

    await expect(page.getByRole('group', { name: 'Placar da rodada' })).toBeVisible({ timeout: 10_000 })
    const abertos = palco(page).locator('.tab-termo:not(.resolvido):not(.falhou)')
    await expect(abertos.first()).toBeVisible()

    /* Cada tabuleiro (`.tab-termo`) mostra a pista (a tradução); fechado, ganha `.resolvido` (ou
       `.falhou`). O laço digita a palavra do primeiro tabuleiro aberto e repete até a rodada acabar.
       Com as letras já sabidas escritas na fileira, só se digita o que falta. Vinte voltas cobrem a
       escada mais longa (1 + 2 + 4) com folga. */
    let digitadas = 0
    for (let volta = 0; volta < 20 && !(await terminou(page)); volta++) {
      const aberto = abertos.first()
      if (!(await aberto.isVisible().catch(() => false))) {
        // Pode ser a transição entre degraus: espera e tenta de novo.
        await page.waitForTimeout(900)
        continue
      }
      const pista = (
        await aberto
          .locator('.pista')
          .innerText()
          .catch(() => '')
      )
        .trim()
        .toLowerCase()
      const palavra = POR_TRADUCAO.get(pista)
      const fileira = (
        await aberto
          .locator('.linha-termo.atual .letra')
          .allInnerTexts()
          .catch(() => [] as string[])
      ).map((c) => c.trim().toLowerCase())
      if (!palavra || fileira.length !== palavra.length) {
        await page.waitForTimeout(900)
        continue
      }
      await page.keyboard.type([...palavra.toLowerCase()].filter((_, i) => !fileira[i]).join(''), { delay: 30 })
      await page.keyboard.press('Enter')
      digitadas++
      await page.waitForTimeout(900)
    }
    expect(digitadas, 'esperava digitar pelo menos uma palavra no Termo').toBeGreaterThan(0)
    const fim = await chegarAoFim(page, 'termo')
    await expect(fim.locator('.fim-numeros').getByText(/^\d+ de \d+$/)).toBeVisible()
    await voltarAoLobby(page)
  })

  test('Bao (cultural): abre com o caderno, mostra as covas, Esc pausa e sair no meio pergunta antes', async ({
    page,
  }) => {
    test.slow()
    await abrirLobbyDoCaderno(page)
    await entrarNoJogo(page, 'bao')

    /* O Bao veste a CASCA COMUM: o cabeçalho é o de toda rodada ("Jogar", Como se joga, Recomeçar) e o
       tabuleiro mora no palco (`#palco`), abaixo do placar comum. */
    await expect(page.getByRole('group', { name: 'Placar da rodada' })).toBeVisible({ timeout: 10_000 })
    const covas = palco(page).locator('.pj-covas .pj-cova')
    await expect(covas.first()).toBeVisible()
    expect(await covas.count(), 'a tela do Bao deveria ter as covas').toBeGreaterThanOrEqual(2)

    /* A PAUSA É A TECLA Esc (o botão "Pausar" saiu): o diálogo diz que o relógio parou, e "Continuar"
       devolve à rodada. */
    await page.keyboard.press('Escape')
    const pausa = page.getByRole('dialog').filter({ hasText: 'Rodada em pausa' })
    await expect(pausa).toBeVisible()
    await expect(pausa).toContainText('o relógio parou')
    await clicarRobusto(page, pausa.getByRole('button', { name: 'Continuar', exact: true }))
    await expect(pausa).toBeHidden()
    await expect(covas.first()).toBeVisible()

    /* Sair no meio PERGUNTA antes: a rodada não conta, e isso é dito. */
    await clicarRobusto(page, page.getByRole('main').getByRole('button', { name: 'Jogar', exact: true }))
    const sair = page.getByRole('dialog').filter({ hasText: 'Sair sem terminar?' })
    await expect(sair.getByRole('heading', { name: 'Sair sem terminar?' })).toBeVisible()
    await expect(sair).toContainText('não conta para a revisão nem para os recordes')
    await clicarRobusto(page, sair.getByRole('button', { name: 'Sair da rodada' }))
    await expect(page.locator('#grade-de-jogos')).toBeVisible({ timeout: 15_000 })
    await expect(lobby(page)).toBeVisible()
  })
})
