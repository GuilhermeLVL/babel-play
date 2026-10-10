// Microbancada do recalculo de estilo: quanto custa recalcular o documento inteiro e um elemento so,
// e quanto cada folha de estilo pesa nisso (desligando uma por vez). Sem limite de CPU: o numero e o da maquina.
// uso: node estiloMicro.mjs <perfil> <caminho>
import { abrir, URL0, sossegar, salvar } from './lib.mjs';
const nome = process.argv[2] || 'cel-medio';
const caminho = process.argv[3] || '/jogar';
const s = await abrir(nome, { cpu: 1, storage: { 'babel.fonte_da_pratica': '{"origem":"trilha","escopo":"todas"}' } });
const { page } = s;
await page.goto(URL0 + caminho, { waitUntil: 'load', timeout: 90000 });
await sossegar(s, 1500, 30000);
await page.waitForTimeout(4000);
const r = await page.evaluate(async () => {
  const html = document.documentElement;
  const el = document.querySelector('button.q-tile') ?? document.querySelector('button');
  const forcar = () => getComputedStyle(document.body).color && getComputedStyle(el).opacity;
  const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  const tudo = (n = 15) => {
    const ts = [];
    for (let i = 0; i < n; i++) {
      html.style.setProperty('--lab-x', String(i));
      const t = performance.now();
      forcar();
      ts.push(performance.now() - t);
    }
    html.style.removeProperty('--lab-x');
    forcar();
    return med(ts);
  };
  const classeNaRaiz = (n = 15) => {
    const ts = [];
    for (let i = 0; i < n; i++) {
      html.classList.toggle('lab-classe');
      const t = performance.now();
      forcar();
      ts.push(performance.now() - t);
    }
    html.classList.remove('lab-classe');
    return med(ts);
  };
  const um = (n = 40) => {
    const ts = [];
    for (let i = 0; i < n; i++) {
      el.style.transform = `perspective(800px) rotateY(${i * 0.1}deg)`;
      const t = performance.now();
      getComputedStyle(el).transform;
      ts.push(performance.now() - t);
    }
    el.style.transform = '';
    return med(ts);
  };
  const contarRegras = (regras) => {
    let n = 0;
    for (const x of regras) {
      if (x.cssRules?.length && !(x instanceof CSSStyleRule)) n += contarRegras(x.cssRules);
      else n++;
    }
    return n;
  };
  const cs = getComputedStyle(html);
  let vars = 0;
  for (let i = 0; i < cs.length; i++) if (cs[i].startsWith('--')) vars++;
  /* espera as entradas acabarem */
  await new Promise((ok) => setTimeout(ok, 500));
  const base = { documento_ms: tudo(), classe_na_raiz_ms: classeNaRaiz(), um_elemento_ms: um() };
  const folhas = [];
  for (const f of document.styleSheets) {
    let regras = 0;
    try {
      regras = contarRegras(f.cssRules);
    } catch {}
    const nomeF = f.href ? f.href.split('/').pop() : '(style ' + (f.ownerNode?.textContent?.length ?? 0) + ' car.)';
    f.disabled = true;
    forcar();
    const sem = { documento_ms: tudo(9), um_elemento_ms: um(15) };
    f.disabled = false;
    forcar();
    folhas.push({ folha: nomeF, regras, documento_sem_ela_ms: sem.documento_ms, um_elemento_sem_ela_ms: sem.um_elemento_ms });
  }
  /* todas as animacoes paradas: quanto do custo e animacao viva */
  const st = document.createElement('style');
  st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
  document.head.append(st);
  forcar();
  const semAnim = { documento_ms: tudo(), um_elemento_ms: um() };
  st.remove();
  return { nos: document.querySelectorAll('*').length, variaveisNaRaiz: vars, animacoes: document.getAnimations().length, base, semAnim, folhas, alvo: el.className };
});
const f2 = (x) => Math.round(x * 100) / 100;
console.log(`${caminho}: ${r.nos} nos, ${r.variaveisNaRaiz} variaveis CSS na raiz, ${r.animacoes} animacoes vivas`);
console.log(`  recalcular o documento inteiro (variavel herdada mudou na raiz): ${f2(r.base.documento_ms)} ms = ${f2((r.base.documento_ms / r.nos) * 1000)} us por no`);
console.log(`  trocar uma classe na raiz: ${f2(r.base.classe_na_raiz_ms)} ms`);
console.log(`  um elemento (transform em linha num .q-tile): ${f2(r.base.um_elemento_ms)} ms`);
console.log(`  com animacoes e transicoes desligadas: documento ${f2(r.semAnim.documento_ms)} ms, um elemento ${f2(r.semAnim.um_elemento_ms)} ms`);
for (const f of r.folhas.sort((a, b) => a.documento_sem_ela_ms - b.documento_sem_ela_ms)) console.log(`  sem ${f.folha.padEnd(34)} (${String(f.regras).padStart(5)} regras): documento ${f2(f.documento_sem_ela_ms)} ms (${f2(r.base.documento_ms - f.documento_sem_ela_ms)} a menos), um elemento ${f2(f.um_elemento_sem_ela_ms)} ms`);
salvar(`estiloMicro-${nome}-${caminho.replace(/\W+/g, '') || 'inicio'}.json`, r);
await s.browser.close();
console.log('FIM');
