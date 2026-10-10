import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/Guilh/dev/ei-polimento/node_modules/');
const { chromium } = require('playwright');
export const URL0 = process.env.URL0 || 'https://babel-play.pages.dev';
const UA_CEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';
const UA_QUEST = 'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/40.0.0.0 Chrome/151.0.0.0 VR Safari/537.36';
export const PERFIS = {
  'cel-medio': { viewport: { width: 390, height: 844 }, dsf: 3, toque: true, ua: UA_CEL, cpu: 4, rede: '4g' },
  'cel-fraco': { viewport: { width: 390, height: 844 }, dsf: 3, toque: true, ua: UA_CEL, cpu: 6, rede: '4g' },
  desktop: { viewport: { width: 1440, height: 900 }, dsf: 1, toque: false, cpu: 1, rede: null },
  quest: { viewport: { width: 1280, height: 720 }, dsf: 1, toque: false, ua: UA_QUEST, cpu: 4, rede: null },
};
const REDES = { '4g': { offline: false, latency: 165, downloadThroughput: 1012500, uploadThroughput: 168750 } };
export const mediana = (a) => {
  const s = a.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
export const r0 = (x) => (x == null ? null : Math.round(x));

const INSTR = () => {
  const p = (window.__p = { lt: [], ev: [], cls: [], lcp: [], paint: [], frames: [], marcos: {}, grav: false });
  const ob = (type, f, extra = {}) => {
    try {
      new PerformanceObserver((l) => l.getEntries().forEach(f)).observe({ type, buffered: true, ...extra });
    } catch {}
  };
  ob('longtask', (e) => p.lt.push({ s: e.startTime, d: e.duration }));
  ob(
    'event',
    (e) => p.ev.push({ n: e.name, s: e.startTime, d: e.duration, ps: e.processingStart, pe: e.processingEnd, id: e.interactionId }),
    { durationThreshold: 16 },
  );
  ob('layout-shift', (e) => p.cls.push({ v: e.value, s: e.startTime, rec: e.hadRecentInput }));
  ob('largest-contentful-paint', (e) =>
    p.lcp.push({ s: e.startTime, size: e.size, el: e.element ? e.element.tagName + '.' + String(e.element.className).slice(0, 40) : null, url: e.url }),
  );
  ob('paint', (e) => p.paint.push({ n: e.name, s: e.startTime }));
  const SEL = { trilho: '.q-trilho', tela: '.px-tela > *', palco: '.px-tela .q-palco, .px-tela .tela', h1: '.px-tela h1' };
  const olha = () => {
    for (const k in SEL) if (!(k in p.marcos) && document.querySelector(SEL[k])) p.marcos[k] = performance.now();
  };
  new MutationObserver(olha).observe(document, { childList: true, subtree: true });
  let ult = 0;
  const laco = (t) => {
    if (!p.grav) return;
    if (ult) p.frames.push(t - ult);
    ult = t;
    requestAnimationFrame(laco);
  };
  p.iniciarQuadros = () => {
    p.frames = [];
    ult = 0;
    p.grav = true;
    requestAnimationFrame(laco);
  };
  p.pararQuadros = () => {
    p.grav = false;
    return p.frames.slice();
  };
};

export async function abrir(nome, { reduz = false, desempenho = false, gpu = true, storage = null, cpu = undefined, semInstr = false, exp = [], giro = false, fonteTrilha = false, semOcioso = false } = {}) {
  const P = PERFIS[nome];
  if (fonteTrilha) storage = { ...(storage ?? {}), 'babel.fonte_da_pratica': '{"origem":"trilha","escopo":"todas"}' };
  const args = gpu ? ['--enable-gpu', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] : [];
  const browser = await chromium.launch({ headless: true, args });
  const ctx = await browser.newContext({
    viewport: P.viewport,
    deviceScaleFactor: P.dsf,
    hasTouch: P.toque,
    isMobile: P.toque,
    userAgent: P.ua,
    reducedMotion: reduz ? 'reduce' : 'no-preference',
    locale: 'pt-BR',
  });
  if (!semInstr) await ctx.addInitScript(INSTR);
  if (desempenho)
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('babel.performance_mode', 'true');
      } catch {}
    });
  if (storage)
    await ctx.addInitScript((s) => {
      try {
        for (const k in s) localStorage.setItem(k, s[k]);
      } catch {}
    }, storage);
  /* So o pedido no toque: o ocioso nunca chega (quem toca logo depois da carga). */
  if (semOcioso)
    await ctx.addInitScript(() => {
      window.requestIdleCallback = () => 0;
    });
  const aplicadas = [];
  /* O celular na mao: o sensor de orientacao entrega leituras (aqui 60/s, com um tremor pequeno). */
  if (giro)
    await ctx.addInitScript(() => {
      window.addEventListener('load', () => {
        let t = 0;
        setInterval(() => {
          t += 0.016;
          const beta = 45 + Math.sin(t * 1.3) * 1.5 + (Math.random() - 0.5) * 0.3;
          const gamma = Math.sin(t * 0.9) * 2 + (Math.random() - 0.5) * 0.3;
          window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta, gamma, absolute: false }));
        }, 16);
      });
    });
  if (exp.includes('sem-pulso'))
    await ctx.addInitScript(() => {
      const por = () => {
        const st = document.createElement('style');
        st.textContent = "html[data-px='on'] .q-contagem{animation:none!important}";
        document.head.append(st);
      };
      if (document.head) por();
      else document.addEventListener('DOMContentLoaded', por);
    });
  if (exp.some((x) => ['aura-para', 'giro-lote', 'giro-barato', 'aura-cache'].includes(x)))
    await ctx.route('**/assets/sentidos-*.js', async (route) => {
      const resp = await route.fetch();
      let js = await resp.text();
      if (exp.includes('giro-lote')) {
        const velho = fs.readFileSync('giro-velho.txt', 'utf8').trim();
        const novo = fs.readFileSync('giro-novo.txt', 'utf8').trim();
        aplicadas.push('giro-lote:' + js.includes(velho));
        js = js.replace(velho, () => novo);
      }
      if (exp.includes('giro-barato')) {
        const velho = fs.readFileSync('giro-velho.txt', 'utf8').trim();
        const novo = fs.readFileSync('giro-novo2.txt', 'utf8').trim();
        aplicadas.push('giro-barato:' + js.includes(velho));
        js = js.replace(velho, () => novo);
      }
      if (exp.includes('aura-cache')) {
        const velho = 'const c=i.getBoundingClientRect();X(i)';
        aplicadas.push('aura-cache:' + js.includes(velho));
        js = js.replace(velho, () => 'const c=(window.__mr&&performance.now()-window.__mrT<1000)?window.__mr:(window.__mrT=performance.now(),window.__mr=i.getBoundingClientRect());X(i)');
      }
      if (!exp.includes('aura-para')) return route.fulfill({ response: resp, body: js });
      const a = 'px)`}document.hidden||requestAnimationFrame(k)}';
      const b = ',$=()=>{document.hidden||requestAnimationFrame(k)};';
      const c = 'G=(i,c)=>{w=[i,c]};';
      aplicadas.push('aura-para:' + (js.includes(a) && js.includes(b) && js.includes(c)));
      js = js
        .replace(a, 'px)`}(Math.abs(w[0]-A[0])+Math.abs(w[1]-A[1])>0.05)?(document.hidden||requestAnimationFrame(k)):(window.__auraParada=1)}')
        .replace(b, () => b + 'document.addEventListener("pointermove",()=>{if(window.__auraParada){window.__auraParada=0;requestAnimationFrame(k)}},{passive:!0});')
        .replace(c, 'G=(i,c)=>{w=[i,c];if(window.__auraParada){window.__auraParada=0;requestAnimationFrame(k)}};');
      await route.fulfill({ response: resp, body: js });
    });
  /* As miniaturas dos jogos so animam com o cartao a vista (o que esta fora da tela pausa). */
  if (exp.includes('minis-visiveis'))
    await ctx.addInitScript(() => {
      const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('lab-fora', !e.isIntersecting)));
      const ligar = () => {
        if (!document.getElementById('lab-minis') && document.head) {
          const st = document.createElement('style');
          st.id = 'lab-minis';
          st.textContent = '.q-tile.lab-fora .px-mini *, .q-tile.lab-fora .px-mini *::before, .q-tile.lab-fora .px-mini *::after{animation-play-state:paused!important}';
          document.head.append(st);
        }
        document.querySelectorAll('.q-tile.px-com-mini:not(.lab-obs)').forEach((t) => {
          t.classList.add('lab-obs');
          io.observe(t);
        });
      };
      new MutationObserver(ligar).observe(document, { childList: true, subtree: true });
    });
  /* Sem o desfoque nas entradas, saidas e na tela recuada (so para medir quanto ele pesa). */
  if (exp.includes('sem-blur')) {
    await ctx.route('**/assets/index-1qSZE85D.js', async (route) => {
      const resp = await route.fetch();
      let js = await resp.text();
      const antes = js.length;
      const n = (js.match(/blur\((8|5)px\)/g) || []).length;
      js = js.replace(/blur\((8|5)px\)/g, 'blur(0px)');
      aplicadas.push(`sem-blur:${n} trocas, ${antes === js.length}`);
      await route.fulfill({ response: resp, body: js });
    });
    await ctx.addInitScript(() => {
      const por = () => {
        const st = document.createElement('style');
        st.textContent = "html[data-px='on'] .px-recuado .px-tela{filter:none!important}";
        document.head.append(st);
      };
      if (document.head) por();
      else document.addEventListener('DOMContentLoaded', por);
    });
  }
  /* Sem nenhum vidro (backdrop-filter), so para medir quanto ele pesa. */
  if (exp.includes('sem-backdrop'))
    await ctx.addInitScript(() => {
      const por = () => {
        const st = document.createElement('style');
        st.textContent = '*,*::before,*::after,::backdrop{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}';
        document.head.append(st);
      };
      if (document.head) por();
      else document.addEventListener('DOMContentLoaded', por);
    });
  if (exp.includes('sem-particulas')) await ctx.route('**/assets/ParticleCanvas-*.js', (route) => route.abort());
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  const rede = { reqs: new Map(), fim: [] };
  cdp.on('Network.responseReceived', (e) =>
    rede.reqs.set(e.requestId, { url: e.response.url, tipo: e.type, cache: !!(e.response.fromDiskCache || e.response.fromPrefetchCache), t: Date.now() }),
  );
  cdp.on('Network.requestServedFromCache', (e) => {
    const r = rede.reqs.get(e.requestId);
    if (r) r.cache = true;
    else rede.reqs.set(e.requestId, { cache: true });
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = rede.reqs.get(e.requestId) || {};
    rede.fim.push({ ...r, bytes: e.encodedDataLength, t: Date.now() });
  });
  if (P.rede) await cdp.send('Network.emulateNetworkConditions', REDES[P.rede]);
  const taxa = cpu ?? P.cpu;
  if (taxa > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: taxa });
  const metricas = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  return { browser, ctx, page, cdp, rede, metricas, P, nome, aplicadas };
}

