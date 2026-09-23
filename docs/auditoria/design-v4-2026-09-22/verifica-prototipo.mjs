import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const RAIZ = 'C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4'
const require = createRequire(join(RAIZ, 'package.json'))
const { chromium } = require('playwright')
const AXE = require.resolve('axe-core/axe.min.js')
const ARQ = pathToFileURL(join(RAIZ, 'docs/prototipos/auditoria-v4-correcoes.html')).href
const OUT = join(import.meta.dirname, 'evidencias-prototipo')
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const TELAS = ['inicio', 'capturar', 'jogar', 'vocabulario', 'personalizar', 'sobre', 'ajustes']

const browser = await chromium.launch({ headless: true })
let falhas = 0
for (const modo of ['desktop-claro', 'desktop-escuro', 'celular-claro', 'celular-escuro']) {
  const celular = modo.startsWith('celular')
  const page = await browser.newPage({ viewport: celular ? { width: 390, height: 900 } : { width: 1400, height: 950 }, colorScheme: modo.endsWith('escuro') ? 'dark' : 'light' })
  const erros = []
  page.on('pageerror', (e) => erros.push(e.message))
  page.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
  await page.goto(ARQ); await esperar(800)
  await page.uncheck('#t-anotar')
  if (celular) await page.check('#t-celular')
  await esperar(300)
  for (const tela of TELAS) {
    await page.evaluate((t) => ir(t), tela); await esperar(350)
    await page.addScriptTag({ path: AXE })
    const r = await page.evaluate(async () => {
      const res = await axe.run(document.querySelector('#app'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })
      const h1 = [...document.querySelectorAll('.tela.ativa h1')].length
      const nav = document.querySelector('#nav-inf')
      const navOk = getComputedStyle(nav).display === 'none' || nav.scrollWidth <= nav.clientWidth
      return { v: res.violations.map((v) => `${v.id}×${v.nodes.length}: ${v.nodes[0].target.join(' ')} ${(v.nodes[0].any[0]?.message || '').slice(0, 90)}`), h1, navOk }
    })
    const ok = r.v.length === 0 && r.h1 === 1 && r.navOk
    if (!ok) falhas++
    console.log(`${ok ? 'OK ' : 'ERR'} ${modo.padEnd(15)} ${tela.padEnd(13)} h1=${r.h1} nav=${r.navOk} ${r.v.join(' | ')}`)
    if (tela === 'inicio' || tela === 'jogar') await page.screenshot({ path: join(OUT, `${modo}-${tela}.png`) })
  }
  // Diálogo de conquista: Esc fecha e o foco entra nele.
  await page.evaluate(() => ir('vocabulario')); await esperar(200)
  await page.click('#concluir'); await esperar(300)
  const focoDentro = await page.evaluate(() => document.getElementById('conquista').contains(document.activeElement))
  await page.screenshot({ path: join(OUT, `${modo}-conquista.png`) })
  await page.keyboard.press('Escape'); await esperar(300)
  const fechou = await page.evaluate(() => !document.getElementById('conquista').open)
  // Folha "Mais" no celular
  let folhaOk = 'n/a'
  if (celular) {
    await page.click('#mais'); await esperar(300)
    folhaOk = await page.evaluate(() => document.getElementById('folha').classList.contains('aberta'))
    await page.screenshot({ path: join(OUT, `${modo}-mais.png`) })
    await page.getByRole('button', { name: 'Ajustes' }).last().click(); await esperar(300)
    folhaOk = folhaOk && (await page.evaluate(() => document.querySelector('[data-tela=ajustes]').classList.contains('ativa')))
  }
  const ok = focoDentro && fechou && folhaOk !== false && erros.length === 0
  if (!ok) falhas++
  console.log(`${ok ? 'OK ' : 'ERR'} ${modo.padEnd(15)} diálogo foco=${focoDentro} esc=${fechou} | folha Mais→Ajustes=${folhaOk} | erros JS=${erros.length} ${erros.join(';').slice(0, 200)}`)
  await page.close()
}
await browser.close()
console.log(falhas === 0 ? 'TUDO OK' : `${falhas} FALHA(S)`)
