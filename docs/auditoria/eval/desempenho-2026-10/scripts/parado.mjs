// Jornada 6: parado no Inicio. Trace de 10 s sem mexer (sem o laco de quadros do medidor).
// uso: node parado.mjs <perfil> <N> <opcoesJSON> <sufixo> [giro|mouse|nada] [caminho]
import { abrir, URL0, sossegar, mediana, salvar, r1 } from './lib.mjs';
import { gravar } from './traco.mjs';
const nome = process.argv[2] || 'cel-medio';
const N = +(process.argv[3] || 3);
const extra = process.argv[4] ? JSON.parse(process.argv[4]) : {};
const suf = process.argv[5] || '';
const estimulo = process.argv[6] || 'nada';
const caminho = '/' + (process.argv[7] || '');
const DUR = 10000;
const runs = [];
for (let i = 0; i < N; i++) {
  const s = await abrir(nome, { ...extra, semInstr: false });
  try {
    await s.page.goto(URL0 + caminho, { waitUntil: 'load', timeout: 90000 });
    await sossegar(s);
    if (!s.P.toque) await s.page.mouse.move(s.P.viewport.width / 2, s.P.viewport.height / 2);
    if (estimulo === 'giro') {
      /* o celular na mao: o sensor entrega ~60 leituras/s com um tremor pequeno */
      await s.page.evaluate(() => {
        let t = 0;
        window.__giro = setInterval(() => {
          t += 0.016;
          const beta = 45 + Math.sin(t * 1.3) * 1.5 + (Math.random() - 0.5) * 0.3;
          const gamma = Math.sin(t * 0.9) * 2 + (Math.random() - 0.5) * 0.3;
          window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta, gamma, absolute: false }));
        }, 16);
      });
    }
    if (estimulo === 'giroquieto') {
      /* o celular pousado na mesa (ou mao firme): o sensor segue entregando ~60 leituras/s, so com o ruido dele */
      await s.page.evaluate(() => {
        window.__giro = setInterval(() => {
          const beta = 45 + (Math.random() - 0.5) * 0.06;
          const gamma = (Math.random() - 0.5) * 0.06;
          window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta, gamma, absolute: false }));
        }, 16);
      });
    }
    await s.page.waitForTimeout(6000); /* entradas e contadores acabam */
    const m0 = await s.metricas();
    const r = await gravar(s, `parado${suf}-${nome}-${estimulo}-${i}.json`, async () => {
      if (estimulo === 'mouse') {
        const { width, height } = s.P.viewport;
        const t0 = Date.now();
        let k = 0;
        while (Date.now() - t0 < DUR) {
          k++;
          await s.page.mouse.move(width * (0.3 + 0.4 * (0.5 + 0.5 * Math.sin(k / 9))), height * (0.25 + 0.5 * (0.5 + 0.5 * Math.cos(k / 13))));
          await s.page.waitForTimeout(12);
        }
      } else await s.page.waitForTimeout(DUR);
    });
    const m1 = await s.metricas();
    const estado = await s.page.evaluate(() => ({
      anims: document.getAnimations().map((a) => {
        const t = a.effect?.target;
        const tm = a.effect?.getComputedTiming?.() ?? {};
        return `${a.constructor.name}:${a.animationName ?? a.transitionProperty ?? ''}:${a.playState}:${tm.iterations}:${t ? t.tagName + '.' + String(t.className?.baseVal ?? t.className).slice(0, 40) : (a.effect?.pseudoElement ?? '?')}`;
      }),
      giro: document.documentElement.dataset.pxGiro ?? null,
      corpo: document.body.className,
      px: document.documentElement.dataset.px,
      nos: document.querySelectorAll('*').length,
      rodando: document.getAnimations().filter((a) => a.playState === 'running').length,
      pausadas: document.getAnimations().filter((a) => a.playState === 'paused').length,
      cartoes: document.querySelectorAll('.q-tile.px-com-mini').length,
      cartoesFora: document.querySelectorAll('.q-tile.lab-fora').length,
      painel: !!document.querySelector('.q-mais-fundo'),
      canvas: [...document.querySelectorAll('canvas')].map((c) => c.width + 'x' + c.height),
    }));
    r.metricas_por_s = { script: r1((m1.ScriptDuration - m0.ScriptDuration) * 100), estilo: r1((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 100), layout: r1((m1.LayoutDuration - m0.LayoutDuration) * 100), tarefa: r1((m1.TaskDuration - m0.TaskDuration) * 100), nEstilo: r1((m1.RecalcStyleCount - m0.RecalcStyleCount) / 10), nLayout: r1((m1.LayoutCount - m0.LayoutCount) / 10) };
    r.estado = estado;
    r.aplicadas = s.aplicadas;
    runs.push(r);
    console.log(`${nome}${suf} ${estimulo} r${i} ocup=${r.principal.ocupacao_pct}% por_s=${JSON.stringify(r.principal.por_s)} estilo/s=${r.estilo.por_s} els=${r.estilo.elementos_medio} quadros/s=${r.quadros.por_s} rAF=${r.quadros.rAF} pinturas=${r.quadros.pinturas} anims=${estado.anims.length} rodando=${estado.rodando} pausadas=${estado.pausadas} cartoes=${estado.cartoes} fora=${estado.cartoesFora} painel=${estado.painel}`);
    console.log('   fios', JSON.stringify(r.fios));
    if (i === 0) {
      console.log('   funcoes', r.funcoes.slice(0, 8).join(' | '));
      console.log('   eventos', r.eventos.slice(0, 12).join(' | '));
      console.log('   anims', [...new Set(estado.anims)].slice(0, 30).join(' | '));
      console.log('   estiloForcado', r.estilo.forcadoPor.slice(0, 5).join(' | '), ' layoutForcado', r.layout.forcados, r.layout.forcadoPor.slice(0, 5).join(' | '));
    }
  } catch (e) {
    console.log(nome, i, 'ERRO', String(e).slice(0, 300));
  }
  await s.browser.close();
}
const m = (f) => mediana(runs.map(f));
const gpuDe = (r) => Object.entries(r.fios).filter(([k]) => /GPU|Gpu/.test(k)).reduce((a, [, v]) => a + v.cpu_por_s, 0);
const med = {
  ocupacao_pct: m((r) => r.principal.ocupacao_pct),
  principal_cpu_ms_por_s: r1(m((r) => r.principal.tarefas_cpu_ms / (r.janela_ms / 1000))),
  principal_parede_ms_por_s: r1(m((r) => r.principal.tarefas_parede_ms / (r.janela_ms / 1000))),
  script_por_s: m((r) => r.principal.por_s.script),
  estilo_por_s: m((r) => r.principal.por_s.estilo),
  layout_por_s: m((r) => r.principal.por_s.layout),
  pintura_por_s: m((r) => r.principal.por_s.pintura),
  recalculos_por_s: m((r) => r.estilo.por_s),
  elementos_por_recalculo: m((r) => r.estilo.elementos_medio),
  quadros_por_s: m((r) => r.quadros.por_s),
  rAF_por_s: r1(m((r) => r.quadros.rAF / (r.janela_ms / 1000))),
  pinturas_por_s: r1(m((r) => r.quadros.pinturas / (r.janela_ms / 1000))),
  gpu_cpu_ms_por_s: r1(m(gpuDe)),
  compositor_cpu_ms_por_s: r1(m((r) => r.fios['pagina/Compositor']?.cpu_por_s ?? 0)),
};
console.log('MEDIANA', nome + suf, estimulo, JSON.stringify(med));
salvar(`parado${suf}-${nome}-${estimulo}.json`, { mediana: med, runs });
console.log('FIM');
