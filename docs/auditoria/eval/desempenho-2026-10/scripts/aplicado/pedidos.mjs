// Pedidos a /api e bytes: ao abrir o app, ao abrir Cartoes (Praticar) e ao abrir Palavras (Vocabulario).
// Conta cada pedido pelo CDP (URL, estado, bytes no fio, bytes do corpo) e o instante desde a navegacao.
// uso: URL0=http://127.0.0.1:4314 node pedidos.mjs <antes|depois> <perfil> <N> [sufixo]
import fs from 'fs';
import { subir } from './ambiente.mjs';
import { abrir, URL0, sossegar, salvar, mediana } from './lib.mjs';
const build = process.argv[2] || 'antes';
const nome = process.argv[3] || 'cel-medio';
const N = +(process.argv[4] || 1);
const suf = process.argv[5] || '';
const guardado = JSON.parse(fs.readFileSync(new URL('./storage.json', import.meta.url), 'utf8'));
const amb = await subir(build, +new URL(URL0).port);
const runs = [];
for (let i = 0; i < N; i++) {
  const s = await abrir(nome, { storage: guardado });
  const { page, cdp } = s;
  const vivos = new Map();
  let lista = [];
  let t0 = Date.now();
  cdp.on('Network.requestWillBeSent', (e) => {
    if (!e.request.url.includes('/api/')) return;
    vivos.set(e.requestId, { m: e.request.method, url: e.request.url.replace(URL0, '').replace(/\?.*/, (q) => (q.length > 40 ? '?…' : q)), t: Date.now() - t0, inm: !!(e.request.headers['If-None-Match'] || e.request.headers['if-none-match']) });
  });
  cdp.on('Network.responseReceived', (e) => {
    const r = vivos.get(e.requestId);
    if (r) {
      r.status = e.response.status;
      r.etag = !!(e.response.headers.etag || e.response.headers.ETag);
      r.cc = e.response.headers['cache-control'] || e.response.headers['Cache-Control'] || '';
      r.doCache = !!e.response.fromDiskCache;
    }
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = vivos.get(e.requestId);
    if (r) {
      r.fio = e.encodedDataLength;
      lista.push(r);
    }
  });
  cdp.on('Network.loadingFailed', (e) => {
    const r = vivos.get(e.requestId);
    if (r) {
      r.falhou = e.errorText + (e.canceled ? ' (cancelado)' : '');
      lista.push(r);
    }
  });
  const fechar = (rot) => {
    const l = lista;
    lista = [];
    const por = {};
    for (const r of l) por[r.m + ' ' + r.url] = (por[r.m + ' ' + r.url] ?? 0) + 1;
    const res = { rotulo: rot, pedidos: l.length, bytes: l.reduce((a, r) => a + (r.fio || 0), 0), repetidos: Object.entries(por).filter(([, n]) => n > 1).map(([k, n]) => `${k} ×${n}`), n304: l.filter((r) => r.status === 304).length, cancelados: l.filter((r) => r.falhou).length, lista: l.map((r) => `${String(r.t).padStart(6)} ${r.m} ${r.url} ${r.status ?? r.falhou}${r.doCache ? ' (cache do navegador)' : ''} ${r.fio ?? 0}B${r.inm ? ' inm' : ''}${r.etag ? ' etag' : ''}${r.cc ? ' cc=' + r.cc : ''}`) };
    console.log(`${build} ${nome} r${i} ${rot}: ${res.pedidos} pedidos, ${res.bytes} B, 304: ${res.n304}, cancelados: ${res.cancelados}, repetidos: ${res.repetidos.join('; ') || 'nenhum'}`);
    if (i === 0) for (const x of res.lista) console.log('   ' + x);
    return res;
  };
  const toca = async (sel) => {
    const el = page.locator(sel).first();
    if (s.P.toque) await el.tap({ timeout: 15000 });
    else await el.click({ timeout: 15000 });
  };
  const passos = [];
  try {
    t0 = Date.now();
    await page.goto(URL0 + '/', { waitUntil: 'load', timeout: 90000 });
    await sossegar(s, 3000, 45000);
    passos.push(fechar('abrir o app'));
    t0 = Date.now();
    await toca(s.P.toque ? '.q-trilho .q-item[data-px-rota="cartoes"]' : '.q-trilho .q-item[data-px-rota="cartoes"], .q-trilho .q-item[aria-label="Praticar"]');
    await page.waitForTimeout(3000);
    await sossegar(s, 2500, 30000);
    passos.push(fechar('abrir Cartoes (Praticar)'));
    /* Palavras: a tela do vocabulario, pelo endereco (a navegacao do app, sem recarregar a pagina) */
    t0 = Date.now();
    await page.evaluate(() => {
      history.pushState({}, '', '/vocabulario');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForTimeout(3500);
    await sossegar(s, 2500, 30000);
    if (i === 0) {
      console.log('   URL', page.url(), '| h1:', await page.evaluate(() => document.querySelector('.px-tela h1, h1')?.textContent));
      await page.screenshot({ path: `palavras-${build}-${nome}.png` });
    }
    passos.push(fechar('abrir Palavras (Vocabulario)'));
    /* volta ao Inicio e abre Palavras de novo: o que a segunda visita pede */
    t0 = Date.now();
    await page.evaluate(() => {
      history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForTimeout(2500);
    await sossegar(s, 2000, 20000);
    fechar('(volta ao Inicio)');
    t0 = Date.now();
    await page.evaluate(() => {
      history.pushState({}, '', '/vocabulario');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForTimeout(3500);
    await sossegar(s, 2500, 30000);
    passos.push(fechar('abrir Palavras de novo'));
  } catch (e) {
    console.log('ERRO', String(e).slice(0, 300));
  }
  runs.push(passos);
  await s.browser.close();
}
amb.parar();
const rotulos = [...new Set(runs.flatMap((r) => r.map((p) => p.rotulo)))];
const med = {};
for (const rot of rotulos) {
  const xs = runs.map((r) => r.find((p) => p.rotulo === rot)).filter(Boolean);
  med[rot] = { n: xs.length, pedidos: mediana(xs.map((x) => x.pedidos)), bytes: mediana(xs.map((x) => x.bytes)), n304: mediana(xs.map((x) => x.n304)), repetidos: xs[0].repetidos };
  console.log('MEDIANA', build, nome, rot, JSON.stringify(med[rot]));
}
salvar(`pedidos-${build}${suf}-${nome}.json`, { mediana: med, runs });
console.log('FIM');
process.exit(0);
