// Grava e resume um trace do Chrome (o arquivo inteiro fica fora do repositorio).
import fs from 'fs';
import { r0, r1 } from './lib.mjs';

export const CATS_BASE = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'v8.execute', 'blink.user_timing', 'latencyInfo', 'cc', 'gpu', 'viz', 'toplevel'];
export const CATS_ESTILO = [...CATS_BASE, 'disabled-by-default-devtools.timeline.invalidationTracking', 'disabled-by-default-blink.debug'];

export async function gravar(s, arquivo, fazer, cats = CATS_BASE) {
  await s.browser.startTracing(s.page, { categories: cats });
  const t0 = Date.now();
  await fazer();
  const ms = Date.now() - t0;
  const buf = await s.browser.stopTracing();
  fs.mkdirSync('traces', { recursive: true });
  if (!/-[1-9].json$/.test(arquivo)) fs.writeFileSync('traces/' + arquivo, buf); /* so a 1a repeticao fica guardada */
  return resumir(JSON.parse(buf.toString('utf8')), ms);
}

const ESCRITA = new Set(['FunctionCall', 'EvaluateScript', 'v8.compile', 'v8.run', 'V8.GC_SCAVENGER', 'MinorGC', 'MajorGC', 'TimerFire', 'FireAnimationFrame', 'EventDispatch', 'RunMicrotasks', 'v8.callFunction', 'FireIdleCallback', 'XHRReadyStateChange', 'V8.GCScavenger', 'CompileCode', 'v8.produceCache', 'v8.compileModule', 'v8.evaluateModule']);
const grupoDe = (n) =>
  n === 'UpdateLayoutTree' || n === 'ScheduleStyleRecalculation' || n === 'ParseAuthorStyleSheet' || n === 'Document::recalcStyle'
    ? 'estilo'
    : n === 'Layout' || n === 'UpdateLayerTree' || n === 'IntersectionObserverController::computeIntersections'
      ? 'layout'
      : n === 'Paint' || n === 'PrePaint' || n === 'Layerize' || n === 'PaintImage' || n === 'Commit' || n === 'CompositeLayers' || n === 'UpdateLayer' || n === 'Pre-paint'
        ? 'pintura'
        : n === 'HitTest'
          ? 'hittest'
          : ESCRITA.has(n)
            ? 'script'
            : null;

