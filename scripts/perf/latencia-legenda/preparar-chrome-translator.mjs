#!/usr/bin/env node
/* global document, window, Translator -- código que roda DENTRO da página (page.evaluate / addInitScript) */
/**
 * Baixa os pacotes do Chrome Translator (en↔pt) num PERFIL DE TESTE do Chrome estável, para medir o
 * caminho `chrome-translator` (o 1º da cadeia de MT, `src/gateway/profiles.ts`) como ele roda para
 * quem já tem os pacotes. `Translator.create()` exige ativação do usuário: o clique é do Playwright.
 *
 *   node scripts/perf/latencia-legenda/preparar-chrome-translator.mjs <perfil> [url]
 */
import { chromium } from 'playwright'
const perfil = process.argv[2]
const url = process.argv[3] || 'http://127.0.0.1:4176/sobre'
const ctx = await chromium.launchPersistentContext(perfil, { channel: 'chrome', headless: false })
const p = ctx.pages()[0] ?? (await ctx.newPage())
await p.goto(url)
await p.evaluate(() => {
  const b = document.createElement('button')
  b.id = 'baixar-tr'
  b.textContent = 'baixar'
  b.style.cssText = 'position:fixed;top:0;left:0;z-index:99999'
  b.onclick = async () => {
    window.__tr = {}
    for (const [s, t] of [
      ['en', 'pt'],
      ['pt', 'en'],
    ]) {
      try {
        const tr = await Translator.create({
          sourceLanguage: s,
          targetLanguage: t,
          monitor(m) {
            m.addEventListener('downloadprogress', (e) => {
              window.__tr[s + t] = e.loaded
            })
          },
        })
        const t0 = performance.now()
        const out = await tr.translate(s === 'en' ? 'Hello, how are you today?' : 'Olá, tudo bem com você?')
        window.__tr[s + t] = 'ok ' + out + ' ' + Math.round(performance.now() - t0) + 'ms'
      } catch (e) {
        window.__tr[s + t] = 'erro ' + e
      }
    }
  }
  document.body.appendChild(b)
})
await p.click('#baixar-tr')
for (let i = 0; i < 120; i++) {
  const st = await p.evaluate(async () => ({
    tr: window.__tr,
    en_pt: await Translator.availability({ sourceLanguage: 'en', targetLanguage: 'pt' }),
    pt_en: await Translator.availability({ sourceLanguage: 'pt', targetLanguage: 'en' }),
  }))
  console.log(JSON.stringify(st))
  if (
    st.tr &&
    Object.values(st.tr).filter((v) => String(v).startsWith('ok') || String(v).startsWith('erro')).length === 2
  )
    break
  await p.waitForTimeout(5000)
}
await ctx.close()
