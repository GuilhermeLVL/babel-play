/* global navigator, caches, localStorage -- código que roda DENTRO da página (page.evaluate / addInitScript) */
// Diagnóstico: o que o perfil do navegador guardou no Cache Storage (pesos do transformers.js).
// Uso: node scripts/perf/latencia-legenda/verificar-cache.mjs <perfil>
import { chromium } from 'playwright'
const ctx = await chromium.launchPersistentContext(process.argv[2], { headless: true })
const p = ctx.pages()[0] ?? (await ctx.newPage())
await p.goto('http://127.0.0.1:4176/sobre')
console.log(
  JSON.stringify(
    await p.evaluate(async () => {
      const out = {
        est: await navigator.storage.estimate(),
        persisted: await navigator.storage.persisted?.(),
        caches: {},
      }
      for (const k of await caches.keys()) {
        const c = await caches.open(k)
        const ks = await c.keys()
        out.caches[k] =
          ks.length +
          ' itens: ' +
          ks
            .slice(0, 4)
            .map((r) => r.url.slice(-80))
            .join(' | ')
      }
      out.manifesto = Object.keys(localStorage)
        .filter((k) => /manif|modelo/i.test(k))
        .map((k) => k + '=' + localStorage.getItem(k).slice(0, 200))
      return out
    }),
    null,
    1,
  ),
)
await ctx.close()
