import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

/**
 * PERSONALIZAR EM CINCO ABAS NA EDIÇÃO ESTÁTICA (recompensas v2, Task 5.4 — Review Focus 2).
 *
 * Banco limpo (cada teste abre um contexto novo: IndexedDB vazio, primeira visita):
 *
 *  1. As cinco abas (Coleção, Maestria, Temporada, Conquistas, Loja) renderizam com zero e sem o
 *     cartão "Disponível na versão completa" — a economia é do servidor em memória.
 *  2. Uma rodada de Memória com três estrelas: a maestria de Memória sobe, o baú aparece com as
 *     chances à vista, e o saldo de Seeds é exatamente o que as telas disseram (o resumo da rodada
 *     mais o que cada recompensa anunciou).
 *
 * Screenshots: com `SHOTS_PERSONALIZAR=<pasta>`, as cinco abas vão para a pasta (claro; e escuro no
 * desktop).
 */

const SHOTS = process.env.SHOTS_PERSONALIZAR || ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const DIST = path.join(process.cwd(), 'dist', 'trilha', 'en.json')
type Registro = [string, string, string?, string?]
const TRILHA = JSON.parse(readFileSync(DIST, 'utf8')) as { niveis: Record<string, Registro[]> }
const norm = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const REGISTROS: Registro[] = Object.values(TRILHA.niveis).flat()
const POR_TRADUCAO = new Map<string, string[]>()
for (const [palavra, traducao] of REGISTROS) {
  const k = norm(traducao)
  POR_TRADUCAO.set(k, [...(POR_TRADUCAO.get(k) ?? []), palavra])
}
/* A PISTA DA CARTA NEM SEMPRE É A TRADUÇÃO. Quando a tradução entrega a resposta ("depender" traz
   "depend"), o jogo mostra a tradução mascarada ("———") ou, se sobrar só a lacuna, a frase de exemplo
   com lacuna ("Children _____ on their parents.") — `promptFor` em `core/minigames/itemSource.ts`.
   Na Trilha inglesa são duas palavras (uma do A2, uma do B1); quando uma delas saía no sorteio, o
   teste achava 7 de 8 pares e a rodada de 3 estrelas não pode errar par. Aqui a lacuna vira curinga
   e a pista casa com a tradução ou a frase da Trilha. */
const LACUNA = /_{3,}|—{2,}/
function comLacuna(pista: string): string[] {
  if (!LACUNA.test(pista)) return []
  const partes = pista.split(LACUNA).map((p) => p.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const molde = new RegExp(`^${partes.join("\\s*[\\p{L}\\p{N}'’-]+\\s*")}$`, 'iu')
  return REGISTROS.filter(([, traducao, frase]) => molde.test(traducao.trim()) || molde.test((frase ?? '').trim())).map(
    ([palavra]) => palavra,
  )
}
const palavrasDe = (pista: string) =>
  [...(POR_TRADUCAO.get(norm(pista)) ?? []), ...comLacuna(pista)].map((p) => p.toLowerCase())

const ABAS = [
  ['colecao', /Coleção/],
  ['maestria', /Maestria/],
  ['temporada', /Temporada/],
  ['conquistas', /Conquistas/],
  ['loja', /Loja/],
] as const

async function preparar(page: Page, escuro = false) {
  await page.addInitScript((escuro: boolean) => {
    try {
      localStorage.setItem('babel_tour_memory', '1')
      if (escuro) localStorage.setItem('theme', 'dark')
    } catch {
      /* storage bloqueado */
    }
  }, escuro)
}

async function entrar(page: Page, rota: string) {
  await page.goto(rota)
  await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
  const pular = page.getByRole('button', { name: 'Pular apresentação' })
  if (await pular.isVisible().catch(() => false)) {
    await pular.click()
    await page.getByRole('button', { name: /Começar/ }).click()
  }
}

const aba = (page: Page, nome: RegExp) => page.getByRole('tab', { name: nome })
const semConvite = async (page: Page, onde: string) =>
  expect(page.getByText('Disponível na versão completa'), `${onde}: convite de versão completa`).toHaveCount(0)

async function fotografar(page: Page, nome: string) {
  if (!SHOTS) return
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SHOTS, `${nome}.png`), fullPage: false })
}

async function saldoNoPersonalizar(page: Page): Promise<number> {
  await entrar(page, '/loja/colecao')
  const pill = page.getByTestId('saldo-de-seeds')
  await expect(pill).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(800)
  return Number((await pill.innerText()).replace(/\D+/g, ''))
}

async function percorrerAbas(page: Page, prefixo: string) {
  await entrar(page, '/loja')
  for (const [id, nome] of ABAS) await expect(aba(page, nome), id).toBeVisible()
  await expect(aba(page, /Coleção/)).toHaveAttribute('aria-selected', 'true')
  await expect(aba(page, /Conquistas/)).toContainText(/0\/\d+/)

  for (const [id, nome] of ABAS) {
    await aba(page, nome).click()
    await expect(page).toHaveURL(new RegExp(`/loja/${id === 'conquistas' ? 'desafios' : id}$`))
    await semConvite(page, id)
    if (id === 'maestria') {
      await expect(page.locator('[data-maestria-jogo]')).toHaveCount(18)
      await expect(page.getByText('Rumo ao Bronze · 0/30')).toHaveCount(18)
    }
    if (id === 'colecao') await expect(page.getByTestId('legenda-de-exemplo')).toBeVisible()
    if (id === 'temporada') await expect(page.getByTestId('temporada')).toBeVisible()
    if (id === 'loja') {
      await expect(page.getByTestId('vitrine-v2')).toBeVisible()
      // Edição estática: sem Créditos, sem compra de Créditos.
      await expect(page.locator('[data-item-de-credito]')).toHaveCount(0)
    }
    await fotografar(page, `${prefixo}-${id}`)
  }
}

