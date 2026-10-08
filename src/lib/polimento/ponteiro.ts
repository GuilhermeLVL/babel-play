/**
 * O QUE RESPONDE AO PONTEIRO — porte de `prototipo.js:792-848` (a aura) e `1194-1294` (a luz dentro
 * do cartão, a inclinação 3D e a onda no toque), com os mesmos números.
 *
 * Itens da lista `fidelidade/casca-e-telas.md`: B2, B36, B37, B38.
 */
import { anima, polido, reduz } from './base';

const BOTAO_COM_LUZ = 'button.q-tile:not(.apagado):not(:disabled), button.q-linha:not(:disabled)';
const COM_ONDA = '.q-ctl, .btn, .q-chip, .q-aba, .q-tile, .q-linha, .q-item, .campo-idioma, .cmd-item';

interface Tilt {
  el: HTMLElement;
  /** rotateX, rotateY, translateY, scale: o valor na tela, que persegue o alvo. */
  v: number[];
  ax: number;
  ay: number;
  saindo: boolean;
  aperta: boolean;
}

export function instalarPonteiro(): () => void {
  let til: Tilt | null = null;
  let comLuz: Element | null = null;
  let vivo = true;

  /* ---- Inclinação 3D com mola (`prototipo.js:1197-1218`) ---- */
  const soltarTilt = () => {
    if (til) til.saindo = true;
  };
  const zerarTilt = () => {
    if (!til) return;
    til.el.style.transform = '';
    til.el.style.transition = '';
    til = null;
  };
  const quadroTilt = () => {
    const t = til;
    if (!t) return;
    if (!t.el.isConnected || !polido()) return zerarTilt();
    const alvo = t.saindo ? [0, 0, 0, 1] : [t.ax, t.ay, -6, t.aperta ? 0.96 : 1.02];
    t.v = t.v.map((v, i) => v + (alvo[i] - v) * 0.16);
    const [rx, ry, y, s] = t.v;
    if (t.saindo && Math.abs(rx) + Math.abs(ry) + Math.abs(y) + Math.abs(s - 1) * 100 < 0.1) return zerarTilt();
    t.el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(${y}px) scale(${s})`;
    requestAnimationFrame(quadroTilt);
  };

  /* ---- Luz que segue o ponteiro, uma por vez (`prototipo.js:1219-1254`) ---- */
  const apagarLuzes = (menos?: Element | null) => {
    for (const l of document.querySelectorAll('.px-luz')) {
      if (menos && l === menos) continue;
      l.classList.remove('on');
      window.setTimeout(() => l.remove(), 320);
    }
  };
  const soltarPonteiro = () => {
    comLuz = null;
    apagarLuzes();
    soltarTilt();
  };

  const aoMover = (e: PointerEvent) => {
    mouse = [e.clientX, e.clientY];
    if (!polido() || reduz() || e.pointerType === 'touch') return;
    const c = (e.target as Element | null)?.closest?.<HTMLElement>(BOTAO_COM_LUZ) ?? null;
    if (c !== comLuz) {
      comLuz = c;
      let l: HTMLElement | null = null;
      if (c) {
        if (getComputedStyle(c).position === 'static') c.style.position = 'relative';
        l = document.createElement('i');
        l.className = 'px-luz';
        l.setAttribute('aria-hidden', 'true');
        c.append(l);
        const nova = l;
        requestAnimationFrame(() => nova.isConnected && nova.classList.add('on'));
      }
      apagarLuzes(l);
    }
    if (c) {
      const r = c.getBoundingClientRect();
      const l = c.lastElementChild as HTMLElement | null;
      if (l?.classList.contains('px-luz')) {
        l.style.setProperty('--mx', e.clientX - r.left + 'px');
        l.style.setProperty('--my', e.clientY - r.top + 'px');
      }
    }
    const k = c && c.matches('.q-tile:not(.em-linha)') ? c : null;
    if (!k) return soltarTilt();
    if (til && til.el !== k) zerarTilt();
    const r = k.getBoundingClientRect();
    const forca = Math.min(1, 320 / r.width) * 8;
    const novo = !til;
    til ??= { el: k, v: [0, 0, 0, 1], ax: 0, ay: 0, saindo: false, aperta: false };
    til.saindo = false;
    til.ay = ((e.clientX - r.left) / r.width - 0.5) * 2 * forca;
    til.ax = -((e.clientY - r.top) / r.height - 0.5) * 2 * forca;
    if (novo) {
      k.style.transition = 'box-shadow 0.25s ease, border-color 0.16s ease, background-color 0.16s ease';
      requestAnimationFrame(quadroTilt);
    }
  };

  /* ---- Onda no toque (`prototipo.js:1276-1294`) ---- */
  const aoApertar = (e: PointerEvent) => {
    if (til) til.aperta = true;
    if (!polido() || reduz()) return;
    const b = (e.target as Element | null)?.closest?.<HTMLElement>(COM_ONDA);
    if (!b || (b as HTMLButtonElement).disabled) return;
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    const r = b.getBoundingClientRect();
    const d = Math.hypot(r.width, r.height) * 2;
    const caixa = document.createElement('i');
    caixa.className = 'px-onda-caixa';
    caixa.setAttribute('aria-hidden', 'true');
    const o = document.createElement('i');
    o.className = 'px-onda';
    o.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    caixa.append(o);
    b.append(caixa);
    const some = () => caixa.remove();
    window.setTimeout(some, 1200); /* a onda nunca fica presa se a animação congelar */
    anima(
      o,
      [
        { transform: 'scale(0)', opacity: 0.28 },
        { transform: 'scale(1)', opacity: 0 },
      ],
      {
        d: 750,
        fill: 'forwards',
      },
    ).finished.then(some, some);
  };
  const aoSoltar = () => {
    if (til) til.aperta = false;
  };

  /* ---- Aura que segue o ponteiro (`prototipo.js:792-848`, `efeitos.css:7-22`) ---- */
  let mouse = [innerWidth / 2, innerHeight / 2];
  const aura = [innerWidth / 2, innerHeight / 3];
  let auraEl: HTMLElement | null = null;
  const garantirAura = (main: HTMLElement): HTMLElement => {
    if (auraEl?.isConnected && auraEl.parentElement === main) return auraEl;
    auraEl = document.createElement('div');
    auraEl.className = 'px-aura';
    auraEl.setAttribute('aria-hidden', 'true');
    main.prepend(auraEl);
    return auraEl;
  };
  const quadroDaAura = () => {
    if (!vivo) return;
    aura[0] += (mouse[0] - aura[0]) * 0.07;
    aura[1] += (mouse[1] - aura[1]) * 0.07;
    const main = document.querySelector<HTMLElement>('main');
    if (main && polido()) {
      const mr = main.getBoundingClientRect();
      garantirAura(main).style.transform = `translate(${aura[0] - mr.left - 310}px, ${aura[1] - mr.top - 310}px)`;
    }
    if (!document.hidden) requestAnimationFrame(quadroDaAura);
  };
  const aoVoltar = () => {
    if (!document.hidden) requestAnimationFrame(quadroDaAura);
  };

  document.addEventListener('pointermove', aoMover, { passive: true });
  document.addEventListener('pointerleave', soltarPonteiro);
  document.documentElement.addEventListener('pointerleave', soltarPonteiro);
  window.addEventListener('blur', soltarPonteiro);
  window.addEventListener('pointerup', aoSoltar);
  document.addEventListener('pointerdown', aoApertar, { passive: true });
  document.addEventListener('visibilitychange', aoVoltar);
  requestAnimationFrame(quadroDaAura);

  return () => {
    vivo = false;
    document.removeEventListener('pointermove', aoMover);
    document.removeEventListener('pointerleave', soltarPonteiro);
    document.documentElement.removeEventListener('pointerleave', soltarPonteiro);
    window.removeEventListener('blur', soltarPonteiro);
    window.removeEventListener('pointerup', aoSoltar);
    document.removeEventListener('pointerdown', aoApertar);
    document.removeEventListener('visibilitychange', aoVoltar);
    zerarTilt();
    apagarLuzes();
    auraEl?.remove();
  };
}
