// O modal de conquista reaparece a cada contexto novo? O resgate concede Seeds de novo?
import { createRequire } from 'node:module'
import { join } from 'node:path'
const RAIZ = 'C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4'
const require = createRequire(join(RAIZ, 'package.json'))
const { chromium } = require('playwright')
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ headless: true })
for (let rodada = 1; rodada <= 2; rodada++) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto('http://localhost:4200', { waitUntil: 'networkidle' }); await esperar(1500)
  const d = page.locator('[role=dialog][aria-modal=true]').first()
  const aberto = await d.isVisible().catch(() => false)
  const seeds = async () => page.evaluate(() => (document.body.innerText.match(/(\d+)\s*\n\s*SEEDS/i) || [])[1])
  const antes = await seeds()
  let fechouComEsc = null
  let depois = null
  if (aberto) {
    await page.keyboard.press('Escape'); await esperar(500)
    fechouComEsc = !(await d.isVisible().catch(() => false))
    if (!fechouComEsc) { await d.getByRole('button', { name: /Resgatar/i }).first().click(); await esperar(1500) }
    depois = await seeds()
  }
  const ls = await page.evaluate(() => Object.keys(localStorage).filter((k) => /conquist|recompens|resgat|claim|reward/i.test(k)))
  console.log(`rodada ${rodada}: modal aberto=${aberto} | Esc fecha=${fechouComEsc} | Seeds antes=${antes} depois=${depois} | chaves localStorage=${JSON.stringify(ls)}`)
  await page.close()
}
await browser.close()
