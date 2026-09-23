import { createRequire } from 'node:module'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const RAIZ = 'C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4'
const require = createRequire(join(RAIZ, 'package.json'))
const { chromium } = require('playwright')
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const ARQ = pathToFileURL(join(RAIZ, 'docs/prototipos/consistencia-telas.html')).href
const D = import.meta.dirname
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
let falhas = 0; const ok = (c, m) => { console.log(c ? '  ok ' : '  ERR', m); if (!c) falhas++ }
const b = await chromium.launch({ headless: true })
for (const [nome, escuro] of [['claro', false], ['escuro', true]]) {
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } }); const erros = []; p.on('pageerror', (e) => erros.push(e.message))
  await p.goto(ARQ, { waitUntil: 'networkidle' }); await esperar(400); if (escuro) await p.click('#p-escuro'); await esperar(300)
  await p.keyboard.press('Control+k'); await esperar(300)
  ok(await p.locator('.cmd-grupo').first().innerText() === 'SUGESTÕES' || /Sugest/i.test(await p.locator('.cmd-grupo').first().innerText()), `${nome}: abre com sugestões`)
  ok(await p.locator('.cmd-item.foco').count() === 1, `${nome}: um destaque só`)
  await p.screenshot({ path: join(D, `busca-${nome}-vazia.png`) })
  const axe = async (r) => { const v = await p.evaluate(async (src) => { if (!window.axe) { const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s) } return (await axe.run('#dlg', { runOnly: { type:'tag', values:['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } })).violations.map((x)=>`${x.id}×${x.nodes.length} ${x.nodes[0].target.join(' ')} ${(x.nodes[0].any[0]?.message||x.nodes[0].failureSummary||'').slice(0,90)}`) }, AXE); ok(!v.length, `${nome}: axe ${r} ${v.join(' | ')}`) }
  await axe('vazia')
  await p.keyboard.type('re'); await esperar(250)
  const grupos = await p.locator('.cmd-grupo').allInnerTexts()
  ok(grupos.length >= 2, `${nome}: resultados agrupados: ${grupos.join(', ')}`)
  ok(await p.locator('.cmd-t mark').count() >= 1, `${nome}: trecho destacado`)
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await esperar(150)
  ok(await p.evaluate(() => document.querySelectorAll('.cmd-item.foco').length === 1 && document.querySelector('.cmd-item.foco').id === 'cmd-2'), `${nome}: setas movem o destaque`)
  await p.screenshot({ path: join(D, `busca-${nome}-re.png`) })
  await axe('com texto')
  await p.fill('#cmd-q', 'xyzw'); await esperar(200)
  ok(await p.locator('.cmd-vazio').count() === 1, `${nome}: estado vazio`)
  await p.fill('#cmd-q', 'podcast'); await esperar(200); await p.keyboard.press('Enter'); await esperar(500)
  ok(await p.evaluate(() => E.tela === 'sessao' && E.sessaoId === 'podcast'), `${nome}: Enter abre a gravação`)
  ok(!erros.length, `${nome}: sem erros de JS ${erros.join(';')}`)
  if (nome === 'claro') { await p.evaluate(() => ir('sobre')); await esperar(600); await p.screenshot({ path: join(D, 'sobre-novo.png') }) }
  await p.close()
}
await b.close(); console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
