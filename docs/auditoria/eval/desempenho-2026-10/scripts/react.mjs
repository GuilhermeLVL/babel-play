// Quanto o React re-renderiza: commits e fibras que trabalharam (bandeira PerformedWork) por interacao,
// pelo mesmo gancho de scripts/perf/telas/medir-telas.mjs (funciona no pacote de producao).
// uso: node react.mjs <perfil> <opcoesJSON> <sufixo>
import { abrir, URL0, sossegar, salvar, r1, mediana } from './lib.mjs';
const nome = process.argv[2] || 'cel-medio';
const extra = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const suf = process.argv[4] || '';
const s = await abrir(nome, { ...extra, storage: { 'babel.fonte_da_pratica': '{"origem":"trilha","escopo":"todas"}' } });
const { page } = s;
await s.ctx.addInitScript(() => {
  const m = (window.__react = { commits: 0, fibras: 0, total: 0 });
  const contar = (f) => {
    let n = 0;
    let t = 0;
    const pilha = [f];
    while (pilha.length) {
      const x = pilha.pop();
      if (!x) continue;
      t++;
      if (x.flags & 1) n++;
      if (x.sibling) pilha.push(x.sibling);
      if (x.child) pilha.push(x.child);
    }
    return [n, t];
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(r) {
      const id = this.renderers.size + 1;
      this.renderers.set(id, r);
      return id;
    },
    onScheduleFiberRoot() {},
    onCommitFiberRoot(_id, raiz) {
      m.commits++;
      try {
        const [n, t] = contar(raiz.current.child);
        m.fibras += n;
        m.total = t;
      } catch {}
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  };
});
const ler = () => page.evaluate(() => ({ ...window.__react }));
const saida = [];
const medir = async (rot, fazer, espera = 2500) => {
  const a = await ler();
  const m0 = await s.metricas();
  await fazer();
  await page.waitForTimeout(espera);
  const b = await ler();
  const m1 = await s.metricas();
  const x = { rotulo: rot, commits: b.commits - a.commits, fibrasQueTrabalharam: b.fibras - a.fibras, fibrasNaArvore: b.total, script_ms: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000) };
  saida.push(x);
  console.log(`${rot.padEnd(44)} commits=${x.commits} fibras que trabalharam=${x.fibrasQueTrabalharam} (arvore: ${x.fibrasNaArvore}) script=${x.script_ms} ms`);
  return x;
};
const toca = async (sel, forcar = false) => {
  const el = page.locator(sel).first();
  if (s.P.toque) await el.tap({ timeout: 15000, force: forcar });
  else await el.click({ timeout: 15000, force: forcar });
};
try {
  await page.goto(URL0 + '/', { waitUntil: 'load', timeout: 90000 });
  await sossegar(s);
  await page.waitForTimeout(3000);
  await medir('Inicio parado por 5 s', async () => {}, 5000);
  await medir('abrir Mais', () => toca('.q-trilho .q-mais-botao'));
  await medir('fechar Mais (Escape)', () => page.keyboard.press('Escape'));
  await medir('ir para Jogar (1a vez)', () => toca('.q-trilho .q-item[data-px-rota="play"]'), 4500);
  await medir('Jogar parado por 5 s', async () => {}, 5000);
  await medir('Jogar: trocar a aba para Classicos', () => toca('.px-tela .q-aba:has-text("Clássicos")'));
  await medir('abrir Memoria', () => toca('button.q-tile:has-text("Memória")'), 3500);
  if (await page.locator('.pj-link').count()) await medir('fechar a explicacao', () => toca('.pj-link'), 1500);
  await medir('virar uma carta', () => toca('.carta >> nth=0'), 1500);
  await medir('virar a segunda carta', () => toca('.carta >> nth=1'), 2000);
  await medir('Memoria parada por 5 s', async () => {}, 5000);
  await page.goto(URL0 + '/capturar', { waitUntil: 'load', timeout: 90000 });
  await sossegar(s);
  await page.waitForTimeout(3000);
  await medir('Capturar parado por 5 s', async () => {}, 5000);
  const fala = (k) => page.evaluate((k) => window.__simFalas([`This is simulated sentence number ${k} with a few more words to wrap the line`]), k);
  const lote = async (de, ate) => {
    const xs = [];
    for (let k = de; k <= ate; k++) {
      const a = await ler();
      await fala(k);
      await page.waitForTimeout(250);
      const b = await ler();
      xs.push({ c: b.commits - a.commits, f: b.fibras - a.fibras, t: b.total });
    }
    const x = { rotulo: `fala simulada ${de}-${ate} (por fala)`, commits: mediana(xs.map((v) => v.c)), fibrasQueTrabalharam: mediana(xs.map((v) => v.f)), fibrasNaArvore: xs[xs.length - 1].t };
    saida.push(x);
    console.log(`${x.rotulo.padEnd(44)} commits=${x.commits} fibras que trabalharam=${x.fibrasQueTrabalharam} (arvore: ${x.fibrasNaArvore})`);
  };
  await lote(1, 10);
  for (let k = 11; k <= 90; k++) await fala(k);
  await page.waitForTimeout(1500);
  await lote(91, 100);
  for (let k = 101; k <= 290; k++) await fala(k);
  await page.waitForTimeout(2500);
  await lote(291, 300);
} catch (e) {
  console.log('ERRO', String(e).slice(0, 300));
}
salvar(`react${suf}-${nome}.json`, saida);
await s.browser.close();
console.log('FIM');
