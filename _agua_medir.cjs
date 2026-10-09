/* Mede a cena da Água nos dois lados: tamanho dos canvas, o que está pintado, custo por quadro e o
   liga/desliga. Navegador do comparador (chromium do playwright, sem janela). */
const { chromium } = require('playwright')
const path = require('path')
const { pathToFileURL } = require('url')
const APP = 'http://localhost:3177/?ui=pt'
const PROTO = pathToFileURL(path.join(__dirname, 'docs/prototipos/polimento-movimento.html')).href

const CRONOMETRO = () => {
  window.__q = { n: 0, soma: 0, max: 0, t: [] }
  const o = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (f) =>
    o((t) => {
      if (f && f.name === 'quadroDaAgua') {
        const a = performance.now()
        f(t)
        const d = performance.now() - a
        const q = window.__q
        q.n++
        q.soma += d
        q.max = Math.max(q.max, d)
        q.t.push(d)
      } else f(t)
    })
}
const ler = (p) =>
  p.evaluate(() => {
    const q = window.__q
    const t = [...q.t].sort((a, b) => a - b)
    const r = {
      quadros: q.n,
      media: +(q.soma / (q.n || 1)).toFixed(3),
      p95: +(t[Math.floor(t.length * 0.95)] || 0).toFixed(3),
      max: +q.max.toFixed(3),
    }
    window.__q = { n: 0, soma: 0, max: 0, t: [] }
    return r
  })
const cena = (p) =>
  p.evaluate(() => {
    const mar = document.querySelector('canvas.ag-mar')
    const bol = document.querySelector('canvas.ag-bolhas')
    const pintado = (c) => {
      if (!c) return null
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      let n = 0
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
      return +(n / (d.length / 4)).toFixed(3)
    }
    const main = document.querySelector('main')
    return {
      tema: document.documentElement.dataset.theme,
      px: document.documentElement.dataset.px,
      main: main && [main.clientWidth, main.clientHeight],
      cena: document.querySelectorAll('.ag-cena').length,
      frente: document.querySelectorAll('.ag-frente').length,
      filhos: [...(document.querySelector('.ag-cena')?.children || [])].map(
        (e) => e.tagName.toLowerCase() + '.' + e.className.replace(/ /g, '.'),
      ),
      primeiro: main?.firstElementChild?.className,
      mar: mar && [mar.width, mar.height, pintado(mar)],
      bolhas: bol && [bol.width, bol.height, pintado(bol)],
      ondas: document.querySelectorAll('.ag-onda').length,
      fundoDoMain: main && getComputedStyle(main).backgroundImage.slice(0, 60),
    }
  })

