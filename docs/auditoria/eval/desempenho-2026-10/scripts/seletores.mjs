// Do trace com estatistica de seletor: quantos seletores sao tentados contra TODO elemento recalculado.
import fs from 'fs';
const arq = process.argv[2] || 'traces/nav-cel-medio-abrirMais.json';
const ev = JSON.parse(fs.readFileSync(arq, 'utf8')).traceEvents;
const ss = ev.filter((e) => e.name === 'SelectorStats' && e.args?.selector_stats?.selector_timings);
const ult = ev.filter((e) => e.name === 'UpdateLayoutTree' && e.ph === 'X');
const us = (x) => x['elapsed (us)'] ?? 0;
const soma = (t, f) => t.reduce((s, x) => s + f(x), 0);
const maior = ss.map((e) => e.args.selector_stats.selector_timings).sort((a, b) => soma(b, (x) => x.match_attempts) - soma(a, (x) => x.match_attempts))[0];
const cont = {};
for (const x of maior) cont[x.match_attempts] = (cont[x.match_attempts] || 0) + 1;
const topo = Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 5);
const E = +(process.argv[3] || topo[0][0]);
const uni = maior.filter((x) => x.match_attempts >= E);
const ultimo = (s) => {
  let d = 0;
  let u = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') d++;
    else if (c === ')' || c === ']') d--;
    else if (d === 0 && (c === ' ' || c === '>' || c === '+' || c === '~')) u = i + 1;
  }
  return s.slice(u).trim();
};
const tipo = (s) => {
  const r = ultimo(s);
  return r.startsWith(':is(') ? ':is(...) no fim' : r.startsWith(':where(') ? ':where(...) no fim' : r.startsWith('[') ? '[atributo] no fim' : r.startsWith('*') ? '* no fim' : r.startsWith('::') ? '::pseudo-elemento' : r.startsWith(':') ? ':pseudo-classe no fim' : /^[a-z]/i.test(r) ? 'tag' : r[0] === '.' ? '.classe' : r[0];
};
const g = {};
for (const x of uni) {
  const k = tipo(x.selector);
  (g[k] ??= { n: 0, us: 0, ex: [] }).n++;
  g[k].us += us(x);
  if (g[k].ex.length < 3) g[k].ex.push(x.selector.slice(0, 110));
}
const u = [...ult].sort((a, b) => b.dur - a.dur)[0];
const saida = {
  arquivo: arq,
  recalculos: ult.length,
  maiorRecalculo: { ms: +(u.dur / 1000).toFixed(1), elementos: u.args?.elementCount },
  noMaiorRecalculo: {
    seletoresComTentativa: maior.length,
    elementosTestados: E,
    distribuicao: topo.map(([a, n]) => `${n} seletores com ${a} tentativas`),
    tentadosEmTodoElemento: uni.length,
    tempoDeles_ms: +(soma(uni, us) / 1000).toFixed(1),
    tempoDeTodos_ms: +(soma(maior, us) / 1000).toFixed(1),
    casamentosDeles: soma(uni, (x) => x.match_count),
    tentativasDeles: soma(uni, (x) => x.match_attempts),
    porFormato: Object.entries(g).sort((a, b) => b[1].us - a[1].us).map(([k, v]) => ({ formato: k, seletores: v.n, ms: +(v.us / 1000).toFixed(1), exemplos: v.ex })),
  },
};
console.log(JSON.stringify(saida, null, 1));
fs.mkdirSync('dados', { recursive: true });
fs.writeFileSync('dados/seletores-' + arq.split('/').pop(), JSON.stringify(saida, null, 1));
