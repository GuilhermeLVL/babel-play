// Entrar no Jogar, fim de rodada e sair da rodada, com TRACE (sem laco de quadros do medidor), no build
// de producao local com conta semeada (3.000 cartoes). Mesmo metodo de `tracoNav.mjs` da auditoria.
// uso: URL0=http://127.0.0.1:4310 node jogar.mjs <antes|depois> <perfil> <N> <trilha|gravacoes> [sufixo]
import fs from 'fs';
import { subir } from './ambiente.mjs';
import { abrir, URL0, sossegar, salvar, mediana, r0, r1 } from './lib.mjs';
import { gravar, CATS_BASE } from './traco.mjs';
const build = process.argv[2] || 'antes';
const nome = process.argv[3] || 'cel-medio';
const N = +(process.argv[4] || 3);
const fonte = process.argv[5] || 'trilha';
const suf = process.argv[6] || '';
const guardado = JSON.parse(fs.readFileSync(new URL('./storage.json', import.meta.url), 'utf8'));
const amb = await subir(build, +new URL(URL0).port);
const runs = [];
const textos = [];
for (let i = 0; i < N; i++) {
  const s = await abrir(nome, { storage: { ...guardado, 'babel.fonte_da_pratica': JSON.stringify({ origem: fonte, escopo: 'todas' }) } });
  const { page } = s;
  const toca = async (sel, opc = {}) => {
    const el = page.locator(sel).first();
    if (s.P.toque) await el.tap({ timeout: 15000, ...opc });
    else await el.click({ timeout: 15000, ...opc });
  };
  const saida = {};
  const medir = async (rot, fazer, espera = 3200) => {
    const ev0 = await page.evaluate(() => window.__p.ev.length);
    const lt0 = await page.evaluate(() => window.__p.lt.length);
    const m0 = await s.metricas();
    const r = await gravar(s, `x-9.json`, async () => {
      await fazer();
      await page.waitForTimeout(espera);
    }, CATS_BASE);
    const m1 = await s.metricas();
    await page.waitForTimeout(200);
    const obs = await page.evaluate(([n, l]) => ({ inp: Math.max(0, ...window.__p.ev.slice(n).filter((e) => e.id).map((e) => e.d)), lt: window.__p.lt.slice(l).map((x) => x.d) }), [ev0, lt0]);
    saida[rot] = {
      inp: obs.inp,
      tarefas_ms: r.principal.tarefas_parede_ms,
      tarefasLongas: r.principal.tarefasLongas,
      somaLongas_ms: r0(obs.lt.reduce((a, b) => a + b, 0)),
      bloqueio_ms: r.principal.bloqueio_ms,
      maiorTarefa_ms: r.principal.maiorTarefa_ms,
      script_ms: r.principal.grupos_ms.script,
      estilo_ms: r.principal.grupos_ms.estilo,
      layout_ms: r.principal.grupos_ms.layout,
      pintura_ms: r.principal.grupos_ms.pintura,
      desenhados: r.quadros.desenhados,
      descartados: r.quadros.descartados,
      metricas: { script: r0((m1.ScriptDuration - m0.ScriptDuration) * 1000), layout: r0((m1.LayoutDuration - m0.LayoutDuration) * 1000), tarefa: r0((m1.TaskDuration - m0.TaskDuration) * 1000) },
      funcoes: r.funcoes.slice(0, 6),
    };
    const x = saida[rot];
    console.log(`${build} ${nome} ${fonte} r${i} ${rot.padEnd(30)} inp=${x.inp} tarefas=${x.tarefas_ms} longas=${x.tarefasLongas}/${x.somaLongas_ms} bloqueio=${x.bloqueio_ms} maior=${x.maiorTarefa_ms} script=${x.script_ms} estilo=${x.estilo_ms} layout=${x.layout_ms} pintura=${x.pintura_ms} desenhados=${x.desenhados} descartados=${x.descartados}`);
  };
      const ABA_JOGOS = s.P.toque ? '[role="tab"]:has-text("Jogos")' : '.q-trilho .q-item[aria-label="Jogar"]';
  const ABA_CARTOES = s.P.toque ? '[role="tab"]:has-text("Cartões")' : '.q-trilho .q-item[data-px-rota="hub"]';
    const fecharExplicacao = async () => {
    await page.waitForTimeout(600);
    if (await page.locator('.pj-link').count()) {
      await toca('.pj-link');
      await page.waitForTimeout(1200);
    }
  };
  const saguao = () => page.evaluate(() => (document.querySelector('.px-tela')?.innerText ?? '').replace(/\s+/g, ' ').trim());
  try {
    await page.goto(URL0 + '/', { waitUntil: 'load', timeout: 90000 });
    await sossegar(s);
    /* aquece: baixa os pedacos de Cartoes e do Jogar */
    if (s.P.toque) await toca('.q-trilho .q-item[data-px-rota="cartoes"]');
    await page.waitForTimeout(3500);
    await toca(ABA_JOGOS);
    await page.waitForTimeout(5000);
    await sossegar(s, 1500, 20000);
    await toca(ABA_CARTOES);
    await page.waitForTimeout(3500);
    await sossegar(s, 1500, 20000);
    await medir('entrar no Jogar', () => toca(ABA_JOGOS));
    await sossegar(s, 1000, 15000);
    const t1 = await saguao();
    await medir('abrir Memoria', () => toca('button.q-tile:has-text("Memória")'));
    await fecharExplicacao();
    await page.waitForTimeout(4500); /* a contagem 3-2-1 */
    const pares = await page.evaluate(() => {
      const m = {};
      [...document.querySelectorAll('.carta')].forEach((c, k) => (m[c.dataset.par] ??= []).push(k));
      return Object.values(m);
    });
    if (i === 0) console.log('PARES', JSON.stringify(pares), await page.evaluate(() => document.querySelector('.carta')?.outerHTML.slice(0, 300)));
    let k = 0;
    for (const [a, b] of pares) {
      k++;
      await toca(`.carta >> nth=${a}`);
      await page.waitForTimeout(700);
      if (k === pares.length) await medir('ultimo par (fim da rodada)', () => toca(`.carta >> nth=${b}`), 4000);
      else {
        await toca(`.carta >> nth=${b}`);
        await page.waitForTimeout(1300);
      }
    }
    const botoes = await page.evaluate(() => [...document.querySelectorAll('.px-tela button')].filter((b) => b.offsetParent).map((b) => (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 30)));
    if (i === 0) console.log('FIM botoes', JSON.stringify(botoes));
    for (let q = 0; q < 6 && (await page.locator('button:has-text("Resgatar e continuar")').count()); q++) {
      await toca('button:has-text("Resgatar e continuar")', { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1200);
    }
    const VOLTA = '.px-tela button:has-text("Voltar aos jogos"), .px-tela button:has-text("Outros jogos"), .px-tela button:has-text("Sair")';
    if (await page.locator(VOLTA).count()) await medir('do fim da rodada ao saguao', () => toca(VOLTA));
    else {
      await toca('.px-tela button.voltar');
      await page.waitForTimeout(3000);
    }
    await sossegar(s, 1000, 15000);
    const t2 = await saguao();
    /* outra rodada, e sai no meio */
    await toca('button.q-tile:has-text("Memória")');
    await page.waitForTimeout(2500);
    await fecharExplicacao();
    await page.waitForTimeout(4500);
    await toca('.carta >> nth=0');
    await page.waitForTimeout(900);
    await toca('.px-tela button.voltar');
    await page.waitForTimeout(1200);
    const SAIR = 'dialog[open] button:has-text("Sair da rodada"), button:has-text("Sair da rodada")';
    if (await page.locator(SAIR).count()) await medir('sair da rodada', () => toca(SAIR));
    else console.log('sem dialogo de sair:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 24)))));
    await sossegar(s, 1000, 15000);
    const t3 = await saguao();
    textos.push({ entrada: t1, depoisDoFim: t2, depoisDeSair: t3 });
  } catch (e) {
    console.log('ERRO', String(e).slice(0, 500));
    await page.screenshot({ path: `erro-jogar-${build}-${nome}.png` }).catch(() => {});
  }
  runs.push(saida);
  await s.browser.close();
}
amb.parar();
const rotulos = [...new Set(runs.flatMap((r) => Object.keys(r)))];
const med = {};
for (const rot of rotulos) {
  const xs = runs.map((r) => r[rot]).filter(Boolean);
  const m = (f) => mediana(xs.map(f));
  med[rot] = { n: xs.length, inp: r0(m((x) => x.inp)), tarefas_ms: r0(m((x) => x.tarefas_ms)), tarefasLongas: m((x) => x.tarefasLongas), somaLongas_ms: r0(m((x) => x.somaLongas_ms)), bloqueio_ms: r0(m((x) => x.bloqueio_ms)), maiorTarefa_ms: r0(m((x) => x.maiorTarefa_ms)), script_ms: r0(m((x) => x.script_ms)), estilo_ms: r0(m((x) => x.estilo_ms)), layout_ms: r0(m((x) => x.layout_ms)), pintura_ms: r0(m((x) => x.pintura_ms)), desenhados: m((x) => x.desenhados), descartados: m((x) => x.descartados) };
  console.log('MEDIANA', build, nome, fonte, rot, JSON.stringify(med[rot]));
}
salvar(`jogar-${build}${suf}-${fonte}-${nome}.json`, { mediana: med, runs, textos });
console.log('FIM');
process.exit(0);
