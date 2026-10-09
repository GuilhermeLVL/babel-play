import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, type Locator, type Page } from '@playwright/test'

/**
 * O CAMINHO ATÉ UM JOGO E ATÉ O FIM DA RODADA, no desenho novo (09/10/2026) — o que as e2e que jogam
 * têm em comum (`jogos`, `comemoracao`, `personalizar-v2`, `edicao-estatica`, `idioma-da-sessao`).
 *
 *  - LOBBY: a primeira visita ao Jogar abre o painel "O que você vai praticar"; escolhe-se "Trilha" e
 *    "Usar estas palavras" (as palavras da Trilha vêm embutidas no site). A escolha fica guardada: na
 *    visita seguinte a grade abre direto.
 *  - JOGO: cada cartão da grade é `.q-tile[data-jogo=<id>]`; o toque abre a partida direto, no palco
 *    `section.palco-jogo.px-partida[data-qj=<id>]` (`#palco`), que fica `aria-busy` até poder jogar.
 *  - EXPLICAÇÃO: na primeira partida de cada jogo abre uma explicação em três telas, antes de a rodada
 *    andar. `semExplicacao` a dispensa pelo `localStorage['babel_tour_<jogo>']`, como quem já jogou.
 *  - FIM: `casca/FimDaRodada` mora dentro do palco (`[data-fim-da-rodada=<id>]`), com "Jogar de novo"
 *    e "Voltar aos jogos". As recompensas (baú, conquista, nível) são diálogos por cima: um por vez.
 *  - PAUSA: não há botão; é a tecla Esc.
 *
 * DETERMINISMO. As respostas saem do mesmo arquivo que o app baixa (`dist/trilha/en.json`): a pista é
 * a tradução, e o teste procura a palavra que a tem.
 */

export const JOGOS = [
  'memory',
  'wordsearch',
  'termo',
  'blitz',
  'scramble',
  'escuta',
  'ditado',
  'karaoke',
  'karuta',
  'choseong',
  'tenis',
  'koffer',
  'bao',
  'vitendawili',
  'shiritori',
  'cadavre',
  'taboo',
  'conectores',
] as const
export type Jogo = (typeof JOGOS)[number]

/* ─────────────────────────── a Trilha embutida ─────────────────────────── */

export type Registro = [string, string, string?, string?]
const DIST = path.join(process.cwd(), 'dist', 'trilha', 'en.json')
const TRILHA = JSON.parse(readFileSync(DIST, 'utf8')) as { niveis: Record<string, Registro[]> }
export const REGISTROS: Registro[] = Object.values(TRILHA.niveis).flat()

export const norm = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const POR_TRADUCAO = new Map<string, string[]>()
for (const [palavra, traducao] of REGISTROS) {
  const k = norm(traducao)
  POR_TRADUCAO.set(k, [...(POR_TRADUCAO.get(k) ?? []), palavra])
}

/* A PISTA NEM SEMPRE É A TRADUÇÃO. Quando a tradução entrega a resposta ("depender" traz "depend"), o
   jogo mostra a tradução mascarada ("———") ou a frase de exemplo com lacuna ("Children _____ on their
   parents.") — `promptFor` em `core/minigames/itemSource.ts`. A lacuna vira curinga e a pista casa com
   a tradução ou com a frase da Trilha. */
