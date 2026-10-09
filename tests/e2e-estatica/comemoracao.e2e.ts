import { expect, type Page, test } from '@playwright/test'

import {
  abrirJogo,
  cartaDoTabu,
  fecharPar,
  type Jogo,
  palco,
  palpitarNoTermo,
  paresDaMemoria,
  pegarNaKaruta,
  semExplicacao,
  vozFalsa,
} from './_jogos'

/**
 * O MESMO RETORNO DE ACERTO NOS JOGOS (recompensas v2, onda 1).
 *
 * Dois jogos principais (Memória, Soletrar) e dois culturais (Karuta, Tabu): acertar um item faz
 * subir o "+N" do que ele valeu e, depois de três acertos seguidos, o HUD comum mostra o
 * multiplicador ×2. É a prova de que os quatro passam pelo mesmo motor (`celebrar`) e pelo mesmo
 * placar.
 *
 * MODO LEVE (`babel.performance_mode = true`, o `html[data-modo-leve='true']`): o acerto continua
 * com o número e o som, mas NENHUMA rajada de partícula é pedida. O motor conta o que pediu em
 * `window.__comemoracoes`, que só existe quando o teste liga `__MEDIR_COMEMORACOES__` antes de a
 * página carregar (a edição estática é um build de produção).
 *
 * DESENHO NOVO (09/10/2026). O "+N" é o ganho do protótipo: um `span.ganho.good` que sobe do lugar do
 * acerto ("+10", ou "+20 ×2" com multiplicador), no lugar da camada `[data-flutuante]`. O
 * multiplicador é o `.combo` do placar (`aria-label="Multiplicador N, M seguidas"`). Os tabuleiros são
 * os do protótipo (`_jogos.ts` diz como se joga cada um).
 *
 * Determinismo: as respostas saem do mesmo arquivo que o app baixa (`dist/trilha/en.json`), como
 * em `jogos.e2e.ts`; a voz é falsa e registra o que foi dito (é assim que a Karuta é "ouvida").
 */

const JOGOS: Jogo[] = ['memory', 'termo', 'karuta', 'taboo']

interface Contador {
  eventos: number
  rajadas: number
  porTipo: Record<string, number>
}

async function prepararPagina(page: Page, leve: boolean) {
  await semExplicacao(page, JOGOS)
  await vozFalsa(page)
  await page.addInitScript((leve: boolean) => {
    try {
      localStorage.setItem('babel.performance_mode', String(leve))
    } catch {
      /* storage bloqueado */
    }
    ;(window as unknown as { __MEDIR_COMEMORACOES__: boolean }).__MEDIR_COMEMORACOES__ = true
  }, leve)
}

/** O "+N" de um acerto: o ganho que sobe do lugar da jogada ("+10", "+20 ×2"). */
const maisN = (page: Page) => page.locator('span.ganho.good').filter({ hasText: /^\+\d+( ×\d+)?$/ })
const multiplicador = (page: Page) => palco(page).locator('.hud [aria-label^="Multiplicador "]')
const contador = (page: Page) =>
  page.evaluate(() => (window as unknown as { __comemoracoes?: Contador }).__comemoracoes ?? null)

/**
 * O que o motor disse da jogada: 'acerto', 'erro' ou nada (palpite de graça do Soletrar). É a
 * régua do teste para "três SEGUIDOS": um erro no meio zera a conta, como zera o multiplicador.
 */
async function veredito(page: Page, antes: Contador | null): Promise<'acerto' | 'erro' | null> {
  const soma = (c: Contador | null) => (c?.porTipo.acerto ?? 0) + (c?.porTipo.erro ?? 0)
  await expect
    .poll(async () => soma(await contador(page)), { timeout: 2500 })
    .toBeGreaterThan(soma(antes))
    .catch(() => {})
  const depois = await contador(page)
  if ((depois?.porTipo.erro ?? 0) > (antes?.porTipo.erro ?? 0)) return 'erro'
  if ((depois?.porTipo.acerto ?? 0) > (antes?.porTipo.acerto ?? 0)) return 'acerto'
  return null
}

/* ─────────────────────────── um acerto por jogo ─────────────────────────── */

/** Memória: fecha o próximo par da mesa que ainda não foi fechado. Devolve se fechou um par. */
async function acertarMemoria(page: Page, usados: Set<number | string>): Promise<boolean> {
  const { pares } = await paresDaMemoria(page)
  const par = pares.find(([a]) => !usados.has(a))
  if (!par) return false
  usados.add(par[0])
  await fecharPar(page, par)
  return true
}

