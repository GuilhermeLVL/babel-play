// Jornada 3: Memoria (ate o fim) e Caca-palavras (arrastos), com a trilha como material.
// uso: node jogos.mjs <perfil> <N> <opcoesJSON> <sufixo>
import { abrir, URL0, sossegar, mediana, salvar, r0, r1, quadros, deltaMetricas } from './lib.mjs';
import { interagir, linha, instalarMedidor } from './medir.mjs';
const nome = process.argv[2] || 'cel-medio';
const N = +(process.argv[3] || 3);
const extra = process.argv[4] ? JSON.parse(process.argv[4]) : {};
const suf = process.argv[5] || '';
const FONTE = { 'babel.fonte_da_pratica': '{"origem":"trilha","escopo":"todas"}' };

async function arrasto(s, rotulo, de, ate) {
  const { page, cdp } = s;
  await instalarMedidor(page);
  const m0 = await s.metricas();
  const t0 = await page.evaluate(() => {
    window.__p.iniciarQuadros();
    return performance.now();
  });
  const passos = 14;
  const ponto = (i) => ({ x: de.x + ((ate.x - de.x) * i) / passos, y: de.y + ((ate.y - de.y) * i) / passos });
  if (s.P.toque) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [ponto(0)] });
    for (let i = 1; i <= passos; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [ponto(i)] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(de.x, de.y);
    await page.mouse.down();
    for (let i = 1; i <= passos; i++) {
      const p = ponto(i);
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
  }
  await page.waitForTimeout(900);
  const r = await page.evaluate((t0) => {
    const p = window.__p;
    const fr = p.pararQuadros();
    const t1 = performance.now();
    return { fr, lt: p.lt.filter((x) => x.s + x.d >= t0 && x.s <= t1), ev: p.ev.filter((x) => x.s >= t0 - 30 && x.s <= t1) };
  }, t0);
  const m1 = await s.metricas();
  const mov = r.ev.filter((e) => /move/.test(e.n));
  return {
    rotulo,
    q: quadros(r.fr),
    nLt: r.lt.length,
    somaLt: r0(r.lt.reduce((a, x) => a + x.d, 0)),
    maiorLt: r0(Math.max(0, ...r.lt.map((x) => x.d))),
    inp: r0(Math.max(0, ...r.ev.filter((e) => e.id).map((e) => e.d))),
    piorMove: r0(Math.max(0, ...mov.map((e) => e.d))),
    cpu: deltaMetricas(m0, m1),
    arrasto: true,
  };
}
const linhaArrasto = (x) => `${x.rotulo.padEnd(28)} q[fps ${x.q.fps} p95 ${x.q.p95} max ${x.q.max} >33:${x.q.acima33} >50:${x.q.acima50}] lt=${x.nLt}/${x.somaLt}ms(max ${x.maiorLt}) inp=${x.inp} piorMove=${x.piorMove} cpu[s ${x.cpu.script_ms} e ${x.cpu.estilo_ms} l ${x.cpu.layout_ms} t ${x.cpu.tarefa_ms}]`;

