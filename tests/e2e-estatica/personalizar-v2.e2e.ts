import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { abrirJogo, fecharPar, fimDaRodada, paresDaMemoria, semExplicacao } from './_jogos'

/**
 * PERSONALIZAR EM CINCO ABAS NA EDIÇÃO ESTÁTICA (recompensas v2, Task 5.4 — Review Focus 2).
 *
 * Banco limpo (cada teste abre um contexto novo: IndexedDB vazio, primeira visita):
 *
 *  1. As cinco abas (Coleção, Maestria, Temporada, Conquistas, Loja) renderizam com zero e sem o
 *     cartão "Disponível na versão completa" — a economia é do servidor em memória.
 *  2. Uma rodada de Memória com três estrelas: a maestria de Memória sobe, o baú aparece com as
 *     chances à vista, e o saldo de Seeds traz o que cada recompensa anunciou.
 *
 * DESENHO NOVO (09/10/2026). As abas são as do protótipo (`PersonalizarDoPrototipo`): a Coleção abre
 * com a vitrine "Como está agora" (`vitrine-da-colecao`), a Loja com a carteira e a prateleira de
 * Seeds (`prateleira-de-seeds`). O fim de rodada (`casca/FimDaRodada`) mostra estrelas, acertos, tempo,
 * pontos, combo e XP; não tem mais raspadinha nem a linha das Seeds da rodada
 * (`data-seeds-da-rodada`): as Seeds são ditas só pelas recompensas que abrem por cima dele.
 *
 * Screenshots: com `SHOTS_PERSONALIZAR=<pasta>`, as cinco abas vão para a pasta (claro; e escuro no
 * desktop).
 */

const SHOTS = process.env.SHOTS_PERSONALIZAR || ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const ABAS = [
  ['colecao', /Coleção/],
  ['maestria', /Maestria/],
  ['temporada', /Temporada/],
  ['conquistas', /Conquistas/],
  ['loja', /Loja/],
] as const

async function preparar(page: Page, escuro = false) {
  await semExplicacao(page, ['memory'])
  await page.addInitScript((escuro: boolean) => {
    try {
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

const aba = (page: Page, nome: RegExp) =>
  page.getByRole('tablist', { name: 'Personalizar' }).getByRole('tab', { name: nome })
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
  await expect(page.getByTestId('saldo-de-seeds')).toContainText(/^\s*0\s*Seeds/)

  for (const [id, nome] of ABAS) {
    await aba(page, nome).click()
    await expect(aba(page, nome)).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(new RegExp(`/loja/${id === 'conquistas' ? 'desafios' : id}$`))
    await semConvite(page, id)
    if (id === 'colecao') await expect(page.getByTestId('vitrine-da-colecao')).toBeVisible()
    if (id === 'maestria') {
      await expect(page.locator('[data-maestria-jogo]')).toHaveCount(18)
      await expect(page.getByText('Rumo ao Bronze · 0/30')).toHaveCount(18)
    }
    if (id === 'temporada') await expect(page.getByTestId('temporada')).toBeVisible()
    if (id === 'conquistas') await expect(page.getByTestId('conquistas-no-quest')).toContainText(/0 de \d+ feitas/)
    if (id === 'loja') {
      await expect(page.getByTestId('prateleira-de-seeds')).toBeVisible()
      // Edição estática: sem Créditos, sem compra de Créditos (o saldo nem abre a carteira paga).
      await expect(page.locator('[data-item-de-credito]')).toHaveCount(0)
      await expect(page.getByTestId('saldo-de-seeds')).not.toHaveAttribute('role', 'button')
      await expect(page.getByRole('main').getByText(/Créditos/)).toHaveCount(0)
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

test('Memória com 3 estrelas: maestria sobe, baú com as chances, Seeds anunciadas no saldo', async ({ page }, info) => {
  await preparar(page)
  const saldoAntes = await saldoNoPersonalizar(page)
  expect(saldoAntes).toBe(0)

  // A rodada, pela Trilha embutida: todos os pares de primeira (3 estrelas não pode errar par).
  await abrirJogo(page, 'memory')
  const { pares, cartas } = await paresDaMemoria(page)
  expect(pares.length * 2, 'todos os pares da mesa identificados').toBe(cartas)
  for (const par of pares) await fecharPar(page, par)

  // O fim da rodada: as recompensas chegam DEPOIS dela, uma por vez; soma o que cada uma anunciou.
  let anunciadas = 0
  let viuChances = false
  const fim = fimDaRodada(page)
  await expect(fim).toBeVisible({ timeout: 15_000 })
  await expect(fim.getByRole('img', { name: '3 de 3 estrelas' })).toBeVisible()
  await expect(fim).toContainText('sem nenhum erro')
  expect(Number(await fim.locator('[data-xp-da-rodada]').getAttribute('data-xp-da-rodada'))).toBeGreaterThan(0)
  for (let i = 0; i < 20; i++) {
    const dialogo = page.getByRole('dialog')
    const resgatar = dialogo.getByRole('button', { name: /^Resgatar e continuar$/ }).first()
    if (!(await resgatar.isVisible().catch(() => false))) {
      // Entre uma recompensa e a seguinte há um instante: só para quando nada mais abre.
      const veioOutra = await resgatar
        .waitFor({ state: 'visible', timeout: 2500 })
        .then(() => true)
        .catch(() => false)
      if (!veioOutra) break
    }
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
  }
  await expect(fim.getByRole('button', { name: /Voltar aos jogos/ })).toBeVisible({ timeout: 5000 })
  expect(viuChances, 'o baú da rodada de 3 estrelas mostra as chances').toBe(true)

  // A maestria de Memória saiu do zero.
  await entrar(page, '/loja/maestria')
  const memoria = page.locator('[data-maestria-jogo="memory"]')
  await expect(memoria).toBeVisible({ timeout: 15_000 })
  await expect(memoria).not.toContainText('Rumo ao Bronze · 0/30', { timeout: 10_000 })

  /* O saldo traz tudo o que as recompensas anunciaram. A IGUALDADE de antes (saldo = Seeds do resumo
     da rodada + recompensas) não dá mais para conferir pela tela: a rodada continua pagando Seeds
     (acertos, rodada perfeita), mas quem as dizia era a raspadinha do fim de rodada, que saiu. O que
     sobra do saldo além do anunciado fica anotado no relatório do teste. */
  const saldo = await saldoNoPersonalizar(page)
  expect(anunciadas, 'as recompensas da rodada anunciaram Seeds').toBeGreaterThan(0)
  expect(saldo, 'o saldo traz o que as recompensas anunciaram').toBeGreaterThanOrEqual(anunciadas)
  info.annotations.push({
    type: 'seeds',
    description: `saldo ${saldo} · anunciadas pelas recompensas ${anunciadas} · da rodada, sem tela que as diga: ${saldo - anunciadas}`,
  })
})
