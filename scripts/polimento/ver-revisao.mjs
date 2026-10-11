/**
 * PERCORRE A REVISÃO ENXUTA NO APP e tira uma captura de cada estado, para olhar ao lado das capturas
 * do protótipo (`docs/prototipos/cartoes-enxuto-capturas/b-*.png`).
 *
 *     APP_URL=http://localhost:4340 node scripts/polimento/ver-revisao.mjs [--largura=390]
 *
 * Pede o banco de `semear-revisao.mjs`. Microfone falso do Chromium (o gravador grava de verdade).
 * Saída: `test-results/ver-revisao/<largura>/*.png` e os erros de console na tela.
 */
/* global document, localStorage, sessionStorage */
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const APP = process.env.APP_URL || 'http://localhost:4340'
const largura = Number((process.argv.find((a) => a.startsWith('--largura=')) || '').slice(10)) || 1280
const pasta = join(RAIZ, 'test-results/ver-revisao', String(largura))
mkdirSync(pasta, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const contexto = await browser.newContext({
  viewport: { width: largura, height: largura < 500 ? 844 : 900 },
  hasTouch: largura < 500,
  isMobile: largura < 500,
  permissions: ['microphone'],
})
await contexto.addInitScript(() => {
  if (sessionStorage.getItem('__semeado')) return
  sessionStorage.setItem('__semeado', '1')
  localStorage.setItem('babel.desenhoNovo', 'sim')
  localStorage.setItem('babel.liberado', '1')
})
const page = await contexto.newPage()
const erros = []
page.on('console', (m) => m.type() === 'error' && erros.push(m.text().slice(0, 300)))
page.on('pageerror', (e) => erros.push('PAGINA: ' + String(e).slice(0, 300)))

const foto = async (nome) => {
  await page.waitForTimeout(900)
  await page.screenshot({ path: join(pasta, `${nome}.png`) })
  console.log('captura', nome)
}
const fecharAvisos = async () => {
  for (let i = 0; i < 6 && (await page.locator('dialog[open]').count()); i++) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(350)
  }
}
const passo = async (nome, fn) => {
  try {
    await fn()
  } catch (e) {
    console.log(`FALHOU ${nome}: ${String(e).split('\n')[0]}`)
  }
}

await page.goto(`${APP}/cartoes/estudar?ui=pt`, { waitUntil: 'load' })
await page.waitForSelector('[data-estado="rodada"]', { timeout: 60000 })
await page.waitForTimeout(1500)
await fecharAvisos()
await foto('01-frente')
await passo('verso', async () => {
  await page.locator('.qr-principal').click()
  await page.waitForSelector('.cx-cena', { timeout: 8000 })
  await foto('02-verso-cena')
})
await passo('mais', async () => {
  await page.getByLabel('Mais ações e ajustes').click()
  await page.waitForSelector('dialog.cx-folha-acoes[open]')
  await foto('03-folha-do-mais')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
})
await passo('minha voz', async () => {
  await page.getByLabel('Minha voz: gravar e comparar').click()
  await page.waitForSelector('dialog.cx-folha-voz[open]')
  await page.waitForSelector('.cx-voz[data-fase="gravando"]', { timeout: 8000 })
  await foto('04-voz-gravando')
  await page.waitForTimeout(1500)
  await page.locator('.cx-mic').click()
  await page.waitForSelector('.cx-voz[data-fase="feito"]', { timeout: 20000 })
  await foto('05-voz-comparando')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
})
await passo('errar a difícil', async () => {
  await page.locator('.fsrs .b').click()
  await page.waitForTimeout(900)
  await page.locator('.qr-principal').click()
  await page.waitForTimeout(600)
  await page.locator('.fsrs .e').click()
  await page.waitForSelector('.cx-aviso.ct-aviso-dif', { timeout: 8000 })
  await foto('06-palavra-que-nao-entra')
  await page.locator('.cx-aviso-corpo').click()
  await page.waitForSelector('dialog.cx-folha-saidas[open]')
  await foto('07-saidas')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
})
await passo('juntar a cena', async () => {
  await page.locator('.qr-principal').click()
  await page.waitForSelector('.cx-juntar', { timeout: 8000 })
  await foto('08-verso-sem-cena-com-convite')
  await page.locator('.cx-juntar').click()
  await page.waitForSelector('.cx-cena', { timeout: 8000 })
  await foto('09-cena-juntada')
})
await passo('até o fim', async () => {
  for (let i = 0; i < 40; i++) {
    if (await page.locator('[data-estado="fim"]').count()) break
    if (await page.locator('.fsrs .b').count()) await page.locator('.fsrs .b').click()
    else if (await page.locator('.qr-principal').count()) await page.locator('.qr-principal').click()
    await page.waitForTimeout(450)
  }
  await page.waitForSelector('[data-estado="fim"]', { timeout: 8000 })
  await page.waitForTimeout(1800)
  await foto('10-fim')
})
await passo('praticar', async () => {
  await page.locator('.cx-fim-pe .q-ctl.pri').click()
  await page.waitForSelector('dialog.cx-folha-praticar[open]')
  await foto('11-folha-praticar')
  await page.locator('[data-pratica="completar"]').click()
  await page.waitForSelector('[data-estado="pratica"]', { timeout: 8000 })
  await foto('12-pratica-completar')
  await page.locator('[data-cx-campo]').fill('thorough')
  await page.keyboard.press('Enter')
  await foto('13-pratica-completar-depois')
})

console.log(erros.length ? `ERROS DE CONSOLE (${erros.length}):\n  ` + [...new Set(erros)].join('\n  ') : 'sem erro de console')
await browser.close()
