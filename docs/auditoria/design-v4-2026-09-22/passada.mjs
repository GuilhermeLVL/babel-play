// Passada de auditoria: cada tela em desktop e mobile, com axe-core, overflow e alvos de toque.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = 'C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4'
const require = createRequire(join(RAIZ, 'package.json'))
const { chromium } = require('playwright')
const AXE = require.resolve('axe-core/axe.min.js')

const URL = 'http://localhost:4200'
const OUT = join(import.meta.dirname, 'evidencias')
mkdirSync(OUT, { recursive: true })

const TELAS = ['Início', 'Capturar', 'Jogar', 'Biblioteca', 'Vocabulário', 'Personalizar', 'Sobre', 'Planos', 'Ajustes']
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } }
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const modaisVistos = []
async function fecharDialogos(page) {
  for (let i = 0; i < 4; i++) {
    const d = page.locator('[role=dialog][aria-modal=true]').first()
    if (!(await d.isVisible().catch(() => false))) return
    modaisVistos.push((await d.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160))
    await page.keyboard.press('Escape'); await esperar(500)
    if (await d.isVisible().catch(() => false)) {
      const b = d.getByRole('button').filter({ hasText: /fechar|continuar|ok|resgatar|coletar|entendi|legal|pegar/i }).first()
      if (await b.isVisible().catch(() => false)) await b.click()
      else await d.getByRole('button').last().click().catch(() => {})
      await esperar(500)
    }
  }
}

const browser = await chromium.launch({ headless: true, args: ['--js-flags=--max-old-space-size=256'] })
const resultado = {}

for (const [vp, tamanho] of Object.entries(VIEWPORTS)) {
  const ctx = await browser.newContext({ viewport: tamanho, colorScheme: 'light' })
  const page = await ctx.newPage()
  const erros = []
  page.on('console', (m) => { if (m.type() === 'error' && !/24678|websocket|upgrade-insecure/i.test(m.text())) erros.push(m.text().slice(0, 200)) })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await esperar(1500)

  await fecharDialogos(page)
  for (const tela of TELAS) {
    await fecharDialogos(page)
    // No mobile o rail vira barra/gaveta; tenta o primeiro alvo VISÍVEL com esse nome.
    const alvos = page.getByRole('button', { name: tela, exact: true }).or(page.getByRole('link', { name: tela, exact: true }))
    let clicou = false
    for (let i = 0; i < (await alvos.count()); i++) {
      const a = alvos.nth(i)
      if (await a.isVisible()) { await a.click(); clicou = true; break }
    }
    if (!clicou) {
      const menu = page.getByRole('button', { name: /menu/i }).first()
      if (await menu.isVisible().catch(() => false)) {
        await menu.click(); await esperar(400)
        const a = page.getByRole('button', { name: tela, exact: true }).first()
        if (await a.isVisible().catch(() => false)) { await a.click(); clicou = true }
      }
    }
    await esperar(1500)
    const nome = `${vp}-${slug(tela)}`
    await page.screenshot({ path: join(OUT, `${nome}.png`), fullPage: true })

    await page.addScriptTag({ path: AXE })
    const axe = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, alvos: v.nodes.slice(0, 4).map((n) => n.target.join(' ')), resumo: v.nodes[0]?.failureSummary?.slice(0, 220) }))
    })
    const medidas = await page.evaluate(() => {
      const iw = innerWidth
      const sw = document.documentElement.scrollWidth
      const pequenos = [...document.querySelectorAll('button, a[href], input, select, [role=button], [role=tab]')]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24) && getComputedStyle(e).visibility !== 'hidden' })
        .map((e) => ({ t: (e.getAttribute('aria-label') || e.innerText || e.tagName).trim().slice(0, 30), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) }))
      const abaixo44 = [...document.querySelectorAll('button, a[href], [role=button], [role=tab]')]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 44 }).length
      const h = [...document.querySelectorAll('h1,h2,h3,h4')].map((e) => e.tagName + ':' + e.innerText.trim().slice(0, 40))
      return { overflowX: sw > iw ? sw - iw : 0, alvosMenores24: pequenos.slice(0, 8), totalMenores24: pequenos.length, alvosMenores44: abaixo44, headings: h.slice(0, 12), h1s: h.filter((x) => x.startsWith('H1')).length }
    })
    resultado[nome] = { clicou, axe, ...medidas }
    console.log(nome, 'clicou', clicou, '| axe', axe.map((v) => `${v.id}(${v.n})`).join(' ') || '0', '| overflowX', medidas.overflowX, '| <24px', medidas.totalMenores24, '| h1', medidas.h1s)
  }

  // Tema escuro: alterna no Início e roda axe só de contraste.
  if (vp === 'desktop') {
    await fecharDialogos(page); await page.getByRole('button', { name: 'Início', exact: true }).first().click(); await esperar(800)
    const tema = page.getByRole('button', { name: /modo escuro/i }).first()
    if (await tema.isVisible().catch(() => false)) {
      await tema.click(); await esperar(1000)
      for (const tela of ['Início', 'Jogar', 'Vocabulário', 'Planos']) {
        await fecharDialogos(page); await page.getByRole('button', { name: tela, exact: true }).first().click(); await esperar(1200)
        await page.screenshot({ path: join(OUT, `escuro-${slug(tela)}.png`), fullPage: true })
        await page.addScriptTag({ path: AXE })
        const c = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['color-contrast'] })).violations.map((v) => ({ n: v.nodes.length, alvos: v.nodes.slice(0, 5).map((n) => n.target.join(' ') + ' → ' + (n.any[0]?.message || '').slice(0, 120)) })))
        resultado[`escuro-${slug(tela)}`] = { contraste: c }
        console.log('escuro', tela, c.map((v) => v.n).join(',') || '0')
      }
      await page.getByRole('button', { name: /modo claro/i }).first().click().catch(() => {})
    }

    // Teclado: 12 Tabs a partir do topo, verifica se o foco é visível.
    await fecharDialogos(page); await page.getByRole('button', { name: 'Início', exact: true }).first().click(); await esperar(800)
    await page.mouse.click(5, 400)
    const foco = []
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      foco.push(await page.evaluate(() => {
        const e = document.activeElement; const s = getComputedStyle(e)
        const visivel = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'
        return { t: (e.getAttribute('aria-label') || e.innerText || e.tagName).trim().slice(0, 30), visivel }
      }))
    }
    resultado.teclado = foco
    console.log('teclado sem foco visível:', foco.filter((f) => !f.visivel).map((f) => f.t))
  }
  resultado[`${vp}-errosConsole`] = erros
  console.log(vp, 'erros de console:', erros.length)
  await ctx.close()
}

resultado.modaisVistos = modaisVistos
await browser.close()
writeFileSync(join(OUT, 'resultado.json'), JSON.stringify(resultado, null, 2))
console.log('OK', OUT)
