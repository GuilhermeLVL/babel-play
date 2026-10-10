// Medidor de uma interacao: do toque ate a tela nova pintar e ate as animacoes assentarem.
import { deltaMetricas, quadros, r0, r1, URL0 } from './lib.mjs';

/** Instala na pagina o medidor (uma vez por documento). */
export async function instalarMedidor(page) {
  await page.evaluate(() => {
    if (window.__medir) return;
    window.__medir = ({ modo, seletor, teto = 9000, minimo = 250 }) =>
      new Promise((res) => {
        const p = window.__p;
        const tela = document.querySelector('.px-tela');
        const antigo = tela?.firstElementChild ?? null;
        const caminho0 = location.pathname;
        const nosAntes = document.querySelectorAll('*').length;
        let t0 = null;
        let tTroca = null;
        let tFallback = null;
        let tConteudo = null;
        let tPintou = null;
        let fim = false;
        const aoApertar = (e) => {
          if (t0 == null) {
            t0 = e.timeStamp > 0 ? e.timeStamp : performance.now();
            p.iniciarQuadros();
          }
        };
        window.addEventListener('pointerdown', aoApertar, { capture: true, once: true });
        const pronto = () => {
          if (modo === 'tela') {
            const f = tela?.firstElementChild;
            return !!f && f !== antigo && !f.classList.contains('carregando-da-tela') && !tela.querySelector('.q-esqueleto, .carregando-da-tela');
          }
          if (modo === 'aparece') return !!document.querySelector(seletor);
          if (modo === 'some') return !document.querySelector(seletor);
          if (modo === 'url') return location.pathname !== caminho0;
          return true; /* 'toque': so a resposta ao toque */
        };
        const animando = () =>
          document.getAnimations().some((a) => {
            if (a.playState !== 'running') return false;
            const t = a.effect?.getComputedTiming?.();
            /* a inclinacao do giroscopio redispara uma transicao de transform a cada escrita: nao conta como entrada */
            if (a.transitionProperty === 'transform' && a.effect?.target?.matches?.('button.q-tile, .carta, .px-premium, .px-vitrine-tela, .px-arte')) return false;
            return !t || t.iterations !== Infinity;
          });
        const acabar = (motivo) => {
          if (fim) return;
          fim = true;
          const t1 = performance.now();
          const fr = p.pararQuadros();
          setTimeout(() => {
            const dentro = (x) => x.s >= t0 - 30 && x.s <= t1;
            const lt = p.lt.filter((x) => x.s + x.d >= t0 && x.s <= t1);
            const ev = p.ev.filter(dentro);
            const res_ = performance
              .getEntriesByType('resource')
              .filter((r) => r.startTime >= t0 - 1 && r.startTime <= t1)
              .map((r) => ({ n: r.name.split('/').pop(), kb: Math.round(r.transferSize / 102.4) / 10, dec: Math.round(r.decodedBodySize / 102.4) / 10, fim: Math.round(r.responseEnd - t0) }));
            res({
              motivo,
              troca: tTroca == null ? null : tTroca - t0,
              fallback: tFallback == null ? null : tFallback - t0,
              conteudo: tConteudo == null ? null : tConteudo - t0,
              pintou: tPintou == null ? null : tPintou - t0,
              assentou: t1 - t0,
              frames: fr,
              lt: lt.map((x) => ({ s: Math.round(x.s - t0), d: Math.round(x.d) })),
              ev: ev.map((x) => ({ n: x.n, d: x.d, atraso: Math.round(x.ps - x.s), proc: Math.round(x.pe - x.ps), id: x.id })),
              res: res_,
              nosAntes,
              nosDepois: document.querySelectorAll('*').length,
              url: location.pathname,
            });
          }, 250);
        };
        const tique = () => {
          if (fim) return;
          const agora = performance.now();
          if (t0 != null) {
            if (modo === 'tela') {
              const f = tela?.firstElementChild;
              if (tTroca == null && f !== antigo) tTroca = agora;
              if (tFallback == null && tela?.querySelector('.carregando-da-tela, .q-esqueleto')) tFallback = agora;
            }
            if (tConteudo == null) {
              if (pronto()) tConteudo = agora;
            } else if (tPintou == null) tPintou = agora;
            if (tPintou != null && agora - t0 > minimo && agora - tPintou > 120 && !animando()) return acabar('assentou');
            if (agora - t0 > teto) return acabar('teto');
          }
          requestAnimationFrame(tique);
        };
        requestAnimationFrame(tique);
        setTimeout(() => t0 == null && acabar('sem-toque'), 15000);
      });
  });
}

/** Uma interacao: prepara o medidor, toca em `alvo` e devolve as medidas. */
export async function interagir(s, rotulo, alvo, opc) {
  const { page } = s;
  await instalarMedidor(page);
  const el = page.locator(alvo).first();
  await el.waitFor({ state: 'visible', timeout: 15000 });
  const m0 = await s.metricas();
  const promessa = page.evaluate((o) => window.__medir(o), opc);
  await page.waitForTimeout(60);
  if (s.P.toque) await el.tap({ timeout: 15000, force: !!opc.forcar });
  else await el.click({ timeout: 15000, force: !!opc.forcar });
  const r = await promessa;
  const m1 = await s.metricas();
  const inp = Math.max(0, ...r.ev.filter((e) => e.id).map((e) => e.d));
  const proc = Math.max(0, ...r.ev.filter((e) => e.id).map((e) => e.proc));
  return {
    rotulo,
    url: r.url,
    motivo: r.motivo,
    troca: r0(r.troca),
    fallback: r0(r.fallback),
    conteudo: r0(r.conteudo),
    pintou: r0(r.pintou),
    assentou: r0(r.assentou),
    inp: r0(inp),
    proc: r0(proc),
    nLt: r.lt.length,
    somaLt: r.lt.reduce((a, x) => a + x.d, 0),
    maiorLt: Math.max(0, ...r.lt.map((x) => x.d)),
    bloqueio: r.lt.reduce((a, x) => a + Math.max(0, x.d - 50), 0),
    q: quadros(r.frames),
    cpu: deltaMetricas(m0, m1),
    baixou: r.res.length,
    baixouKb: r1(r.res.reduce((a, x) => a + x.kb, 0)),
    jsKb: r1(r.res.filter((x) => x.n.endsWith('.js')).reduce((a, x) => a + x.dec, 0)),
    ultimoRecurso: Math.max(0, ...r.res.map((x) => x.fim)),
    res: r.res,
    lt: r.lt,
    ev: r.ev,
    nos: r.nosDepois,
  };
}
export const linha = (x) =>
  `${x.rotulo.padEnd(28)} troca=${x.troca} conteudo=${x.conteudo} pintou=${x.pintou} assentou=${x.assentou} inp=${x.inp} proc=${x.proc} lt=${x.nLt}/${x.somaLt}ms(max ${x.maiorLt}) q[fps ${x.q.fps} p95 ${x.q.p95} max ${x.q.max} >50:${x.q.acima50}] cpu[s ${x.cpu.script_ms} e ${x.cpu.estilo_ms} l ${x.cpu.layout_ms} t ${x.cpu.tarefa_ms}] baixou=${x.baixou}/${x.baixouKb}kB js=${x.jsKb}kB nos=${x.nos} ${x.motivo === 'assentou' ? '' : x.motivo}`;
export { URL0 };
