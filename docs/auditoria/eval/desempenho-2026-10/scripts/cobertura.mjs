// Cobertura de JS e CSS no arranque (Inicio, celular): quanto do que desce e usado ate a tela assentar.
import { abrir, URL0, sossegar, salvar, r1 } from './lib.mjs';
const s = await abrir(process.argv[2] || 'cel-medio', { cpu: 1 });
const { page, cdp } = s;
await cdp.send('Profiler.enable');
await cdp.send('Profiler.startPreciseCoverage', { callCount: false, detailed: true });
await cdp.send('DOM.enable');
await cdp.send('CSS.enable');
const folhas = new Map();
cdp.on('CSS.styleSheetAdded', (e) => folhas.set(e.header.styleSheetId, e.header));
await cdp.send('CSS.startRuleUsageTracking');
await page.goto(URL0 + '/', { waitUntil: 'load', timeout: 90000 });
await sossegar(s, 2500);
await page.waitForTimeout(3000);
const js = (await cdp.send('Profiler.takePreciseCoverage')).result.filter((r) => r.url.includes('/assets/'));
const porJs = js.map((r) => {
  const total = Math.max(0, ...r.functions.flatMap((f) => f.ranges.map((x) => x.endOffset)));
  /* intervalos usados: o intervalo externo conta, os internos com count 0 descontam */
  const marc = new Uint8Array(total + 1);
  const ranges = r.functions.flatMap((f) => f.ranges).sort((a, b) => b.endOffset - b.startOffset - (a.endOffset - a.startOffset));
  for (const x of ranges) marc.fill(x.count > 0 ? 1 : 0, x.startOffset, x.endOffset);
  let usado = 0;
  for (let i = 0; i < total; i++) usado += marc[i];
  return { arq: r.url.split('/').pop(), total, usado };
});
const css = (await cdp.send('CSS.stopRuleUsageTracking')).ruleUsage;
const porCss = {};
for (const u of css) {
  const h = folhas.get(u.styleSheetId);
  const arq = h?.sourceURL ? h.sourceURL.split('/').pop() : '(inline)';
  const o = (porCss[arq] ??= { total: h?.length ?? 0, usado: 0, regras: 0, regrasUsadas: 0 });
  o.regras++;
  if (u.used) {
    o.regrasUsadas++;
    o.usado += u.endOffset - u.startOffset;
  }
}
const tj = porJs.reduce((a, x) => a + x.total, 0);
const uj = porJs.reduce((a, x) => a + x.usado, 0);
console.log(`JS no arranque: ${porJs.length} arquivos, ${r1(tj / 1024)} kB, executado ${r1(uj / 1024)} kB (${r1((uj / tj) * 100)}%)`);
for (const x of porJs.sort((a, b) => b.total - a.total).slice(0, 12)) console.log(`   ${x.arq.padEnd(40)} ${r1(x.total / 1024)} kB, usado ${r1((x.usado / x.total) * 100)}% (sobra ${r1((x.total - x.usado) / 1024)} kB)`);
let tc = 0;
let uc = 0;
for (const [arq, o] of Object.entries(porCss).sort((a, b) => b[1].total - a[1].total)) {
  tc += o.total;
  uc += o.usado;
  console.log(`CSS ${arq.padEnd(34)} ${r1(o.total / 1024)} kB, regras ${o.regrasUsadas}/${o.regras} usadas, bytes de regra usados ${r1(o.usado / 1024)} kB (${r1((o.usado / (o.total || 1)) * 100)}%)`);
}
console.log(`CSS no arranque: ${r1(tc / 1024)} kB, usado ${r1(uc / 1024)} kB (${r1((uc / tc) * 100)}%)`);
salvar(`cobertura-${s.nome}.json`, { js: porJs, css: porCss, totalJs: tj, usadoJs: uj, totalCss: tc, usadoCss: uc });
await s.browser.close();
console.log('FIM');
