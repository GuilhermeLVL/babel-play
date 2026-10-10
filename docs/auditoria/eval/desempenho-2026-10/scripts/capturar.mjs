// Jornada 4: Capturar (tela pronta), folhas e falas simuladas (window.__simFalas, que vai no pacote publicado).
// uso: node capturar.mjs <perfil> <N> <opcoesJSON> <sufixo>
import { abrir, URL0, sossegar, mediana, salvar, r0, r1, deltaMetricas } from './lib.mjs';
import { interagir, linha } from './medir.mjs';
const nome = process.argv[2] || 'cel-medio';
const N = +(process.argv[3] || 3);
const extra = process.argv[4] ? JSON.parse(process.argv[4]) : {};
const suf = process.argv[5] || '';
const ABERTO = 'dialog[open]:not([aria-hidden="true"]), .q-mais-fundo:not(.px-saindo)';
const FECHAR = 'dialog[open]:not([aria-hidden="true"]) button[aria-label*="Fechar"], .q-mais-fundo:not(.px-saindo) button[aria-label*="Fechar"], dialog[open]:not([aria-hidden="true"]) button:has-text("Fechar"), .q-mais-fundo:not(.px-saindo) button:has-text("Fechar"), dialog[open]:not([aria-hidden="true"]) button:has-text("Entendi")';
const FOLHAS = [
  ['Ajuda (Como isto funciona)', '.px-tela button[aria-label="Ajuda"]'],
  ['Ajustes da captura', '.px-tela button[aria-label="Ajustes da captura"]'],
  ['Onde a fala e processada', '.px-tela [data-testid="marca-de-onde"]'],
];
const NFALAS = 200;
const runs = [];
for (let i = 0; i < N; i++) {
  const s = await abrir(nome, extra);
  const { page } = s;
  const passos = [];
  let falas = null;
  const passo = async (rot, alvo, opc) => {
    try {
      const x = await interagir(s, rot, alvo, opc);
      passos.push(x);
      console.log(`${nome} r${i} ${linha(x)}`);
      return x;
    } catch (e) {
      console.log(`${nome} r${i} ${rot} ERRO ${String(e).slice(0, 220)}`);
      passos.push({ rotulo: rot, erro: String(e).slice(0, 220) });
      await page.keyboard.press('Escape').catch(() => {});
      return null;
    }
  };
  try {
    await page.goto(URL0 + '/', { waitUntil: 'load', timeout: 90000 });
    await sossegar(s);
    await passo('Capturar: abrir a tela (1a vez)', '.q-trilho .q-item[data-px-rota="capture"]', { modo: 'tela' });
    await sossegar(s, 1500, 20000);
    for (const [rot, alvo] of FOLHAS) {
      if (!(await page.locator(alvo).first().isVisible().catch(() => false))) {
        console.log(`${nome} r${i} ${rot}: gatilho nao visivel`);
        continue;
      }
      for (const vez of [1, 2]) {
        const a = await passo(`abrir ${rot} (${vez}a)`, alvo, { modo: 'aparece', seletor: ABERTO });
        await page.waitForTimeout(500);
        if (!a) continue;
        if (await page.locator(FECHAR).first().isVisible().catch(() => false)) await passo(`fechar ${rot} (${vez}a)`, FECHAR, { modo: 'some', seletor: ABERTO });
        else {
          console.log(`${nome} r${i} ${rot}: sem botao de fechar; Escape`);
          await page.keyboard.press('Escape');
        }
        await page.waitForTimeout(900);
      }
    }
    /* falas simuladas: custo de cada fala na tela, do 1o ao 80o */
    const tem = await page.evaluate(() => typeof window.__simFalas === 'function');
    if (tem) {
      const m0 = await s.metricas();
      const nos0 = await page.evaluate(() => document.querySelectorAll('*').length);
      const custos = [];
      for (let k = 0; k < NFALAS; k++) {
        const c = await page.evaluate(async (k) => {
          const t = performance.now();
          const lt0 = window.__p.lt.length;
          window.__simFalas([`This is simulated sentence number ${k + 1} with a few more words to wrap the line`]);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          return { ms: performance.now() - t, lt: window.__p.lt.length - lt0 };
        }, k);
        custos.push(c.ms);
        await page.waitForTimeout(60);
      }
      const m1 = await s.metricas();
      const fim = await page.evaluate(() => ({ nos: document.querySelectorAll('*').length, lt: window.__p.lt.slice(-200).length, visiveis: document.querySelectorAll('[data-segment-id], .legenda, .fala, [data-fala]').length, texto: document.body.innerText.includes('simulated sentence number 200') }));
      const med = (a) => r1(mediana(a));
      falas = { n: NFALAS, primeiras10: med(custos.slice(0, 10)), meio: med(custos.slice(35, 45)), ultimas10: med(custos.slice(-10)), pior: r1(Math.max(...custos)), cpu: deltaMetricas(m0, m1), nos0, nos1: fim.nos, apareceu: fim.texto, custos: custos.map(r1) };
      console.log(`${nome} r${i} FALAS ${JSON.stringify({ ...falas, custos: undefined })}`);
      await page.screenshot({ path: `captura-falas-${nome}.png` });
    } else console.log(`${nome} r${i} sem __simFalas`);
  } catch (e) {
    console.log(nome, i, 'ERRO', String(e).slice(0, 300));
  }
  runs.push({ passos, falas });
  await s.browser.close();
}
const por = {};
for (const r of runs) for (const x of r.passos) if (!x.erro) (por[x.rotulo] ??= []).push(x);
const resumo = Object.entries(por).map(([rot, xs]) => {
  const m = (f) => mediana(xs.map(f));
  return { rotulo: rot, n: xs.length, conteudo: r0(m((x) => x.conteudo)), pintou: r0(m((x) => x.pintou)), assentou: r0(m((x) => x.assentou)), inp: r0(m((x) => x.inp)), proc: r0(m((x) => x.proc)), somaLt: r0(m((x) => x.somaLt)), maiorLt: r0(m((x) => x.maiorLt)), fps: r1(m((x) => x.q.fps)), p95: r1(m((x) => x.q.p95)), maxQuadro: r1(m((x) => x.q.max)), acima50: m((x) => x.q.acima50), script: m((x) => x.cpu.script_ms), estilo: m((x) => x.cpu.estilo_ms), layout: m((x) => x.cpu.layout_ms), tarefa: m((x) => x.cpu.tarefa_ms), baixouKb: r1(m((x) => x.baixouKb)), jsKb: r1(m((x) => x.jsKb)), nos: m((x) => x.nos) };
});
const fs_ = runs.map((r) => r.falas).filter(Boolean);
const falasMed = fs_.length ? { n: NFALAS, primeiras10: mediana(fs_.map((f) => f.primeiras10)), meio: mediana(fs_.map((f) => f.meio)), ultimas10: mediana(fs_.map((f) => f.ultimas10)), pior: mediana(fs_.map((f) => f.pior)), script: mediana(fs_.map((f) => f.cpu.script_ms)), estilo: mediana(fs_.map((f) => f.cpu.estilo_ms)), layout: mediana(fs_.map((f) => f.cpu.layout_ms)), nos0: fs_[0].nos0, nos1: fs_[0].nos1, apareceu: fs_[0].apareceu } : null;
for (const l of resumo) console.log('MEDIANA', nome, JSON.stringify(l));
console.log('MEDIANA', nome, 'FALAS', JSON.stringify(falasMed));
salvar(`capturar${suf}-${nome}.json`, { resumo, falas: falasMed, runs });
console.log('FIM');
