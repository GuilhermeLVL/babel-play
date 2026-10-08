/**
 * PERSONALIZAR (Coleção, Temporada e Loja) — o comportamento de `telas2.js:285-477, 585-609` e
 * `telas3.js:108-160`, função por função, com os mesmos números. Quem desenha a tela é o React
 * (`views/personalizar/polimento/*`); aqui mora só o que no protótipo era JS de movimento, som e leitura.
 *
 * Itens da lista `fidelidade/casca-e-telas.md`: D34–D44.
 */
import { anima, limpar, MOLA, MOLA_SUAVE, polido, reduz } from './base';
import { centro, rajada } from './captura';

export { centro, rajada };

const html = (): HTMLElement => document.documentElement;

/* ---- As quatro faixas de cada tema (`telas2.js:302-313`) -------------------------------------- */

const VARS = ['--canvas', '--surface', '--accent', '--ink'] as const;
const amostras = new Map<string, string[]>();

/**
 * Lê as cores de cada tema direto do CSS do app: troca o atributo e destroca no mesmo quadro
 * (`telas2.js:304-313`). A leitura fica guardada por tema e por claro/escuro.
 */
export function lerAmostras(ids: readonly string[]): Record<string, string[]> {
  const raiz = html();
  const escuro = raiz.classList.contains('dark') ? 'e' : 'c';
  const saida: Record<string, string[]> = {};
  const faltam = ids.filter((id) => !amostras.has(`${escuro}:${id}`));
  if (faltam.length) {
    const era = raiz.dataset.theme;
    for (const id of faltam) {
      raiz.dataset.theme = id;
      const cs = getComputedStyle(raiz);
      amostras.set(
        `${escuro}:${id}`,
        VARS.map((v) => cs.getPropertyValue(v).trim() || '#888'),
      );
    }
    if (era === undefined) delete raiz.dataset.theme;
    else raiz.dataset.theme = era;
  }
  for (const id of ids) saida[id] = amostras.get(`${escuro}:${id}`) ?? ['#888', '#888', '#888', '#888'];
  return saida;
}

/* ---- O painel entra pelo lado depois de uma troca local (`repintar`, `telas2.js:17-24`) -------- */

/** Os irmãos que vêm depois de `g` (ou do bloco dele dentro do palco) entram de lado: 56 px, 520 ms. */
export function entrarDepoisDe(g: Element | null, dir = 1): void {
  if (!g || !polido() || reduz()) return;
  let topo: Element = g;
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

/* ---- A aba ativa à vista (`abaAVista`, `sentidos.js:292-299`) ---------------------------------- */

/** Numa barra de abas que rola de lado (o celular), a aba escolhida vai para o meio. */
export function abaAVista(g: HTMLElement | null): void {
  if (!g || !polido()) return;
  const a = g.querySelector<HTMLElement>('.q-aba[aria-selected="true"], .q-aba[aria-checked="true"]');
  if (!a || g.scrollWidth <= g.clientWidth + 2) return;
  g.scrollLeft = a.offsetLeft - (g.clientWidth - a.offsetWidth) / 2;
}

/* ---- Temporada: ir para o nível (`telas3.js:116-122`) ----------------------------------------- */

export function irParaNivel(raiz: ParentNode, n: number): void {
  const alvo = raiz.querySelector<HTMLElement>(`.px-degrau[data-nivel="${n}"]`);
  const trilha = raiz.querySelector<HTMLElement>('.px-trilha');
  if (!alvo || !trilha) return;
  const vivo = polido() && !reduz();
  trilha.scrollTo?.({ left: alvo.offsetLeft - 120, behavior: vivo ? 'smooth' : 'auto' });
  if (vivo)
    alvo.querySelectorAll('.px-premio').forEach((p, i) =>
      anima(p, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], {
        d: 620,
        atraso: 420 + i * 90,
        e: MOLA,
      }),
    );
}

/** Resgatar (`telas2.js:607`): a faísca sai do prêmio e o aparelho vibra. */
export function comemorarResgate(x: number, y: number): void {
  if (!polido() || reduz()) return;
  rajada(x, y, 24, 1.2);
  navigator.vibrate?.(12);
}

/* ---- Som (`sentidos.js:13-45, 79, 113-130`): o tom de segurar e a moeda ------------------------ */

type ComWebkit = Window & { webkitAudioContext?: typeof AudioContext };
let ac: AudioContext | null = null;
let mestre: GainNode | null = null;

/** O som do app está ligado? (o interruptor "Som" dos Ajustes, `babel.sound_enabled`). */
function comSom(): boolean {
  try {
    return localStorage.getItem('babel.sound_enabled') !== 'false';
  } catch {
    return true;
  }
}

/** `audio()` de `sentidos.js:13-26`: um contexto só, com o ganho mestre em 0,55 e um compressor. */
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ac) {
    const AC = window.AudioContext ?? (window as ComWebkit).webkitAudioContext;
    if (!AC) return null;
    try {
      ac = new AC();
    } catch {
      return null;
    }
    mestre = ac.createGain();
    mestre.gain.value = 0.55;
    const comp = ac.createDynamicsCompressor();
    mestre.connect(comp).connect(ac.destination);
  }
  if (ac.state === 'suspended') void ac.resume();
  return ac;
}

/** `nota()` de `sentidos.js:27-42`, só com o que a moeda usa. */
function nota(f: number, t: number, d: number, g: number): void {
  const a = audio();
  if (!a || !mestre) return;
  const t0 = a.currentTime + t;
  const o = a.createOscillator();
  const v = a.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(f, t0);
  v.gain.setValueAtTime(0.0001, t0);
  v.gain.exponentialRampToValueAtTime(g, t0 + 0.006);
  v.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(v).connect(mestre);
  o.start(t0);
  o.stop(t0 + d + 0.02);
}

