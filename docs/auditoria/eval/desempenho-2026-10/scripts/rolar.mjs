// Jornada 5: rolar as telas longas com gesto de verdade (compositor), contando quadros pelo trace.
// uso: node rolar.mjs <perfil> <N> <opcoesJSON> <sufixo>
import { abrir, URL0, sossegar, mediana, salvar, r1 } from './lib.mjs';
import { gravar } from './traco.mjs';
const nome = process.argv[2] || 'cel-medio';
const N = +(process.argv[3] || 3);
const extra = process.argv[4] ? JSON.parse(process.argv[4]) : {};
const suf = process.argv[5] || '';
const TELAS = [
  ['Inicio', '/'],
  ['Jogar (grade)', '/jogar'],
  ['Estatisticas', '/estatisticas'],
  ['Personalizar', '/personalizar'],
  ['Ajustes', '/ajustes'],
];
const FONTE = { 'babel.fonte_da_pratica': '{"origem":"trilha","escopo":"todas"}' };
const runs = [];
for (let i = 0; i < N; i++) {
  const s = await abrir(nome, { ...extra, storage: FONTE });
  const { page, cdp } = s;
  const telas = [];
  try {
    for (const [rot, caminho] of TELAS) {
      await page.goto(URL0 + caminho, { waitUntil: 'load', timeout: 90000 });
      await sossegar(s, 1500, 30000);
      await page.waitForTimeout(2500);
      const alvo = await page.evaluate(() => {
        const c = [...document.querySelectorAll('.px-tela .q-palco, .px-tela .rolagem, .px-tela *')].find((e) => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY));
        if (!c) return null;
        const r = c.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height * 0.6, alto: c.scrollHeight, vista: c.clientHeight, cls: String(c.className).slice(0, 40), nos: document.querySelectorAll('*').length, url: location.pathname };
      });
      if (!alvo) {
        console.log(`${nome} r${i} ${rot}: nada para rolar (${page.url()})`);
        continue;
      }
      const dist = Math.min(alvo.alto - alvo.vista, 2400);
      const tipo = s.P.toque ? 'touch' : 'mouse';
      const m0 = await s.metricas();
      const lt0 = await page.evaluate(() => window.__p.lt.length);
      const r = await gravar(s, `rolar${suf}-${nome}-${rot.replace(/\W+/g, '')}-${i}.json`, async () => {
        await cdp.send('Input.synthesizeScrollGesture', { x: alvo.x, y: alvo.y, yDistance: -dist, speed: 1400, gestureSourceType: tipo, repeatCount: 0 });
        await page.waitForTimeout(250);
        await cdp.send('Input.synthesizeScrollGesture', { x: alvo.x, y: alvo.y, yDistance: dist, speed: 1400, gestureSourceType: tipo, repeatCount: 0 });
        await page.waitForTimeout(400);
      });
      const m1 = await s.metricas();
      const lt = await page.evaluate((n) => window.__p.lt.slice(n).map((x) => Math.round(x.d)), lt0);
      const seg = r.janela_ms / 1000;
      const x = {
        rotulo: rot,
        url: alvo.url,
        nos: alvo.nos,
        rolou_px: dist * 2,
        dur_ms: r.janela_ms,
        quadros_por_s: r1(r.quadros.desenhados / seg),
        desenhados: r.quadros.desenhados,
        descartados: r.quadros.descartados,
        ocupacao_pct: r.principal.ocupacao_pct,
        por_s: r.principal.por_s,
        recalculos: r.estilo.recalculos,
        els: r.estilo.elementos_medio,
        pinturas: r.quadros.pinturas,
        rAF: r.quadros.rAF,
        nLt: lt.length,
        maiorLt: Math.max(0, ...lt),
        gpu_cpu_por_s: r1(Object.entries(r.fios).filter(([k]) => /GPU|Gpu/.test(k)).reduce((a, [, v]) => a + v.cpu_por_s, 0)),
        compositor_por_s: r.fios['pagina/Compositor']?.cpu_por_s ?? 0,
        raster_por_s: r1(Object.entries(r.fios).filter(([k]) => /TileWorker|ThreadPool/.test(k)).reduce((a, [, v]) => a + v.cpu_por_s, 0)),
        funcoes: r.funcoes.slice(0, 6),
        eventos: r.eventos.slice(0, 10),
        layoutForcado: r.layout.forcadoPor.slice(0, 4),
      };
      telas.push(x);
      console.log(`${nome} r${i} ${rot.padEnd(16)} ${alvo.cls} nos=${x.nos} rolou=${x.rolou_px}px em ${x.dur_ms}ms quadros/s=${x.quadros_por_s} desc=${x.descartados} ocup=${x.ocupacao_pct}% por_s=${JSON.stringify(x.por_s)} recalc=${x.recalculos} els=${x.els} pint=${x.pinturas} lt=${x.nLt}(max ${x.maiorLt}) gpu=${x.gpu_cpu_por_s} comp=${x.compositor_por_s} raster=${x.raster_por_s}`);
      if (i === 0) console.log('    funcoes', x.funcoes.join(' | '), '\n    eventos', x.eventos.slice(0, 8).join(' | '));
    }
  } catch (e) {
    console.log(nome, i, 'ERRO', String(e).slice(0, 300));
  }
  runs.push(telas);
  await s.browser.close();
}
const por = {};
for (const r of runs) for (const x of r) (por[x.rotulo] ??= []).push(x);
const resumo = Object.entries(por).map(([rot, xs]) => {
  const m = (f) => mediana(xs.map(f));
  return { rotulo: rot, n: xs.length, nos: m((x) => x.nos), quadros_por_s: m((x) => x.quadros_por_s), descartados: m((x) => x.descartados), ocupacao_pct: m((x) => x.ocupacao_pct), script_por_s: m((x) => x.por_s.script), estilo_por_s: m((x) => x.por_s.estilo), layout_por_s: m((x) => x.por_s.layout), pintura_por_s: m((x) => x.por_s.pintura), recalculos: m((x) => x.recalculos), els: m((x) => x.els), nLt: m((x) => x.nLt), maiorLt: m((x) => x.maiorLt), gpu_cpu_por_s: m((x) => x.gpu_cpu_por_s), compositor_por_s: m((x) => x.compositor_por_s), raster_por_s: m((x) => x.raster_por_s) };
});
for (const l of resumo) console.log('MEDIANA', nome, JSON.stringify(l));
salvar(`rolar${suf}-${nome}.json`, { resumo, runs });
console.log('FIM');
