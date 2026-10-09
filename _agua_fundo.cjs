/* O que fica atrás do menu de vidro (o fundo do body) nos dois lados, e o tema no desenho antigo. */
const { chromium } = require('playwright')
const path = require('path')
const { pathToFileURL } = require('url')
const PROTO = pathToFileURL(path.join(__dirname, 'docs/prototipos/polimento-movimento.html')).href
const ler = () => {
  const cs = (el, p) => {
    const c = getComputedStyle(el, p)
    return { cor: c.backgroundColor, imagem: c.backgroundImage.slice(0, 70), display: c.display, conteudo: c.content }
  }
  const main = document.querySelector('main')
  const h1 = document.querySelector('.q-cab h1') || document.querySelector('h1')
  return {
    tema: document.documentElement.dataset.theme,
    px: document.documentElement.dataset.px,
    html: cs(document.documentElement).cor,
    body: cs(document.body),
    antes: cs(document.body, '::before'),
    depois: cs(document.body, '::after'),
    main: main && cs(main),
    inkFaint: getComputedStyle(document.documentElement).getPropertyValue('--ink-faint').trim(),
    good: getComputedStyle(document.documentElement).getPropertyValue('--good').trim(),
    anel: getComputedStyle(document.documentElement).getPropertyValue('--anel').trim(),
    hudBarra: getComputedStyle(document.documentElement).getPropertyValue('--hud-barra').trim(),
    fonteDoTitulo: h1 && getComputedStyle(h1).fontFamily,
  }
}
;(async () => {
  const b = await chromium.launch()
  for (const [nome, novo, escuro] of [
    ['app novo claro', true, false],
    ['app novo escuro', true, true],
    ['app antigo claro', false, false],
  ]) {
    const c = await b.newContext({ viewport: { width: 1280, height: 960 }, reducedMotion: 'reduce' })
    await c.addInitScript(
      ([novo]) => {
        if (sessionStorage.getItem('s')) return
        sessionStorage.setItem('s', '1')
        if (novo) localStorage.setItem('babel.desenhoNovo', 'sim')
        localStorage.setItem('babel.liberado', '1')
        localStorage.setItem('app_theme', 'agua')
      },
      [novo],
    )
    const p = await c.newPage()
    await p.goto('http://localhost:3177/?ui=pt', { waitUntil: 'load' })
    await p.waitForTimeout(3500)
    await p.evaluate("import('/src/lib/theme.ts').then((t) => t.applyDarkMode(" + escuro + '))')
    await p.waitForTimeout(800)
    console.log(nome, JSON.stringify(await p.evaluate(ler)))
    if (!novo) await p.screenshot({ path: path.join(__dirname, 'test-results/comparar/_agua_antigo.png') })
    await c.close()
  }
  for (const escuro of [false, true]) {
    const c = await b.newContext({ viewport: { width: 1280, height: 960 }, reducedMotion: 'reduce' })
    const p = await c.newPage()
    await p.goto(PROTO, { waitUntil: 'load' })
    await p.waitForTimeout(2500)
    await p.evaluate('document.querySelector("[data-px-acao=\'agua\']").click()')
    await p.waitForTimeout(1500)
    if (escuro) await p.evaluate('document.querySelector("[data-px-acao=\'tema\']").click()')
    await p.waitForTimeout(1500)
    console.log('proto ' + (escuro ? 'escuro' : 'claro'), JSON.stringify(await p.evaluate(ler)))
    await c.close()
  }
  await b.close()
})()