export function resumir(trace, janelaMs) {
  const ev = trace.traceEvents ?? trace;
  const nomes = new Map();
  const procs = new Map();
  for (const e of ev) {
    if (e.ph === 'M' && e.name === 'thread_name') nomes.set(e.pid + ':' + e.tid, e.args.name);
    if (e.ph === 'M' && e.name === 'process_name') procs.set(e.pid, e.args.name);
  }
  /* o fio principal da pagina: o CrRendererMain com mais UpdateLayoutTree/RunTask */
  const carga = new Map();
  for (const e of ev) {
    if (e.ph !== 'X') continue;
    const k = e.pid + ':' + e.tid;
    if (nomes.get(k) === 'CrRendererMain' && e.name === 'RunTask') carga.set(k, (carga.get(k) ?? 0) + (e.dur ?? 0));
  }
  const principal = [...carga.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const pidPagina = principal ? +principal.split(':')[0] : -1;
  const X = ev.filter((e) => e.ph === 'X' && e.dur != null);
  const doFio = (k) => X.filter((e) => e.pid + ':' + e.tid === k).sort((a, b) => a.ts - b.ts || b.dur - a.dur);

  /* tempo proprio por grupo no fio principal (pilha por ts/dur) */
  const grupos = { script: 0, estilo: 0, layout: 0, pintura: 0, hittest: 0, outro: 0 };
  const porNome = {};
  let tarefas = 0;
  let tarefasCpu = 0;
  let nTarefas = 0;
  let longas = 0;
  let bloqueio = 0;
  let maiorTarefa = 0;
  const pilha = [];
  const fechar = (ate) => {
    while (pilha.length && pilha[pilha.length - 1].fim <= ate) {
      const t = pilha.pop();
      const proprio = t.e.dur - t.filhos;
      const g = t.grupo ?? 'outro';
      grupos[g] += proprio;
      (porNome[t.e.name] ??= { n: 0, total: 0, proprio: 0 }).proprio += proprio;
    }
  };
  for (const e of doFio(principal)) {
    fechar(e.ts);
    const pai = pilha[pilha.length - 1];
    const g = grupoDe(e.name) ?? pai?.grupo ?? null;
    if (!pai) {
      if (e.name !== 'RunTask' && e.name !== 'ThreadControllerImpl::RunTask') continue;
      tarefas += e.dur;
      tarefasCpu += e.tdur ?? 0;
      nTarefas++;
      if (e.dur > 50000) {
        longas++;
        bloqueio += e.dur - 50000;
      }
      if (e.dur > maiorTarefa) maiorTarefa = e.dur;
    } else pai.filhos += e.dur;
    const p = (porNome[e.name] ??= { n: 0, total: 0, proprio: 0 });
    p.n++;
    p.total += e.dur;
    pilha.push({ e, fim: e.ts + e.dur, filhos: 0, grupo: g });
  }
  fechar(Infinity);

  const seg = janelaMs / 1000;
  const ms = (us) => r1(us / 1000);
  const somaTopo = (k) => {
    let fim = 0;
    let tot = 0;
    let cpu = 0;
    for (const e of doFio(k)) {
      if (e.ts < fim) continue;
      fim = e.ts + e.dur;
      tot += e.dur;
      cpu += e.tdur ?? 0;
    }
    return { parede: tot, cpu };
  };
  const fios = {};
  for (const [k, n] of nomes) {
    const pid = +k.split(':')[0];
    const ehPagina = pid === pidPagina;
    const proc = procs.get(pid) ?? '';
    if (!(ehPagina || /GPU|Gpu|Browser/i.test(proc) || /Gpu|Viz/.test(n))) continue;
    const t = somaTopo(k);
    if (t.parede < 1000) continue;
    const rot = (ehPagina ? 'pagina' : proc) + '/' + n.replace(/\d+$/, '').replace(/\/.*/, '');
    fios[rot] ??= { parede_ms: 0, cpu_ms: 0 };
    fios[rot].parede_ms += t.parede / 1000;
    fios[rot].cpu_ms += t.cpu / 1000;
  }
  for (const k in fios) fios[k] = { parede_ms: r0(fios[k].parede_ms), cpu_ms: r0(fios[k].cpu_ms), cpu_por_s: r1(fios[k].cpu_ms / seg) };

  const cont = (nome, f = () => true) => ev.filter((e) => e.name === nome && f(e)).length;
  const ult = X.filter((e) => e.name === 'UpdateLayoutTree' && e.pid + ':' + e.tid === principal);
  const els = ult.map((e) => e.args?.elementCount ?? 0);
  const funcs = {};
  for (const e of X) {
    if (e.name !== 'FunctionCall' || e.pid + ':' + e.tid !== principal) continue;
    const d = e.args?.data ?? {};
    const k = `${(d.url ?? '').split('/').pop()}:${d.lineNumber ?? '?'}:${d.columnNumber ?? '?'} ${d.functionName ?? ''}`;
    (funcs[k] ??= { n: 0, ms: 0 }).n++;
    funcs[k].ms += e.dur / 1000;
  }
  const layouts = X.filter((e) => e.name === 'Layout' && e.pid + ':' + e.tid === principal);
  const forcados = layouts.filter((e) => e.args?.beginData?.stackTrace?.length);
  const pilhasForcadas = {};
  for (const e of forcados) {
    const f = e.args.beginData.stackTrace[0];
    const k = `${(f.url ?? '').split('/').pop()}:${f.lineNumber}:${f.columnNumber} ${f.functionName}`;
    (pilhasForcadas[k] ??= { n: 0, ms: 0 }).n++;
    pilhasForcadas[k].ms += e.dur / 1000;
  }
  const estiloForcado = {};
  for (const e of ult) {
    const st = e.args?.beginData?.stackTrace;
    if (!st?.length) continue;
    const f = st[0];
    const k = `${(f.url ?? '').split('/').pop()}:${f.lineNumber}:${f.columnNumber} ${f.functionName}`;
    (estiloForcado[k] ??= { n: 0, ms: 0 }).n++;
    estiloForcado[k].ms += e.dur / 1000;
  }
  const topo = (o, n = 12, c = 'ms') =>
    Object.entries(o)
      .sort((a, b) => b[1][c] - a[1][c])
      .slice(0, n)
      .map(([k, v]) => `${k} n=${v.n} ${r1(v[c])}ms`);
  return {
    janela_ms: janelaMs,
    principal: {
      tarefas_parede_ms: ms(tarefas),
      tarefas_cpu_ms: ms(tarefasCpu),
      ocupacao_pct: r1((tarefas / 1000 / janelaMs) * 100),
      nTarefas,
      tarefasLongas: longas,
      bloqueio_ms: ms(bloqueio),
      maiorTarefa_ms: ms(maiorTarefa),
      grupos_ms: Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, ms(v)])),
      por_s: Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, r1(v / 1000 / seg)])),
    },
    estilo: { recalculos: ult.length, por_s: r1(ult.length / seg), total_ms: ms(ult.reduce((a, e) => a + e.dur, 0)), elementos_medio: r1(els.reduce((a, b) => a + b, 0) / (els.length || 1)), elementos_max: Math.max(0, ...els), forcadoPor: topo(estiloForcado) },
    layout: { n: layouts.length, total_ms: ms(layouts.reduce((a, e) => a + e.dur, 0)), forcados: forcados.length, forcadoPor: topo(pilhasForcadas) },
    quadros: {
      desenhados: cont('DrawFrame'),
      descartados: cont('DroppedFrame'),
      beginMain: cont('BeginMainThreadFrame'),
      commits: cont('Commit', (e) => e.ph === 'X'),
      rAF: cont('FireAnimationFrame', (e) => e.ph === 'X' && e.pid + ':' + e.tid === principal),
      pinturas: cont('Paint', (e) => e.ph === 'X'),
      por_s: r1(cont('DrawFrame') / seg),
    },
    fios,
    funcoes: topo(funcs, 14),
    eventos: Object.entries(porNome)
      .filter(([, v]) => v.total > 2000)
      .sort((a, b) => b[1].proprio - a[1].proprio)
      .slice(0, 22)
      .map(([k, v]) => `${k} n=${v.n} total=${ms(v.total)} proprio=${ms(v.proprio)}`),
  };
}

