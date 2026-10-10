// Qual escrita do laco do giroscopio e a cara: repete cada uma, isolada, na pagina de verdade (sem limite de CPU).
import { abrir, URL0, sossegar, salvar } from './lib.mjs';
const s = await abrir('cel-medio', { cpu: 1 });
const { page } = s;
await page.goto(URL0 + '/', { waitUntil: 'load', timeout: 90000 });
await sossegar(s, 1500);
await page.waitForTimeout(5000);
const r = await page.evaluate(async () => {
  const tiles = [...document.querySelectorAll('button.q-tile:not(.apagado):not(.em-linha)')].filter((e) => e.offsetParent);
  /* as luzes que o laco poe (uma por cartao, ate 4) */
  const luzes = tiles.map((t) => {
    if (getComputedStyle(t).position === 'static') t.style.position = 'relative';
    const l = document.createElement('i');
    l.className = 'px-luz giro on';
    t.append(l);
    return l;
  });
  const forcar = () => getComputedStyle(document.body).color;
  forcar();
  const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  const medir = (escrever, n = 60) => {
    const ts = [];
    for (let i = 0; i < n; i++) {
      escrever(i);
      const t = performance.now();
      forcar();
      ts.push(performance.now() - t);
    }
    return Math.round(med(ts) * 1000) / 1000;
  };
  const semTransicao = (sim) => tiles.forEach((t) => (t.style.transitionProperty = sim ? 'box-shadow, border-color, background-color' : ''));
  const zerar = () => {
    tiles.forEach((t) => (t.style.transform = ''));
    forcar();
  };
  const out = { cartoes: tiles.length, descendentes: tiles.map((t) => t.querySelectorAll('*').length) };
  out.nada = medir(() => {});
  out.transform_com_transicao = medir((i) => tiles.forEach((t) => (t.style.transform = `perspective(800px) rotateY(${(i % 7) * 0.3}deg) rotateX(${(i % 5) * 0.2}deg)`)));
  zerar();
  semTransicao(true);
  forcar();
  out.transform_sem_transicao = medir((i) => tiles.forEach((t) => (t.style.transform = `perspective(800px) rotateY(${(i % 7) * 0.3}deg) rotateX(${(i % 5) * 0.2}deg)`)));
  zerar();
  out.so_rotate_sem_perspective = medir((i) => tiles.forEach((t) => (t.style.transform = `rotateY(${(i % 7) * 0.3}deg)`)));
  zerar();
  out.translate_sem_transicao = medir((i) => tiles.forEach((t) => (t.style.transform = `translateY(${i % 7}px)`)));
  zerar();
  semTransicao(false);
  out.luz_mx_my = medir((i) =>
    luzes.forEach((l) => {
      l.style.setProperty('--mx', 100 + (i % 9) + 'px');
      l.style.setProperty('--my', 60 + (i % 7) + 'px');
    }),
  );
  const aura = document.querySelector('.px-aura');
  out.aura_transform = aura ? medir((i) => (aura.style.transform = `translate(${i % 9}px, ${i % 7}px)`)) : null;
  out.getAnimations_por_cartao = medir(() => tiles.forEach((t) => t.getAnimations()));
  luzes.forEach((l) => l.remove());
  return out;
});
console.log(JSON.stringify(r, null, 1));
salvar('giroMicro-cel-medio.json', r);
await s.browser.close();
console.log('FIM');
