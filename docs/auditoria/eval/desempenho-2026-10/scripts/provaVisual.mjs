// PROVA DE APARENCIA, ANTES x DEPOIS: as mesmas telas nos dois builds de producao, com as animacoes
// congeladas no MESMO instante, comparadas pixel a pixel, mais caixas e estilos computados (as mesmas
// propriedades de scripts/polimento/comparar.mjs).
// uso: node provaVisual.mjs <urlAntes> <urlDepois> [filtro]
// saida: prova/<cena>-<antes|depois>.png, prova/<cena>-lado.png (lado a lado + diferenca) e prova/resultado.json
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/Guilh/dev/ei-polimento/node_modules/');
const { chromium } = require('playwright');
const [, , ANTES, DEPOIS, filtro] = process.argv;
fs.mkdirSync('prova', { recursive: true });

const PROPS = ['display', 'position', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'backgroundColor', 'backgroundImage', 'borderTopWidth', 'borderTopColor', 'borderTopLeftRadius', 'boxShadow', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'gap', 'opacity', 'transform', 'backdropFilter', 'transitionDuration', 'transitionTimingFunction', 'animationName', 'animationDuration'];
const SELETORES = ['.q-trilho', '.q-trilho .q-item', '.q-trilho .px-pilula', '.q-contagem', '.q-mais-botao', '.px-aura', '.px-tela', '.q-cab h1', '.q-cab .q-sobre', '.q-grade', '.q-tile', '.q-tile.pri', '.q-tile.pri .q-ic', '.q-tile b', '.q-tile .q-d', '.q-tile .px-mini', '.px-mini .mm-l', '.px-mini .mm-chip', '.px-mini .mm-carta', '.q-barra', '.q-abas', '.q-abas .px-pilula', '.q-aba', '.q-mais', '.q-mais-fundo', '.q-mais .q-tile', '.q-linha', '.q-ctl', '.carta', '.hud', '.palco-jogo', '.px-luz', '.q-secao h2', '.q-chip'];

const UA_CEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';
const TELAS = {
  1280: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: UA_CEL },
};
const item = (r) => `.q-trilho .q-item[data-px-rota="${r}"]`;
const tocar = async (page, toque, sel) => {
  const el = page.locator(sel).first();
  await el.waitFor({ state: 'visible', timeout: 15000 });
  if (toque) await el.tap();
  else await el.click();
};
/** As cenas: o que fazer depois de o Inicio assentar, e em que instantes (ms) congelar as animacoes. */
const CENAS = [
  { nome: 'inicio', instantes: [187, 667, 1103] },
  { nome: 'mais', instantes: [667], fazer: async (p, t) => { await tocar(p, t, '.q-trilho .q-mais-botao'); await p.waitForTimeout(2500); } },
  { nome: 'capturar', instantes: [667], fazer: async (p, t) => { await tocar(p, t, item('capture')); await p.waitForTimeout(4500); } },
  { nome: 'jogar', storage: { 'babel.fonte_da_pratica': '{"origem":"trilha","escopo":"todas"}' }, instantes: [413, 1507, 2903], fazer: async (p, t) => { await tocar(p, t, t ? '.q-trilho .q-item[data-px-tambem="play"], ' + item('play') : item('play')); await p.waitForTimeout(6000); } },
  { nome: 'memoria', so: 1280, storage: { 'babel.fonte_da_pratica': '{"origem":"trilha","escopo":"todas"}', 'babel.pratica.ultima': 'play' }, instantes: [667], fazer: async (p, t) => { await tocar(p, t, t ? '.q-trilho .q-item[data-px-tambem="play"], ' + item('play') : item('play')); await p.waitForTimeout(5000); await tocar(p, t, 'button.q-tile:has-text("Memória")'); await p.waitForTimeout(4500); } },
  /* so no computador: o mouse parado sobre um cartao (luz, brilho, inclinacao 3D, aura) */
  { nome: 'inicio-mouse', so: 1280, instantes: [667], fazer: async (p) => { const c = await p.locator('.px-tela button.q-tile').nth(1).boundingBox(); await p.mouse.move(c.x + c.width * 0.72, c.y + c.height * 0.3, { steps: 12 }); await p.waitForTimeout(3500); } },
  /* so no celular: o aparelho inclinado e parado (giroscopio): cartoes inclinados, luz, aura */
  { nome: 'inicio-giro', so: 390, instantes: [667], fazer: async (p) => { await p.evaluate(async () => { const ev = (b, g) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: b, gamma: g })); ev(45, 0); for (let i = 0; i < 240; i++) { ev(51, 7); await new Promise((r) => setTimeout(r, 16)); } }); await p.waitForTimeout(2500); } },
  { nome: 'jogar-giro', so: 390, storage: { 'babel.fonte_da_pratica': '{"origem":"trilha","escopo":"todas"}' }, instantes: [1507], fazer: async (p, t) => { await tocar(p, t, '.q-trilho .q-item[data-px-tambem="play"], ' + item('play')); await p.waitForTimeout(6000); await p.evaluate(async () => { const ev = (b, g) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: b, gamma: g })); ev(45, 0); for (let i = 0; i < 240; i++) { ev(40, -6); await new Promise((r) => setTimeout(r, 16)); } }); await p.waitForTimeout(2500); } },
];