/** Estatisticas de seletor e motivos de invalidacao (precisa de CATS_ESTILO). */
export function estilos(arquivo) {
  const trace = JSON.parse(fs.readFileSync('traces/' + arquivo, 'utf8'));
  const ev = trace.traceEvents ?? trace;
  const sel = {};
  for (const e of ev) {
    if (e.name !== 'SelectorStats') continue;
    for (const t of e.args?.selector_stats?.selector_timings ?? []) {
      const s = (sel[t.selector] ??= { us: 0, tentativas: 0, casou: 0, lento: 0 });
      s.us += t['elapsed (us)'] ?? 0;
      s.tentativas += t.match_attempts ?? 0;
      s.casou += t.match_count ?? 0;
      s.lento += t.fast_reject_count ?? 0;
    }
  }
  const motivos = {};
  for (const e of ev) {
    if (e.name === 'StyleRecalcInvalidationTracking' || e.name === 'ScheduleStyleInvalidationTracking' || e.name === 'StyleInvalidatorInvalidationTracking') {
      const d = e.args?.data ?? {};
      const k = `${e.name.replace('InvalidationTracking', '')}|${d.reason ?? d.invalidationSet ?? ''}|${d.extraData ?? d.changedClass ?? d.changedAttribute ?? d.changedId ?? d.changedPseudo ?? ''}|${(d.nodeName ?? '').slice(0, 60)}`;
      motivos[k] = (motivos[k] ?? 0) + 1;
    }
  }
  const total = Object.values(sel).reduce((a, s) => a + s.us, 0);
  return {
    seletores_total_ms: r1(total / 1000),
    nSeletores: Object.keys(sel).length,
    topo: Object.entries(sel)
      .sort((a, b) => b[1].us - a[1].us)
      .slice(0, 40)
      .map(([k, v]) => ({ seletor: k.slice(0, 160), ms: r1(v.us / 1000), tentativas: v.tentativas, casou: v.casou })),
    comHas_ms: r1(Object.entries(sel).filter(([k]) => k.includes(':has(')).reduce((a, [, v]) => a + v.us, 0) / 1000),
    motivos: Object.entries(motivos)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([k, n]) => `${n}x ${k}`),
  };
}
