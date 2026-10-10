// Junta dados/*.json em tabelas Markdown (tabelas.md) e numa copia enxuta para o repositorio.
// uso: node resumo.mjs [pastaDeDestinoNoRepo]
import fs from 'fs';
import path from 'path';
const D = 'dados';
const ler = (f) => (fs.existsSync(path.join(D, f)) ? JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')) : null);
const out = [];
const p = (s = '') => out.push(s);
const v = (x) => (x == null ? '–' : typeof x === 'number' ? (Number.isInteger(x) ? String(x) : x.toFixed(1)) : String(x));
const tabela = (cab, linhas) => {
  p('| ' + cab.join(' | ') + ' |');
  p('|' + cab.map((_, i) => (i ? '---:' : '---')).join('|') + '|');
  for (const l of linhas) p('| ' + l.map(v).join(' | ') + ' |');
  p();
};

/* ---- 1. Carga ---- */
p('## Carga (mediana de 3; ms, salvo indicado)\n');
const cargas = [
  ['carga-cel-medio+cel-fraco+desktop+quest.json', ''],
  ['carga-reduz-cel-medio.json', ' (reduzir movimento)'],
  ['carga-desempenho-cel-medio.json', ' (Modo desempenho)'],
];
const lc = [];
for (const [f, suf] of cargas) {
  const d = ler(f);
  if (!d) continue;
  for (const [perfil, o] of Object.entries(d))
    for (const k of ['fria', 'quente']) {
      const m = o.mediana[k];
      lc.push([perfil + suf, k, m.ttfb, m.fcp, m.lcp, m.palco, m.tti, m.tbt, m.cls, m.maiorLt, m.pedidos, m.kB, m.jsDecodKB, m.script_ms, m.estilo_ms, m.layout_ms]);
    }
}
tabela(['perfil', 'carga', 'TTFB', 'FCP', 'LCP', 'tela montada', 'ate interagir', 'TBT', 'CLS', 'maior tarefa', 'pedidos', 'kB baixados', 'JS (kB descomprimido)', 'script', 'estilo', 'layout'], lc);

/* ---- 2. Navegar ---- */
const navs = fs.readdirSync(D).filter((f) => /^navegar-.*\.json$/.test(f) && !/teste/.test(f)).sort();
for (const f of navs) {
  const d = ler(f);
  p(`## Navegar: ${f.replace(/^navegar-?/, '').replace('.json', '')} (mediana de ${d.runs.length})\n`);
  for (const k of ['volta1', 'volta2']) {
    p(`**${k === 'volta1' ? '1a visita a cada tela (baixa os pedacos)' : '2a visita (pedacos em memoria)'}**\n`);
    tabela(
      ['troca', 'n', 'React troca', 'conteudo', 'pintou', 'assentou', 'INP', 'tarefas longas (n / soma / maior)', 'bloqueio', 'pior quadro', 'quadros >50', 'script', 'estilo', 'layout', 'baixou (n / kB)', 'JS kB', 'nos'],
      d.resumo[k].map((x) => [x.rotulo, x.n, x.troca, x.conteudo, x.pintou, x.assentou, x.inp, `${v(x.nLt)} / ${v(x.somaLt)} / ${v(x.maiorLt)}`, x.bloqueio, x.maxQuadro, x.acima50, x.script, x.estilo, x.layout, `${v(x.baixou)} / ${v(x.baixouKb)}`, x.jsKb, x.nos]),
    );
  }
}

/* ---- 3. Jogos ---- */
for (const f of fs.readdirSync(D).filter((f) => /^jogos-.*\.json$/.test(f) && !/teste/.test(f)).sort()) {
  const d = ler(f);
  p(`## Jogos: ${f.replace(/^jogos-?/, '').replace('.json', '')} (${d.runs.length} execucoes)\n`);
  tabela(
    ['passo', 'n', 'conteudo', 'pintou', 'assentou', 'INP (mediana)', 'INP (pior)', 'tarefas longas (soma / maior)', 'pior quadro', 'quadros >50', 'script', 'estilo', 'layout', 'nos'],
    d.resumo.filter((x) => x.conteudo !== undefined).map((x) => [x.rotulo, x.n, x.conteudo, x.pintou, x.assentou, x.inp, x.inpPior, `${v(x.somaLt)} / ${v(x.maiorLt)}`, x.maxQuadro, x.acima50, x.script, x.estilo, x.layout, x.nos]),
  );
  const arr = d.resumo.filter((x) => x.conteudo === undefined);
  if (arr.length) tabela(['arrasto', 'n', 'p95 do quadro', 'pior quadro', 'quadros >33', 'tarefas longas', 'script', 'estilo', 'layout'], arr.map((x) => [x.rotulo, x.n, x.p95, x.maxQuadro, x.acima33, x.somaLt, x.script, x.estilo, x.layout]));
}

/* ---- 4. Capturar ---- */
for (const f of fs.readdirSync(D).filter((f) => /^capturar-.*\.json$/.test(f) && !/teste/.test(f)).sort()) {
  const d = ler(f);
  p(`## Capturar: ${f.replace(/^capturar-?/, '').replace('.json', '')} (${d.runs.length} execucoes)\n`);
  tabela(
    ['passo', 'n', 'conteudo', 'pintou', 'assentou', 'INP', 'tarefas longas (soma / maior)', 'pior quadro', 'script', 'estilo', 'layout', 'nos'],
    d.resumo.map((x) => [x.rotulo, x.n, x.conteudo, x.pintou, x.assentou, x.inp, `${v(x.somaLt)} / ${v(x.maiorLt)}`, x.maxQuadro, x.script, x.estilo, x.layout, x.nos]),
  );
  if (d.falas) p(`Falas simuladas (${d.falas.n}): custo ate o 2o quadro: 1-10 = ${v(d.falas.primeiras10)} ms; meio = ${v(d.falas.meio)} ms; ultimas 10 = ${v(d.falas.ultimas10)} ms; pior = ${v(d.falas.pior)} ms. No total: script ${v(d.falas.script)} ms, estilo ${v(d.falas.estilo)} ms, layout ${v(d.falas.layout)} ms. Nos do DOM: ${d.falas.nos0} -> ${d.falas.nos1}.\n`);
}

/* ---- 5. Rolar ---- */
for (const f of fs.readdirSync(D).filter((f) => /^rolar-.*\.json$/.test(f) && !/teste/.test(f)).sort()) {
  const d = ler(f);
  p(`## Rolar: ${f.replace(/^rolar-?/, '').replace('.json', '')} (mediana de ${d.runs.length})\n`);
  tabela(
    ['tela', 'n', 'nos', 'quadros/s', 'quadros descartados', 'fio principal ocupado %', 'script ms/s', 'estilo ms/s', 'layout ms/s', 'pintura ms/s', 'recalculos', 'elementos por recalculo', 'tarefas longas', 'GPU (CPU ms/s)', 'compositor ms/s'],
    d.resumo.map((x) => [x.rotulo, x.n, x.nos, x.quadros_por_s, x.descartados, x.ocupacao_pct, x.script_por_s, x.estilo_por_s, x.layout_por_s, x.pintura_por_s, x.recalculos, x.els, x.nLt, x.gpu_cpu_por_s, x.compositor_por_s]),
  );
}

/* ---- 6. Parado ---- */
p('## Parado (trace de 10 s sem mexer; mediana de 3)\n');
const lp = [];
for (const f of fs.readdirSync(D).filter((f) => /^parado-.*\.json$/.test(f) && !/teste/.test(f)).sort()) {
  const d = ler(f);
  const m = d.mediana;
  const trab = d.runs[0]?.fios?.['pagina/DedicatedWorker thread']?.cpu_por_s ?? 0;
  lp.push([f.replace(/^parado-?/, '').replace('.json', ''), d.runs.length, m.ocupacao_pct, m.principal_parede_ms_por_s, m.principal_cpu_ms_por_s, m.script_por_s, m.estilo_por_s, m.pintura_por_s, m.rAF_por_s, m.recalculos_por_s, m.elementos_por_recalculo, m.pinturas_por_s, m.quadros_por_s, m.gpu_cpu_ms_por_s, m.compositor_cpu_ms_por_s, trab]);
}
tabela(['variante', 'n', 'fio principal ocupado %', 'fio principal ms/s (relogio, CPU limitada)', 'fio principal ms/s (CPU real da maquina)', 'script ms/s', 'estilo ms/s', 'pintura ms/s', 'rAF/s', 'recalculos/s', 'elementos por recalculo', 'pinturas/s', 'quadros/s', 'processo da GPU ms/s (sem limite)', 'compositor ms/s (sem limite)', 'worker das particulas ms/s (sem limite)'], lp);

fs.writeFileSync('tabelas.md', out.join('\n'));
console.log('tabelas.md', out.length, 'linhas');

/* ---- copia enxuta para o repositorio ---- */
const destino = process.argv[2];
if (destino) {
  fs.mkdirSync(path.join(destino, 'dados'), { recursive: true });
  fs.mkdirSync(path.join(destino, 'scripts'), { recursive: true });
  let bytes = 0;
  for (const f of fs.readdirSync(D)) {
    if (!f.endsWith('.json') || /teste/.test(f)) continue;
    const d = ler(f);
    const enxugar = (x) => {
      if (Array.isArray(x)) return x.map(enxugar);
      if (x && typeof x === 'object') {
        const o = {};
        for (const [k, val] of Object.entries(x)) {
          if (['res', 'ev', 'lt', 'frames', 'custos', 'urls', 'lcpTodos'].includes(k) && Array.isArray(val)) continue;
          o[k] = enxugar(val);
        }
        return o;
      }
      return typeof x === 'number' && !Number.isInteger(x) ? Math.round(x * 100) / 100 : x;
    };
    const txt = JSON.stringify(enxugar(d));
    fs.writeFileSync(path.join(destino, 'dados', f), txt);
    bytes += txt.length;
  }
  for (const f of fs.readdirSync('.')) if (/\.(mjs|sh|txt)$/.test(f) && !/^(exp|sonda|gpu|hz)/.test(f) && !/^log-/.test(f)) fs.copyFileSync(f, path.join(destino, 'scripts', f));
  fs.copyFileSync('tabelas.md', path.join(destino, 'tabelas.md'));
  console.log('copiado para', destino, Math.round(bytes / 1024), 'kB de dados');
}
