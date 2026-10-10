// Jornada 1: primeira carga (cache frio) e segunda carga (cache HTTP quente).
// uso: node carga.mjs <perfis,> <N> <opcoesJSON> <sufixo>
import { abrir, URL0, sossegar, resumoRede, deltaMetricas, mediana, r0, salvar, PERFIS } from './lib.mjs';
const perfis = process.argv[2] ? process.argv[2].split(',') : Object.keys(PERFIS);
const N = +(process.argv[3] || 3);
const extra = process.argv[4] ? JSON.parse(process.argv[4]) : {};
const colher = async (s, m0, tRede) => {
  const m1 = await s.metricas();
  const d = await s.page.evaluate(() => {
    const p = window.__p;
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = p.paint.find((x) => x.n === 'first-contentful-paint')?.s ?? null;
    const lcp = p.lcp[p.lcp.length - 1] ?? null;
    const res = performance.getEntriesByType('resource');
    const js = res.filter((r) => r.name.endsWith('.js'));
    return {
      ttfb: nav.responseStart,
      dcl: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
      fcp,
      lcp: lcp?.s ?? null,
      lcpEl: lcp?.el,
      lcpTodos: p.lcp,
      cls: p.cls.filter((x) => !x.rec).reduce((a, x) => a + x.v, 0),
      clsN: p.cls.length,
      lt: p.lt,
      marcos: p.marcos,
      jsDecod: js.reduce((a, r) => a + (r.decodedBodySize || 0), 0),
      nJs: js.length,
      nRes: res.length,
      nos: document.querySelectorAll('*').length,
      folhas: document.styleSheets.length,
      corpo: document.body.className,
      raiz: Object.fromEntries([...document.documentElement.attributes].filter((a) => a.name.startsWith('data-')).map((a) => [a.name, a.value])),
      sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    };
  });
  const depois = d.lt.filter((x) => d.fcp != null && x.s + x.d > d.fcp);
  const tbt = depois.reduce((a, x) => a + Math.max(0, x.d - 50), 0);
  const ult = d.lt[d.lt.length - 1];
  const tti = Math.max(d.fcp ?? 0, ult ? ult.s + ult.d : 0, d.marcos.palco ?? 0);
  return {
    ...d,
    tbt,
    nLt: d.lt.length,
    maiorLt: Math.max(0, ...d.lt.map((x) => x.d)),
    somaLt: d.lt.reduce((a, x) => a + x.d, 0),
    tti,
    cpu: deltaMetricas(m0, m1), aosMs: await s.page.evaluate(() => performance.now()),
    heapMb: Math.round((m1.JSHeapUsedSize / 1048576) * 10) / 10,
    rede: resumoRede(s.rede.fim, tRede),
  };
};
const curto = (x) => ({ fcp: r0(x.fcp), lcp: r0(x.lcp), palco: r0(x.marcos.palco), tti: r0(x.tti), tbt: r0(x.tbt), cls: +x.cls.toFixed(3), ped: x.rede.pedidos, daRede: x.rede.daRede, kb: r0(x.rede.bytes / 1024), cpu: x.cpu });
const ZERO = { TaskDuration: 0, ScriptDuration: 0, RecalcStyleDuration: 0, LayoutDuration: 0, RecalcStyleCount: 0, LayoutCount: 0 };
const tudo = {};
for (const nome of perfis) {
  const runs = [];
  for (let i = 0; i < N; i++) {
    const s = await abrir(nome, extra);
    try {
      let m0 = ZERO;
      let t = Date.now();
      await s.page.goto(URL0 + '/', { waitUntil: 'load', timeout: 90000 });
      await sossegar(s);
      const fria = await colher(s, m0, t);
      m0 = ZERO;
      t = Date.now();
      await s.page.reload({ waitUntil: 'load', timeout: 90000 });
      await sossegar(s);
      const quente = await colher(s, m0, t);
      runs.push({ fria, quente });
      console.log(nome, i, 'fria', JSON.stringify(curto(fria)));
      console.log(nome, i, 'quente', JSON.stringify(curto(quente)));
    } catch (e) {
      console.log(nome, i, 'ERRO', String(e).slice(0, 300));
    }
    await s.browser.close();
  }
  const med = (k, f) => mediana(runs.map((r) => f(r[k])));
  const res = {};
  for (const k of ['fria', 'quente'])
    res[k] = {
      ttfb: r0(med(k, (x) => x.ttfb)),
      fcp: r0(med(k, (x) => x.fcp)),
      lcp: r0(med(k, (x) => x.lcp)),
      palco: r0(med(k, (x) => x.marcos.palco)),
      tti: r0(med(k, (x) => x.tti)),
      tbt: r0(med(k, (x) => x.tbt)),
      cls: +(med(k, (x) => x.cls) ?? 0).toFixed(4),
      maiorLt: r0(med(k, (x) => x.maiorLt)),
      pedidos: med(k, (x) => x.rede.pedidos),
      daRede: med(k, (x) => x.rede.daRede),
      kB: r0(med(k, (x) => x.rede.bytes) / 1024),
      jsDecodKB: r0(med(k, (x) => x.jsDecod) / 1024),
      script_ms: med(k, (x) => x.cpu.script_ms),
      estilo_ms: med(k, (x) => x.cpu.estilo_ms),
      layout_ms: med(k, (x) => x.cpu.layout_ms),
      tarefa_ms: med(k, (x) => x.cpu.tarefa_ms),
      heapMb: med(k, (x) => x.heapMb),
      nos: med(k, (x) => x.nos),
    };
  tudo[nome] = { mediana: res, runs };
  console.log('MEDIANA', nome, JSON.stringify(res));
}
salvar('carga' + (process.argv[5] || '') + '-' + perfis.join('+') + '.json', tudo);