const LACUNA = /_{3,}|—{2,}/
function comLacuna(pista: string): string[] {
  if (!LACUNA.test(pista)) return []
  const partes = pista.split(LACUNA).map((p) => p.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const molde = new RegExp(`^${partes.join("\\s*[\\p{L}\\p{N}'’-]+\\s*")}$`, 'iu')
  return REGISTROS.filter(([, traducao, frase]) => molde.test(traducao.trim()) || molde.test((frase ?? '').trim())).map(
    ([palavra]) => palavra,
  )
}

/** As palavras da Trilha que têm esta pista (a tradução, ou a tradução/frase com lacuna), em minúsculas. */
export const palavrasDe = (pista: string) =>
  [...(POR_TRADUCAO.get(norm(pista)) ?? []), ...comLacuna(pista)].map((p) => p.toLowerCase())

/**
 * A palavra que fecha a FRASE com lacuna (Vitendawili, Tabu): entre as opções, a que, tirada da frase
 * da Trilha, deixa o texto mostrado. Devolve o índice da opção, ou -1.
 */
export function opcaoQueFechaAFrase(textoComLacuna: string, opcoes: string[]): number {
  const texto = norm(textoComLacuna.replace(LACUNA, ' '))
  return opcoes.findIndex((op) =>
    REGISTROS.some(
      (r) =>
        r[0].toLowerCase() === op.toLowerCase() &&
        r[2] &&
        norm(r[2]).replace(norm(op), ' ').replace(/\s+/g, ' ').trim() === texto,
    ),
  )
}

export const textos = async (l: Locator) => (await l.allInnerTexts()).map((t) => t.trim())

/* ─────────────────────────── antes de a página carregar ─────────────────────────── */

/** Quem já jogou não vê a explicação em três telas: marca os jogos como já explicados. */
export async function semExplicacao(page: Page, jogos: readonly string[] = JOGOS) {
  await page.addInitScript((jogos: readonly string[]) => {
    try {
      for (const j of jogos) localStorage.setItem(`babel_tour_${j}`, '1')
    } catch {
      /* storage bloqueado */
    }
  }, jogos)
}

/**
 * VOZ FALSA em `speechSynthesis` (duas vozes, en-US e pt-BR) que registra o que foi dito em
 * `window.__falas` — é assim que o teste "ouve" a Karuta e o Ditado sem depender das vozes da máquina.
 * E um reconhecimento de fala falso, que "ouve" a última coisa que a voz falou (o Karaokê).
 */
export async function vozFalsa(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __falas: Array<{ t: string; lang: string }>
      webkitSpeechRecognition: unknown
      SpeechRecognition: unknown
    }
    w.__falas = []
    const s = window.speechSynthesis
    if (s) {
      const vozes = [
        { name: 'Teste en', lang: 'en-US', localService: true, default: true, voiceURI: 'en' },
        { name: 'Teste pt', lang: 'pt-BR', localService: true, default: false, voiceURI: 'pt' },
      ]
      try {
        Object.defineProperty(SpeechSynthesisUtterance.prototype, 'voice', {
          configurable: true,
          get() {
            return (this as { __v?: unknown }).__v ?? null
          },
          set(v) {
            ;(this as { __v?: unknown }).__v = v
          },
        })
      } catch {
        /* navegador sem o protótipo */
      }
      s.getVoices = () => vozes as unknown as SpeechSynthesisVoice[]
      s.speak = (u: SpeechSynthesisUtterance) => {
        w.__falas.push({ t: u.text, lang: u.lang })
        setTimeout(() => {
          u.onstart?.(new Event('start') as SpeechSynthesisEvent)
          setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 120)
        }, 10)
      }
      s.cancel = () => {}
    }
    /* Os DOIS nomes: o Chromium recente expõe `SpeechRecognition` sem prefixo, e o jogo prefere esse. */
    w.SpeechRecognition = w.webkitSpeechRecognition = class {
      onresult?: (e: unknown) => void
      onend?: () => void
      start() {
        setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: w.__falas.at(-1)?.t ?? '' }]] })
          this.onend?.()
        }, 200)
      }
      stop() {}
      abort() {}
    }
  })
}

type Fala = { t: string; lang: string }
/** A última coisa que a voz falsa disse (em qualquer idioma, ou só no que começa por `idioma`). */
export const ultimaFala = (page: Page, idioma = '') =>
  page.evaluate(
    (idioma) =>
      (window as unknown as { __falas: Fala[] }).__falas.filter((f) => !idioma || f.lang.startsWith(idioma)).at(-1),
    idioma,
  )

/* ─────────────────────────── o caminho ─────────────────────────── */

