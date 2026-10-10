// Trace de interacoes SEM laco de quadros do medidor (o medidor de `medir.mjs` pede um quadro por vsync e,
// com isso, faz o fio principal acompanhar toda animacao; aqui quem pede quadro e so o app).
// uso: node tracoNav.mjs <perfil> <opcoesJSON> <sufixo> [estilo|base] [N]
//   estilo: 1 execucao, com estatistica de seletor e motivo de invalidacao (trace pesado, fica em disco)
//   base:   N execucoes, mediana, trace fora do disco
import { abrir, URL0, sossegar, salvar, mediana, r0, r1 } from './lib.mjs';
import { gravar, estilos, CATS_ESTILO, CATS_BASE } from './traco.mjs';
const nome = process.argv[2] || 'cel-medio';
const extra = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const suf = process.argv[4] || '';
const comEstilo = (process.argv[5] || 'estilo') === 'estilo';
const N = comEstilo ? 1 : +(process.argv[6] || 3);
const JOGAR = '.q-trilho .q-item[data-px-rota="play"], .q-trilho .q-item[data-px-tambem="play"]';
const runs = [];
let aplicadas = [];
for (let i = 0; i < N; i++) {
  const s = await abrir(nome, { ...extra, storage: { 'babel.fonte_da_pratica': '{"origem":"trilha","escopo":"todas"}', 'babel.praticar': 'play' } });
  const { page } = s;
  const toca = async (sel) => {
    const el = page.locator(sel).first();
    if (s.P.toque) await el.tap({ timeout: 15000 });
    else await el.click({ timeout: 15000 });
  };
  const saida = {};
  const medir = async (rot, fazer, espera = 2600) => {
    /* sem estatistica de estilo o trace nao fica em disco (o sufixo -9 faz `gravar` pular a gravacao) */
    const arq = `nav${suf}-${nome}-${rot.replace(/\W+/g, '')}${comEstilo ? '' : '-9'}.json`;
    const ev0 = await page.evaluate(() => window.__p.ev.length);
    const m0 = await s.metricas();
    const r = await gravar(
      s,
      arq,
      async () => {
        await fazer();
        await page.waitForTimeout(espera);
      },
      comEstilo ? CATS_ESTILO : CATS_BASE,
    );
    const m1 = await s.metricas();
    await page.waitForTimeout(200);
    const inp = await page.evaluate((n) => Math.max(0, ...window.__p.ev.slice(n).filter((e) => e.id).map((e) => e.d)), ev0);
    const e = comEstilo ? estilos(arq) : null;
    const gpu = Object.entries(r.fios).filter(([k]) => /GPU|Gpu/.test(k)).reduce((a, [, v]) => a + v.cpu_ms, 0);
    saida[rot] = {
      janela_ms: r.janela_ms,
      inp,
      ocupacao_pct: r.principal.ocupacao_pct,
      tarefas_ms: r.principal.tarefas_parede_ms,
      tarefasLongas: r.principal.tarefasLongas,
      bloqueio_ms: r.principal.bloqueio_ms,
      maiorTarefa_ms: r.principal.maiorTarefa_ms,
      script_ms: r.principal.grupos_ms.script,
      estilo_ms: r.principal.grupos_ms.estilo,
      layout_ms: r.principal.grupos_ms.layout,
      pintura_ms: r.principal.grupos_ms.pintura,
      recalculos: r.estilo.recalculos,
      elementos_medio: r.estilo.elementos_medio,
      beginMain: r.quadros.beginMain,
      rAF: r.quadros.rAF,
      desenhados: r.quadros.desenhados,
      descartados: r.quadros.descartados,
      pinturas: r.quadros.pinturas,
      gpu_cpu_ms: r0(gpu),
      compositor_cpu_ms: r.fios['pagina/Compositor']?.cpu_ms ?? 0,
      metricas: { script: r0((m1.ScriptDuration - m0.ScriptDuration) * 1000), estilo: r0((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000), layout: r0((m1.LayoutDuration - m0.LayoutDuration) * 1000), tarefa: r0((m1.TaskDuration - m0.TaskDuration) * 1000) },
      funcoes: r.funcoes.slice(0, 8),
      eventos: r.eventos.slice(0, 12),
      estilos: e,
    };
    const x = saida[rot];
    console.log(`${nome}${suf} r${i} ${rot.padEnd(38)} inp=${x.inp} ocup=${x.ocupacao_pct}% tarefas=${x.tarefas_ms} longas=${x.tarefasLongas} bloqueio=${x.bloqueio_ms} maior=${x.maiorTarefa_ms} script=${x.script_ms} estilo=${x.estilo_ms} layout=${x.layout_ms} pintura=${x.pintura_ms} recalc=${x.recalculos} quadrosMain=${x.beginMain} rAF=${x.rAF} desenhados=${x.desenhados} descartados=${x.descartados} gpu=${x.gpu_cpu_ms}`);
    if (comEstilo) {
      console.log('funcoes', r.funcoes.slice(0, 10).join(' | '));
      console.log('eventos', r.eventos.slice(0, 14).join(' | '));
      console.log(`seletores: total ${e.seletores_total_ms} ms em ${e.nSeletores} seletores; com :has() ${e.comHas_ms} ms`);
      for (const t of e.topo.slice(0, 18)) console.log(`   ${t.ms} ms  tent=${t.tentativas} casou=${t.casou}  ${t.seletor}`);
      console.log('motivos:', e.motivos.slice(0, 16).join('\n   '));
    }
  };
  try {
    await page.goto(URL0 + '/', { waitUntil: 'load', timeout: 90000 });
    await sossegar(s);
    /* aquece: baixa os pedacos do Jogar e volta */
    await toca(JOGAR);
    await page.waitForTimeout(4000);
    await sossegar(s, 1500, 20000);
    await toca('.q-trilho .q-item[data-px-rota="hub"]');
    await page.waitForTimeout(3000);
    await sossegar(s, 1500, 20000);
    await medir('abrir Mais', () => toca('.q-trilho .q-mais-botao'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    await medir('ir para Jogar (pedacos ja baixados)', () => toca(JOGAR), 3200);
    await medir('abrir Memoria', () => toca('button.q-tile:has-text("Memória")'), 3200);
    if (await page.locator('.pj-link').count()) {
      await toca('.pj-link');
      await page.waitForTimeout(1200);
    }
    await medir('virar uma carta', () => toca('.carta >> nth=0'), 1500);
  } catch (e) {
    console.log('ERRO', String(e).slice(0, 400));
  }
  aplicadas = s.aplicadas;
  runs.push(saida);
  await s.browser.close();
}
const rotulos = Object.keys(runs[0] ?? {});
const med = {};
for (const rot of rotulos) {
  const xs = runs.map((r) => r[rot]).filter(Boolean);
  const m = (f) => mediana(xs.map(f));
  med[rot] = { n: xs.length, inp: r0(m((x) => x.inp)), ocupacao_pct: r1(m((x) => x.ocupacao_pct)), tarefas_ms: r0(m((x) => x.tarefas_ms)), tarefasLongas: m((x) => x.tarefasLongas), bloqueio_ms: r0(m((x) => x.bloqueio_ms)), maiorTarefa_ms: r0(m((x) => x.maiorTarefa_ms)), script_ms: r0(m((x) => x.script_ms)), estilo_ms: r0(m((x) => x.estilo_ms)), layout_ms: r0(m((x) => x.layout_ms)), pintura_ms: r0(m((x) => x.pintura_ms)), recalculos: m((x) => x.recalculos), quadrosDoFioPrincipal: m((x) => x.beginMain), desenhados: m((x) => x.desenhados), descartados: m((x) => x.descartados), gpu_cpu_ms: m((x) => x.gpu_cpu_ms), compositor_cpu_ms: r0(m((x) => x.compositor_cpu_ms)), janela_ms: r0(m((x) => x.janela_ms)) };
  console.log('MEDIANA', nome + suf, rot, JSON.stringify(med[rot]));
}
salvar(`tracoNav${suf}-${nome}.json`, { mediana: med, aplicadas, runs });
console.log('FIM');