/** Soletrar: escreve a palavra da primeira pista aberta (`palpitarNoTermo`). */
const acertarTermo = async (page: Page, tentadas: Set<number | string>) =>
  !!(await palpitarNoTermo(page, tentadas as Set<string>))

/** Tabu: a certa é a opção que, posta na lacuna, reconstrói a frase da Trilha. */
async function acertarTabu(page: Page): Promise<boolean> {
  const { certa } = await cartaDoTabu(page)
  if (certa < 0) return false
  await page.keyboard.press(String(certa + 1))
  return true
}

const CASOS: Array<{
  nome: string
  jogo: Jogo
  acertar: (page: Page, usados: Set<number | string>) => Promise<boolean>
  pausa: number
}> = [
  { nome: 'Memória', jogo: 'memory', acertar: acertarMemoria, pausa: 400 },
  { nome: 'Soletrar', jogo: 'termo', acertar: acertarTermo, pausa: 1700 },
  { nome: 'Karuta', jogo: 'karuta', acertar: (p) => pegarNaKaruta(p), pausa: 1000 },
  { nome: 'Tabu', jogo: 'taboo', acertar: (p) => acertarTabu(p), pausa: 1000 },
]

for (const caso of CASOS) {
  test(`${caso.nome}: o acerto sobe "+N" e três seguidos acendem o ×2`, async ({ page }) => {
    await prepararPagina(page, false)
    let acertos = 0
    let viuMaisN = false
    /* Até três rodadas: o que se testa é o ×2 depois de três acertos SEGUIDOS, e um erro do
       resolvedor (tradução ambígua no Soletrar, que só tem três palavras por rodada) zera a
       sequência sem chance de refazê-la na mesma rodada. Uma rodada nova recomeça a conta. */
    for (let rodada = 0; rodada < 3 && acertos < 3; rodada++) {
      await abrirJogo(page, caso.jogo)
      const usados = new Set<number | string>()
      acertos = 0
      for (let volta = 0; volta < 16 && acertos < 3; volta++) {
        const antes = await contador(page)
        if (!(await caso.acertar(page, usados))) {
          await page.waitForTimeout(caso.pausa)
          continue
        }
        const v = await veredito(page, antes)
        if (v !== 'acerto') {
          if (v === 'erro') acertos = 0
          await page.waitForTimeout(caso.pausa)
          continue
        }
        acertos++
        if (!viuMaisN) {
          await expect(maisN(page).first(), 'o acerto mostra o que valeu').toBeVisible({ timeout: 3000 })
          viuMaisN = true
        }
        /* Conferido logo depois do 3º acerto: numa rodada de três itens (Soletrar) o HUD sai de cena
           com a pausa de leitura, antes do fim comum. */
        if (acertos === 3) await expect(multiplicador(page)).toHaveAttribute('aria-label', /^Multiplicador [2-5],/)
        else await page.waitForTimeout(caso.pausa)
      }
    }
    expect(acertos, 'o teste precisa acertar três itens seguidos').toBe(3)

    const c = await contador(page)
    expect(c?.porTipo.acerto ?? 0, 'os acertos passam pelo motor').toBeGreaterThanOrEqual(3)
    expect(c?.porTipo.combo ?? 0, 'o ×2 é comemorado pelo motor').toBeGreaterThanOrEqual(1)
    expect(c?.rajadas ?? 0, 'fora do modo leve há partícula').toBeGreaterThan(0)
  })
}

test('modo leve: o acerto mantém o número e não pede partícula nenhuma', async ({ page }) => {
  await prepararPagina(page, true)
  await abrirJogo(page, 'memory')
  await expect(page.locator('html')).toHaveAttribute('data-modo-leve', 'true')
  const usados = new Set<number | string>()
  let acertos = 0
  for (let volta = 0; volta < 8 && acertos < 3; volta++) {
    if (await acertarMemoria(page, usados)) {
      acertos++
      if (acertos === 1) await expect(maisN(page).first(), 'o acerto mostra o que valeu').toBeVisible({ timeout: 3000 })
    }
    await page.waitForTimeout(400)
  }
  expect(acertos).toBe(3)
  await expect(multiplicador(page)).toHaveAttribute('aria-label', /^Multiplicador [2-5],/)
  const c = await contador(page)
  expect(c?.porTipo.acerto ?? 0).toBeGreaterThanOrEqual(3)
  expect(c?.rajadas, 'nenhum canvas de partículas recebe rajada no modo leve').toBe(0)
  // E o canvas de partículas nem monta (App.tsx: `!performanceMode && <ParticleCanvas/>`).
  expect(await page.locator('canvas.fixed.pointer-events-none').count()).toBe(0)
})
