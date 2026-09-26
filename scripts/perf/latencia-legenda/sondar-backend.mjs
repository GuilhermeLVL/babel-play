/* global navigator, self, Translator, LanguageDetector -- código que roda DENTRO da página (page.evaluate / addInitScript) */
// Diagnóstico: WebGPU (adaptador), Translator e LanguageDetector em cada modo de navegador (headless/headful, Chromium/Chrome).
// Uso: node scripts/perf/latencia-legenda/sondar-backend.mjs (servidor estático na 4176).
import { chromium } from 'playwright'
for (const [nome, opts] of [
  ['headless', { headless: true }],
  ['headful', { headless: false }],
  ['chrome-headful', { headless: false, channel: 'chrome' }],
  ['chrome-headless', { headless: true, channel: 'chrome' }],
]) {
  try {
    const b = await chromium.launch({
      ...opts,
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    })
    const p = await b.newPage()
    await p.goto('http://127.0.0.1:4176/sobre')
    const r = await p.evaluate(async () => {
      const out = { ua: navigator.userAgent.slice(0, 90), gpu: !!navigator.gpu, cores: navigator.hardwareConcurrency }
      try {
        const a = await navigator.gpu?.requestAdapter()
        out.adapter = !!a
        out.info = a ? (a.info ? `${a.info.vendor} ${a.info.architecture} ${a.info.description}` : 'sem info') : null
      } catch (e) {
        out.adapterErr = String(e)
      }
      try {
        out.tr =
          'Translator' in self
            ? {
                enpt: await Translator.availability({ sourceLanguage: 'en', targetLanguage: 'pt' }),
                pten: await Translator.availability({ sourceLanguage: 'pt', targetLanguage: 'en' }),
              }
            : null
      } catch (e) {
        out.trErr = String(e)
      }
      try {
        out.ld = 'LanguageDetector' in self ? await LanguageDetector.availability() : null
      } catch (e) {
        out.ldErr = String(e)
      }
      return out
    })
    console.log(nome, JSON.stringify(r))
    await b.close()
  } catch (e) {
    console.log(nome, 'FALHOU', String(e).slice(0, 200))
  }
}
