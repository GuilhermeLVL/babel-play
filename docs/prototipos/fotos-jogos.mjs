// Fotos de cada jogo em plena rodada, no tamanho da janela do dono, e detecção automática de sobreposição.
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const RAIZ = 'C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4'
const require = createRequire(join(RAIZ, 'package.json'))
const { chromium } = require('playwright')
const OUT = join(import.meta.dirname, 'fotos'); mkdirSync(OUT, { recursive: true })
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const [w, h, tag, escuro] = process.argv[2] === 'cel' ? [430, 900, 'cel', false] : [1100, 830, 'jan', process.argv[3] === 'escuro']
const b = await chromium.launch({ headless: true })
const p = await b.newPage({ viewport: { width: w, height: h } })
await p.goto(pathToFileURL(join(RAIZ, 'docs/prototipos/consistencia-telas.html')).href, { waitUntil: 'networkidle' })
if (tag === 'cel') await p.click('#p-celular'); if (escuro) await p.click('#p-escuro')
await p.emulateMedia({ reducedMotion: 'reduce' })
await p.evaluate(() => { E.som = false; E.fonte.origens = ['gravacoes', 'anki']; atualizarJogos(); E.ante.niveis = new Set(['dificil']) })
// sobreposição: elementos interativos/textuais do palco que se cruzam (fora pai/filho)
const sobrepostos = () => p.evaluate(() => {
  const els = [...document.querySelectorAll('#palco button, #palco .letra, #palco .hud > *, #palco .tab-termo, #palco .pista, #palco h2, #palco .opcoes-fala button, #palco .peca, #palco .grade-caca span, #palco .carta, .fab')].filter(e => e.offsetParent)
  const r = els.map(e => e.getBoundingClientRect()), ruins = []
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    if (els[i].contains(els[j]) || els[j].contains(els[i])) continue
    const a = r[i], c = r[j], x = Math.min(a.right, c.right) - Math.max(a.left, c.left), y = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top)
    if (x > 2 && y > 2) ruins.push(`${els[i].className || els[i].tagName}|${els[j].className || els[j].tagName}`.replace(/\s+/g, '.').slice(0, 90))
  }
  const palco = document.querySelector('#palco')?.getBoundingClientRect(), vaza = els.filter(e => { const q = e.getBoundingClientRect(); return palco && e.closest('#palco') && (q.right > palco.right + 1 || q.left < palco.left - 1) }).map(e => e.className).slice(0, 5)
  return { ruins: [...new Set(ruins)].slice(0, 8), vaza, hscroll: document.querySelector('#rolagem').scrollWidth > document.querySelector('#rolagem').clientWidth + 1 }
})
const JOGOS_ = [['memory', null], ['termo', async () => { const J = await p.evaluate(() => E.J.tam); await p.keyboard.type('zzzzzz'.slice(0, J)); await p.keyboard.press('Enter'); await esperar(300) }],
  ['termo-dueto', null], ['termo-quarteto', null], ['blitz', null], ['wordsearch', null], ['escuta', null], ['ditado', async () => { await p.fill('#dit-in', 'the deadline for the milestone'); await p.locator('#dit-in').press('Enter'); await esperar(300) }], ['karaoke', null], ['scramble', async () => { await p.locator('[data-peca]').first().click(); await p.locator('[data-peca]').first().click() }]]
for (const [id, depois] of JOGOS_) {
  const base = id.split('-')[0]
  await p.evaluate((base) => jogarJogo(base, true), base); await esperar(500)
  if (id === 'termo-dueto' || id === 'termo-quarteto') await p.evaluate((n) => { const J = E.J; J.degrau = n; J.usadas = n === 1 ? 1 : 3; montarDegrau(J); J.tentativas = ['zzzzzz'.slice(0, J.tam), J.tabs[0].w]; J.tabs[0].feito = 2; J.vistas = 2; render() }, id === 'termo-dueto' ? 1 : 2)
  if (depois) await depois()
  await esperar(300); const s = await sobrepostos()
  console.log(`${tag} ${id.padEnd(15)} ${s.hscroll ? 'ROLAGEM-LATERAL ' : ''}${s.vaza.length ? 'VAZA:' + s.vaza.join(',') + ' ' : ''}${s.ruins.length ? 'SOBREPÕE: ' + s.ruins.join(' ; ') : 'ok'}`)
  await p.evaluate(() => { document.querySelector('#rolagem').scrollTop = 0 })
  await p.screenshot({ path: join(OUT, `${tag}${escuro ? '-escuro' : ''}-${id}.png`), fullPage: false })
}
await b.close()