export function resumoRede(fim, desde = 0) {
  const l = fim.filter((r) => r.t >= desde && r.url && r.url.startsWith('http'));
  const por = {};
  let total = 0;
  let daRede = 0;
  for (const r of l) {
    const k = r.tipo || '?';
    por[k] ??= { n: 0, bytes: 0 };
    por[k].n++;
    por[k].bytes += r.bytes || 0;
    total += r.bytes || 0;
    if ((r.bytes || 0) > 0) daRede++;
  }
  return { pedidos: l.length, daRede, bytes: total, por, urls: l.map((r) => r.url.replace(URL0, '') + (r.cache ? ' (cache)' : '') + ' ' + (r.bytes || 0)) };
}

/** Espera o fio principal e a rede sossegarem por `quieto` ms (relogio real), ate `teto` ms. */
export async function sossegar(s, quieto = 2000, teto = 45000) {
  const t0 = Date.now();
  for (;;) {
    const lt = await s.page.evaluate(() => {
      const l = window.__p.lt;
      const u = l[l.length - 1];
      return u ? performance.now() - (u.s + u.d) : 1e9;
    });
    const ultRede = s.rede.fim.length ? Date.now() - s.rede.fim[s.rede.fim.length - 1].t : 1e9;
    if (lt > quieto && ultRede > quieto) return;
    if (Date.now() - t0 > teto) return;
    await s.page.waitForTimeout(250);
  }
}
export const deltaMetricas = (a, b) => ({
  tarefa_ms: r0((b.TaskDuration - a.TaskDuration) * 1000),
  script_ms: r0((b.ScriptDuration - a.ScriptDuration) * 1000),
  estilo_ms: r0((b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000),
  layout_ms: r0((b.LayoutDuration - a.LayoutDuration) * 1000),
  n_estilo: b.RecalcStyleCount - a.RecalcStyleCount,
  n_layout: b.LayoutCount - a.LayoutCount,
});
export function quadros(fr) {
  if (!fr.length) return { n: 0 };
  const s = [...fr].sort((a, b) => a - b);
  const tot = fr.reduce((a, b) => a + b, 0);
  return {
    n: fr.length,
    dur: r0(tot),
    fps: r1((fr.length / tot) * 1000),
    p50: r1(s[s.length >> 1]),
    p95: r1(s[Math.floor(s.length * 0.95)]),
    max: r1(s[s.length - 1]),
    acima33: fr.filter((x) => x > 33.4).length,
    acima50: fr.filter((x) => x > 50).length,
    acima100: fr.filter((x) => x > 100).length,
  };
}
export const salvar = (nome, dado) => {
  fs.mkdirSync('dados', { recursive: true });
  fs.writeFileSync('dados/' + nome, JSON.stringify(dado, null, 1));
};
