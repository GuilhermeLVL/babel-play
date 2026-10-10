// Perfil de CPU do JS (amostragem) do arranque e de trocas de tela: tempo proprio por funcao e por pedaco.
// uso: node perfilCpu.mjs <perfil> <opcoesJSON> <sufixo>
import fs from 'fs';
import { abrir, URL0, sossegar, salvar, r1 } from './lib.mjs';
const nome = process.argv[2] || 'cel-medio';
const extra = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const suf = process.argv[4] || '';
const s = await abrir(nome, { ...extra, storage: { 'babel.fonte_da_pratica': '{"origem":"trilha","escopo":"todas"}' } });
const { page, cdp } = s;
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
const DIST = 'C:/Users/Guilh/dev/babel-publicar-aa97cf3d/dist/assets/';
const trecho = (url, lin, col) => {
  try {
    const f = DIST + url.split('/').pop();
    const linhas = fs.readFileSync(f, 'utf8').split('\n');
    return (linhas[lin] ?? '').slice(Math.max(0, col - 10), col + 110).replace(/\s+/g, ' ');
  } catch {
    return '';
  }
};
const resumir = (prof) => {
  const { nodes, samples, timeDeltas } = prof;
  const porId = new Map(nodes.map((n) => [n.id, n]));
  const proprio = new Map();
  for (let i = 0; i < samples.length; i++) proprio.set(samples[i], (proprio.get(samples[i]) ?? 0) + (timeDeltas[i] ?? 0));
  const pai = new Map();
  for (const n of nodes) for (const c of n.children ?? []) pai.set(c, n.id);
  const chamador = (id) => {
    let x = pai.get(id);
    while (x != null) {
      const cf = porId.get(x).callFrame;
      if (cf.url) return cf.url.split("/").pop() + ":" + cf.lineNumber + ":" + cf.columnNumber + " " + cf.functionName;
      x = pai.get(x);
    }
    return "(raiz)";
  };
  const nativos = {};
  const porFn = {};
  const porArq = {};
  let total = 0;
  for (const [id, us] of proprio) {
    const n = porId.get(id);
    const cf = n.callFrame;
    if (cf.functionName === '(idle)' || cf.functionName === '(program)' || cf.functionName === '(root)') continue;
    total += us;
    const arq = cf.url ? cf.url.split('/').pop() : cf.functionName.startsWith('(') ? cf.functionName : '(nativo)';
    const k = `${arq}:${cf.lineNumber}:${cf.columnNumber} ${cf.functionName}`;
    (porFn[k] ??= { ms: 0, cf }).ms += us / 1000;
    if (!cf.url && us > 0) {
      const kk = cf.functionName + " <- " + chamador(id);
      (nativos[kk] ??= { ms: 0, de: null }).ms += us / 1000;
      if (!nativos[kk].de) { let x = pai.get(id); while (x != null && !porId.get(x).callFrame.url) x = pai.get(x); nativos[kk].de = x != null ? porId.get(x).callFrame : null; }
    }
    porArq[arq] = (porArq[arq] ?? 0) + us / 1000;
  }
  return {
    total_ms: r1(total / 1000),
    nativos: Object.entries(nativos).sort((a, b) => b[1].ms - a[1].ms).slice(0, 14).map(([k, v]) => ({ fn: k, ms: r1(v.ms), trecho: v.de ? trecho(v.de.url, v.de.lineNumber, v.de.columnNumber) : "" })),
    porArquivo: Object.entries(porArq).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${r1(v)}ms`),
    funcoes: Object.entries(porFn).sort((a, b) => b[1].ms - a[1].ms).slice(0, 22).map(([k, v]) => ({ fn: k, ms: r1(v.ms), trecho: v.cf.url ? trecho(v.cf.url, v.cf.lineNumber, v.cf.columnNumber) : '' })),
  };
};
const saida = {};
const perfilar = async (rot, fazer) => {
  await cdp.send('Profiler.start');
  await fazer();
  const { profile } = await cdp.send('Profiler.stop');
  const r = resumir(profile);
  saida[rot] = r;
  console.log(`\n=== ${rot}: JS ${r.total_ms} ms (relogio com a CPU limitada) ===`);
  console.log('por arquivo:', r.porArquivo.join(' | '));
  console.log('  NATIVOS por quem chamou:');
  for (const f of r.nativos.slice(0, 10)) console.log(`  ${String(f.ms).padStart(7)} ms  ${f.fn}
            ${f.trecho.slice(0, 100)}`);
  for (const f of r.funcoes.slice(0, 10)) console.log(`  ${String(f.ms).padStart(7)} ms  ${f.fn}\n            ${f.trecho}`);
};
const toca = async (sel) => {
  const el = page.locator(sel).first();
  if (s.P.toque) await el.tap({ timeout: 15000 });
  else await el.click({ timeout: 15000 });
};
try {
  await page.goto(URL0 + '/', { waitUntil: 'load', timeout: 90000 });
  await sossegar(s);
  await toca('.q-trilho .q-item[data-px-rota="play"]');
  await page.waitForTimeout(4500);
  await sossegar(s, 1500, 20000);
  await toca('.q-trilho .q-item[data-px-rota="hub"]');
  await page.waitForTimeout(3000);
  await perfilar('abrir Mais', async () => {
    await toca('.q-trilho .q-mais-botao');
    await page.waitForTimeout(2500);
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  await perfilar('ir para Jogar (pedacos ja baixados)', async () => {
    await toca('.q-trilho .q-item[data-px-rota="play"]');
    await page.waitForTimeout(3200);
  });
  await perfilar('abrir Memoria', async () => {
    await toca('button.q-tile:has-text("Memória")');
    await page.waitForTimeout(3200);
  });
} catch (e) {
  console.log('ERRO', String(e).slice(0, 300));
}
salvar(`perfilCpu${suf}-${nome}.json`, saida);
await s.browser.close();
console.log('FIM');
