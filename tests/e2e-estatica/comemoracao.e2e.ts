import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, type Locator, type Page, test } from '@playwright/test'

/**
 * O MESMO RETORNO DE ACERTO NOS JOGOS (recompensas v2, onda 1).
 *
 * Dois jogos principais (Memória, Soletrar) e dois culturais (Karuta, Tabu): acertar um item faz
 * subir o "+N" do que ele valeu (`[data-flutuante]`, a camada única dos números) e, depois de três
 * acertos seguidos, o HUD comum mostra o multiplicador ×2. É a prova de que os quatro passam pelo
 * mesmo motor (`celebrar`) e pelo mesmo placar.
 *
 * MODO LEVE (`babel.performance_mode = true`, o `html[data-modo-leve='true']`): o acerto continua
 * com o número e o som, mas NENHUMA rajada de partícula é pedida. O motor conta o que pediu em
 * `window.__comemoracoes`, que só existe quando o teste liga `__MEDIR_COMEMORACOES__` antes de a
 * página carregar (a edição estática é um build de produção).
 *
 * Determinismo: as respostas saem do mesmo arquivo que o app baixa (`dist/trilha/en.json`), como
 * em `jogos.e2e.ts`; a voz é falsa e registra o que foi dito (é assim que a Karuta é "ouvida").
 */

const DIST = path.join(process.cwd(), 'dist', 'trilha', 'en.json')
type Registro = [string, string, string?, string?]
const TRILHA = JSON.parse(readFileSync(DIST, 'utf8')) as { niveis: Record<string, Registro[]> }
const REGISTROS: Registro[] = Object.values(TRILHA.niveis).flat()

const norm = (s: string) =>
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
const palavrasDe = (pista: string) => (POR_TRADUCAO.get(norm(pista)) ?? []).map((p) => p.toLowerCase())
const textos = async (l: Locator) => (await l.allInnerTexts()).map((t) => t.trim())

const JOGOS = ['memory', 'termo', 'karuta', 'taboo']

interface Contador {
  eventos: number
  rajadas: number
  porTipo: Record<string, number>
}

async function prepararPagina(page: Page, leve: boolean) {
  await page.addInitScript(
    ({ jogos, leve }: { jogos: string[]; leve: boolean }) => {
      try {
        for (const j of jogos) localStorage.setItem(`babel_tour_${j}`, '1')
        localStorage.setItem('babel.performance_mode', String(leve))
      } catch {
        /* storage bloqueado */
      }
      const w = window as unknown as { __falas: Array<{ t: string; lang: string }>; __MEDIR_COMEMORACOES__: boolean }
      w.__MEDIR_COMEMORACOES__ = true
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
    },
    { jogos: JOGOS, leve },
  )
}

async function dispensarModais(page: Page) {
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

async function abrirJogo(page: Page, titulo: RegExp) {
  await page.goto('/jogar')
  await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
  const pular = page.getByRole('button', { name: 'Pular apresentação' })
  if (await pular.isVisible().catch(() => false)) {
    await pular.click()
    await page.getByRole('button', { name: /Começar/ }).click()
  }
  await dispensarModais(page)
  /* A fonte escolhida fica guardada: numa rodada nova (o teste recomeça depois de um erro) o lobby
     já abre na grade, sem a escolha de fonte. */
  const trilha = page.getByRole('radio', { name: /Trilha/ })
  const grade = page.locator('#grade-de-jogos')
  await expect(trilha.or(grade).first()).toBeVisible({ timeout: 15_000 })
  if (await trilha.isVisible().catch(() => false)) {
    await trilha.click()
    await page.getByRole('button', { name: /Usar estas palavras/ }).click()
  }
  await expect(grade).toBeVisible({ timeout: 15_000 })
  const carta = page.locator('#grade-de-jogos').getByRole('button', { name: titulo }).first()
  await expect(carta).toBeEnabled({ timeout: 15_000 })
  await carta.scrollIntoViewIfNeeded()
  await carta.click()
  const comecar = page.getByRole('button', { name: /^(Começar|Jogar agora|Começar a rodada)/ }).first()
  if (await comecar.isVisible().catch(() => false)) await comecar.click()
  await expect(page.locator('#palco')).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 })
}

/** O "+N" de um acerto: número positivo na camada única dos números que sobem. */
const maisN = (page: Page) => page.locator('[data-flutuante="bom"]').filter({ hasText: /^\+\d+$/ })
const multiplicador = (page: Page) => page.locator('.hud [aria-label^="Multiplicador "]')
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

