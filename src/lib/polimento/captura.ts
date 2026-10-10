/**
 * CAPTURAR — o comportamento do protótipo de polimento, função por função, com os mesmos números.
 *
 *   - a captura pronta e o toque em Iniciar: `direto.js:33-62`;
 *   - a fala ao vivo (linha nova, palavra por palavra, a tradução que assume a linha): `telas.js:111-160`;
 *   - "Guardar" com faísca, na folha da palavra: `telas.js:243-253`;
 *   - as legendas flutuantes (entrar, arrastar, jogar para o canto, espelho das falas): `telas.js:261-380`;
 *   - a mola que herda a velocidade do dedo: `telas.js:30-48`; a rajada: `prototipo.js:808-815, 867-886`.
 *
 * Itens da lista `fidelidade/casca-e-telas.md`: D6–D18. Quem decide SE anima é quem chama, com
 * `polido() && !reduz()`, como no protótipo; aqui só mora o que cada momento faz.
 */
import { anima, limpar, MOLA, MOLA_SUAVE, polido, reduz } from './base';
import { elastico } from './folha';
import { sentir, vibrar } from './sentidos';

const $$ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode) => [...r.querySelectorAll<T>(s)];

/** `celular()` de `prototipo.js:385`. */
export const celular = (): boolean => window.matchMedia?.('(max-width: 720px)').matches ?? false;

/** O protótipo anima quando está polido e a pessoa não pediu menos movimento. */
export const comMovimento = (): boolean => polido() && !reduz();

/* ---- A captura pronta ------------------------------------------------------------------------ */

/**
 * `prepararVivo()` de `direto.js:43-46`: o ícone cresce na mola e o resto sobe em cascata.
 *
 * A marca do topo e a nota do nível de serviço ficam DE FORA desta cascata, como no protótipo dos
 * planos: lá elas são postas na tela depois dela (`planos4.js:293-298`), e a fileira nova tem a sua
 * (`lib/polimento/niveis.ts`). Sem isto, a marca empurraria em 60 ms cada botão que vem depois dela.
 *
 * NA TELA ENXUTA (`enxuto.js`) o chip de estado também entra depois (`enxuto.js:80, 96`) e tem a entrada
 * dele (`entraSuave`, 180 ms). E no protótipo o chip do modelo e o botão de ajuda continuam na fileira,
 * só escondidos (`enxuto.css:10`), e contam na cascata: aqui eles não existem, então quem vem depois do
 * idioma pula uma posição (o chip do modelo) e o miolo pula duas (o chip e a ajuda). Cada peça sobe no
 * mesmo instante do protótipo.
 */
