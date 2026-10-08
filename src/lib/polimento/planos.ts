/**
 * PLANOS E OFERTA — porte de `telas2.js:9-25, 108-117, 622-634`, `telas.js:484-519` e
 * `prototipo.js:816-834`, com os mesmos números.
 *
 * No protótipo a tela de Planos é um `innerHTML` que ele mesmo troca (`repintar`); no app quem troca o
 * miolo é o React, e estas funções rodam logo depois, sobre o que ele desenhou.
 *
 * Itens da lista `fidelidade/casca-e-telas.md`: D54–D59.
 */
import type { Plan } from '../entitlements';
import { anima, EG, MOLA, MOLA_SUAVE, polido, reduz } from './base';

const comMovimento = () => polido() && !reduz();

/* ---- A troca de aba (`repintar`, `telas2.js:10-25`) -------------------------------------------- */

/**
 * O que vem depois das abas entra pelo lado: 56 px, desfoque de 6, 520 ms, 55 ms um do outro (até o
 * quinto). `dir` é 1 quando se avança e −1 quando um botão de dentro devolve à primeira aba.
 */
export function repintarPlanos(abas: HTMLElement | null, dir: number): void {
  if (!abas || !comMovimento()) return;
  let topo: HTMLElement = abas;
  while (topo.parentElement && !topo.parentElement.matches('.q-palco')) topo = topo.parentElement;
  let i = 0;
  for (let n = topo.nextElementSibling; n; n = n.nextElementSibling) {
    anima(
      n,
      [
        { opacity: 0, transform: `translateX(${56 * dir}px)`, filter: 'blur(6px)' },
        { opacity: 1, transform: 'translateX(0)', filter: 'blur(0)' },
      ],
      { d: 520, atraso: Math.min(i++, 5) * 55 },
    );
  }
}

/* ---- Perguntas frequentes (`telas2.js:622-634`) ------------------------------------------------- */

