/* O caminho de verdade no app: Personalizar → provar a Água (círculo) → Equipar. A cena monta na prova,
   o mergulho só toca ao equipar. Nenhuma escrita chega ao servidor (a conta local é dividida). */
const { chromium } = require('playwright')
const path = require('path')
;(async () => {
  const b = await chromium.launch()
  const c = await b.newContext({ viewport: { width: 1280, height: 960 }, reducedMotion: 'reduce' })
  await c.addInitScript(() => {
    /* cada frequência que um som programa: o mergulho tem 520, 1300, 1700 e 2100 Hz (`agua.js:256`) */
    window.__hz = []
    const o = AudioParam.prototype.setValueAtTime
    AudioParam.prototype.setValueAtTime = function (v, t) {
      window.__hz.push(Math.round(v))
      return o.call(this, v, t)
    }
    if (sessionStorage.getItem('s')) return
    sessionStorage.setItem('s', '1')
    localStorage.setItem('babel.desenhoNovo', 'sim')
    localStorage.setItem('babel.liberado', '1')
    localStorage.setItem('app_theme', 'babel')
  })
  const escritas = []
  await c.route('**/api/**', async (rota) => {
    const r = rota.request()
    if (r.method() === 'GET') return rota.continue()
    escritas.push(r.method() + ' ' + new URL(r.url()).pathname + ' ' + (r.postData() || '').slice(0, 120))
    return rota.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  const p = await c.newPage()
  p.on('pageerror', (e) => console.log('ERRO NA PÁGINA', e.message))
  await p.goto('http://localhost:3177/?ui=pt', { waitUntil: 'load' })
  await p.bringToFront()
  await p.waitForTimeout(3000)
  for (let i = 0; i < 4 && (await p.locator('dialog[open]').count()); i++) {
    await p.keyboard.press('Escape')
    await p.waitForTimeout(350)
  }
  await p.evaluate("import('/src/lib/polimento/agua.ts').then((a) => { window.__agua = a.instalarAgua() })")
  const est = (rotulo) =>
    p
      .evaluate(() => {
        const hz = window.__hz
        window.__hz = []
        return {
          tema: document.documentElement.dataset.theme,
          guardado: localStorage.getItem('app_theme'),
          cena: document.querySelectorAll('.ag-cena').length,
          mergulho: [520, 1300, 1700, 2100].every((f) => hz.includes(f)),
          sons: hz.length,
        }
      })
      .then((e) => console.log(rotulo, JSON.stringify(e)))
  await est('início, tema Babel:')
  await p.locator('.q-trilho .q-item >> text=Personalizar').first().click()
  await p.waitForTimeout(5000)
  await est('no Personalizar:')
  await p.locator('.px-tema', { hasText: 'Água' }).first().click()
  await p.waitForTimeout(2500)
  await est('provando a Água:')
  await p.screenshot({ path: path.join(__dirname, 'test-results/comparar/_agua_prova.png') })
  const equipar = p.locator('button', { hasText: /^Equipar/ }).first()
  console.log('botões Equipar:', await p.locator('button', { hasText: /^Equipar/ }).count())
  await equipar.click()
  await p.waitForTimeout(2500)
  await est('equipada:')
  await p.locator('.q-trilho .q-item >> text=Início').first().click()
  await p.waitForTimeout(2500)
  await est('de volta ao Início:')
  /* provar outro tema e sair da tela: a prova não sobrevive, a Água volta e a cena com ela */
  await p.locator('.q-trilho .q-item >> text=Personalizar').first().click()
  await p.waitForTimeout(4000)
  await p.locator('.px-tema', { hasText: 'Jardim' }).first().click()
  await p.waitForTimeout(2500)
  await est('provando o Jardim (a Água equipada):')
  await p.locator('.q-trilho .q-item >> text=Início').first().click()
  await p.waitForTimeout(2500)
  await est('saiu do Personalizar:')
  console.log('escritas barradas:', escritas.length, escritas.filter((e) => /settings/.test(e)).slice(0, 4))
  await b.close()
})()
