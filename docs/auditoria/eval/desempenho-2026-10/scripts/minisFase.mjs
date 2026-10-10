// AS MINIATURAS QUE VOLTAM A VISTA ESTAO NO MESMO PASSO DAS QUE NUNCA SAIRAM?
// No saguao do Jogar (celular), cada animacao de miniatura tem um "comeco" na linha do tempo do documento
// (agora - currentTime). Todos os cartoes montam juntos, entao o comeco e o mesmo para todos. O conserto
// pausa as dos cartoes fora da vista; ao voltar, cada uma tem de estar no instante em que estaria sem a pausa.
// uso: node minisFase.mjs <url>
import { createRequire } from 'module';
const require = createRequire('C:/Users/Guilh/dev/ei-polimento/node_modules/');
const { chromium } = require('playwright');
const URL0 = process.argv[2];
const b = await chromium.launch({ headless: true, args: ['--enable-gpu', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'pt-BR' });
await ctx.addInitScript(() => { localStorage.setItem('babel.fonte_da_pratica', '{"origem":"trilha","escopo":"todas"}'); localStorage.setItem('babel.praticar', 'play'); });
const p = await ctx.newPage();
await p.goto(URL0 + '/jogar?ui=pt', { waitUntil: 'load' });
await p.waitForSelector('.q-tile.px-com-mini', { timeout: 30000 });
await p.waitForTimeout(7000);
const ler = () => p.evaluate(() => {
  const agora = document.timeline.currentTime;
  return [...document.querySelectorAll('.q-tile.px-com-mini')].map((c, i) => {
    const r = c.getBoundingClientRect();
    const as = c.getAnimations({ subtree: true }).filter((a) => a.animationName && a.effect?.target?.closest('.px-mini'));
    return { i, fora: c.classList.contains('px-fora-da-vista'), naTela: r.bottom > 0 && r.top < innerHeight, n: as.length, estados: [...new Set(as.map((a) => a.playState))].join('+'), comecos: as.map((a) => Math.round(agora - a.currentTime)) };
  });
});
const resumo = (l) => l.map((c) => `${c.i}:${c.naTela ? 'tela' : 'fora'}${c.fora ? '(pausado)' : ''} ${c.estados || '-'} n=${c.n}`).join(' | ');
const t0 = await ler();
console.log('ao abrir     ', resumo(t0));
const naTela0 = t0.filter((c) => c.naTela && c.n);
const ref = naTela0[0].comecos[0];
console.log('comeco das animacoes dos cartoes a vista (ms na linha do tempo):', [...new Set(naTela0.flatMap((c) => c.comecos))].sort((a, b) => a - b).join(', '));
/* rola ate o fim, espera, e volta ao comeco */
const rolar = (y) => p.evaluate((y) => { const r = document.querySelector('.px-tela .q-palco, .px-tela .rolagem'); r.scrollTo({ top: y === 'fim' ? r.scrollHeight : y }); }, y);
await rolar('fim');
await p.waitForTimeout(3000);
const t1 = await ler();
console.log('rolado ao fim', resumo(t1));
const voltaram = t1.filter((c) => c.naTela && c.n && t0[c.i] && !t0[c.i].naTela);
const desvios = voltaram.flatMap((c) => c.comecos.map((x) => x - ref));
console.log(`cartoes que entraram na vista: ${voltaram.map((c) => c.i).join(',')}; desvio do comeco contra os que nunca pararam: min ${Math.min(...desvios)} ms, max ${Math.max(...desvios)} ms (n=${desvios.length})`);
await rolar(0);
await p.waitForTimeout(3000);
const t2 = await ler();
console.log('de volta     ', resumo(t2));
const d2 = t2.filter((c) => c.naTela && c.n).flatMap((c) => c.comecos.map((x, k) => x - t0[c.i].comecos[k]));
console.log(`os do comeco, depois de sair e voltar: desvio contra eles mesmos antes de sair: min ${Math.min(...d2)} ms, max ${Math.max(...d2)} ms (n=${d2.length})`);
console.log('rodando agora:', t2.filter((c) => c.estados.includes('running')).length, 'cartoes; pausados:', t2.filter((c) => c.fora).length);
await b.close();
