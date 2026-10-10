// Perfil de CPU (amostragem) da entrada no Jogar e do fim de rodada, num build SEM minificar: tempo
// proprio e tempo total (com os filhos) por funcao, pelo nome do codigo-fonte.
// uso: URL0=http://127.0.0.1:4311 node perfil.mjs <legivel|legivel-depois> <perfil> <trilha|gravacoes> [sufixo]
import fs from 'fs';
import { subir } from './ambiente.mjs';
import { abrir, URL0, sossegar, salvar, r1 } from './lib.mjs';
const build = process.argv[2] || 'legivel';
const nome = process.argv[3] || 'cel-medio';
const fonte = process.argv[4] || 'trilha';
const suf = process.argv[5] || '';
const guardado = JSON.parse(fs.readFileSync(new URL('./storage.json', import.meta.url), 'utf8'));
const amb = await subir(build, +new URL(URL0).port);
const s = await abrir(nome, { storage: { ...guardado, 'babel.fonte_da_pratica': JSON.stringify({ origem: fonte, escopo: 'todas' }) } });
const { page, cdp } = s;
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
const resumir = (prof) => {
  const { nodes, samples, timeDeltas } = prof;
  const porId = new Map(nodes.map((n) => [n.id, n]));
  const pai = new Map();
  for (const n of nodes) for (const c of n.children ?? []) pai.set(c, n.id);
  const proprio = new Map();
  for (let i = 0; i < samples.length; i++) proprio.set(samples[i], (proprio.get(samples[i]) ?? 0) + (timeDeltas[i] ?? 0));
  const nomeDe = (cf) => `${cf.functionName || '(anon)'} ${cf.url ? cf.url.split('/').pop().replace(/-[\w-]{8}\.js$/, '') : ''}:${cf.lineNumber}`;
  const porFn = {};
  const total = {};
  let soma = 0;
  for (const [id, us] of proprio) {
    const cf = porId.get(id).callFrame;
    if (['(idle)', '(program)', '(root)'].includes(cf.functionName)) continue;
    soma += us;
    const k = nomeDe(cf);
    porFn[k] = (porFn[k] ?? 0) + us / 1000;
    /* tempo total: soma em cada ancestral distinto da pilha */
    const vistos = new Set();
    for (let x = id; x != null; x = pai.get(x)) {
      const kk = nomeDe(porId.get(x).callFrame);
      if (vistos.has(kk)) continue;
      vistos.add(kk);
      total[kk] = (total[kk] ?? 0) + us / 1000;
    }
  }
  const topo = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [r1(v), k]);
  return { js_ms: r1(soma / 1000), proprio: topo(porFn, 40), total: topo(total, 90) };
};
const saida = {};
const perfilar = async (rot, fazer) => {
  await cdp.send('Profiler.start');
  await fazer();
  const { profile } = await cdp.send('Profiler.stop');
  const r = resumir(profile);
  saida[rot] = r;
  console.log(`\n=== ${rot}: JS ${r.js_ms} ms ===\n-- tempo proprio`);
  for (const [ms, k] of r.proprio.slice(0, 28)) console.log(String(ms).padStart(8), k);
  console.log('-- tempo total (com filhos), so codigo do app');
  for (const [ms, k] of r.total.filter(([, k]) => !/vendor-react|\(anon\) :|^\(/.test(k)).slice(0, 60)) console.log(String(ms).padStart(8), k);
};
const toca = async (sel, opc = {}) => {
  const el = page.locator(sel).first();
  if (s.P.toque) await el.tap({ timeout: 15000, ...opc });
  else await el.click({ timeout: 15000, ...opc });
};
const ABA_JOGOS = s.P.toque ? '[role="tab"]:has-text("Jogos")' : '.q-trilho .q-item[aria-label="Jogar"]';
const ABA_CARTOES = s.P.toque ? '[role="tab"]:has-text("Cartões")' : '.q-trilho .q-item[data-px-rota="hub"]';
try {
  await page.goto(URL0 + '/', { waitUntil: 'load', timeout: 90000 });
  await sossegar(s);
  if (s.P.toque) await toca('.q-trilho .q-item[data-px-rota="cartoes"]');
  await page.waitForTimeout(3500);
  await toca(ABA_JOGOS);
  await page.waitForTimeout(5000);
  await sossegar(s, 1500, 20000);
  await toca(ABA_CARTOES);
  await page.waitForTimeout(3500);
  await sossegar(s, 1500, 20000);
  await perfilar('entrar no Jogar', async () => {
    await toca(ABA_JOGOS);
    await page.waitForTimeout(3200);
  });
  await sossegar(s, 1000, 15000);
  const marcas = await page.evaluate(() => performance.getEntriesByType('measure').map((m) => [m.name, Math.round(m.duration * 10) / 10]));
  if (marcas.length) console.log('MEDIDAS', JSON.stringify(marcas));
  await toca('button.q-tile:has-text("Memória")');
  await page.waitForTimeout(2500);
  if (await page.locator('.pj-link').count()) await toca('.pj-link');
  await page.waitForTimeout(5500);
  const pares = await page.evaluate(() => {
    const m = {};
    [...document.querySelectorAll('.carta')].forEach((c, k) => (m[c.dataset.par] ??= []).push(k));
    return Object.values(m);
  });
  let k = 0;
  for (const [a, b] of pares) {
    k++;
    await toca(`.carta >> nth=${a}`);
    await page.waitForTimeout(700);
    if (k === pares.length)
      await perfilar('ultimo par (fim da rodada)', async () => {
        await toca(`.carta >> nth=${b}`);
        await page.waitForTimeout(4000);
      });
    else {
      await toca(`.carta >> nth=${b}`);
      await page.waitForTimeout(1300);
    }
  }
} catch (e) {
  console.log('ERRO', String(e).slice(0, 400));
}
salvar(`perfil-${build}${suf}-${fonte}-${nome}.json`, saida);
await s.browser.close();
amb.parar();
console.log('FIM');
process.exit(0);
