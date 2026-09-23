// Rodada 10: os quatro jogos rodam até o fim, com HUD, efeitos e pós-jogo; entrada e apresentação animadas.
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { readFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const RAIZ = 'C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4'
const require = createRequire(join(RAIZ, 'package.json'))
const { chromium } = require('playwright')
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const ARQ = pathToFileURL(join(RAIZ, 'docs/prototipos/consistencia-telas.html')).href
const OUT = join(import.meta.dirname, 'jogos'); mkdirSync(OUT, { recursive: true })
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
let falhas = 0; const ok = (c, m) => { console.log(c ? '  ok ' : '  ERR', m); if (!c) falhas++ }
const MODOS = process.argv[2] ? [process.argv[2]] : ['desktop-claro', 'desktop-escuro', 'celular-claro']
const b = await chromium.launch({ headless: true })
for (const modo of MODOS) {
  console.log('==', modo)
  const cel = modo.startsWith('celular')
  const p = await b.newPage({ viewport: cel ? { width: 430, height: 1000 } : { width: 1440, height: 1000 } })
  const erros = []; p.on('pageerror', (e) => { erros.push(e.message); console.log('  !! JS', e.stack.split(String.fromCharCode(10)).slice(0, 3).join(' | ')) }); p.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
  await p.goto(ARQ, { waitUntil: 'networkidle' }); await esperar(400)
  if (cel) await p.click('#p-celular'); if (modo.endsWith('escuro')) await p.click('#p-escuro'); await esperar(300)
  await p.evaluate(() => { E.som = false })
  const axe = async (r, alvo = '#app') => { const v = await p.evaluate(async ([src, alvo]) => { if (!window.axe) { const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s) }
      return (await axe.run({ include:[alvo], exclude:['#toast','#tip','.fx-contagem'] }, { runOnly:{ type:'tag', values:['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } })).violations.map((x)=>`${x.id}×${x.nodes.length} ${x.nodes[0].target.join(' ')} ${(x.nodes[0].any[0]?.message||x.nodes[0].failureSummary||'').slice(0,90)}`) }, [AXE, alvo])
    ok(!v.length, `axe ${r} ${v.join(' | ')}`) }
  const hscroll = async (r) => ok(await p.evaluate(() => { const e = document.querySelector('#rolagem'); return e.scrollWidth <= e.clientWidth + 1 }), `sem rolagem lateral: ${r}`)
  const foto = (n) => p.screenshot({ path: join(OUT, `${modo}-${n}.png`) })
  const pronto = async () => { for (let i = 0; i < 40; i++) { if (await p.evaluate(() => !!(E.J && E.J.pronto))) return true; await esperar(150) } return false }
  const naTela = (t) => p.evaluate((t) => E.tela === t, t)

  // ── Pré-jogo
  await p.evaluate(() => { E.verAntes = true; ir('jogar') }); await esperar(400)
  ok(await p.evaluate(() => JOGOS.find(j => j.id === 'termo').estado === 'material'), 'termo: só com as 3 palavras longas das gravações, pede outro material')
  await p.evaluate(() => { E.fonte.origens = ['gravacoes', 'anki']; atualizarJogos(); jogarJogo('termo') }); await esperar(900)
  ok(await p.locator('.ante-heroi .arte-flutua').count() === 1, 'antessala: herói com a arte'); ok(await p.locator('.btn-jogar-grande').count() === 1, 'antessala: botão Jogar em destaque'); await axe('antessala'); await hscroll('antessala'); await foto('01-antessala')
  await p.locator('[data-ante-trocar]').click(); await esperar(200); await p.locator('[data-ante-nivel="dificil"]').click(); await esperar(300)
  ok(/Termo → Dueto → Quarteto/.test(await p.locator('.ante-heroi').innerText()), 'antessala do termo: difícil mostra a escada até o Quarteto')

  // ── TERMO → DUETO → QUARTETO
  await p.locator('.btn-jogar-grande').click(); await esperar(300)
  ok(await p.locator('.fx-contagem').count() === 1, 'contagem 3-2-1 aparece'); await foto('02-contagem')
  ok(await pronto(), 'termo: rodada começa depois da contagem'); await axe('termo'); await hscroll('termo')
  ok(await p.evaluate(() => { const t = E.J.tam; return t >= 4 && t <= 6 && E.J.palavras.every(([w]) => w.length === t) }), 'termo: todas as palavras têm o mesmo tamanho, entre 4 e 6 letras')
  ok(await p.evaluate(() => E.J.plano.join() === '1,2,4' && E.J.max === 6), 'termo: escada 1-2-4 e 6 tentativas no primeiro degrau')
  const tam = await p.evaluate(() => E.J.tam)
  await p.keyboard.type('zzzzzz'.slice(0, tam)); await p.keyboard.press('Enter'); await esperar(tam * 110 + 800)
  ok(await p.locator('.letra.fora').count() >= tam, 'termo: tentativa errada pinta as letras')
  await p.locator('[data-ajuda="letra-termo"]').click(); await esperar(200); ok(await p.locator('.tab-termo .revela').count() === 1, 'termo: dica revela uma letra'); await foto('03-soletrar')
  for (let d = 0; d < 3; d++) {
    const n = await p.evaluate(() => E.J.tabs.length); ok(n === [1, 2, 4][d], `degrau ${d + 1}: ${n} tabuleiro(s)`)
    if (d === 1) { await axe('dueto'); await hscroll('dueto'); await foto('03b-dueto') }
    for (let k = 0; k < n; k++) {
      const w = await p.evaluate(() => E.J.tabs.find(t => !t.feito).w)
      for (const ch of w) await p.locator(`.teclado [data-tecla="${ch}"]`).click()
      await p.locator('.teclado [data-tecla="enter"]').click(); await esperar(tam * 110 + 700)
      if (d === 2 && k === 1) { ok(await p.locator('.teclado .k-marcas.q4').count() > 0, 'quarteto: teclas mostram o estado em cada tabuleiro'); await axe('quarteto'); await hscroll('quarteto'); await foto('03c-quarteto') }
    }
    await esperar(1700)
  }
  ok(await naTela('resultado'), 'termo: subir a escada inteira termina no pós-jogo')
  await esperar(2200); ok(await p.locator('.estrelas-fim span.on').count() >= 1, 'pós-jogo: estrelas'); ok(/\d/.test(await p.locator('[data-contar]').innerText()), 'pós-jogo: placar contou'); await axe('pós-jogo'); await hscroll('pós-jogo'); await foto('04-pos-jogo')
  // raspadinha: arrastar até abrir sozinha
  const rb = await p.locator('.raspa').boundingBox()
  await p.mouse.move(rb.x + 5, rb.y + 5); await p.mouse.down()
  for (let y = 8; y < rb.height; y += 14) for (let x = 5; x < rb.width; x += 22) await p.mouse.move(rb.x + x, rb.y + y)
  await p.mouse.up(); await esperar(600)
  ok(await p.evaluate(() => E.res.revelado), 'raspadinha abre sozinha depois de raspar'); ok(await p.locator('#xp-barra').count() === 1, 'barra de XP aparece'); await axe('pós-jogo revelado'); await foto('05-revelado')

  // ── DUELO RELÂMPAGO (precisa de 4+ palavras: fonte com Anki)
  await p.evaluate(() => { E.fonte.origens = ['gravacoes','anki']; atualizarJogos(); jogarJogo('blitz', true) }); await esperar(300)
  ok(await pronto(), 'duelo: começa'); ok(/60 s|59 s/.test(await p.locator('#hud-seg').innerText()), 'duelo: relógio de 60 s')
  for (let i = 0; i < 9; i++) {
    const certa = await p.evaluate(() => E.J && E.J.itens[E.J.idx][1]); if (!certa) break
    await p.locator(`#palco [data-blitz="${certa}"]`).click(); await esperar(560)
    if (i === 2) ok(await p.locator('#hud-combo.quente').count() === 1, 'duelo: multiplicador acende com 3 seguidas')
  }
  ok(await p.evaluate(() => E.J && E.J.seq >= 8 && document.querySelector('#palco').classList.contains('fever')), 'duelo: FEVER com 8 seguidas'); await axe('duelo em FEVER'); await hscroll('duelo'); await foto('06-duelo-fever')
  const errada = await p.evaluate(() => E.J.opcoes.find(o => o !== E.J.itens[E.J.idx][1])); const t0 = await p.evaluate(() => E.J.tempo)
  await p.locator(`#palco [data-blitz="${errada}"]`).click(); await esperar(150); ok(await p.evaluate((t0) => E.J.tempo < t0 - 1.5 && E.J.seq === 0, t0), 'duelo: erro tira tempo e zera a sequência'); await esperar(1000)
  await p.locator('[data-ajuda="cortar"]').click(); await esperar(250); ok(await p.locator('#palco .cortada').count() === 2, 'duelo: cortar duas')
  await p.keyboard.press('Escape'); await esperar(250); ok(/pausa/i.test(await p.locator('#dlg').innerText()), 'duelo: Esc pausa'); const tp = await p.evaluate(() => E.J.tempo); await esperar(700); ok(await p.evaluate((tp) => E.J.tempo === tp, tp), 'duelo: relógio para na pausa'); await axe('pausa do duelo', '#dlg')
  await p.locator('[data-pausa-jogo="continuar"]').click(); await esperar(200)
  await p.evaluate(() => { E.J.tempo = .3 }); await esperar(1500); ok(await naTela('resultado'), 'duelo: tempo acabou vai para o pós-jogo'); ok(/O tempo acabou|Rodada/i.test(await p.locator('#fim').innerText()), 'pós-jogo do duelo')

  // ── CAÇA-PALAVRAS
  await p.evaluate(() => jogarJogo('wordsearch', true)); await esperar(300); ok(await pronto(), 'caça-palavras: começa'); await axe('caça-palavras'); await hscroll('caça-palavras'); await foto('07-caca')
  await p.locator('[data-ajuda="dica"]').click(); await esperar(200); ok(await p.locator('#grade-caca .dica').count() === 1, 'caça: dica acende a primeira letra')
  for (let k = 0; k < 2; k++) {
    const [a, z] = await p.evaluate(() => { const alvo = E.J.pos.find(x => !E.J.achadas.includes(x.w)); return [alvo.cel[0].join(','), alvo.cel.at(-1).join(',')] })
    const A = await p.locator(`[data-cel="${a}"]`).boundingBox(), Z = await p.locator(`[data-cel="${z}"]`).boundingBox()
    await p.mouse.move(A.x + A.width / 2, A.y + A.height / 2); await p.mouse.down(); await p.mouse.move((A.x + Z.x) / 2 + A.width / 2, (A.y + Z.y) / 2 + A.height / 2, { steps: 4 }); await p.mouse.move(Z.x + Z.width / 2, Z.y + Z.height / 2, { steps: 4 }); await p.mouse.up(); await esperar(500)
  }
  ok(await p.evaluate(() => E.J.achadas.length === 2), 'caça: arrastar acha palavras'); await foto('08-caca-achadas')
  await p.locator('[data-ajuda="revelar"]').click(); await esperar(1600); ok(await naTela('resultado'), 'caça: revelar a última termina a rodada')

  // ── MEMÓRIA
  await p.evaluate(() => jogarJogo('memory', true)); await esperar(300); ok(await pronto(), 'memória: começa depois da contagem'); ok(await p.locator('#palco .hud').count() === 1, 'memória: HUD')
  await p.locator('[data-ajuda="espiar"]').click(); await esperar(200); ok(await p.locator('.carta.espiando').count() === 6, 'memória: espiar mostra as cartas'); await foto('09-memoria-espiar'); await esperar(1300)
  for (let k = 0; k < 3; k++) {
    const [i, j] = await p.evaluate(() => { const c = MEM.cartas, livres = [...document.querySelectorAll('.carta')].map((b, n) => b.classList.contains('par') ? -1 : n).filter(n => n >= 0); const a = livres[0]; return [a, livres.find(n => n !== a && c[n].k === c[a].k)] })
    await p.locator('.carta').nth(i).click(); await p.locator('.carta').nth(j).click(); await esperar(500)
  }
  await esperar(1500); ok(await naTela('resultado'), 'memória termina no pós-jogo')

  // ── ENTRADA E APRESENTAÇÃO
  await p.evaluate(() => irAuth('entrar')); await esperar(500)
  ok(await p.locator('.nuvem-palavras span').count() >= 10 || cel, 'entrada: palavras flutuando no painel'); await axe('entrada', '#auth'); await foto('10-entrada')
  await p.evaluate(() => { E.authErro = 'E-mail ou senha não conferem.'; desenharAuth() }); await esperar(100); ok(await p.locator('.auth-form.treme').count() === 1, 'entrada: formulário treme no erro')
  await p.evaluate(() => { E.authErro = null; irAuth(null) }); await esperar(300)
  await p.evaluate(() => onboarding(0)); await esperar(400); ok(await p.locator('#dlg .onb-palco').count() === 1, 'apresentação: cena animada'); await axe('apresentação 1', '#dlg'); await foto('11-apresentacao')
  await p.locator('[data-onb="prox"]').click(); await esperar(300); await p.locator('[data-onb-idioma="es"]').click(); await esperar(200); ok(await p.evaluate(() => E.onb.idioma === 'es'), 'apresentação: escolher idioma'); await axe('apresentação idioma', '#dlg')
  await p.locator('[data-onb="prox"]').click(); await esperar(300); await p.locator('[data-onb-perfil="kids"]').click(); await esperar(200); await axe('apresentação perfil', '#dlg'); await foto('12-apresentacao-perfil')
  for (let k = 0; k < 3; k++) { await p.locator('[data-onb="prox"]').click(); await esperar(300) }
  ok(await p.locator('[data-onb-ia]').count() === 2, 'apresentação: 6º passo escolhe a IA'); await axe('apresentação IA', '#dlg')
  await p.locator('[data-onb="fim"]').click(); await esperar(400); ok(await p.evaluate(() => !document.getElementById('dlg').open), 'apresentação: Começar fecha')

  // ── movimento reduzido: sem contagem, direto ao jogo
  await p.emulateMedia({ reducedMotion: 'reduce' }); await p.evaluate(() => jogarJogo('termo', true)); await esperar(400)
  ok(await p.evaluate(() => E.J.pronto) && await p.locator('.fx-contagem').count() === 0, 'reduzir movimento: sem contagem animada'); await p.emulateMedia({ reducedMotion: 'no-preference' })
  ok(!erros.length, `sem erros de JS ${erros.join(' ; ').slice(0, 400)}`)
  await p.close()
}
await b.close(); console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