/** Memória: vira o par cuja pista é a tradução da palavra. Devolve se fechou um par. */
async function acertarMemoria(page: Page, usados: Set<number | string>): Promise<boolean> {
  const cartas = page.locator('[data-tour="mesa"] > button')
  const n = await cartas.count()
  const t: string[] = []
  for (let i = 0; i < n; i++) t.push(((await cartas.nth(i).getAttribute('data-texto')) ?? '').toLowerCase())
  for (let i = 0; i < n; i++) {
    if (usados.has(i)) continue
    const j = t.findIndex((x, k) => k !== i && !usados.has(k) && palavrasDe(t[i]).includes(x))
    if (j < 0) continue
    usados.add(i).add(j)
    await cartas.nth(i).click()
    await cartas.nth(j).click()
    return true
  }
  return false
}

/**
 * Soletrar: digita a palavra da primeira pista aberta. A pista é a TRADUÇÃO, e há traduções com
 * mais de uma palavra do mesmo tamanho na Trilha (o sorteio decide qual é a certa): a que já foi
 * tentada e errou fica em `tentadas`, e a próxima tentativa usa a outra.
 */
async function acertarTermo(page: Page, tentadas: Set<number | string>): Promise<boolean> {
  const pistas = await textos(page.locator('[data-tour="tabuleiro"] .tab-termo:not(.resolvido):not(.falhou) .pista'))
  if (!pistas.length) return false
  const colunas = await page
    .locator('[data-tour="tabuleiro"] .tab-termo')
    .first()
    .locator('.linha-termo')
    .first()
    .locator('> *')
    .count()
  const w = palavrasDe(pistas[0]).find((x) => x.replace(/[^a-z]/g, '').length === colunas && !tentadas.has(x))
  if (!w) return false
  tentadas.add(w)
  await page.keyboard.type(w, { delay: 20 })
  await page.keyboard.press('Enter')
  return true
}

/** Karuta: a pista é dita em português; golpeia a carta cuja palavra tem essa tradução. */
async function acertarKaruta(page: Page): Promise<boolean> {
  const cartas = page.locator('[data-tour="cartas"] button')
  await expect(cartas.first()).toBeEnabled({ timeout: 5000 })
  const pista = await page.evaluate(
    () =>
      (window as unknown as { __falas: Array<{ t: string; lang: string }> }).__falas
        .filter((f) => /^pt/.test(f.lang))
        .at(-1)?.t ?? '',
  )
  const alts = await textos(cartas)
  const i = alts.findIndex((a) => palavrasDe(pista).includes(a.toLowerCase()))
  if (i < 0) return false
  await page.keyboard.press(String(i + 1))
  return true
}

/** Tabu: a certa é a opção que, posta na lacuna, reconstrói a frase da Trilha. */
async function acertarTabu(page: Page): Promise<boolean> {
  const alts = page.locator('[data-tour="alternativas"] button')
  await expect(alts.first()).toBeEnabled({ timeout: 5000 })
  const texto = norm((await page.locator('[data-tour="alvo"] p[dir]').innerText()).replace(/—+/g, ' '))
  const opcoes = await textos(alts)
  const certa = opcoes.findIndex((op) =>
    REGISTROS.some(
      (r) =>
        r[0].toLowerCase() === op.toLowerCase() &&
        r[2] &&
        norm(r[2]).replace(norm(op), ' ').replace(/\s+/g, ' ').trim() === texto,
    ),
  )
  if (certa < 0) return false
  await page.keyboard.press(String(certa + 1))
  return true
}

const CASOS: Array<{
  nome: string
  titulo: RegExp
  acertar: (page: Page, usados: Set<number | string>) => Promise<boolean>
  pausa: number
}> = [
  { nome: 'Memória', titulo: /^Jogar: Memória/, acertar: acertarMemoria, pausa: 400 },
  { nome: 'Soletrar', titulo: /^Jogar: Soletrar/, acertar: acertarTermo, pausa: 1700 },
  { nome: 'Karuta', titulo: /^Jogar: Karuta/, acertar: (p) => acertarKaruta(p), pausa: 1000 },
  { nome: 'Tabu', titulo: /^Jogar: Tabu/, acertar: (p) => acertarTabu(p), pausa: 1000 },
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
      await abrirJogo(page, caso.titulo)
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
  await abrirJogo(page, /^Jogar: Memória/)
  await expect(page.locator('html')).toHaveAttribute('data-modo-leve', 'true')
  /* O ponteiro fica onde estava a carta do jogo, em cima da 1ª carta da mesa. No modo leve as
     transições são instantâneas e o "levantar no hover" da carta a tira de baixo do ponteiro e a
     devolve a cada quadro — ela nunca fica estável para o clique. Tira o ponteiro de cima. */
  await page.mouse.move(1, 1)
  const usados = new Set<number>()
  let acertos = 0
  for (let volta = 0; volta < 8 && acertos < 3; volta++) {
    if (await acertarMemoria(page, usados)) acertos++
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