export function entrarPronta(v: HTMLElement): void {
  if (!comMovimento()) return;
  const ic = v.querySelector('.px-pronto-miolo .q-ic');
  if (ic) anima(ic, [{ transform: 'scale(0.4)' }, { transform: 'scale(1)' }], { d: 700, atraso: 200, e: MOLA });
  const enxuta = !!v.querySelector('.px-vivo-topo > .ex-estado');
  $$(
    '.px-vivo-topo > :not(.pl-onde):not(.ex-estado), .px-pronto-miolo > :not(.q-ic):not(.pl-nota):not(.pl-sem)',
    v,
  ).forEach((x, i) => {
    const pulo = !enxuta || i === 0 ? 0 : x.parentElement?.classList.contains('px-vivo-topo') ? 1 : 2;
    anima(
      x,
      [
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { d: 480, atraso: 120 + (i + pulo) * 60 },
    );
  });
}

/** `iniciarVivo()` de `direto.js:60`: o botão afunda e volta na mola. */
export function afundarBotao(botao: Element | null): void {
  if (!comMovimento() || !botao) return;
  anima(botao, [{ transform: 'scale(1)' }, { transform: 'scale(0.9)' }, { transform: 'scale(1)' }], {
    d: 420,
    e: MOLA,
  });
}

/** `iniciarVivo()` de `direto.js:61`: o miolo sai. Resolve quando a legenda pode ocupar o lugar. */
export function sairMiolo(miolo: Element | null): Promise<unknown> {
  if (!comMovimento() || !miolo) return Promise.resolve();
  return anima(miolo, [{ opacity: 0, transform: 'scale(0.9)', filter: 'blur(8px)' }], {
    d: 260,
    fill: 'forwards',
  }).finished.catch(() => undefined);
}

/* ---- A fala ao vivo -------------------------------------------------------------------------- */

/** A linha nova, `telas.js:127`. */
export function entrarLinha(linha: Element): void {
  if (!comMovimento()) return;
  limpar(linha);
  anima(
    linha,
    [
      { opacity: 0, transform: 'translateY(26px) scale(0.98)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ],
    { d: 520 },
  );
}

/**
 * A linha de ESCUTA que acabou sem texto (ruído, silêncio) sai sem alarde. O protótipo não tem este
 * momento (lá toda fala tem texto); o jeito é o de `sairFlutuante`: o React tira a linha na hora, e uma
 * cópia sem toque fica no lugar, apaga, fecha a altura e some. Sem movimento, a linha só sai.
 *
 * Chamada na desmontagem, com a linha AINDA no documento. A cópia só nasce depois, se a linha saiu
 * mesmo: em desenvolvimento o React desmonta e remonta os efeitos sem tirar nada da tela.
 */
export function sairLinhaVazia(linha: HTMLElement): void {
  const pai = linha.parentElement;
  if (!comMovimento() || !pai) return;
  const altura = linha.getBoundingClientRect().height;
  const seguinte = linha.nextSibling;
  queueMicrotask(() => {
    if (linha.isConnected || !pai.isConnected) return;
    const copia = linha.cloneNode(true) as HTMLElement;
    copia.removeAttribute('data-fala');
    copia.setAttribute('aria-hidden', 'true');
    copia.setAttribute('inert', '');
    copia.style.pointerEvents = 'none';
    copia.style.overflow = 'hidden';
    pai.insertBefore(copia, seguinte?.parentNode === pai ? seguinte : null);
    const some = () => copia.remove();
    window.setTimeout(some, 400); /* a cópia nunca fica presa se a animação não terminar */
    anima(
      copia,
      [
        { opacity: 1, height: `${altura}px` },
        { opacity: 0, height: '0px', paddingBlock: '0px', borderBlockWidth: '0px' },
      ],
      { d: 180, e: 'ease', fill: 'forwards' },
    ).finished.then(some, some);
  });
}

/** Cada palavra que chega, `telas.js:134`. */
export function entrarPalavra(s: Element): void {
  if (!comMovimento()) return;
  anima(
    s,
    [
      { opacity: 0, filter: 'blur(6px)', transform: 'translateY(6px)' },
      { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' },
    ],
    { d: 320 },
  );
}

/** A original sai para a tradução entrar, `telas.js:149`. Resolve quando dá para trocar o texto. */
export function sairOriginal(alvo: Element): Promise<unknown> {
  if (!comMovimento()) return Promise.resolve();
  return anima(alvo, [{ opacity: 0, filter: 'blur(6px)' }], { d: 140, e: 'ease', fill: 'forwards' }).finished.catch(
    () => undefined,
  );
}

/** A tradução assume a linha grande e a original sobe para a pequena, `telas.js:151-153`. */
export function entrarTraducao(alvo: Element, original: Element | null): void {
  sentir('fala'); /* `telas.js:156` */
  limpar(alvo);
  if (!comMovimento()) return;
  anima(
    alvo,
    [
      { opacity: 0, filter: 'blur(8px)', transform: 'translateY(10px)' },
      { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' },
    ],
    { d: 480 },
  );
  if (original)
    anima(
      original,
      [
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { d: 420 },
    );
}

/** `fim()` de `telas.js:126`: a lista vai ao fim, suave quando há movimento. */
export function irAoFim(hist: HTMLElement): void {
  if (typeof hist.scrollTo === 'function')
    hist.scrollTo({ top: hist.scrollHeight, behavior: comMovimento() ? 'smooth' : 'auto' });
  else hist.scrollTop = hist.scrollHeight;
}

/* ---- As folhas ------------------------------------------------------------------------------ */

/**
 * `folhaDeBaixo()` de `telas.js:180-186`: a folha sobe de baixo e o conteúdo vem em cascata. A
 * primeira subida é de `dialogos.ts` (o diálogo que abre); esta é a de quando a MESMA folha troca de
 * conteúdo (da frase para a palavra e de volta), que no protótipo é uma folha nova.
 */
export function entrarFolha(d: HTMLElement): void {
  if (!comMovimento()) return;
  limpar(d);
  anima(d, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { d: 560, e: MOLA_SUAVE });
  $$('.folha-corpo > *, .folha-acao, .folha-palavras button', d).forEach((x, i) =>
    anima(
      x,
      [
        { opacity: 0, transform: 'translateY(16px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { d: 420, atraso: 120 + Math.min(i, 14) * 30 },
    ),
  );
}

/* ---- A rajada (`prototipo.js:808-815`, desenhada como em `prototipo.js:867-886`) -------------- */

interface Faisca {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
  r: number;
  g: number;
  q: number;
}

/** `centro()` de `prototipo.js:897-900`. */
export const centro = (el: Element): [number, number] => {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
};

/**
 * `rajada()` do protótipo. Lá as faíscas entram na tela de partículas que já existe; aqui a rajada
 * traz a própria tela, por cima de tudo (a folha é um `<dialog>` modal), e a tira quando acaba.
 */
export function rajada(x: number, y: number, n = 14, forca = 1, dentroDe: Element = document.body): void {
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
  dentroDe.append(cv);
  const estilo = getComputedStyle(document.documentElement);
  const cor = estilo.getPropertyValue('--q-acento').trim() || estilo.getPropertyValue('--accent').trim() || '#f04e23';
  let raj: Faisca[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const v = (110 + Math.random() * 220) * forca;
    raj.push({
      x,
      y,
      vx: Math.cos(ang) * v,
      vy: Math.sin(ang) * v - 80,
      vida: 1,
      r: 2 + Math.random() * 3.5,
      g: 520,
      q: 1.3,
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
      cx.fillStyle = cor;
      cx.beginPath();
      cx.arc(p.x, p.y, p.r, 0, 6.3);
      cx.fill();
    }
    raj = raj.filter((p) => p.vida > 0 && p.y < innerHeight + 40);
    if (raj.length && cv.isConnected) requestAnimationFrame(quadro);
    else cv.remove();
  };
  requestAnimationFrame(quadro);
}

/** "Guardar" na folha da palavra, `telas.js:248-253`: o botão pula, o ícone gira para dentro e sai a faísca. */
export function comemorarGuardada(botao: HTMLElement): void {
  if (!comMovimento()) return;
  vibrar(10);
  anima(botao, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], {
    d: 520,
    e: MOLA,
  });
  const svg = botao.querySelector('svg');
  if (svg)
    anima(svg, [{ transform: 'scale(0) rotate(-90deg)' }, { transform: 'scale(1) rotate(0deg)' }], {
      d: 520,
      e: MOLA,
    });
  rajada(...centro(botao), 16, 1, botao.closest('dialog') ?? document.body);
}

/* ---- A mola física (`telas.js:30-48`): para o que o dedo solta, herdando a velocidade -------- */

export function molaFisica(
  de: number,
  ate: number,
  v0: number,
  aoPasso: (x: number) => void,
  zeta = 0.8,
  resp = 0.42,
): { parar: () => void } {
  const k = ((2 * Math.PI) / resp) ** 2;
  const c = 2 * zeta * Math.sqrt(k);
  let x = de;
  let v = v0;
  let t0 = performance.now();
  let vivo = true;
  const passo = (t: number) => {
    if (!vivo) return;
    const dt = Math.min(0.032, (t - t0) / 1000);
    t0 = t;
    v += (-k * (x - ate) - c * v) * dt;
    x += v * dt;
    if (Math.abs(x - ate) < 0.4 && Math.abs(v) < 6) return aoPasso(ate);
    aoPasso(x);
    requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
  return { parar: () => (vivo = false) };
}

/* ---- As legendas flutuantes (`telas.js:281-380`) ---------------------------------------------- */

export interface Flutuante {
  /** A janela cresceu com fala nova: se passou da borda, volta para dentro (`telas.js:329-335`). */
  ajustar: () => void;
  /** Para as molas e solta os ouvintes. */
  desligar: () => void;
}

/**
 * `abrirFlutuante()` de `telas.js:313-379`, da parte que posiciona e arrasta: a janela parte do canto
 * de cima à direita, segue o dedo, resiste fora dos limites e, solta, pousa no canto para onde ia.
 */
export function ligarFlutuante(el: HTMLElement): Flutuante {
  if (!polido()) return { ajustar: () => undefined, desligar: () => undefined };
  sentir('abre'); /* `abrirFlutuante`, `sentidos.js:145` */
  const app = el.parentElement ?? document.body;
  const M = 16;
  const pos = { x: 0, y: 0 };
  let mx: { parar: () => void } | null = null;
  let my: { parar: () => void } | null = null;
  let ligado = true;
  const cantos = () => {
    const r = el.getBoundingClientRect();
    const a = app.getBoundingClientRect();
    const trilho = document.querySelector<HTMLElement>('.q-trilho');
    const esq = celular() ? M : (trilho?.offsetWidth || 0) + M;
    return {
      xs: [esq, a.width - r.width - M] as [number, number],
      ys: [M, a.height - r.height - M - (celular() ? 86 : 0)] as [number, number],
    };
  };
  Object.assign(el.style, {
    left: '0',
    top: '0',
    right: 'auto',
    bottom: 'auto',
    touchAction: 'none',
    willChange: 'transform',
  });
  const por = () => (el.style.transform = `translate(${pos.x}px, ${pos.y}px)`);
  const c0 = cantos();
  pos.x = c0.xs[1];
  pos.y = c0.ys[0];
  por();
  let a: { id: number; dx: number; dy: number; hist: Array<[number, number, number]> } | null = null;
  const ajustar = () => {
    if (a || !ligado) return;
    const c = cantos();
    pos.x = Math.min(pos.x, c.xs[1]);
    pos.y = Math.min(pos.y, c.ys[1]);
    por();
  };
  if (!reduz())
    anima(
      el,
      [
        { opacity: 0, scale: '0.7', filter: 'blur(8px)' },
        { opacity: 1, scale: '1', filter: 'blur(0)' },
      ],
      { d: 560, e: MOLA_SUAVE },
    );
  const aoApertar = (e: PointerEvent) => {
    if (a || (e.target as Element).closest('button:not(.leg-tit)')) return;
    /* Pegar no meio do voo: as molas param e o arrasto continua de onde a janela está. */
    mx?.parar();
    my?.parar();
    el.setPointerCapture?.(e.pointerId);
    a = {
      id: e.pointerId,
      dx: e.clientX - pos.x,
      dy: e.clientY - pos.y,
      hist: [[performance.now(), e.clientX, e.clientY]],
    };
    el.classList.add('px-pegou');
  };
  const aoMover = (e: PointerEvent) => {
    if (!a || e.pointerId !== a.id) return;
    const c = cantos();
    const livre = (v: number, [min, max]: [number, number]) =>
      v < min ? min + elastico(v - min, 120) : v > max ? max + elastico(v - max, 120) : v;
    pos.x = livre(e.clientX - a.dx, c.xs);
    pos.y = livre(e.clientY - a.dy, c.ys);
    a.hist.push([performance.now(), e.clientX, e.clientY]);
    if (a.hist.length > 6) a.hist.shift();
    por();
  };
  const soltar = (e: PointerEvent) => {
    if (!a || e.pointerId !== a.id || !ligado) return;
    const g = a;
    a = null;
    el.classList.remove('px-pegou');
    const [t0, x0, y0] = g.hist[0];
    const [t1, x1, y1] = g.hist[g.hist.length - 1];
    const dt = Math.max(1, t1 - t0) / 1000;
    const vx = g.hist.length > 1 ? (x1 - x0) / dt : 0;
    const vy = g.hist.length > 1 ? (y1 - y0) / dt : 0;
    /* Projeção de momento (a mesma conta da rolagem): decide pelo ponto para onde a janela IA. */
    const proj = (v: number) => ((v / 1000) * 0.998) / (1 - 0.998);
    const c = cantos();
    const perto = (v: number, op: number[]) => op.reduce((m, o) => (Math.abs(o - v) < Math.abs(m - v) ? o : m));
    const ax = perto(pos.x + proj(vx) * 0.4, c.xs);
    const ay = perto(pos.y + proj(vy) * 0.4, c.ys);
    if (reduz()) {
      pos.x = ax;
      pos.y = ay;
      por();
      return;
    }
    /* Uma mola por eixo, cada uma herdando a velocidade do dedo: não há emenda entre arrastar e pousar. */
    mx = molaFisica(pos.x, ax, vx, (x) => {
      if (!ligado) return;
      pos.x = x;
      por();
    });
    my = molaFisica(pos.y, ay, vy, (y) => {
      if (!ligado) return;
      pos.y = y;
      por();
    });
  };
  el.addEventListener('pointerdown', aoApertar);
  el.addEventListener('pointermove', aoMover);
  el.addEventListener('pointerup', soltar);
  el.addEventListener('pointercancel', soltar);
  return {
    ajustar,
    desligar: () => {
      ligado = false;
      mx?.parar();
      my?.parar();
      el.removeEventListener('pointerdown', aoApertar);
      el.removeEventListener('pointermove', aoMover);
      el.removeEventListener('pointerup', soltar);
      el.removeEventListener('pointercancel', soltar);
    },
  };
}

/**
 * `fecharFlutuante()` de `telas.js:281-290`. O React tira a janela do documento na hora; para a saída
 * existir, uma cópia sem toque fica no lugar, anima e some.
 */
export function sairFlutuante(el: HTMLElement, pai: Element | null): void {
  sentir('fecha'); /* `abrirFlutuante` com a janela aberta, `sentidos.js:145` */
  if (!comMovimento() || !pai?.isConnected) return;
  const copia = el.cloneNode(true) as HTMLElement;
  copia.removeAttribute('id');
  copia.setAttribute('aria-hidden', 'true');
  copia.setAttribute('inert', '');
  copia.style.pointerEvents = 'none';
  pai.append(copia);
  const some = () => copia.remove();
  window.setTimeout(some, 420); /* a cópia nunca fica presa se a animação não terminar */
  anima(copia, [{ opacity: 0, scale: '0.85', filter: 'blur(6px)' }], { d: 220, fill: 'forwards' }).finished.then(
    some,
    some,
  );
}

/** A fala nova no espelho, `telas.js:271`. */
export function entrarFalaNoEspelho(l: Element): void {
  if (!comMovimento()) return;
  anima(
    l,
    [
      { opacity: 0, transform: 'translateY(18px)', filter: 'blur(6px)' },
      { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
    ],
    { d: 420 },
  );
}

/** A tradução que chega no espelho, `telas.js:278`. */
export function entrarTraducaoNoEspelho(t: Element): void {
  if (!comMovimento()) return;
  anima(
    t,
    [
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { d: 380 },
  );
}
