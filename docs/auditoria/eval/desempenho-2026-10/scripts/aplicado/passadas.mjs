// Quantas vezes a triagem, a composicao e o gate do saguao rodam por entrada no Jogar, por fim de rodada
// e por saida de rodada (contador deterministico de `lib/passadasDoPipeline`).
// uso: URL0=http://127.0.0.1:4312 node passadas.mjs <build> <trilha|gravacoes>
import fs from 'fs';
import { subir } from './ambiente.mjs';
import { abrir, URL0, sossegar } from './lib.mjs';
const build = process.argv[2] || 'antes';
const fonte = process.argv[3] || 'trilha';
const guardado = JSON.parse(fs.readFileSync(new URL('./storage.json', import.meta.url), 'utf8'));
const amb = await subir(build, +new URL(URL0).port);
const s = await abrir('desktop', { storage: { ...guardado, 'babel.fonte_da_pratica': JSON.stringify({ origem: fonte, escopo: 'todas' }) } });
const { page } = s;
await s.ctx.addInitScript(() => {
  window.__MEDIR_PASSADAS__ = true;
});
const ABA_JOGOS = s.P.toque ? '[role="tab"]:has-text("Jogos")' : '.q-trilho .q-item[aria-label="Jogar"]';
const ABA_CARTOES = s.P.toque ? '[role="tab"]:has-text("Cartões")' : '.q-trilho .q-item[data-px-rota="hub"]';
const toca = (sel) => page.locator(sel).first().click({ timeout: 15000 });
const passadas = async (rot) => {
  const l = await page.evaluate(() => {
    const x = window.__PASSADAS__ ?? [];
    window.__PASSADAS__ = [];
    return x;
  });
  const por = {};
  for (const p of l) por[p.nome] = (por[p.nome] ?? 0) + 1;
  console.log(build, fonte, rot.padEnd(28), JSON.stringify(por), l.map((p) => p.nome[0] + p.ms + ':' + (p.detalhe.cartas ?? p.detalhe.cartoes)).join(' '));
};
try {
  await page.goto(URL0 + '/', { waitUntil: 'load', timeout: 90000 });
  await sossegar(s);
  if (s.P.toque) await toca('.q-trilho .q-item[data-px-rota="cartoes"]');
  await page.waitForTimeout(2500);
  await toca(ABA_JOGOS);
  await page.waitForTimeout(4000);
  await sossegar(s, 1500, 20000);
  await passadas('1a entrada');
  await toca(ABA_CARTOES);
  await page.waitForTimeout(2500);
  await toca(ABA_JOGOS);
  await page.waitForTimeout(4000);
  await sossegar(s, 1500, 20000);
  await passadas('2a entrada');
  await toca('button.q-tile:has-text("Memória")');
  await page.waitForTimeout(2000);
  if (await page.locator('.pj-link').count()) await toca('.pj-link');
  await page.waitForTimeout(4500);
  await passadas('abrir a Memoria');
  const pares = await page.evaluate(() => {
    const m = {};
    [...document.querySelectorAll('.carta')].forEach((c, k) => (m[c.dataset.par] ??= []).push(k));
    return Object.values(m);
  });
  for (const [a, b] of pares) {
    await toca(`.carta >> nth=${a}`);
    await page.waitForTimeout(700);
    await toca(`.carta >> nth=${b}`);
    await page.waitForTimeout(1300);
  }
  await page.waitForTimeout(4000);
  await passadas('fim da rodada');
  for (let q = 0; q < 6 && (await page.locator('button:has-text("Resgatar e continuar")').count()); q++) {
    await toca('button:has-text("Resgatar e continuar")').catch(() => {});
    await page.waitForTimeout(1000);
  }
  await toca('.px-tela button:has-text("Voltar aos jogos")');
  await page.waitForTimeout(3500);
  await passadas('do fim ao saguao');
  await toca('button.q-tile:has-text("Memória")');
  await page.waitForTimeout(2000);
  if (await page.locator('.pj-link').count()) await toca('.pj-link');
  await page.waitForTimeout(4500);
  await toca('.px-tela button.voltar');
  await page.waitForTimeout(1000);
  await toca('button:has-text("Sair da rodada")');
  await page.waitForTimeout(3500);
  await passadas('abrir e sair da rodada');
} catch (e) {
  console.log('ERRO', String(e).slice(0, 300));
}
await s.browser.close();
amb.parar();
process.exit(0);
