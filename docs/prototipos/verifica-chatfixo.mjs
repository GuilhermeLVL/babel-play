// Rodada 14: iChat fixo na lateral direita — vira coluna, conteúdo não fica por baixo, sem rolagem lateral nas telas,
// borda arrastável, lembra a escolha, janela estreita volta a flutuar.
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { readFileSync, mkdirSync } from 'node:fs'
const RAIZ = 'C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4'
const require = createRequire(join(RAIZ, 'package.json'))
const { chromium } = require('playwright')
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const ARQ = 'http://localhost:4200/prototipo-consistencia.html'
const OUT = join(import.meta.dirname, 'chatfixo'); mkdirSync(OUT, { recursive: true })
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
let falhas = 0; const ok = (c, m) => { console.log(c ? '  ok ' : '  ERR', m); if (!c) falhas++ }
const b = await chromium.launch({ headless: true })
const p = await b.newPage({ viewport: { width: 1100, height: 830 } }); const erros = []; p.on('pageerror', (e) => erros.push(e.message))
await p.goto(ARQ, { waitUntil: 'networkidle' }); await p.evaluate(() => { try { localStorage.clear() } catch {} }); await p.reload({ waitUntil: 'networkidle' }); await esperar(400)
const caixa = (s) => p.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), t: Math.round(r.top), b: Math.round(r.bottom) } }, s)
const hscroll = () => p.evaluate(() => { const e = document.querySelector('#rolagem'); return e.scrollWidth > e.clientWidth + 1 })
const axe = async (r) => { const v = await p.evaluate(async (src) => { if (!window.axe) { const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s) }
    return (await axe.run({ include:['#painel-chat'] }, { runOnly:{ type:'tag', values:['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } })).violations.map((x)=>`${x.id}×${x.nodes.length} ${x.nodes[0].target.join(' ')}`) }, AXE)
  ok(!v.length, `axe ${r} ${v.join(' | ')}`) }

await p.evaluate(() => ir('capturar')); await esperar(400)
await p.click('#fab'); await esperar(400)
const antes = await caixa('#rolagem')
ok(await p.locator('#painel-chat [data-ch-doca]').count() === 1, 'botão de fixar no cabeçalho do iChat'); await axe('flutuante')
await p.click('#painel-chat [data-ch-doca]'); await esperar(500)
const ch = await caixa('#painel-chat'), rol = await caixa('#rolagem'), app = await caixa('.app')
ok(await p.evaluate(() => document.querySelector('.app').classList.contains('chat-fixo')), 'fixou: o app ganhou a coluna do chat')
ok(Math.abs(ch.r - app.r) <= 1 && ch.t <= app.t + 1 && ch.b >= app.b - 1, `chat ocupa a lateral direita de cima a baixo (${ch.w}px)`)
ok(rol.r <= ch.l + 1, `o conteúdo termina onde o chat começa (${rol.r} ≤ ${ch.l})`); ok(rol.w < antes.w, `o conteúdo encolheu (${antes.w} → ${rol.w}px)`)
ok(await p.getAttribute('#painel-chat [data-ch-doca]', 'aria-pressed') === 'true', 'botão indica que está fixo'); await axe('fixo')
await p.screenshot({ path: join(OUT, 'capturar-fixo.png') })
for (const t of ['inicio', 'jogar', 'biblioteca', 'vocabulario', 'estatisticas', 'planos', 'ajustes', 'sessao', 'personalizar']) {
  await p.evaluate((t) => ir(t), t); await esperar(450)
  ok(!(await hscroll()) && await p.evaluate(() => document.querySelector('.app').classList.contains('chat-fixo')), `${t}: sem rolagem lateral com o chat fixo`)
  if (t === 'jogar' || t === 'estatisticas') await p.screenshot({ path: join(OUT, `${t}-fixo.png`) })
}
// recolher o menu dá mais espaço ao conteúdo, o chat continua fixo
const w1 = (await caixa('#rolagem')).w; await p.keyboard.press('Control+b'); await esperar(500)
ok((await caixa('#rolagem')).w > w1 + 100, 'recolher o menu devolve espaço ao conteúdo'); ok(await p.evaluate(() => document.querySelector('.app').classList.contains('chat-fixo')), 'chat continua fixo com o menu recolhido')
await p.screenshot({ path: join(OUT, 'menu-recolhido-chat-fixo.png') })
// arrastar a borda esquerda muda a largura
const al = await caixa('#painel-chat .ch-redim'), w0 = (await caixa('#painel-chat')).w
await p.mouse.move(al.l + 3, al.t + 200); await p.mouse.down(); await p.mouse.move(al.l - 90, al.t + 200, { steps: 6 }); await p.mouse.up(); await esperar(300)
const w2 = (await caixa('#painel-chat')).w; ok(w2 > w0 + 60, `arrastar a borda alarga o chat (${w0} → ${w2}px)`)
// fechar e abrir de novo: volta fixo; recarregar: lembra
await p.click('#painel-chat [data-ch="fechar"]'); await esperar(400); ok(!(await p.evaluate(() => document.querySelector('.app').classList.contains('chat-fixo'))), 'fechar o chat devolve a tela inteira')
await p.click('#fab'); await esperar(400); ok(await p.evaluate(() => document.querySelector('.app').classList.contains('chat-fixo')), 'reabrir: volta fixo')
await p.reload({ waitUntil: 'networkidle' }); await esperar(400); await p.click('#fab'); await esperar(400)
ok(await p.evaluate(() => document.querySelector('.app').classList.contains('chat-fixo')), 'lembra a escolha depois de recarregar'); ok(Math.abs((await caixa('#painel-chat')).w - w2) <= 2, 'lembra a largura')
// soltar
await p.click('#painel-chat [data-ch-doca]'); await esperar(400); ok(!(await p.evaluate(() => document.querySelector('.app').classList.contains('chat-fixo'))), 'soltar: volta a flutuar')
// janela estreita: não fixa, avisa
await p.click('#painel-chat [data-ch-doca]'); await esperar(300); await p.setViewportSize({ width: 800, height: 830 }); await esperar(1000)
ok(!(await p.evaluate(() => document.querySelector('.app').classList.contains('chat-fixo'))), 'janela estreita: o chat volta a flutuar')
ok(!(await hscroll()), 'janela estreita: sem rolagem lateral')
await p.setViewportSize({ width: 1100, height: 830 }); await esperar(500); ok(await p.evaluate(() => document.querySelector('.app').classList.contains('chat-fixo')), 'janela volta a ter espaço: fixa de novo')
await p.evaluate(() => { try { localStorage.clear() } catch {} })
ok(!erros.length, `sem erros de JS ${erros.join(' ; ').slice(0, 200)}`)
await b.close(); console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