const runs = [];
for (let i = 0; i < N; i++) {
  const s = await abrir(nome, { ...extra, storage: FONTE });
  const { page } = s;
  const passos = [];
  const passo = async (rot, alvo, opc) => {
    try {
      const x = await interagir(s, rot, alvo, opc);
      passos.push(x);
      console.log(`${nome} r${i} ${linha(x)}`);
      return x;
    } catch (e) {
      console.log(`${nome} r${i} ${rot} ERRO ${String(e).slice(0, 220)}`);
      passos.push({ rotulo: rot, erro: String(e).slice(0, 220) });
      return null;
    }
  };
  try {
    await page.goto(URL0 + '/jogar', { waitUntil: 'load', timeout: 90000 });
    await sossegar(s);
    if (await page.locator('.q-mais-fundo').count()) {
      await page.locator('.q-mais-fundo .q-aba:has-text("Trilha")').first().click();
      await page.waitForTimeout(800);
      await page.locator('.q-mais-fundo .q-ctl.pri').first().click();
      await page.waitForTimeout(2500);
    }
    await sossegar(s, 1000, 15000);
    /* ---- Memoria ---- */
    await passo('Memoria: abrir', 'button.q-tile:has-text("Memória")', { modo: 'aparece', seletor: '.carta' });
    await page.waitForTimeout(800);
    if (await page.locator('.pj-link').count()) await passo('Memoria: fechar explicacao', '.pj-link', { modo: 'some', seletor: 'dialog.pj-como-folha[open]' });
    await page.waitForTimeout(600);
    const pares = await page.evaluate(() => {
      const m = {};
      [...document.querySelectorAll('.carta')].forEach((c, i) => (m[c.dataset.par] ??= []).push(i));
      return Object.values(m);
    });
    let k = 0;
    for (const [a, b] of pares) {
      k++;
      const ultimo = k === pares.length;
      await passo(`Memoria: carta ${k}a`, `.carta >> nth=${a}`, { modo: 'toque' });
      await passo(ultimo ? 'Memoria: ultimo par (fim)' : `Memoria: carta ${k}b (par)`, `.carta >> nth=${b}`, { modo: 'toque', minimo: ultimo ? 1500 : 250 });
      await page.waitForTimeout(350);
    }
    await page.waitForTimeout(2500);
    const fim = await page.evaluate(() => ({
      botoes: [...document.querySelectorAll('.px-tela button, dialog[open] button')].filter((b) => b.offsetParent).map((b) => (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 40) + '|' + b.className),
      nos: document.querySelectorAll('*').length,
      h: [...document.querySelectorAll('.px-tela h1, .px-tela h2, dialog[open] h2')].map((h) => h.textContent.trim().slice(0, 50)),
    }));
    console.log(`${nome} r${i} FIM-MEMORIA ${JSON.stringify(fim).slice(0, 700)}`);
    await page.screenshot({ path: `jogo-fim-${nome}.png` });
    /* volta ao lobby pelo que houver */
    if (await page.locator('button:has-text("Voltar aos jogos")').count()) await passo('Memoria: voltar aos jogos', 'button:has-text("Voltar aos jogos")', { modo: 'aparece', seletor: '.quest-jogar', forcar: true });
    else await passo('Memoria: voltar', '.px-tela button.voltar', { modo: 'aparece', seletor: '.quest-jogar, dialog[open] button', forcar: true });
    if (await page.locator('dialog[open] button:has-text("Sair da rodada")').count()) await passo('Memoria: sair da rodada', 'dialog[open] button:has-text("Sair da rodada")', { modo: 'aparece', seletor: '.quest-jogar' });
    await page.waitForTimeout(1500);
    /* ---- Caca-palavras ---- */
    await passo('Caca: abrir', 'button.q-tile:has-text("Caça-palavras")', { modo: 'aparece', seletor: '.grade-caca' });
    await page.waitForTimeout(800);
    if (await page.locator('.pj-link').count()) await passo('Caca: fechar explicacao', '.pj-link', { modo: 'some', seletor: 'dialog.pj-como-folha[open]' });
    await page.waitForTimeout(600);
    const g = await page.evaluate(() => {
      const el = document.querySelector('.grade-caca');
      const r = el.getBoundingClientRect();
      const c = el.children[0]?.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, n: el.children.length, cw: c?.width, ch: c?.height, nos: document.querySelectorAll('*').length };
    });
    console.log(`${nome} r${i} GRADE ${JSON.stringify(g)}`);
    for (let j = 0; j < 3; j++) {
      const y = g.y + g.ch * (0.5 + j * 2);
      const x = await arrasto(s, `Caca: arrasto ${j + 1}`, { x: g.x + g.cw * 0.5, y }, { x: g.x + g.cw * 5.5, y });
      passos.push(x);
      console.log(`${nome} r${i} ${linhaArrasto(x)}`);
    }
    await passo('Caca: ajuda Radar', 'button.ajuda-jogo:has-text("Radar")', { modo: 'toque' });
    await passo('Caca: voltar (abre confirmacao)', '.px-tela button.voltar', { modo: 'aparece', seletor: 'dialog[open] button:has-text("Sair da rodada"), .quest-jogar' });
    if (await page.locator('dialog[open] button:has-text("Sair da rodada")').count()) await passo('Caca: sair da rodada', 'dialog[open] button:has-text("Sair da rodada")', { modo: 'aparece', seletor: '.quest-jogar' });
  } catch (e) {
    console.log(nome, i, 'ERRO', String(e).slice(0, 300));
  }
  runs.push(passos);
  await s.browser.close();
}
/* mediana por rotulo; as cartas viram um grupo so */
const grupo = (rot) => rot.replace(/carta \d+a/, 'carta (1a do par)').replace(/carta \d+b \(par\)/, 'carta (2a do par)').replace(/arrasto \d/, 'arrasto');
const por = {};
for (const r of runs) for (const x of r) if (!x.erro) (por[grupo(x.rotulo)] ??= []).push(x);
const resumo = Object.entries(por).map(([rot, xs]) => {
  const m = (f) => mediana(xs.map(f));
  const p = (f) => Math.max(...xs.map(f));
  return xs[0].arrasto
    ? { rotulo: rot, n: xs.length, fps: r1(m((x) => x.q.fps)), p95: r1(m((x) => x.q.p95)), maxQuadro: r1(p((x) => x.q.max)), acima33: m((x) => x.q.acima33), somaLt: m((x) => x.somaLt), piorMove: m((x) => x.piorMove), script: m((x) => x.cpu.script_ms), estilo: m((x) => x.cpu.estilo_ms), layout: m((x) => x.cpu.layout_ms) }
    : { rotulo: rot, n: xs.length, conteudo: r0(m((x) => x.conteudo)), pintou: r0(m((x) => x.pintou)), assentou: r0(m((x) => x.assentou)), inp: r0(m((x) => x.inp)), inpPior: r0(p((x) => x.inp)), proc: r0(m((x) => x.proc)), somaLt: r0(m((x) => x.somaLt)), maiorLt: r0(m((x) => x.maiorLt)), fps: r1(m((x) => x.q.fps)), p95: r1(m((x) => x.q.p95)), maxQuadro: r1(m((x) => x.q.max)), acima50: m((x) => x.q.acima50), script: m((x) => x.cpu.script_ms), estilo: m((x) => x.cpu.estilo_ms), layout: m((x) => x.cpu.layout_ms), tarefa: m((x) => x.cpu.tarefa_ms), baixouKb: r1(m((x) => x.baixouKb)), nos: m((x) => x.nos) };
});
for (const l of resumo) console.log('MEDIANA', nome, JSON.stringify(l));
salvar(`jogos${suf}-${nome}.json`, { resumo, runs });
console.log('FIM');
