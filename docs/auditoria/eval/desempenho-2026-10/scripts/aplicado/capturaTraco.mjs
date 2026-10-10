// Trace de 20 falas depois de N ja na tela: quem recalcula estilo, quantos elementos, quem forca.
// uso: URL0=http://127.0.0.1:4313 node capturaTraco.mjs <build> <perfil> <jaNaTela>
import fs from 'fs';
import { subir } from './ambiente.mjs';
import { abrir, URL0, sossegar } from './lib.mjs';
import { gravar, estilos, CATS_ESTILO, CATS_BASE } from './traco.mjs';
const EXP = process.argv[5] || '';
const LEVE = process.argv[6] !== 'estilo';
const build = process.argv[2] || 'antes';
const nome = process.argv[3] || 'cel-medio';
const JA = +(process.argv[4] || 180);
const guardado = JSON.parse(fs.readFileSync(new URL('./storage.json', import.meta.url), 'utf8'));
const amb = await subir(build, +new URL(URL0).port);
const s = await abrir(nome, { storage: guardado });
const { page } = s;
try {
  await page.goto(URL0 + '/', { waitUntil: 'load', timeout: 90000 });
  await sossegar(s);
  await page.locator('.q-trilho .q-item[data-px-rota="capture"]').first().tap();
  await page.waitForTimeout(4000);
  await sossegar(s, 1500, 20000);
  await page.waitForFunction(() => typeof window.__simFalas === 'function', null, { timeout: 20000 });
  await page.evaluate((n) => window.__simFalas(Array.from({ length: n }, (_, k) => `This is simulated sentence number ${k + 1} with a few more words to wrap the line`)), JA);
  await page.waitForTimeout(5000);
  await sossegar(s, 1500, 20000);
  if (process.argv[7] === 'blocos') {
    const n = await page.evaluate(() => {
      const h = document.querySelector('.q-historico');
      const linhas = [...h.querySelectorAll(':scope > .q-linha-da-fala')];
      let n = 0;
      for (let i = 0; i + 20 <= linhas.length - 1; i += 20) {
        const b = document.createElement('div');
        b.style.cssText = 'display:flex;flex-direction:column;gap:10px;content-visibility:auto;contain-intrinsic-size:auto 1800px;flex:none';
        h.insertBefore(b, linhas[i]);
        for (const l of linhas.slice(i, i + 20)) b.appendChild(l);
        n++;
      }
      h.scrollTop = h.scrollHeight;
      return n;
    });
    console.log('blocos:', n);
    await page.waitForTimeout(1500);
  }
  if (EXP) {
    const n = await page.evaluate((exp) => {
      const re = new RegExp(exp);
      let n = 0;
      const varrer = (pai) => {
        const regras = pai.cssRules;
        for (let i = regras.length - 1; i >= 0; i--) {
          const r = regras[i];
          if (r.cssRules && !r.selectorText) varrer(r);
          else if (r.selectorText && re.test(r.selectorText)) { pai.deleteRule(i); n++; }
        }
      };
      for (const f of document.styleSheets) { try { varrer(f); } catch {} }
      return n;
    }, EXP);
    console.log('regras apagadas:', n, 'por', EXP);
    await page.waitForTimeout(800);
  }
  const arq = `captura-${build}-${nome}${LEVE ? '-9' : ''}.json`;
  const r = await gravar(s, arq, async () => {
    for (let k = 0; k < 20; k++) {
      await page.evaluate((k) => window.__simFalas([`Another simulated sentence number ${k + 1} with a few more words to wrap the line`]), k);
      await page.waitForTimeout(250);
    }
  }, LEVE ? CATS_BASE : CATS_ESTILO);
  console.log('principal', JSON.stringify(r.principal));
  console.log('estilo', JSON.stringify(r.estilo));
  console.log('layout', JSON.stringify(r.layout));
  console.log('quadros', JSON.stringify(r.quadros));
  console.log('funcoes', r.funcoes.slice(0, 14).join('\n   '));
  console.log('eventos', r.eventos.slice(0, 16).join('\n   '));
  if (LEVE) throw new Error('fim (leve)');
  const e = estilos(arq);
  console.log(`seletores: total ${e.seletores_total_ms} ms em ${e.nSeletores}; :has ${e.comHas_ms} ms`);
  for (const t of e.topo.slice(0, 14)) console.log(`   ${t.ms} ms tent=${t.tentativas} casou=${t.casou} ${t.seletor.slice(0, 130)}`);
  console.log('motivos:\n   ' + e.motivos.slice(0, 18).join('\n   '));
} catch (e) {
  console.log('ERRO', String(e).slice(0, 400));
}
await s.browser.close();
amb.parar();
process.exit(0);
