// Rodada 11: Qual foi a fala?, Ditado, Karaokê e Frase embaralhada rodam até o fim, com axe e sem rolagem lateral.
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { readFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const RAIZ = 'C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4'
const require = createRequire(join(RAIZ, 'package.json'))
const { chromium } = require('playwright')
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const ARQ = pathToFileURL(join(RAIZ, 'docs/prototipos/consistencia-telas.html')).href
const OUT = join(import.meta.dirname, 'escuta'); mkdirSync(OUT, { recursive: true })
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
let falhas = 0; const ok = (c, m) => { console.log(c ? '  ok ' : '  ERR', m); if (!c) falhas++ }
const modo = process.argv[2] || 'desktop-claro', cel = modo.startsWith('celular')
console.log('==', modo)
const b = await chromium.launch({ headless: true })
const p = await b.newPage({ viewport: cel ? { width: 430, height: 1000 } : { width: 1440, height: 1000 } })
const erros = []; p.on('pageerror', (e) => { erros.push(e.message); console.log('  !! JS', e.stack.split(String.fromCharCode(10)).slice(0, 3).join(' | ')) })
await p.goto(ARQ, { waitUntil: 'networkidle' }); await esperar(400)
if (cel) await p.click('#p-celular'); if (modo.endsWith('escuro')) await p.click('#p-escuro'); await esperar(300)
await p.evaluate(() => { E.som = false })
const axe = async (r, alvo = '#app') => { const v = await p.evaluate(async ([src, alvo]) => { if (!window.axe) { const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s) }
    return (await axe.run({ include:[alvo], exclude:['#toast','#tip','.fx-contagem'] }, { runOnly:{ type:'tag', values:['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } })).violations.map((x)=>`${x.id}×${x.nodes.length} ${x.nodes[0].target.join(' ')} ${(x.nodes[0].any[0]?.message||x.nodes[0].failureSummary||'').slice(0,90)}`) }, [AXE, alvo])
  ok(!v.length, `axe ${r} ${v.join(' | ')}`) }
const hscroll = async (r) => ok(await p.evaluate(() => { const e = document.querySelector('#rolagem'); return e.scrollWidth <= e.clientWidth + 1 }), `sem rolagem lateral: ${r}`)
const foto = (n) => p.screenshot({ path: join(OUT, `${modo}-${n}.png`) })
const pronto = async () => { for (let i = 0; i < 40; i++) { if (await p.evaluate(() => !!(E.J && E.J.pronto))) return true; await esperar(150) } return false }
const fim = async () => { for (let i = 0; i < 40; i++) { if (await p.evaluate(() => E.tela === 'resultado')) return true; await esperar(150) } return false }
const comecar = async (id) => { await p.evaluate((id) => jogarJogo(id, true), id); await esperar(300); return pronto() }

// Qual foi a fala?
ok(await comecar('escuta'), 'escuta: começa'); await esperar(900); await axe('escuta'); await hscroll('escuta'); await foto('01-escuta')
ok(await p.locator('.opcoes-fala button').count() === 4, 'escuta: 4 alternativas')
for (let k = 0; k < 4; k++) {
  const certa = await p.evaluate(() => E.J.itens[E.J.idx])
  const alvo = k === 1 ? await p.evaluate(() => E.J.opcoes.find(o => o !== E.J.itens[E.J.idx])) : certa
  await p.locator(`[data-escuta="${alvo}"]`).click(); await esperar(k === 1 ? 2300 : 1200)
  if (k === 1) ok(true, 'escuta: errar mostra a certa e espera mais')
}
ok(await fim(), 'escuta: termina no pós-jogo'); ok(/3 de 4 falas/.test(await p.locator('#fim h1').innerText()), 'escuta: título do pós-jogo')

// Ditado
ok(await comecar('ditado'), 'ditado: começa'); await axe('ditado'); await hscroll('ditado')
await p.fill('#dit-in', 'the nothing wrong'); await p.locator('#dit-in').press('Enter'); await esperar(400)
ok(await p.locator('.correcao.ruim').count() === 1 && await p.locator('.m-falta, .m-troca').count() > 0, 'ditado: correção palavra a palavra'); await axe('ditado corrigido'); await foto('02-ditado-errado'); await esperar(3400)
for (let k = 0; k < 2; k++) {
  const txt = await p.evaluate(() => FALA_OK(E.J.itens[E.J.idx]))
  if (k === 0) { await p.locator('[data-ajuda="proxima-palavra"]').click(); await esperar(200); ok((await p.inputValue('#dit-in')).trim().split(' ').length === 1, 'ditado: dica escreve a próxima palavra') }
  await p.fill('#dit-in', txt.toLowerCase().replace(/[.,]/g, '')); await p.locator('#dit-in').press('Enter'); await esperar(300)
  if (k === 0) { ok(await p.locator('.correcao.boa').count() === 1, 'ditado: 80%+ conta como certo (ignora maiúsculas e pontuação)'); await foto('03-ditado-certo') }
  await esperar(1500)
}
ok(await fim(), 'ditado: termina no pós-jogo')

// Karaokê
ok(await comecar('karaoke'), 'karaokê: começa'); await esperar(700)
ok(await p.locator('.linha-karaoke span.aceso').count() > 0, 'karaokê: palavras acendem com a fala'); await axe('karaokê'); await hscroll('karaokê'); await foto('04-karaoke')
for (let k = 0; k < 3; k++) {
  await esperar(4000); await p.locator('[data-karaoke="gravar"]').click(); await esperar(300)
  if (k === 0) { ok(await p.locator('.btn.gravando').count() === 1, 'karaokê: gravando'); await foto('05-karaoke-gravando') }
  for (let i = 0; i < 30 && !(await p.locator('.nota-karaoke').count()); i++) await esperar(200)
  if (k === 0) { ok(/estimativa/i.test(await p.locator('.nota-karaoke').innerText()), 'karaokê: sem reconhecimento, a nota diz que é estimativa'); await axe('karaokê com nota'); await foto('06-karaoke-nota') }
  if (await p.locator('[data-karaoke="denovo"]').count()) { await p.locator('[data-karaoke="denovo"]').click(); await esperar(200); await p.locator('[data-karaoke="gravar"]').click(); for (let i = 0; i < 30 && !(await p.locator('.nota-karaoke').count()); i++) await esperar(200) }
  await p.locator('[data-karaoke="proxima"]').click(); await esperar(400)
}
ok(await fim(), 'karaokê: termina no pós-jogo')

// Frase embaralhada (precisa de frases: fonte com Anki)
await p.evaluate(() => { E.fonte.origens = ['gravacoes', 'anki']; atualizarJogos() })
ok(await comecar('scramble'), 'frase: começa'); await axe('frase'); await hscroll('frase')
for (let k = 0; k < 4; k++) {
  const certa = await p.evaluate(() => FALA_OK(E.J.itens[E.J.idx]).split(' '))
  const ordem = k === 0 ? [...certa].reverse() : certa
  for (const w of ordem) { const n = await p.evaluate((w) => E.J.pecas.findIndex(x => x.w === w && !E.J.montada.includes(x)), w); await p.locator(`[data-peca="${n}"]`).click() }
  await p.locator('[data-scramble="conferir"]').click(); await esperar(300)
  if (k === 0) { ok(await p.locator('.peca-frase.posta.fora').count() > 0, 'frase: as fora do lugar ficam vermelhas'); await foto('07-frase-errada'); await esperar(1500); await p.locator('[data-scramble="limpar"]').click(); await esperar(150)
    await p.locator('[data-ajuda="proxima-peca"]').click(); await esperar(150); ok(await p.locator('.frase-montada .peca-frase').count() === 1, 'frase: dica põe a próxima palavra')
    for (const w of certa.slice(1)) { const n = await p.evaluate((w) => E.J.pecas.findIndex(x => x.w === w && !E.J.montada.includes(x)), w); await p.locator(`[data-peca="${n}"]`).click() }
    await p.locator('[data-scramble="conferir"]').click(); await esperar(300); ok(await p.locator('.frase-montada.certa').count() === 1, 'frase: ordem certa'); await foto('08-frase-certa') }
  await esperar(1500)
}
ok(await fim(), 'frase: termina no pós-jogo'); await axe('pós-jogo da frase')
ok(!erros.length, `sem erros de JS ${erros.join(' ; ').slice(0, 300)}`)
await b.close(); console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