;(async () => {
  const b = await chromium.launch()
  for (const [w, h, dpr] of [
    [1280, 960, 1],
    [390, 844, 3],
  ]) {
    for (const lado of ['app', 'proto']) {
      const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, reducedMotion: 'reduce' })
      await c.addInitScript(CRONOMETRO)
      const pedidos = []
      if (lado === 'app')
        await c.addInitScript(() => {
          if (sessionStorage.getItem('s')) return
          sessionStorage.setItem('s', '1')
          localStorage.setItem('babel.desenhoNovo', 'sim')
          localStorage.setItem('babel.liberado', '1')
        })
      const p = await c.newPage()
      p.on('pageerror', (e) => console.log('  ERRO NA PÁGINA', e.message))
      p.on('request', (r) => /aguaCena/.test(r.url()) && pedidos.push(r.url().split('/').pop()))
      await p.goto(lado === 'app' ? APP : PROTO, { waitUntil: 'load' })
      await p.bringToFront()
      await p.waitForTimeout(3000)
      console.log('\n== ' + lado + ' ' + w + 'x' + h + ' dpr ' + dpr)
      if (lado === 'app') {
        await p.evaluate("import('/src/lib/polimento/agua.ts').then((a) => { window.__agua = a.instalarAgua() })")
        await p.waitForTimeout(1200)
        console.log(
          '  fora do tema:',
          JSON.stringify({ ...(await cena(p)), pedidosDaCena: pedidos.length, quadros: (await ler(p)).quadros }),
        )
        await p.evaluate("import('/src/lib/theme.ts').then((t) => t.applyTheme('agua'))")
      } else {
        console.log('  fora do tema:', JSON.stringify({ quadros: (await ler(p)).quadros }))
        await p.evaluate('document.querySelector("[data-px-acao=\'agua\']").click()')
      }
      await p.waitForTimeout(2500)
      await ler(p)
      await p.waitForTimeout(5000)
      console.log('  no tema:', JSON.stringify(await cena(p)), lado === 'app' ? 'pedidos da cena: ' + pedidos.join(',') : '')
      console.log('  custo por quadro, parado (ms):', JSON.stringify(await ler(p)))
      /* com o ponteiro mexendo e toques (a água agitada é o pior caso) */
      for (let i = 0; i < 40; i++) {
        await p.mouse.move(w * (0.2 + 0.6 * (i % 2)), h * (0.3 + 0.01 * i))
        if (i % 8 === 0) await p.mouse.click(w * 0.6, h * 0.5)
        await p.waitForTimeout(100)
      }
      console.log('  custo por quadro, agitado (ms):', JSON.stringify(await ler(p)))
      console.log('  ondas no meio do toque:', (await cena(p)).ondas)
      await p.screenshot({ path: path.join(__dirname, 'test-results/comparar', '_agua_cena_' + lado + '_' + w + '.png') })
      await p.waitForTimeout(2600)
      console.log('  ondas 2,6 s depois:', (await cena(p)).ondas)
      if (lado === 'app') {
        /* aba escondida: o laço para; volta: retoma */
        await p.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
          document.dispatchEvent(new Event('visibilitychange'))
        })
        await p.waitForTimeout(300)
        await ler(p)
        await p.waitForTimeout(1000)
        console.log('  aba escondida, quadros em 1 s:', (await ler(p)).quadros)
        await p.evaluate(() => {
          delete document.hidden
          document.dispatchEvent(new Event('visibilitychange'))
        })
        await p.waitForTimeout(1000)
        console.log('  aba de volta, quadros em 1 s:', (await ler(p)).quadros)
        /* Modo desempenho: a cena sai, a paleta fica */
        await p.evaluate(() => document.body.classList.add('performance-mode'))
        await p.waitForTimeout(500)
        await ler(p)
        await p.waitForTimeout(1000)
        console.log('  modo desempenho:', JSON.stringify({ ...(await cena(p)), quadros: (await ler(p)).quadros }))
        await p.evaluate(() => document.body.classList.remove('performance-mode'))
        await p.waitForTimeout(1200)
        console.log('  de volta:', JSON.stringify({ cena: (await cena(p)).cena, quadros: (await ler(p)).quadros }))
        /* sair do tema */
        await p.evaluate("import('/src/lib/theme.ts').then((t) => t.applyTheme('babel'))")
        await p.waitForTimeout(500)
        await ler(p)
        await p.waitForTimeout(1000)
        console.log('  saiu do tema:', JSON.stringify({ ...(await cena(p)), quadros: (await ler(p)).quadros }))
        /* desligar a instalação */
        await p.evaluate("import('/src/lib/theme.ts').then((t) => t.applyTheme('agua'))")
        await p.waitForTimeout(800)
        const antes = (await cena(p)).cena
        await p.evaluate(() => window.__agua())
        await p.waitForTimeout(300)
        await ler(p)
        await p.waitForTimeout(800)
        console.log(
          '  desinstalar:',
          JSON.stringify({ cenaAntes: antes, cenaDepois: (await cena(p)).cena, quadros: (await ler(p)).quadros }),
        )
      }
      await c.close()
    }
  }
  await b.close()
})()
