// 200 falas simuladas na captura (`window.__simFalas`, o mesmo gancho dos testes e da auditoria):
// custo de cada fala ate o 2o quadro, nos do DOM e tempo de script/estilo/layout no total.
// uso: URL0=http://127.0.0.1:4313 node captura.mjs <antes|depois> <perfil> <N> [sufixo]
import fs from 'fs';
import { subir } from './ambiente.mjs';
import { abrir, URL0, sossegar, mediana, salvar, r1, deltaMetricas } from './lib.mjs';
const build = process.argv[2] || 'antes';
const nome = process.argv[3] || 'cel-medio';
const N = +(process.argv[4] || 3);
const suf = process.argv[5] || '';
const NFALAS = 200;
const guardado = JSON.parse(fs.readFileSync(new URL('./storage.json', import.meta.url), 'utf8'));
const amb = await subir(build, +new URL(URL0).port);
const runs = [];
for (let i = 0; i < N; i++) {
  const s = await abrir(nome, { storage: guardado });
  const { page } = s;
  let falas = null;
  try {
    await page.goto(URL0 + '/', { waitUntil: 'load', timeout: 90000 });
    await sossegar(s);
    const item = page.locator('.q-trilho .q-item[data-px-rota="capture"]').first();
    if (s.P.toque) await item.tap();
    else await item.click();
    await page.waitForTimeout(4000);
    await sossegar(s, 1500, 20000);
    await page.waitForFunction(() => typeof window.__simFalas === 'function', null, { timeout: 20000 });
    const m0 = await s.metricas();
    const nos0 = await page.evaluate(() => document.querySelectorAll('*').length);
    const custos = [];
    for (let k = 0; k < NFALAS; k++) {
      const c = await page.evaluate(async (k) => {
        const t = performance.now();
        window.__simFalas([`This is simulated sentence number ${k + 1} with a few more words to wrap the line`]);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return performance.now() - t;
      }, k);
      custos.push(c);
      await page.waitForTimeout(60);
    }
    const m1 = await s.metricas();
    const fim = await page.evaluate(() => {
      const h = document.querySelector('.q-historico');
      return {
        nos: document.querySelectorAll('*').length,
        linhas: document.querySelectorAll('.q-linha-da-fala').length,
        apareceu: document.body.innerText.includes('simulated sentence number 200'),
        noFim: h ? Math.round(h.scrollHeight - h.scrollTop - h.clientHeight) : null,
        altura: h ? h.scrollHeight : null,
      };
    });
    const med = (a) => r1(mediana(a));
    falas = { primeiras10: med(custos.slice(0, 10)), meio: med(custos.slice(95, 105)), ultimas10: med(custos.slice(-10)), pior: r1(Math.max(...custos)), cpu: deltaMetricas(m0, m1), nos0, ...fim };
    console.log(`${build} ${nome} r${i} FALAS ${JSON.stringify(falas)}`);
    if (i === 0) await page.screenshot({ path: `captura-falas-${build}-${nome}.png` });
  } catch (e) {
    console.log(build, nome, i, 'ERRO', String(e).slice(0, 300));
  }
  runs.push(falas);
  await s.browser.close();
}
amb.parar();
const fs_ = runs.filter(Boolean);
const m = (f) => mediana(fs_.map(f));
const med = fs_.length ? { n: fs_.length, primeiras10: m((f) => f.primeiras10), meio: m((f) => f.meio), ultimas10: m((f) => f.ultimas10), pior: m((f) => f.pior), script: m((f) => f.cpu.script_ms), estilo: m((f) => f.cpu.estilo_ms), layout: m((f) => f.cpu.layout_ms), tarefa: m((f) => f.cpu.tarefa_ms), nos0: fs_[0].nos0, nos1: fs_[0].nos, linhas: fs_[0].linhas, apareceu: fs_[0].apareceu, noFim: fs_[0].noFim } : null;
console.log('MEDIANA', build, nome, 'FALAS', JSON.stringify(med));
salvar(`captura-${build}${suf}-${nome}.json`, { mediana: med, runs });
console.log('FIM');
process.exit(0);
