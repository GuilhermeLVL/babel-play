// Por que o estilo e recalculado com a tela parada: trace curto com motivo de invalidacao e estatistica de seletor.
// uso: node motivosParado.mjs <perfil> <opcoesJSON> <sufixo> [caminho]
import { abrir, URL0, sossegar, salvar, r1 } from './lib.mjs';
import { gravar, estilos, CATS_ESTILO } from './traco.mjs';
import fs from 'fs';
const nome = process.argv[2] || 'cel-medio';
const extra = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const suf = process.argv[4] || '';
const caminho = process.argv[5] || '/';
const s = await abrir(nome, extra);
await s.page.goto(URL0 + caminho, { waitUntil: 'load', timeout: 90000 });
await sossegar(s);
await s.page.waitForTimeout(6000);
const arq = `motivos${suf}-${nome}.json`;
const r = await gravar(s, arq, () => s.page.waitForTimeout(3000), CATS_ESTILO);
const e = estilos(arq);
const ev = JSON.parse(fs.readFileSync('traces/' + arq, 'utf8')).traceEvents;
const ult = ev.filter((x) => x.name === 'UpdateLayoutTree' && x.ph === 'X');
const hist = {};
for (const u of ult) {
  const k = u.args?.elementCount ?? '?';
  (hist[k] ??= { n: 0, ms: 0 }).n++;
  hist[k].ms += u.dur / 1000;
}
const anims = await s.page.evaluate(() =>
  document.getAnimations().map((a) => {
    const t = a.effect?.target;
    return `${a.constructor.name}:${a.animationName ?? a.transitionProperty ?? ''}:${t ? t.tagName + '.' + String(t.className?.baseVal ?? t.className).slice(0, 30) : ''}${a.effect?.pseudoElement ?? ''}`;
  }),
);
console.log(`${nome}${suf} ${caminho}: ocupacao ${r.principal.ocupacao_pct}% (trace pesado: so as proporcoes valem), recalculos ${r.estilo.recalculos} em 3 s, estilo ${r.principal.grupos_ms.estilo} ms`);
console.log('recalculos por numero de elementos:', Object.entries(hist).sort((a, b) => b[1].ms - a[1].ms).slice(0, 8).map(([k, v]) => `${k} el: ${v.n}x, ${r1(v.ms)} ms (${r1(v.ms / v.n)} ms cada)`).join(' | '));
console.log(`seletores: ${e.seletores_total_ms} ms no total`);
for (const t of e.topo.slice(0, 10)) console.log(`   ${t.ms} ms tent=${t.tentativas} casou=${t.casou} ${t.seletor}`);
console.log('motivos:\n   ' + e.motivos.slice(0, 25).join('\n   '));
console.log('funcoes:', r.funcoes.slice(0, 6).join(' | '));
console.log('eventos:', r.eventos.slice(0, 10).join(' | '));
console.log('animacoes vivas:', [...new Set(anims)].join(' | '));
salvar(`motivos${suf}-${nome}.json`, { resumo: r, estilos: e, hist, anims });
await s.browser.close();
console.log('FIM');