/** As recompensas (baú, conquista, nível) são diálogos por cima da tela: fecha um por um. */
export async function dispensarRecompensas(page: Page) {
  for (let i = 0; i < 6; i++) {
    const b = page
      .getByRole('dialog')
      .getByRole('button', { name: /^(Resgatar e continuar|Continuar)$/ })
      .first()
    if (!(await b.isVisible().catch(() => false))) return
    await b.click({ force: true, timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(500)
  }
}

export const cartaoDoJogo = (page: Page, jogo: string) => page.locator(`#grade-de-jogos .q-tile[data-jogo="${jogo}"]`)
export const palco = (page: Page) => page.locator('#palco')

/** Abre o Jogar com as palavras da Trilha embutida, até a grade de jogos. */
export async function abrirLobbyDaTrilha(page: Page, rota = '/jogar') {
  await page.goto(rota)
  await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
  const pular = page.getByRole('button', { name: 'Pular apresentação' })
  if (await pular.isVisible().catch(() => false)) {
    await pular.click()
    await page.getByRole('button', { name: /Começar/ }).click()
  }
  await dispensarRecompensas(page)
  /* A primeira visita abre "O que você vai praticar"; com a fonte já escolhida, a grade abre direto. */
  const sala = page.getByRole('dialog', { name: 'O que você vai praticar' })
  const trilha = sala.getByRole('radio', { name: /Trilha/ })
  const pronto = cartaoDoJogo(page, 'memory').and(page.locator(':enabled'))
  await expect(trilha.or(pronto).first()).toBeVisible({ timeout: 20_000 })
  if (await trilha.isVisible().catch(() => false)) {
    await trilha.click()
    await sala.getByRole('button', { name: /Usar estas palavras/ }).click()
    await expect(sala).toBeHidden()
  }
  await expect(pronto).toBeVisible({ timeout: 20_000 })
}

/** Da grade para a partida: toca no cartão e espera o palco aceitar jogada. */
export async function entrarNoJogo(page: Page, jogo: Jogo) {
  const cartao = cartaoDoJogo(page, jogo)
  await expect(cartao).toBeEnabled({ timeout: 15_000 })
  await cartao.scrollIntoViewIfNeeded()
  await cartao.click()
  await expect(page.locator(`#palco[data-qj="${jogo}"]`)).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 })
}

/** Abre um jogo pela Trilha embutida, pronto para a primeira jogada. */
export async function abrirJogo(page: Page, jogo: Jogo) {
  await abrirLobbyDaTrilha(page)
  await entrarNoJogo(page, jogo)
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
export async function chegarAoFim(page: Page, jogo: Jogo, espera = 30_000): Promise<Locator> {
  const fim = page.locator(`#palco [data-fim-da-rodada="${jogo}"]`)
  await expect(fim, 'a rodada deveria terminar no fim de rodada comum').toBeVisible({ timeout: espera })
  await dispensarRecompensas(page)
  await expect(page.locator('#palco')).toHaveClass(/pj-acabou/)
  await expect(fim.getByRole('button', { name: /Jogar de novo/ })).toBeVisible()
  await expect(fim.getByRole('button', { name: /Voltar aos jogos/ })).toBeVisible()
  return fim
}

/* ─────────────────────────── Memória ─────────────────────────── */

export const cartasDaMemoria = (page: Page) => palco(page).locator('.tabuleiro .carta')

/**
 * Os pares da mesa, como [carta, carta]. Primeiro pelo que se lê: a carta da pista (a tradução) casa
 * com a carta da palavra que a Trilha dá para ela. O que o dicionário não reconhecer (pista mascarada
 * fora do molde) fecha pela marca do par que a carta traz (`data-par`). `peloDicionario` diz quantos
 * pares saíram só da leitura.
 */
export async function paresDaMemoria(page: Page) {
  const cartas = await cartasDaMemoria(page).evaluateAll((els) =>
    els.map((el) => ({ texto: (el.getAttribute('data-texto') ?? '').toLowerCase(), par: el.getAttribute('data-par') })),
  )
  const usados = new Set<number>()
  const pares: Array<[number, number]> = []
  for (let i = 0; i < cartas.length; i++) {
    if (usados.has(i)) continue
    const j = cartas.findIndex((c, k) => k !== i && !usados.has(k) && palavrasDe(cartas[i].texto).includes(c.texto))
    if (j < 0) continue
    usados.add(i).add(j)
    pares.push([i, j])
  }
  const peloDicionario = pares.length
  for (let i = 0; i < cartas.length; i++) {
    if (usados.has(i)) continue
    const j = cartas.findIndex((c, k) => k !== i && !usados.has(k) && c.par === cartas[i].par)
    if (j < 0) continue
    usados.add(i).add(j)
    pares.push([i, j])
  }
  return { pares, peloDicionario, cartas: cartas.length }
}

/** Vira as duas cartas e espera o par fechar (a mesa não aceita outra carta enquanto compara). */
export async function fecharPar(page: Page, [a, b]: [number, number]) {
  const cartas = cartasDaMemoria(page)
  await cartas.nth(a).click()
  await cartas.nth(b).click()
  await expect(cartas.nth(b), 'o par fecha').toHaveClass(/(^| )par( |$)/, { timeout: 5000 })
}

/* ─────────────────────────── uma jogada certa, jogo a jogo ─────────────────────────── */

/** O que cada alternativa traz escrito (`data-op`), na ordem da tela — a posição é a tecla 1–9. */
export const opcoesDe = (l: Locator) => l.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.op ?? ''))

