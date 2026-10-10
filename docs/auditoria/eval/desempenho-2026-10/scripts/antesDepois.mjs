// Tabelas ANTES x DEPOIS a partir de <pasta>/i-antes/dados e <pasta>/i-depois/dados, gravados por intercalado.sh (medianas de 3).
// uso: node antesDepois.mjs <pasta>
import fs from 'fs';
import path from 'path';
const P = process.argv[2];
const ler = (lado, nome) => {
  const f = path.join(P, `i-${lado}/dados/${nome}`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};
const r0 = (x) => (x == null ? '–' : String(Math.round(x)));
const delta = (a, d) => {
  if (a == null || d == null || !a) return '–';
  const p = ((d - a) / a) * 100;
  return Math.abs(p) < 10 ? `${p >= 0 ? '+' : ''}${p.toFixed(0)}% (ruído)` : `${p >= 0 ? '+' : ''}${p.toFixed(0)}%`;
};
const faixa = (runs, f) => {
  const v = runs.map(f).filter((x) => x != null).sort((a, b) => a - b);
  return v.length ? `${r0(v[0])}–${r0(v[v.length - 1])}` : '–';
};
const out = [];
const PERF = { 'cel-medio': 'celular médio', 'cel-fraco': 'celular fraco', desktop: 'computador' };

out.push('### Tela parada (10 s de trace, mediana de 3; entre parênteses, o menor e o maior das 3)\n');
out.push('| Tela | Perfil | Condição | Fio principal ms/s: antes | depois | Δ | rAF/s: antes → depois | Recálculos/s | Pinturas/s | GPU ms/s |');
out.push('|---|---|---|---:|---:|---:|---:|---:|---:|---:|');
const COND = { nada: 'sem sensor', giroquieto: 'sensor, aparelho parado', giro: 'sensor, aparelho em movimento', mouse: 'mouse em movimento' };
for (const [suf, tela] of [['', 'Início'], ['-desempenho', 'Início, Modo desempenho'], ['-saguao', 'Jogar (saguão)']])
  for (const perfil of ['cel-medio', 'cel-fraco', 'desktop'])
    for (const est of ['nada', 'giroquieto', 'giro', 'mouse']) {
      const nome = `parado${suf}-${perfil}-${est}.json`;
      const a = ler('antes', nome), d = ler('depois', nome);
      if (!a && !d) continue;
      const ms = (x) => x?.mediana.principal_parede_ms_por_s;
      const fx = (x) => (x ? ` (${faixa(x.runs, (r) => r.principal.tarefas_parede_ms / (r.janela_ms / 1000))})` : '');
      const par = (k) => `${r0(a?.mediana[k])} → ${r0(d?.mediana[k])}`;
      out.push(`| ${tela} | ${PERF[perfil]} | ${perfil === 'desktop' && est === 'nada' ? 'mouse parado' : COND[est]} | ${r0(ms(a))}${fx(a)} | ${r0(ms(d))}${fx(d)} | ${delta(ms(a), ms(d))} | ${par('rAF_por_s')} | ${par('recalculos_por_s')} | ${par('pinturas_por_s')} | ${par('gpu_cpu_ms_por_s')} |`);
    }

for (const [suf, titulo] of [['', 'Navegar pelo menu (medidor de `navegar.mjs`; mediana de 3). Com o navegador ocioso antes do toque'], ['-semocioso', 'Navegar pelo menu SEM o ocioso (quem toca logo depois da carga: só o pedido no toque)']]) {
  out.push(`\n### ${titulo}\n`);
  out.push('| Perfil | Troca | 1ª visita, conteúdo: antes | depois | Δ | baixou no toque (arq.): antes → depois | INP 1ª: antes → depois | 2ª visita, conteúdo: antes | depois | Δ | assentou 2ª: antes → depois |');
  out.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const perfil of ['cel-medio', 'cel-fraco', 'desktop']) {
    const a = ler('antes', `navegar${suf}-${perfil}.json`), d = ler('depois', `navegar${suf}-${perfil}.json`);
    if (!a || !d) continue;
    a.resumo.volta1.forEach((x, i) => {
      const y = d.resumo.volta1[i], x2 = a.resumo.volta2[i], y2 = d.resumo.volta2[i];
      if (!y) return;
      out.push(`| ${PERF[perfil]} | ${x.rotulo} | ${r0(x.conteudo)} | ${r0(y.conteudo)} | ${delta(x.conteudo, y.conteudo)} | ${r0(x.baixou)} → ${r0(y.baixou)} | ${r0(x.inp)} → ${r0(y.inp)} | ${r0(x2?.conteudo)} | ${r0(y2?.conteudo)} | ${delta(x2?.conteudo, y2?.conteudo)} | ${r0(x2?.assentou)} → ${r0(y2?.assentou)} |`);
    });
  }
}

out.push('\n### Interações, só com trace (sem medidor na página; mediana de 3)\n');
out.push('| Perfil | Interação | Tarefas no fio principal ms: antes | depois | Δ | Quadros feitos no fio principal | Descartados | INP | Maior tarefa ms | Layout ms | Estilo ms |');
out.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const perfil of ['cel-medio', 'cel-fraco', 'desktop']) {
  const a = ler('antes', `tracoNav-base-${perfil}.json`), d = ler('depois', `tracoNav-base-${perfil}.json`);
  if (!a || !d) continue;
  for (const rot of Object.keys(a.mediana)) {
    const x = a.mediana[rot], y = d.mediana[rot];
    if (!y) continue;
    const par = (k) => `${r0(x[k])} → ${r0(y[k])}`;
    out.push(`| ${PERF[perfil]} | ${rot} | ${r0(x.tarefas_ms)} | ${r0(y.tarefas_ms)} | ${delta(x.tarefas_ms, y.tarefas_ms)} | ${par('quadrosDoFioPrincipal')} | ${par('descartados')} | ${par('inp')} | ${par('maiorTarefa_ms')} | ${par('layout_ms')} | ${par('estilo_ms')} |`);
  }
}
const ca = fs.existsSync(path.join(P, 'i-antes/dados')) ? fs.readdirSync(path.join(P, 'i-antes/dados')).find((f) => f.startsWith('carga')) : null;
if (ca) {
  const a = ler('antes', ca), d = ler('depois', ca);
  out.push('\n### Carga (celular médio, mediana de 3)\n');
  const A = a?.['cel-medio']?.mediana, D = d?.['cel-medio']?.mediana;
  out.push('| Carga | Medida | antes | depois | Δ |');
  out.push('|---|---|---:|---:|---:|');
  for (const k of ['fria', 'quente'])
    for (const [m, rot] of [['fcp', 'FCP ms'], ['lcp', 'LCP ms'], ['tti', 'até interagir ms'], ['tbt', 'TBT ms'], ['maiorLt', 'maior tarefa longa ms'], ['cls', 'CLS'], ['pedidos', 'pedidos (até a rede sossegar)'], ['kB', 'kB baixados (até a rede sossegar)'], ['jsDecodKB', 'JS descomprimido kB'], ['tarefa_ms', 'fio principal ms (até a rede sossegar)'], ['heapMb', 'heap MB']])
      out.push(`| ${k} | ${rot} | ${A?.[k]?.[m] ?? '–'} | ${D?.[k]?.[m] ?? '–'} | ${m === 'cls' ? '–' : delta(A?.[k]?.[m], D?.[k]?.[m])} |`);
}
console.log(out.join('\n'));
