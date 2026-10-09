/* Quadros por segundo da página inteira, com e sem o tema, nos dois lados (chromium sem janela). */
const { chromium } = require('playwright')
const path = require('path')
const { pathToFileURL } = require('url')
const APP = 'http://localhost:3177/?ui=pt'
const PROTO = pathToFileURL(path.join(__dirname, 'docs/prototipos/polimento-movimento.html')).href
const fps = (p) =>
  p.evaluate(
    () =>
      new Promise((ok) => {
        let n = 0
        const t0 = performance.now()
        const q = (t) => {
          n++
          if (t - t0 < 4000) requestAnimationFrame(q)
          else ok(+((n * 1000) / (t - t0)).toFixed(1))
        }
        requestAnimationFrame(q)
      }),
  )
;(async () => {
  const b = await chromium.launch()
  for (const escuro of [false, true])
    for (const lado of ['app', 'proto']) {
      const c = await b.newContext({ viewport: { width: 1280, height: 960 }, reducedMotion: 'reduce' })
      if (lado === 'app')
        await c.addInitScript(() => {
          if (sessionStorage.getItem('s')) return
          sessionStorage.setItem('s', '1')
          localStorage.setItem('babel.desenhoNovo', 'sim')
          localStorage.setItem('babel.liberado', '1')
        })
      const p = await c.newPage()
      await p.goto(lado === 'app' ? APP : PROTO, { waitUntil: 'load' })
      await p.bringToFront()
      await p.waitForTimeout(3000)
      if (lado === 'app') {
        await p.evaluate(
          "Promise.all([import('/src/lib/theme.ts'), import('/src/lib/polimento/agua.ts')]).then(([t, a]) => { t.applyTheme('babel'); t.applyDarkMode(" +
            escuro +
            '); window.__agua = a.instalarAgua() })',
        )
      } else if (escuro) await p.evaluate('document.querySelector("[data-px-acao=\'tema\']").click()')
      await p.waitForTimeout(2000)
      const sem = await fps(p)
      if (lado === 'app') await p.evaluate("import('/src/lib/theme.ts').then((t) => t.applyTheme('agua'))")
      else await p.evaluate('document.querySelector("[data-px-acao=\'agua\']").click()')
      await p.waitForTimeout(2500)
      const com = await fps(p)
      let semCena = null
      if (lado === 'app') {
        /* o tema ligado, a cena desmontada: quanto do custo é do vidro (CSS) e quanto é da cena */
        await p.evaluate(() => window.__agua())
        await p.waitForTimeout(800)
        semCena = await fps(p)
      }
      console.log(lado, escuro ? 'escuro' : 'claro', '| fps sem o tema:', sem, '| com a Água:', com, semCena === null ? '' : '| Água sem a cena (só o vidro): ' + semCena)
      await c.close()
    }
  await b.close()
})()