/**
 * SOLETRAR (Termo): escreve a palavra da primeira pista aberta e envia. A pista é a TRADUÇÃO, e há
 * traduções com mais de uma palavra do mesmo tamanho na Trilha: a que já foi tentada fica em
 * `tentadas`, e a tentativa seguinte usa outra. Com um tabuleiro só, as letras já sabidas voltam
 * escritas na fileira — só se digita o que falta. Devolve a palavra enviada, ou `null` sem candidata.
 */
export async function palpitarNoTermo(page: Page, tentadas: Set<string>): Promise<string | null> {
  const aberto = palco(page).locator('.tab-termo:not(.resolvido):not(.falhou)').first()
  if (!(await aberto.isVisible().catch(() => false))) return null
  const pista = (await aberto.locator('.pista').innerText()).trim()
  const fileira = (await aberto.locator('.linha-termo.atual .letra').allInnerTexts()).map((c) => c.trim().toLowerCase())
  if (!fileira.length) return null
  const cabe = (w: string) => w.length === fileira.length && fileira.every((c, i) => !c || c === w[i])
  const w = palavrasDe(pista).find((x) => /^[a-z]+$/.test(x) && cabe(x) && !tentadas.has(x))
  if (!w) return null
  tentadas.add(w)
  await page.keyboard.type([...w].filter((_, i) => !fileira[i]).join(''), { delay: 20 })
  await page.keyboard.press('Enter')
  return w
}

/**
 * KARUTA: a pista é o significado, dito em português pelo narrador (e escrito no alto da mesa); pega,
 * pela tecla da posição, a carta cuja palavra tem essa tradução. Devolve se achou a carta.
 */
export async function pegarNaKaruta(page: Page): Promise<boolean> {
  const cartas = palco(page).locator('.pj-mesa button')
  const dita = (await ultimaFala(page, 'pt'))?.t ?? ''
  const escrita = await palco(page)
    .locator('[data-pista] .pj-pista > span')
    .last()
    .innerText()
    .catch(() => '')
  const candidatas = [...palavrasDe(dita), ...palavrasDe(escrita)]
  const mesa = await opcoesDe(cartas)
  const livres = await cartas.evaluateAll((els) => els.map((el) => !(el as HTMLButtonElement).disabled))
  const i = mesa.findIndex((w, k) => livres[k] && candidatas.includes(w.toLowerCase()))
  if (i < 0) return false
  await page.keyboard.press(String(i + 1))
  return true
}

/**
 * TABU: a definição é a frase da Trilha com a palavra apagada. Devolve as opções e a posição da certa
 * (-1 quando a frase não foi identificada).
 */
export async function cartaDoTabu(page: Page) {
  const alternativas = palco(page).locator('.opcoes-blitz button')
  await expect(alternativas.first()).toBeEnabled({ timeout: 5000 })
  const texto = await palco(page).locator('.pj-tabu p').innerText()
  const opcoes = await opcoesDe(alternativas)
  return { opcoes, certa: opcaoQueFechaAFrase(texto, opcoes) }
}
