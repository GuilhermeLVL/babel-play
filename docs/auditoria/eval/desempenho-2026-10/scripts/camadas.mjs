// Conta as camadas do compositor e a memoria de textura estimada por tela; lista quem tem backdrop-filter,
// filter, will-change e animacao infinita no DOM vivo.
// uso: node camadas.mjs <perfil> <opcoesJSON> <sufixo>
import { abrir, URL0, sossegar, salvar, r1 } from './lib.mjs';
const nome = process.argv[2] || 'cel-medio';
const extra = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const suf = process.argv[4] || '';
const s = await abrir(nome, { ...extra, cpu: 1, storage: { 'babel.fonte_da_pratica': '{"origem":"trilha","escopo":"todas"}' } });
const { page, cdp } = s;
let ultimas = [];
cdp.on('LayerTree.layerTreeDidChange', (e) => {
  if (e.layers) ultimas = e.layers;
});
await cdp.send('LayerTree.enable');
const saida = {};
for (const [rot, caminho] of [['Inicio', '/'], ['Capturar', '/capturar'], ['Jogar', '/jogar'], ['Estatisticas', '/estatisticas'], ['Personalizar', '/personalizar'], ['Ajustes', '/ajustes'], ['Interprete', '/interprete']]) {
  await page.goto(URL0 + caminho, { waitUntil: 'load', timeout: 90000 });
  await sossegar(s, 1500, 30000);
  await page.waitForTimeout(3500);
  const dsf = s.P.dsf;
  const cam = ultimas.filter((l) => l.drawsContent);
  const mem = cam.reduce((a, l) => a + l.width * l.height * 4 * dsf * dsf, 0);
  const motivos = {};
  for (const l of cam.slice(0, 400)) {
    try {
      const r = await cdp.send('LayerTree.compositingReasons', { layerId: l.layerId });
      for (const m of r.compositingReasonIds ?? r.compositingReasons ?? []) motivos[m] = (motivos[m] ?? 0) + 1;
    } catch {}
  }
  const dom = await page.evaluate(() => {
    const out = { nos: 0, backdrop: [], filtro: [], willChange: [], infinitas: [], sombras: 0, mascara: 0, fixos: 0 };
    const nomeDe = (e) => e.tagName.toLowerCase() + '.' + String(e.className?.baseVal ?? e.className).trim().split(/\s+/).slice(0, 3).join('.');
    for (const e of document.querySelectorAll('*')) {
      out.nos++;
      const c = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const area = Math.round(r.width * r.height);
      if (c.backdropFilter && c.backdropFilter !== 'none') out.backdrop.push(`${nomeDe(e)} ${c.backdropFilter} ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (c.filter && c.filter !== 'none') out.filtro.push(`${nomeDe(e)} ${c.filter} ${area}`);
      if (c.willChange && c.willChange !== 'auto') out.willChange.push(`${nomeDe(e)} ${c.willChange}`);
      if (c.boxShadow && c.boxShadow !== 'none') out.sombras++;
      if ((c.maskImage && c.maskImage !== 'none') || (c.webkitMaskImage && c.webkitMaskImage !== 'none')) out.mascara++;
      if (c.position === 'fixed') out.fixos++;
    }
    out.infinitas = document.getAnimations().filter((a) => a.effect?.getComputedTiming?.().iterations === Infinity).map((a) => {
      const t = a.effect.target;
      const props = [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)))].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k));
      return `${a.animationName ?? '?'} em ${t ? nomeDe(t) : '?'}${a.effect.pseudoElement ?? ''} [${props.join(',')}]`;
    });
    return out;
  });
  const resumoWc = {};
  for (const w of dom.willChange) resumoWc[w.split(' ').slice(1).join(' ')] = (resumoWc[w.split(' ').slice(1).join(' ')] ?? 0) + 1;
  saida[rot] = { camadas: cam.length, camadasTotal: ultimas.length, memoriaMB: r1(mem / 1048576), motivos, nos: dom.nos, backdrop: dom.backdrop, filtro: dom.filtro, willChange: resumoWc, nWillChange: dom.willChange.length, infinitas: dom.infinitas, sombras: dom.sombras, mascara: dom.mascara };
  console.log(`${rot.padEnd(13)} nos=${dom.nos} camadas=${cam.length} (~${r1(mem / 1048576)} MB de textura a ${dsf}x) backdrop=${dom.backdrop.length} filtro=${dom.filtro.length} will-change=${dom.willChange.length} ${JSON.stringify(resumoWc)} sombras=${dom.sombras} mascaras=${dom.mascara}`);
  console.log('   backdrop:', dom.backdrop.slice(0, 8).join(' | '));
  console.log('   filtro:', dom.filtro.slice(0, 6).join(' | '));
  console.log('   infinitas:', [...new Set(dom.infinitas)].map((x) => `${x} x${dom.infinitas.filter((y) => y === x).length}`).join(' | '));
  console.log('   motivos:', JSON.stringify(motivos));
  console.log('   maiores camadas:', cam.sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 6).map((l) => `${l.width}x${l.height}`).join(' '));
}
salvar(`camadas${suf}-${nome}.json`, saida);
await s.browser.close();
console.log('FIM');