/** Congela toda animacao no instante `t` (as infinitas no mesmo ponto do ciclo; as finitas, acabadas). */
const congelar = (t) => {
  for (const a of document.getAnimations()) {
    const tm = a.effect?.getComputedTiming?.() ?? {};
    try {
      if (tm.iterations === Infinity) { a.pause(); a.currentTime = t; }
      else a.finish();
    } catch {}
  }
};
const medir = ({ seletores, props }) => {
  const fora = {};
  for (const sel of seletores) {
    const lista = [...document.querySelectorAll(sel)];
    fora[sel] = lista.slice(0, 40).map((el) => {
      const c = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { caixa: [Math.round(c.left), Math.round(c.top), Math.round(c.width), Math.round(c.height)], estilo: Object.fromEntries(props.map((p) => [p, String(cs[p])])) };
    });
    fora[sel].quantos = lista.length;
  }
  return fora;
};

async function lado(browser, url, cena, largura, escuro) {
  const T = TELAS[largura];
  const ctx = await browser.newContext({ ...T, locale: 'pt-BR', reducedMotion: 'no-preference' });
  await ctx.addInitScript(({ s, escuro }) => {
    try {
      localStorage.setItem('theme', escuro ? 'dark' : 'light');
      for (const k in s) localStorage.setItem(k, s[k]);
    } catch {}
  }, { s: cena.storage ?? {}, escuro });
  /* as particulas sao sorteadas: fora da comparacao nos dois lados (o conserto nao toca nelas) */
  await ctx.addInitScript(() => {
    const por = () => { const st = document.createElement('style'); st.textContent = 'canvas{visibility:hidden!important}'; document.head.append(st); };
    if (document.head) por(); else document.addEventListener('DOMContentLoaded', por);
  });
  const page = await ctx.newPage();
  await page.goto(url + '/?ui=pt', { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('.q-trilho', { timeout: 30000 });
  await page.waitForTimeout(9000); /* entradas, contadores e (no depois) a pre-carga em ocioso */
  if (cena.fazer) await cena.fazer(page, !!T.hasTouch);
  const fotos = [];
  let medidas = null;
  for (const t of cena.instantes) {
    await page.evaluate(congelar, t);
    /* Com o laco parado (o depois), ninguem pede quadro: a animacao composta que acabou de pausar ficaria na
       tela com o quadro de antes. Dois quadros pedidos aqui poem na tela o instante congelado, nos dois lados. */
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.waitForTimeout(900);
    /* de novo, ja com a pausa assentada: o salto de instante numa animacao pausada obriga o quadro novo */
    await page.evaluate((t) => { for (const a of document.getAnimations()) if (a.playState === 'paused') { try { a.currentTime = t + 1; } catch {} } }, t);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.evaluate((t) => { for (const a of document.getAnimations()) if (a.playState === 'paused') { try { a.currentTime = t; } catch {} } }, t);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.waitForTimeout(500);
    if (!medidas) medidas = await page.evaluate(medir, { seletores: SELETORES, props: PROPS });
    /* A pagina parada nao desenha quadro novo sozinha, e a captura pegaria o ultimo desenhado (com a animacao
       ainda andando no compositor): a tela inteira e invalidada e uma captura de descarte vem antes da que vale. */
    await page.evaluate(() => new Promise((r) => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;background:rgba(0,0,0,0.004)'; document.documentElement.append(d); requestAnimationFrame(() => requestAnimationFrame(() => { d.remove(); requestAnimationFrame(() => requestAnimationFrame(() => r())); })); }));
    await page.screenshot();
    await page.waitForTimeout(200);
    fotos.push(await page.screenshot());
  }
  const extra = await page.evaluate(() => ({
    px: document.documentElement.dataset.px,
    aura: document.querySelector('.px-aura')?.style.transform ?? null,
    inclinados: [...document.querySelectorAll('button.q-tile, .carta')].map((e) => e.style.transform).filter(Boolean).slice(0, 16),
    luzes: [...document.querySelectorAll('.px-luz')].map((l) => [l.className, l.style.getPropertyValue('--mx'), l.style.getPropertyValue('--my')]),
    folhas: document.styleSheets.length,
    nos: document.querySelectorAll('*').length,
  }));
  await ctx.close();
  return { fotos, medidas, extra };
}

/** Diferenca pixel a pixel, feita num canvas do proprio navegador; devolve tambem a imagem lado a lado. */
async function comparar(pagina, a, b) {
  return pagina.evaluate(async ({ a, b }) => {
    const carregar = (b64) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b64; });
    const [ia, ib] = await Promise.all([carregar(a), carregar(b)]);
    const w = ia.width, h = ia.height;
    const c = new OffscreenCanvas(w * 3, h);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(ia, 0, 0); g.drawImage(ib, w, 0);
    const da = g.getImageData(0, 0, w, h).data, db = g.getImageData(w, 0, w, h).data;
    const dif = g.createImageData(w, h);
    let n = 0, maior = 0, acima8 = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (d) { n++; if (d > maior) maior = d; if (d > 8) acima8++; }
      const v = d ? 255 : Math.round((da[i] + da[i + 1] + da[i + 2]) / 3 / 4 + 190);
      dif.data[i] = d ? 255 : v; dif.data[i + 1] = d ? Math.max(0, 200 - d * 12) : v; dif.data[i + 2] = d ? 0 : v; dif.data[i + 3] = 255;
    }
    g.putImageData(dif, w * 2, 0);
    const blob = await c.convertToBlob({ type: 'image/png' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { pixels: w * h, diferentes: n, maiorDiferenca: maior, acimaDe8: acima8, mesmaMedida: ia.width === ib.width && ia.height === ib.height, lado: btoa(s) };
  }, { a: a.toString('base64'), b: b.toString('base64') });
}

const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const bancada = await (await browser.newContext()).newPage();
const resultado = [];
for (const cena of CENAS) {
  if (filtro && !cena.nome.includes(filtro)) continue;
  for (const largura of [1280, 390]) {
    if (cena.so && cena.so !== largura) continue;
    for (const escuro of [false, true]) {
      const rot = `${cena.nome}-${largura}-${escuro ? 'escuro' : 'claro'}`;
      try {
        const antes = await lado(browser, ANTES, cena, largura, escuro);
        const depois = await lado(browser, DEPOIS, cena, largura, escuro);
        const difs = [];
        for (const sel of SELETORES) {
          const A = antes.medidas[sel], D = depois.medidas[sel];
          if (A.length !== D.length) { difs.push(`${sel}: quantidade ${A.length} x ${D.length}`); continue; }
          A.forEach((x, i) => {
            const y = D[i];
            if (x.caixa.some((v, k) => Math.abs(v - y.caixa[k]) > 1)) difs.push(`${sel}[${i}]: caixa ${x.caixa} x ${y.caixa}`);
            for (const p of PROPS) if (x.estilo[p] !== y.estilo[p]) difs.push(`${sel}[${i}]: ${p} "${x.estilo[p].slice(0, 90)}" x "${y.estilo[p].slice(0, 90)}"`);
          });
        }
        const fotos = [];
        for (let i = 0; i < cena.instantes.length; i++) {
          const c = await comparar(bancada, antes.fotos[i], depois.fotos[i]);
          const nome = `${rot}-t${cena.instantes[i]}`;
          fs.writeFileSync(`prova/${nome}-lado.png`, Buffer.from(c.lado, 'base64'));
          delete c.lado;
          fotos.push({ instante: cena.instantes[i], ...c });
        }
        const r = { cena: rot, pecas: SELETORES.reduce((n, s) => n + antes.medidas[s].length, 0), difsDeEstilo: difs, fotos, antes: antes.extra, depois: depois.extra };
        resultado.push(r);
        console.log(`${rot}: ${r.pecas} pecas, ${difs.length} diferencas de caixa/estilo; fotos: ${fotos.map((f) => `t${f.instante}=${f.diferentes}px (max ${f.maiorDiferenca}, >8: ${f.acimaDe8})`).join(' ')}`);
        for (const d of difs.slice(0, 12)) console.log('   - ' + d);
        if (JSON.stringify(antes.extra.inclinados) !== JSON.stringify(depois.extra.inclinados)) console.log('   inclinados', JSON.stringify(antes.extra.inclinados.slice(0, 2)), 'x', JSON.stringify(depois.extra.inclinados.slice(0, 2)));
        console.log('   aura', antes.extra.aura, 'x', depois.extra.aura, '| folhas', antes.extra.folhas, 'x', depois.extra.folhas);
      } catch (e) {
        console.log(rot, 'ERRO', String(e).slice(0, 300));
        resultado.push({ cena: rot, erro: String(e).slice(0, 300) });
      }
    }
  }
}
fs.writeFileSync('prova/resultado.json', JSON.stringify(resultado, null, 1));
await browser.close();
console.log('FIM');