test('primeira visita: as cinco abas no zero, sem "Disponível na versão completa"', async ({ page }, info) => {
  await preparar(page)
  await percorrerAbas(page, `${info.project.name}-claro`)
})

test('as cinco abas no escuro (screenshots do desktop)', async ({ page }, info) => {
  test.skip(!SHOTS || info.project.name !== 'desktop-1280', 'só para as fotos do desktop')
  await preparar(page, true)
  await percorrerAbas(page, `${info.project.name}-escuro`)
})

test('Memória com 3 estrelas: maestria sobe, baú com as chances, Seeds do resumo = saldo', async ({ page }) => {
  await preparar(page)
  const saldoAntes = await saldoNoPersonalizar(page)
  expect(saldoAntes).toBe(0)

  // A rodada, pela Trilha embutida.
  await entrar(page, '/jogar')
  await page.getByRole('radio', { name: /Trilha/ }).click()
  await page.getByRole('button', { name: /Usar estas palavras/ }).click()
  const carta = page
    .locator('#grade-de-jogos')
    .getByRole('button', { name: /^Jogar: Memória/ })
    .first()
  await expect(carta).toBeEnabled({ timeout: 15_000 })
  await carta.scrollIntoViewIfNeeded()
  await carta.click()
  const comecar = page.getByRole('button', { name: /^(Começar|Jogar agora|Começar a rodada)/ }).first()
  if (await comecar.isVisible().catch(() => false)) await comecar.click()
  await expect(page.locator('#palco')).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 })

  const cartas = page.locator('[data-tour="mesa"] > button')
  const n = await cartas.count()
  const textos: string[] = []
  for (let i = 0; i < n; i++) textos.push(((await cartas.nth(i).getAttribute('data-texto')) ?? '').toLowerCase())
  const usados = new Set<number>()
  for (let i = 0; i < n; i++) {
    if (usados.has(i)) continue
    const j = textos.findIndex((x, k) => k !== i && !usados.has(k) && palavrasDe(textos[i]).includes(x))
    if (j < 0) continue
    usados.add(i).add(j)
    await cartas.nth(i).click()
    await cartas.nth(j).click()
    await page.waitForTimeout(200)
  }
  expect(usados.size, 'todos os pares pelo dicionário da Trilha (3 estrelas)').toBe(n)

  // O fim da rodada: as recompensas chegam DEPOIS dela, uma por vez; soma o que cada uma anunciou.
  let anunciadas = 0
  let viuChances = false
  const voltar = page.getByRole('button', { name: /Voltar aos jogos/ })
  for (let i = 0; i < 60 && !(await voltar.isVisible().catch(() => false)); i++) {
    const dialogo = page.getByRole('dialog')
    const resgatar = dialogo.getByRole('button', { name: /^Resgatar e continuar$/ }).first()
    if (await resgatar.isVisible().catch(() => false)) {
      if (
        await dialogo
          .locator('[data-chances-do-bau]')
          .isVisible()
          .catch(() => false)
      ) {
        await expect(dialogo.locator('[data-chances-do-bau]')).toContainText(/Chances: \d+% comum · \d+% raro/)
        viuChances = true
      }
      for (const selo of await dialogo.locator('.badge.ok').allInnerTexts()) {
        const m = selo.match(/\+(\d+)\s*Seeds/i) // o selo vem em caixa alta pelo CSS
        if (m) anunciadas += Number(m[1])
      }
      await resgatar.click({ timeout: 3000 })
      await page.waitForTimeout(500)
      continue
    }
    const revelar = page.getByRole('button', { name: 'Revelar sem raspar' })
    if (await revelar.isVisible().catch(() => false)) await revelar.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(400)
  }
  await expect(voltar).toBeVisible({ timeout: 5000 })
  const premio = page.locator('[data-seeds-da-rodada]')
  const seedsDaRodada = Number(await premio.getAttribute('data-seeds-da-rodada'))
  expect(seedsDaRodada).toBeGreaterThan(0)
  expect(viuChances, 'o baú da rodada de 3 estrelas mostra as chances').toBe(true)

  // A maestria de Memória saiu do zero.
  await entrar(page, '/loja/maestria')
  const memoria = page.locator('[data-maestria-jogo="memory"]')
  await expect(memoria).toBeVisible({ timeout: 15_000 })
  await expect(memoria).not.toContainText('Rumo ao Bronze · 0/30', { timeout: 10_000 })

  // O saldo é o que as telas disseram: o resumo da rodada mais o que cada recompensa anunciou.
  const saldo = await saldoNoPersonalizar(page)
  expect(saldo).toBe(seedsDaRodada + anunciadas)
})
