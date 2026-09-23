// Rodada 13: menu lateral recolhível (botão e Ctrl+B), dica com o nome, lembra a escolha, axe nos dois estados.
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { readFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const RAIZ = 'C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4'
const require = createRequire(join(RAIZ, 'package.json'))
const { chromium } = require('playwright')
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const ARQ = 'http://localhost:4200/prototipo-consistencia.html'
const OUT = join(import.meta.dirname, 'rail'); mkdirSync(OUT, { recursive: true })
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
let falhas = 0; const ok = (c, m) => { console.log(c ? '  ok ' : '  ERR', m); if (!c) falhas++ }
const b = await chromium.launch({ headless: true })
for (const escuro of [false, true]) {
  console.log('==', escuro ? 'escuro' : 'claro')
  const p = await b.newPage({ viewport: { width: 1100, height: 830 } }); const erros = []; p.on('pageerror', (e) => erros.push(e.message))
  await p.goto(ARQ, { waitUntil: 'networkidle' }); await p.evaluate(() => { try { localStorage.removeItem('babel.railRecolhido') } catch {} }); await p.reload({ waitUntil: 'networkidle' }); await esperar(400)
  if (escuro) await p.click('#p-escuro')
  const axe = async (r) => { const v = await p.evaluate(async (src) => { if (!window.axe) { const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s) }
      return (await axe.run({ include:['.rail'] }, { runOnly:{ type:'tag', values:['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } })).violations.map((x)=>`${x.id}×${x.nodes.length} ${x.nodes[0].target.join(' ')}`) }, AXE)
    ok(!v.length, `axe ${r} ${v.join(' | ')}`) }
  const largura = () => p.evaluate(() => Math.round(document.querySelector('.rail').getBoundingClientRect().width))
  const w0 = await largura(); ok(w0 > 200, `menu aberto (${w0}px)`)
  await p.locator('[data-rail-recolher]').click(); await esperar(450)
  const w1 = await largura(); ok(w1 < 90, `recolhido só com ícones (${w1}px)`); ok(await p.getAttribute('[data-rail-recolher]', 'aria-expanded') === 'false', 'botão diz que está recolhido')
  ok(await p.evaluate(() => document.querySelectorAll('.rail nav .item[data-rot]').length >= 10), 'cada item guarda o nome para a dica')
  ok(await p.evaluate(() => { const i = document.querySelector('.rail nav .item[aria-current="page"]'), ind = document.querySelector('#pilula-ativa'); if (!i || !ind) return true; const a = i.getBoundingClientRect(), c = ind.getBoundingClientRect(); return Math.abs(a.top - c.top) < 6 && c.width < 90 }), 'destaque da página atual acompanha o recolhimento')
  await p.locator('.rail nav .item[data-ir="jogar"]').hover(); await esperar(250)
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.rail nav .item[data-ir="jogar"]'), '::after').opacity === '1'), 'dica com o nome aparece ao passar o mouse')
  await axe('recolhido'); await p.screenshot({ path: join(OUT, `${escuro ? 'escuro' : 'claro'}-recolhido.png`) })
  await p.locator('.rail nav .item[data-ir="jogar"]').click(); await esperar(600); ok(await p.evaluate(() => E.tela === 'jogar'), 'navega com o menu recolhido')
  await p.screenshot({ path: join(OUT, `${escuro ? 'escuro' : 'claro'}-jogar-recolhido.png`) })
  await p.reload({ waitUntil: 'networkidle' }); await esperar(500); ok(await largura() < 90, 'lembra a escolha depois de recarregar')
  await p.locator('body').click({ position: { x: 5, y: 5 } }); await p.keyboard.press('Control+b'); await esperar(450); ok(await largura() > 200, 'Ctrl+B expande'); await axe('aberto')
  await p.keyboard.press('Control+b'); await esperar(450); ok(await largura() < 90, 'Ctrl+B recolhe')
  await p.evaluate(() => { try { localStorage.removeItem('babel.railRecolhido') } catch {} })
  ok(!erros.length, `sem erros de JS ${erros.join(' ; ').slice(0, 200)}`); await p.close()
}
await b.close(); console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
