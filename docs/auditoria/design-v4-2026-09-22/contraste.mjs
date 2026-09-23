import { createRequire } from 'node:module'
import { join } from 'node:path'
const RAIZ = 'C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4'
const require = createRequire(join(RAIZ, 'package.json'))
const { chromium } = require('playwright')
const AXE = require.resolve('axe-core/axe.min.js')
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ headless: true })
for (const esquema of ['claro', 'escuro']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto('http://localhost:4200', { waitUntil: 'networkidle' }); await esperar(1200)
  await page.keyboard.press('Escape'); await esperar(400)
  if (esquema === 'escuro') { await page.getByRole('button', { name: /modo escuro/i }).first().click(); await esperar(800) }
  const vistos = new Set()
  for (const tela of ['Início', 'Capturar', 'Jogar', 'Biblioteca', 'Vocabulário', 'Personalizar', 'Sobre', 'Planos', 'Ajustes']) {
    await page.keyboard.press('Escape'); await esperar(300)
    await page.getByRole('button', { name: tela, exact: true }).first().click({ force: true }); await esperar(1300)
    await page.keyboard.press('Escape'); await esperar(500) // fecha "Antes de jogar" e similares
    await page.addScriptTag({ path: AXE })
    const nos = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: ['color-contrast'] })
      return r.violations.flatMap((v) => v.nodes.map((n) => {
        const el = document.querySelector(n.target[0])
        const d = n.any[0]?.data || {}
        return { alvo: n.target.join(' '), texto: (el?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), razao: d.contrastRatio, fg: d.fgColor, bg: d.bgColor, fs: d.fontSize, peso: d.fontWeight, classe: (el?.className?.toString() || '').slice(0, 90) }
      }))
    })
    for (const n of nos) {
      const k = `${n.fg}/${n.bg}/${n.texto}`
      if (vistos.has(k)) continue
      vistos.add(k)
      console.log(`[${esquema}] ${tela.padEnd(12)} ${n.razao}:1  ${n.fg} sobre ${n.bg}  ${n.fs} ${n.peso}  «${n.texto}»  .${n.classe}`)
    }
  }
  await page.close()
}
await browser.close()