/** A pergunta abre e fecha com a altura animada (420 ms na mola suave), não num salto. */
export function alternarPergunta(e: { target: EventTarget | null; preventDefault: () => void }): void {
  const s = e.target instanceof Element ? e.target.closest('.px-faq summary') : null;
  const d = s?.parentElement;
  if (!(d instanceof HTMLDetailsElement) || !comMovimento()) return;
  e.preventDefault();
  const h0 = d.offsetHeight;
  d.open = !d.open;
  const h1 = d.offsetHeight;
  d.style.overflow = 'hidden';
  const solta = () => {
    d.style.overflow = '';
  };
  anima(d, [{ height: h0 + 'px' }, { height: h1 + 'px' }], { d: 420, e: MOLA_SUAVE, fill: 'none' }).finished.then(
    solta,
    solta,
  );
  const p = d.querySelector('p');
  if (d.open && p)
    anima(
      p,
      [
        { opacity: 0, transform: 'translateY(-8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { d: 360, atraso: 80 },
    );
}

/* ---- O confete (`prototipo.js:816-834`, desenhado como em `prototipo.js:867-886`) --------------- */

const CORES = ['#f04e23', '#ffb347', '#3f9b56', '#5b6ee1', '#f6d55c', '#ff7aa2'];

interface Papel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
  r: number;
  g: number;
  q: number;
  cor: string;
  giro: number;
  vg: number;
}

/**
 * `confete()` do protótipo. Lá os papéis entram na tela de partículas que já existe; aqui o confete
 * traz a própria tela, por cima de tudo, e a tira quando o último papel cai (como a `rajada` de
 * `captura.ts`).
 */
export function confete(n = 170): void {
  if (reduz() || typeof document === 'undefined') return;
  const cv = document.createElement('canvas');
  const cx = cv.getContext?.('2d');
  if (!cx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483647';
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  document.body.append(cv);
  let raj: Papel[] = [];
  for (let i = 0; i < n; i++) {
    raj.push({
      x: Math.random() * innerWidth,
      y: -20 - Math.random() * innerHeight * 0.5,
      vx: (Math.random() - 0.5) * 160,
      vy: 120 + Math.random() * 260,
      vida: 1,
      r: 4 + Math.random() * 5,
      g: 160,
      q: 0.3,
      cor: CORES[i % CORES.length],
      giro: Math.random() * 6,
      vg: (Math.random() - 0.5) * 14,
    });
  }
  let tAnt = performance.now();
  const quadro = (t: number) => {
    const real = (t - tAnt) / 1000;
    const dt = Math.min(0.05, real);
    tAnt = t;
    cx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of raj) {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vida -= real * p.q;
      cx.globalAlpha = Math.max(0, Math.min(1, p.vida * 2));
      cx.fillStyle = p.cor;
      p.giro += p.vg * dt;
      cx.save();
      cx.translate(p.x, p.y);
      cx.rotate(p.giro);
      cx.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
      cx.restore();
    }
    raj = raj.filter((p) => p.vida > 0 && p.y < innerHeight + 40);
    if (raj.length && cv.isConnected) requestAnimationFrame(quadro);
    else cv.remove();
  };
  requestAnimationFrame(quadro);
}

/** O teste começou (`ativarTeste`, `telas2.js:113-116`): o aparelho vibra e cai o confete. */
export function festejarTeste(): void {
  if (!comMovimento()) return;
  navigator.vibrate?.([12, 60, 12]);
  confete(120);
}

/* ---- A oferta (`telas.js:484-519`) --------------------------------------------------------------- */

/** A oferta sobe de baixo (680 ms na mola suave), o ícone gira para o lugar e os textos vêm em fila. */
export function entrarOferta(o: HTMLElement): void {
  if (!comMovimento()) return;
  anima(
    o,
    [
      { opacity: 0, translate: '0 120%' },
      { opacity: 1, translate: '0 0' },
    ],
    { d: 680, e: MOLA_SUAVE },
  );
  const icone = o.querySelector('.q-ic');
  if (icone)
    anima(icone, [{ transform: 'scale(0.4) rotate(-20deg)' }, { transform: 'scale(1) rotate(0deg)' }], {
      d: 700,
      atraso: 180,
      e: MOLA,
    });
  o.querySelectorAll('.qc-oferta-texto > *, .q-acoes > *').forEach((x, i) =>
    anima(
      x,
      [
        { opacity: 0, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { d: 420, atraso: 200 + i * 55 },
    ),
  );
}

/** `fecharOferta()`: desce em 280 ms e só então `depois` roda (é ele que a tira da tela). */
export function sairOferta(o: HTMLElement | null, depois: () => void): void {
  if (!o || !comMovimento()) return depois();
  let feito = false;
  const fim = () => {
    if (feito) return;
    feito = true;
    depois();
  };
  /* Numa aba em segundo plano o navegador congela a animação: o relógio garante a saída. */
  window.setTimeout(fim, 600);
  anima(o, [{ opacity: 0, translate: '0 120%' }], { d: 280, e: EG, fill: 'forwards' }).finished.then(fim, fim);
}

/* ---- A bancada ------------------------------------------------------------------------------------ */

const CHAVE_DA_PROVA = 'babel.px.planoDeProva';

/**
 * SÓ NA BANCADA: o servidor local é `selfhost` (tudo liberado), e ali a tela de Planos de quem está
 * no Grátis e a oferta nunca aparecem. Com `localStorage['babel.px.planoDeProva'] = 'free'` o
 * comparador (`scripts/polimento/roteiros/planos*.json`, `oferta*.json`) as vê como o Grátis as vê.
 *
 * Cercada por `import.meta.env.DEV`, como `liberacaoDev.ts`: num build de produção devolve `null`
 * antes de olhar o armazenamento. Muda só o que a tela DESENHA; quem concede plano é o servidor.
 */
export function planoDeProva(): 'free' | null {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  if (!env?.DEV) return null;
  try {
    return localStorage.getItem(CHAVE_DA_PROVA) === 'free' ? 'free' : null;
  } catch {
    return null;
  }
}