/**
 * `sentir('moeda')` (`sentidos.js:79, 87, 94-110`): três notas agudas e o toque curto no aparelho.
 * Só no modo Polido, como lá.
 */
export function sentirMoeda(): void {
  if (!polido()) return;
  if (comSom()) {
    try {
      [1318, 1760, 2093].forEach((f, i) => nota(f, i * 0.055, 0.16, 0.06));
    } catch {
      /* sem áudio neste navegador */
    }
  }
  if (!reduz()) navigator.vibrate?.([8, 30, 8]);
}

/**
 * `somSegurar()` de `sentidos.js:113-130`: o tom sobe de 280 a 980 Hz em 1,1 s enquanto o dedo segura
 * e some se soltar antes. Devolve como calar.
 */
export function somSegurar(): () => void {
  const a = comSom() && polido() ? audio() : null;
  if (!a || !mestre) return () => undefined;
  const o = a.createOscillator();
  const v = a.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(280, a.currentTime);
  o.frequency.exponentialRampToValueAtTime(980, a.currentTime + 1.1);
  v.gain.setValueAtTime(0.0001, a.currentTime);
  v.gain.exponentialRampToValueAtTime(0.06, a.currentTime + 0.05);
  o.connect(v).connect(mestre);
  o.start();
  let calado = false;
  return () => {
    if (calado) return;
    calado = true;
    v.gain.cancelScheduledValues(a.currentTime);
    v.gain.setTargetAtTime(0.0001, a.currentTime, 0.02);
    o.stop(a.currentTime + 0.1);
  };
}

/* ---- Loja: segurar para comprar (`telas2.js:435-457`) ----------------------------------------- */

/** Quanto o dedo segura até a compra valer (`telas2.js:440`). */
export const SEGURAR_MS = 1100;

/**
 * Arma a compra no botão `b` (chamado no `pointerdown`). O fundo enche da esquerda para a direita em
 * 1100 ms, linear; soltar ou sair do botão antes cala o tom e recolhe o fundo em 200 ms. Se o dedo
 * ficar até o fim, `aoConcluir` roda (é ele que compra de verdade).
 *
 * Gastar Seeds não pode acontecer num toque sem querer.
 */
export function armarCompra(b: HTMLElement, aoConcluir: () => void): void {
  const fundo = b.querySelector<HTMLElement>('.px-segurar-fundo');
  if (!fundo) return;
  const a = anima(fundo, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], {
    d: SEGURAR_MS,
    e: 'linear',
    fill: 'forwards',
  });
  const calar = somSegurar();
  let solto = false;
  const soltar = () => {
    solto = true;
    calar();
    a.finished.catch(() => undefined);
    a.cancel();
    limpar(fundo);
    anima(
      fundo,
      [
        { clipPath: 'inset(0 0 0 0)', opacity: 0.6 },
        { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
      ],
      { d: 200 },
    );
  };
  b.addEventListener('pointerup', soltar, { once: true });
  b.addEventListener('pointerleave', soltar, { once: true });
  a.finished.then(
    () => {
      if (solto) return;
      b.removeEventListener('pointerup', soltar);
      b.removeEventListener('pointerleave', soltar);
      calar();
      aoConcluir();
    },
    () => undefined,
  );
}

/** O fundo do botão volta ao começo (a compra foi recusada pelo servidor: nada foi cobrado). */
export function desarmarCompra(b: Element | null): void {
  const fundo = b?.querySelector('.px-segurar-fundo');
  if (fundo) limpar(fundo);
}

/** A festa da compra (`telas2.js:466-471`): vibra, solta a faísca e o cartão novo gira para dentro. */
export function comemorarCompra(x: number, y: number, novo: Element | null): void {
  if (!polido() || reduz()) return;
  navigator.vibrate?.([10, 40, 16]);
  rajada(x, y, 34, 1.4);
  if (novo)
    anima(novo, [{ transform: 'scale(0.94) rotateY(60deg)' }, { transform: 'scale(1) rotateY(0deg)' }], {
      d: 760,
      e: MOLA_SUAVE,
    });
}

/* ---- Loja: prévia do efeito (`telas2.js:429-434`) --------------------------------------------- */

const CORES = ['#f04e23', '#ffb347', '#3f9b56', '#5b6ee1', '#f6d55c', '#ff7aa2'];

interface Papel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
  r: number;
  cor: string;
  giro: number;
  vg: number;
}

/**
 * `confete()` de `prototipo.js:816-834`, desenhado como em `prototipo.js:867-886`. Lá o papel picado
 * entra na tela de partículas que já existe; aqui ele traz a própria tela e a tira quando acaba.
 */
export function confete(n = 170): void {
  if (reduz()) return;
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
      p.vy += 160 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vida -= real * 0.3;
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

/** As artes em CSS do protótipo (`telas2.js:326-334`, `telas2.css:208-240`). */
export type ArteDaLoja = 'legenda' | 'fita' | 'pixel' | 'cartao' | 'brasa' | 'paleta' | 'confete';

/**
 * `previaDoEfeito()` de `telas2.js:429-434`. Devolve `true` quando a prévia foi um efeito na tela;
 * `false` quando quem chama deve avisar "Prévia aplicada na vitrine da Coleção.".
 */
export function previaDoEfeito(arte: string | undefined, deOnde: Element): boolean {
  const [x, y] = centro(deOnde);
  if (arte === 'confete') {
    confete(90);
    return true;
  }
  if (arte === 'pixel' || arte === 'brasa') {
    rajada(x, y, 26, 1.3);
    return true;
  }
  return false;
}
