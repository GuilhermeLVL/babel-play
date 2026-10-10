// A barra de baixo da captura GRAVANDO no celular estreito (360, 375, 390 e 412 px): o que cabe, o que
// e cortado, no app e no prototipo `telas-enxutas.html?telas=enxuta&ir=gravando&limpo`.
// uso: URL0=http://127.0.0.1:4315 node gravando.mjs <antes|depois|prototipo>
import fs from 'fs';
import { createRequire } from 'module';
import { subir } from './ambiente.mjs';
import { esperarVez } from './lib.mjs';
const require = createRequire('C:/Users/Guilh/dev/ei-polimento/node_modules/');
const { chromium } = require('playwright');
const alvo = process.argv[2] || 'antes';
const PROTO = 'file:///C:/Users/Guilh/OneDrive/%C3%81rea%20de%20Trabalho/babel-play-lab/docs/prototipos/telas-enxutas.html?telas=enxuta&ir=gravando&limpo';
const guardado = JSON.parse(fs.readFileSync(new URL('./storage.json', import.meta.url), 'utf8'));
const amb = alvo === 'prototipo' ? null : await subir(alvo, +new URL(process.env.URL0).port);
await esperarVez();
const browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const medirBarra = (sel) => {
  const vw = document.documentElement.clientWidth;
  const barra = document.querySelector(sel);
  if (!barra) return { erro: 'sem barra ' + sel };
  const rb = barra.getBoundingClientRect();
  const itens = [...barra.querySelectorAll('button, a, [role="button"]')].map((b) => {
    const r = b.getBoundingClientRect();
    const st = getComputedStyle(b);
    const txt = (b.getAttribute('aria-label') || b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 26);
    const visivel = st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    return { txt, texto: b.textContent.trim().slice(0, 14), x: Math.round(r.left), dir: Math.round(r.right), larg: Math.round(r.width), visivel, cortado: visivel && (r.right > Math.min(vw, rb.right) + 0.5 || r.left < Math.max(0, rb.left) - 0.5), rolagemInterna: b.scrollWidth > b.clientWidth + 1 };
  });
  return { vw, barra: { x: Math.round(rb.left), dir: Math.round(rb.right), larg: Math.round(rb.width), rola: barra.scrollWidth > barra.clientWidth + 1, scrollWidth: barra.scrollWidth, clientWidth: barra.clientWidth, overflowX: getComputedStyle(barra).overflowX }, itens };
};
for (const [w, h] of [[360, 780], [375, 812], [390, 844], [412, 915]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: alvo === 'prototipo' ? [] : ['microphone'], locale: 'pt-BR', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36' });
  if (alvo !== 'prototipo') await ctx.addInitScript((s) => { try { for (const k in s) localStorage.setItem(k, s[k]); } catch {} }, guardado);
  const page = await ctx.newPage();
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort());
  try {
    if (alvo === 'prototipo') {
      await page.goto(PROTO, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3500);
      const sel = await page.evaluate(() => {
        const c = [...document.querySelectorAll('.q-faixa, [role="toolbar"]')].filter((e) => e.offsetParent);
        return c.map((e) => e.className + '|' + (e.getAttribute('aria-label') || ''));
      });
      console.log(w, 'faixas no prototipo:', JSON.stringify(sel));
      console.log(w, 'PROTOTIPO', JSON.stringify(await page.evaluate(medirBarra, '.q-faixa')));
    } else {
      await page.goto(process.env.URL0 + '/capturar', { waitUntil: 'load', timeout: 90000 });
      const iniciar = page.getByTestId('iniciar-captura');
      await iniciar.waitFor({ state: 'visible', timeout: 60000 });
      await page.waitForTimeout(2500);
      await iniciar.tap();
      for (let k = 0; k < 8; k++) {
        if (await page.getByTestId('encerrar-captura').isVisible().catch(() => false)) break;
        const opc = page.locator('dialog[open] button, .q-mais-fundo button').filter({ hasText: /Baixar e iniciar|No aparelho|Neste aparelho|Continuar|Iniciar/ }).first();
        if (await opc.isVisible().catch(() => false)) await opc.tap().catch(() => {});
        await page.waitForTimeout(1500);
      }
      await page.getByTestId('encerrar-captura').waitFor({ state: 'visible', timeout: 20000 });
      await page.evaluate(() => window.__simFalas(['Hello there, how are you doing today?', 'I was thinking about going to the beach.']));
      await page.waitForTimeout(2500);
      console.log(w, alvo.toUpperCase(), JSON.stringify(await page.evaluate(medirBarra, '[role="toolbar"][aria-label="Controles da captura"]')));
    }
    await page.screenshot({ path: `gravando-${alvo}-${w}.png` });
  } catch (e) {
    console.log(w, 'ERRO', String(e).slice(0, 300));
    await page.screenshot({ path: `gravando-${alvo}-${w}-erro.png` }).catch(() => {});
  }
  await ctx.close();
}
await browser.close();
amb?.parar();
process.exit(0);
