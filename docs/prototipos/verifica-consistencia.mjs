import { createRequire } from 'node:module'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const RAIZ = 'C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4'
const require = createRequire(join(RAIZ, 'package.json'))
const { chromium } = require('playwright')
const AXE = require.resolve('axe-core/axe.min.js')
const ARQ = pathToFileURL(join(RAIZ, 'docs/prototipos/consistencia-telas.html')).href
const OUT = join(import.meta.dirname, 'cons'); mkdirSync(OUT, { recursive: true })
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const SO = process.argv[2] // opcional: 'desktop' | 'celular'
const TELAS = ['inicio', 'capturar', 'jogar', 'biblioteca', 'sessao', 'vocabulario', 'revisao', 'personalizar', 'sobre', 'planos', 'ajustes', 'perfil', 'memoria']

const browser = await chromium.launch({ headless: true })
let falhas = 0
const ok = (cond, msg) => { if (!cond) { falhas++; console.log('  ERR', msg) } }
for (const modo of ['desktop-claro', 'desktop-escuro', 'celular-claro', 'celular-escuro']) {
  if (SO && !modo.startsWith(SO)) continue
  const celular = modo.startsWith('celular')
  const page = await browser.newPage({ viewport: celular ? { width: 430, height: 1000 } : { width: 1440, height: 1000 } })
  const erros = []
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message))
  page.on('console', (m) => m.type() === 'error' && erros.push('console: ' + m.text()))
  await page.goto(ARQ, { waitUntil: 'networkidle' }); await esperar(600)
  if (celular) await page.click('#p-celular')
  if (modo.endsWith('escuro')) await page.click('#p-escuro')
  await esperar(300)
  for (const tela of TELAS) {
    await page.evaluate((t) => ir(t), tela); await esperar(450)
    const r = await page.evaluate(async (axeSrc) => {
      if (!window.axe) { const s = document.createElement('script'); s.textContent = axeSrc; document.head.appendChild(s) }
      const res = await axe.run({ include: ['#app'], exclude: ['#toast'] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })
      const iconesFaltando = [...document.querySelectorAll('#app i[data-lucide]')].map((i) => i.dataset.lucide)
      const h1 = document.querySelectorAll('#main h1').length
      const app = document.querySelector('#app').getBoundingClientRect()
      const estouro = [...document.querySelectorAll('#main *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > app.right + 1 && getComputedStyle(e).position !== 'absolute' && !e.closest('.abas, .passe') }).slice(0, 3).map((e) => e.tagName + '.' + (e.className?.toString() || '').slice(0, 40))
      const rol = document.querySelector('#rolagem'); const hOverflow = rol.scrollWidth > rol.clientWidth + 1
      const dock = document.querySelector('#dock'); const dockOk = getComputedStyle(dock).display === 'none' || dock.scrollWidth <= dock.clientWidth + 1
      return { v: res.violations.map((v) => `${v.id}×${v.nodes.length} ${v.nodes[0].target.join(' ')} ${(v.nodes[0].any[0]?.message || v.nodes[0].failureSummary || '').slice(0, 120)}`), iconesFaltando: [...new Set(iconesFaltando)], h1, estouro, hOverflow, dockOk }
    }, (await import('node:fs')).readFileSync(AXE, 'utf8'))
    const bom = !r.v.length && !r.iconesFaltando.length && r.h1 === 1 && !r.hOverflow && r.dockOk
    if (!bom) falhas++
    console.log(`${bom ? 'OK ' : 'ERR'} ${modo.padEnd(15)} ${tela.padEnd(13)} h1=${r.h1} hscroll=${r.hOverflow} dock=${r.dockOk} ${r.iconesFaltando.length ? 'ICONES:' + r.iconesFaltando.join(',') : ''} ${r.v.join(' | ')} ${r.estouro.length ? 'ESTOURO:' + r.estouro.join(',') : ''}`)
    await page.screenshot({ path: join(OUT, `${modo}-${tela}.png`), fullPage: false })
  }
  // Fluxos (só uma vez por viewport, no claro)
  if (modo.endsWith('claro')) {
    await page.evaluate(() => ir('revisao')); await esperar(300)
    for (let i = 0; i < 3; i++) { await page.click('#mostrar'); await esperar(150); await page.locator('[data-fsrs]').nth(2).click(); await esperar(250) }
    const dlg1 = await page.evaluate(() => document.getElementById('dlg').open && document.getElementById('dlg').contains(document.activeElement))
    ok(dlg1, `${modo}: conquista após revisão deve abrir com foco`)
    await page.keyboard.press('Escape'); await esperar(200)
    ok(await page.evaluate(() => !document.getElementById('dlg').open), `${modo}: Esc fecha o diálogo`)
    await page.evaluate(() => ir('jogar')); await esperar(300)
    await page.locator('[data-jogo=memory]').first().click(); await esperar(300)
    await page.locator('.pe-ante [data-jogo-direto]').last().click(); await esperar(400)
    for (let i = 0; i < 40 && !(await page.evaluate(() => !!(E.J && E.J.pronto))); i++) await esperar(150)
    // resolve a memória lendo o estado
    for (let tent = 0; tent < 12; tent++) {
      const feitas = await page.locator('.carta.par').count(); if (feitas === 6) break
      const n = await page.locator('.carta').count()
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        const livres = await page.evaluate(([a, b]) => { const c = document.querySelectorAll('.carta'); return !!c[a] && !!c[b] && !c[a].classList.contains('par') && !c[b].classList.contains('par') }, [a, b])
        if (await page.evaluate(() => E.tela === 'resultado')) break
        if (!livres) continue
        await page.locator('.carta').nth(a).click(); await page.locator('.carta').nth(b).click(); await esperar(900)
        if (await page.evaluate(() => E.tela === 'resultado')) break
      }
      if (await page.evaluate(() => E.tela === 'resultado')) break
    }
    for (let i = 0; i < 30 && !(await page.evaluate(() => E.tela === 'resultado')); i++) await esperar(150)
    ok(await page.evaluate(() => E.tela === 'resultado' && /3 de 3 pares/.test(document.getElementById('main').innerText)), `${modo}: memória termina na tela de fim de rodada`)
    await page.screenshot({ path: join(OUT, `${modo}-fluxo-memoria.png`) })
    await page.keyboard.press('Escape'); await esperar(200)
    await page.evaluate(() => ir('capturar')); await esperar(300)
    await page.click('#btn-gravar'); await esperar(5800)
    ok((await page.locator('.fala').count()) >= 2, `${modo}: captura mostra falas`)
    await page.screenshot({ path: join(OUT, `${modo}-fluxo-captura.png`) })
    await page.click('#btn-gravar'); await esperar(300)
    ok(/Encerrar a sessão/i.test(await page.locator('#dlg').innerText()), `${modo}: parar abre encerrar sessão`)
    await page.locator('[data-encerrar="salvar-aqui"]').click(); await esperar(400)
    ok(await page.evaluate(() => document.getElementById('dlg').open && /Primeira captura/i.test(document.getElementById('dlg').innerText)), `${modo}: conquista de captura`)
    await page.keyboard.press('Escape'); await esperar(200)
    await page.keyboard.press('Control+k'); await esperar(300)
    await page.keyboard.type('lever'); await page.keyboard.press('Enter'); await esperar(300)
    ok(await page.evaluate(() => /leverage/.test(document.getElementById('dlg').innerText)), `${modo}: busca abre palavra`)
    await page.keyboard.press('Escape'); await esperar(200)
    await page.evaluate(() => ir('personalizar')); await esperar(300)
    await page.click('[data-equipar="tema:indigo"]'); await esperar(300)
    ok(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase() === '#5b5ef0'), `${modo}: tema indigo aplica`)
    await page.screenshot({ path: join(OUT, `${modo}-fluxo-indigo.png`) })
    await page.click('[data-equipar="tema:babel"]'); await esperar(200)
    if (celular) {
      await page.click('#mais'); await esperar(350)
      await page.screenshot({ path: join(OUT, `${modo}-fluxo-mais.png`) })
      await page.locator('#folha [data-ir=ajustes]').click(); await esperar(300)
      ok(await page.evaluate(() => E.tela === 'ajustes'), `${modo}: Mais → Ajustes`)
    }
    // Biblioteca: importar embutido, filtros, menu da mídia, excluir + desfazer.
    await page.evaluate(() => ir('biblioteca')); await esperar(400)
    await page.locator('.cab-acoes [data-bib=importar]').click(); await esperar(300)
    await page.locator('[data-fonte-imp=local]').click(); await esperar(250)
    ok(await page.locator('.importar .soltar').count() === 1, `${modo}: importar embutido com área de soltar`)
    await page.screenshot({ path: join(OUT, `${modo}-fluxo-importar.png`) })
    await page.locator('.cab-acoes [data-bib=filtros]').click(); await esperar(250)
    await page.locator('[data-filtro=comAudio]').check(); await esperar(250)
    ok(await page.locator('.midia').count() === 2, `${modo}: filtro com áudio deixa 2 mídias`)
    await page.locator('[data-limpar-filtros]').first().click(); await esperar(250)
    await page.locator('[data-menu-midia=podcast]').click(); await esperar(250)
    ok(await page.locator('.menu-midia [role=menuitem]').count() >= 4, `${modo}: menu da mídia com 4+ ações`)
    await page.screenshot({ path: join(OUT, `${modo}-fluxo-menu-midia.png`) })
    await page.locator('[data-acao-midia="excluir:podcast"]').click(); await esperar(300)
    ok(await page.locator('.midia').count() === 2, `${modo}: excluir tira a mídia`)
    await page.evaluate(() => { MIDIAS.splice(1, 0, E._excluida); E.bib.importar = false; E.bib.filtros = false; render() }); await esperar(200)
    ok(await page.locator('#main').getByText('Cofre de memória').count() === 0, `${modo}: sem aba Cofre de memória`)
    // Sessão: as 4 abas com axe, e os fluxos de cada uma.
    await page.locator('[data-abrir-sessao=reuniao]').click(); await esperar(500)
    for (const [aba, sub] of [['transcricao'], ['leitura'], ['jogos'], ['visao','painel'], ['visao','lexical'], ['visao','fluencia']]) {
      await page.evaluate(([a, s]) => { E.abas.sessao = a; if (s) E.visaoSub = s; render() }, [aba, sub]); await esperar(350)
      const v = await page.evaluate(async () => (await axe.run({ include: ['#app'], exclude: ['#toast'] }, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } })).violations.map((x) => `${x.id}×${x.nodes.length} ${x.nodes[0].target.join(' ')} ${(x.nodes[0].any[0]?.message||'').slice(0,90)}`))
      ok(!v.length, `${modo}: sessão/${aba}${sub?'/'+sub:''} axe: ${v.join(' | ')}`)
      await page.screenshot({ path: join(OUT, `${modo}-sessao-${aba}${sub?'-'+sub:''}.png`), fullPage: false })
    }
    await page.evaluate(() => { E.abas.sessao = 'transcricao'; render() }); await esperar(300)
    await page.locator('[data-player=tocar]').first().click(); await esperar(2300)
    ok(await page.evaluate(() => E.player.pos >= 2), `${modo}: player avança`)
    await page.locator('[data-player=tocar]').first().click(); await esperar(200)
    await page.locator('[data-exib-toggle]').click(); await esperar(200)
    for (const tema of ['sepia','contraste','oceano','neon']) {
      await page.locator(`[data-exib="tema:${tema}"]`).click(); await esperar(200)
      const v = await page.evaluate(async () => (await axe.run(document.querySelector('.transcrito'), { runOnly: ['color-contrast'] })).violations.map((x) => `${x.nodes.length}× ${x.nodes[0].any[0]?.message.slice(0,80)}`))
      ok(!v.length, `${modo}: tema do texto ${tema}: ${v.join(' | ')}`)
      if (tema === 'sepia') await page.screenshot({ path: join(OUT, `${modo}-sessao-tema-sepia.png`) })
    }
    await page.locator('[data-exib="tema:padrao"]').click(); await esperar(200)
    await page.locator('[data-sombra="0"]').click(); await esperar(200)
    await page.locator('[data-sombra-gravar]').click(); await esperar(1900)
    ok(await page.locator('.nota-sombra').count() === 1, `${modo}: shadowing dá nota`)
    await page.screenshot({ path: join(OUT, `${modo}-sessao-sombra.png`) })
    await page.locator('[data-corrigir="1"]').click(); await esperar(200)
    await page.fill('#c-t', 'O prazo do primeiro marco é sexta que vem.'); await page.locator('[data-salvar-fala="1"]').click(); await esperar(250)
    ok(await page.getByText('sexta que vem').count() > 0, `${modo}: correção de fala salva`)
    await page.locator('.transcrito [data-palavra=deadline]').first().click(); await esperar(250)
    ok(await page.locator('.analista h3').first().innerText() === 'deadline', `${modo}: analista abre a palavra`)
    await page.screenshot({ path: join(OUT, `${modo}-sessao-analista.png`) })
    await page.evaluate(() => { E.abas.sessao = 'leitura'; render() }); await esperar(350)
    await page.locator('[data-frase="2"]').click(); await esperar(200)
    await page.locator('[data-anotar=gram]').click(); await esperar(200)
    ok(await page.locator('.nota-item').count() === 1, `${modo}: anotação semântica`)
    await page.locator('[data-leitura="ferramenta:desenho"]').click(); await esperar(300)
    const c = await page.locator('#tela-desenho').boundingBox()
    await page.mouse.move(c.x + 60, c.y + 60); await page.mouse.down(); await page.mouse.move(c.x + 220, c.y + 110, { steps: 8 }); await page.mouse.up(); await esperar(200)
    ok(await page.evaluate(() => !!E.desenho), `${modo}: desenho livre grava traço`)
    await page.screenshot({ path: join(OUT, `${modo}-sessao-leitura-desenho.png`) })
    await page.locator('[data-exportar-sessao]').click(); await esperar(300)
    ok(await page.evaluate(() => document.getElementById('dlg').open && /Flashcards para Anki/.test(document.getElementById('dlg').innerText)), `${modo}: exportar sessão`)
    await page.keyboard.press('Escape')
  }
  // Cada tema × claro/escuro: contraste nas telas mais densas.
  if (!celular && modo.endsWith('claro')) {
    const ESPERADO = { 'indigo-0':'#e9ebf2', 'indigo-1':'#0f1019', 'matcha-0':'#e2e6d8', 'matcha-1':'#101511', 'babel-1':'#17130f' }
    for (const [tema, escuro] of [['indigo',0],['indigo',1],['matcha',0],['matcha',1],['babel',1]]) {
      await page.evaluate(([tema, escuro]) => { E.equip.tema = tema; aplicarEquip(); aplicarEscuro(!!escuro) }, [tema, escuro]); await esperar(250)
      const canvas = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim().toLowerCase())
      ok(canvas === ESPERADO[`${tema}-${escuro}`], `tema ${tema}/${escuro}: canvas ${canvas}`)
      for (const tela of ['inicio', 'jogar', 'vocabulario', 'personalizar', 'planos']) {
        await page.evaluate((t) => ir(t), tela); await esperar(450)
        const v = await page.evaluate(async () => (await axe.run({ include: ['#app'], exclude: ['#toast'] }, { runOnly: ['color-contrast'] })).violations.map((x) => `${x.nodes.length}× ${x.nodes[0].target.join(' ')} ${x.nodes[0].any[0]?.message.slice(0, 90)}`))
        ok(!v.length, `tema ${tema}/${escuro ? 'escuro' : 'claro'} ${tela}: ${v.join(' | ')}`)
        if (tela === 'inicio' || tela === 'personalizar') await page.screenshot({ path: join(OUT, `tema-${tema}-${escuro ? 'escuro' : 'claro'}-${tela}.png`) })
      }
    }
    await page.evaluate(() => { E.equip.tema = 'babel'; aplicarEquip(); aplicarEscuro(false) })
    console.log('  temas verificados')
  }
  ok(erros.length === 0, `${modo}: erros JS ${erros.join(' ; ').slice(0, 300)}`)
  await page.close()
}
await browser.close()
console.log(falhas === 0 ? 'TUDO OK' : `${falhas} FALHA(S)`)
