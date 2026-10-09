/**
 * OS PAINÉIS ("Mais") — porte de `prototipo.js:383-557`: nascem do botão que os abriu, a tela de trás
 * recua, e saem pelo mesmo caminho. No celular viram folha de baixo, que se arrasta para fechar.
 *
 * No protótipo é ele quem põe e tira o painel do documento. No app é o React, que tira o painel na
 * hora em que fecha; para a saída existir, o painel que acabou de sair volta ao lugar como um
 * fantasma (sem toque, sem foco), anima a saída e então some de vez.
 *
 * Itens da lista `fidelidade/casca-e-telas.md`: B20–B26 e as folhas de baixo (2.10).
 */
import { anima, EG, limpar, MOLA_SUAVE, polido, reduz } from './base';

const $$ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode) => [...r.querySelectorAll<T>(s)];

const celular = () => window.matchMedia?.('(max-width: 720px)').matches ?? false;

/** `elastico()` de `prototipo.js:698`. */
export const elastico = (v: number, dim = 120, c = 0.55) => (v * dim * c) / (dim + c * Math.abs(v));

interface Folha {
  el: HTMLElement;
  painel: HTMLElement;
  gatilho: Element | null;
}

let folha: Folha | null = null;
/** Como a folha foi fechada pelo dedo (para a saída sair mais rápido, `prototipo.js:526`). */
let jogada: { vel: number } | null = null;
const fantasmas = new WeakSet<Node>();
const alturas = new WeakMap<Element, number>();
let ultimoGatilho: { el: Element; quando: number } | null = null;

const principal = () => document.querySelector('main');

/** O botão tocado há pouco: é dele que o painel ou o diálogo nasce. */
export function gatilhoRecente(): Element | null {
  return ultimoGatilho && performance.now() - ultimoGatilho.quando < 700 ? ultimoGatilho.el : null;
}

/** O painel cresce a partir do centro do botão que o abriu (`prototipo.js:454-459`). */
function origem(painel: HTMLElement, gatilho: Element | null): void {
  const r = painel.getBoundingClientRect();
  const g = gatilho?.getBoundingClientRect?.();
  painel.style.transformOrigin =
    g && g.width ? `${g.left + g.width / 2 - r.left}px ${g.top + g.height / 2 - r.top}px` : '50% 50%';
}

/**
 * Arrastar a folha: segue o dedo para baixo, resiste para cima, e ao soltar decide pelo ponto para
 * onde o gesto IA (`prototipo.js:404-447`).
 */
function arrastarFolha(f: Folha): void {
  const p = f.painel;
  let a: { id: number; y0: number; t: number; hist: Array<[number, number]>; indo: boolean } | null = null;
  p.addEventListener('pointerdown', (e) => {
    if (a || (e.target as Element).closest('button, input, a')) return;
    if (e.clientY - p.getBoundingClientRect().top > 76) return;
    a = { id: e.pointerId, y0: e.clientY, t: 0, hist: [[performance.now(), e.clientY]], indo: false };
    p.setPointerCapture?.(e.pointerId);
  });
  p.addEventListener('pointermove', (e) => {
    if (!a || e.pointerId !== a.id) return;
    const dy = e.clientY - a.y0;
    if (!a.indo) {
      if (Math.abs(dy) < 6) return;
      a.indo = true;
      limpar(p);
      f.el.classList.add('px-arrastando');
    }
    a.t = dy > 0 ? dy : elastico(dy, 90);
    a.hist.push([performance.now(), e.clientY]);
    if (a.hist.length > 6) a.hist.shift();
    p.style.transform = `translateY(${a.t}px)`;
    f.el.style.setProperty('--px-prog', String(Math.max(0, 1 - a.t / p.offsetHeight)));
  });
  const soltar = (e: PointerEvent) => {
    if (!a || e.pointerId !== a.id) return;
    const g = a;
    a = null;
    if (!g.indo) return;
    f.el.classList.remove('px-arrastando');
    const [t0, y0] = g.hist[0];
    const [t1, y1] = g.hist[g.hist.length - 1];
    const vel = t1 > t0 ? ((y1 - y0) / (t1 - t0)) * 1000 : 0; /* px/s */
    const projetado = g.t + (((vel / 1000) * 0.998) / (1 - 0.998)) * 0.35;
    if (projetado > p.offsetHeight * 0.4 && folha === f) {
      /* Quem fecha é o app (o estado é dele): o toque no véu é o caminho que ele já tem. */
      jogada = { vel };
      f.el.click();
      return;
    }
    anima(p, [{ transform: `translateY(${g.t}px)` }, { transform: 'translateY(0)' }], { d: 520, e: MOLA_SUAVE });
    p.style.transform = '';
    f.el.style.removeProperty('--px-prog');
  };
  p.addEventListener('pointerup', soltar);
  p.addEventListener('pointercancel', soltar);
}

/** `abrirFolha()` de `prototipo.js:466-507`, da parte que anima. */
function abrir(el: HTMLElement): void {
  const painel = el.querySelector<HTMLElement>('.q-mais');
  if (!painel || folha?.el === el) return;
  const recente = ultimoGatilho && performance.now() - ultimoGatilho.quando < 700 ? ultimoGatilho.el : null;
  const gatilho = recente ?? document.querySelector('.q-mais-botao');
  folha = { el, painel, gatilho };
  alturas.set(painel, painel.offsetHeight);
  /* O foco vai para o botão de fechar, sem rolar a tela (`prototipo.js:528`). O "Fechar" é o último
     controle do cabeçalho do painel. */
  (painel.querySelector<HTMLElement>(':scope > .q-cab > .q-ctl:last-of-type') ?? painel).focus?.({
    preventScroll: true,
  });
  if (!polido()) return;
  const main = principal();
  main?.classList.add('px-recuado');
  requestAnimationFrame(() => el.classList.add('px-aberto'));
  if (celular() && !reduz()) {
    anima(painel, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { d: 620, e: MOLA_SUAVE });
    $$('.q-tile, :scope > .q-faixa, .q-secao', painel).forEach((t, i) =>
      anima(
        t,
        [
          { opacity: 0, transform: 'translateY(26px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          d: 520,
          atraso: 140 + i * 45,
        },
      ),
    );
    arrastarFolha(folha);
    return;
  }
  if (reduz()) {
    anima(painel, [{ opacity: 0 }, { opacity: 1 }], { d: 180, e: 'ease' });
    return;
  }
  origem(painel, gatilho);
  anima(
    painel,
    [
      { opacity: 0, transform: 'scale(0.55)', filter: 'blur(10px)' },
      { opacity: 1, offset: 0.35 },
      { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
    ],
    { d: 640, e: MOLA_SUAVE },
  );
  $$(':scope > *:not(.q-grade)', painel).forEach((t, i) =>
    anima(
      t,
      [
        { opacity: 0, transform: 'translateY(18px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      {
        d: 520,
        atraso: 120 + i * 60,
      },
    ),
  );
  $$('.q-tile', painel).forEach((t, i) =>
    anima(
      t,
      [
        { opacity: 0, transform: 'translateY(22px) scale(0.9)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ],
      { d: 620, atraso: 220 + i * 55, e: MOLA_SUAVE },
    ),
  );
}

/** `fecharFolha()` de `prototipo.js:509-535`: sai pelo mesmo caminho por onde entrou. */
function fechar(el: HTMLElement, pai: Node, antesDe: Node | null): void {
  const f = folha?.el === el ? folha : null;
  folha = null;
  const o = jogada;
  jogada = null;
  principal()?.classList.remove('px-recuado');
  const painel = f?.painel ?? el.querySelector<HTMLElement>('.q-mais');
  if (!polido() || !painel || !pai.isConnected) return;
  /* O fantasma: o painel volta ao lugar só para sair. */
  fantasmas.add(el);
  pai.insertBefore(el, antesDe?.parentNode === pai ? antesDe : null);
  const fim = () => el.remove();
  el.classList.remove('px-aberto');
  el.classList.add('px-saindo');
  el.style.pointerEvents = 'none';
  el.style.removeProperty('--px-prog');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('inert', '');
  window.setTimeout(fim, 700); /* nunca fica um fantasma preso se a animação não terminar */
  if (celular() && !reduz()) {
    /* Sai por onde entrou; se foi jogado com o dedo, sai mais rápido. */
    const d = o ? Math.max(160, 340 - Math.abs(o.vel || 0) / 8) : 340;
    anima(painel, [{ transform: 'translateY(105%)' }], { d, e: EG, fill: 'forwards' }).finished.then(fim, fim);
    return;
  }
  /* Um quadro só ("para onde"): parte do valor que está na tela, mesmo no meio da entrada. */
  const a = reduz()
    ? anima(painel, [{ opacity: 0 }], { d: 140, e: 'ease', fill: 'forwards' })
    : (origem(painel, f?.gatilho ?? null),
      anima(painel, [{ opacity: 0, transform: 'scale(0.6)', filter: 'blur(8px)' }], { d: 260, fill: 'forwards' }));
  a.finished.then(fim, fim);
}

/** `trocarAbaDoMais()` de `prototipo.js:537-557`: o conteúdo entra pelo lado e a altura acompanha. */
function trocarAba(painel: HTMLElement): void {
  const h0 = alturas.get(painel);
  const abas = $$('.q-abas .q-aba', painel);
  const i = abas.findIndex((a) => a.getAttribute('aria-selected') === 'true');
  const h1 = painel.offsetHeight;
  alturas.set(painel, h1);
  if (!polido() || i < 0) return;
  $$(':scope > .q-abas ~ *', painel).forEach((n, k) =>
    anima(
      n,
      [
        { opacity: 0, transform: `translateX(${50 * (i ? 1 : -1)}px)`, filter: 'blur(6px)' },
        { opacity: 1, transform: 'translateX(0)', filter: 'blur(0)' },
      ],
      { d: 480, atraso: k * 50 },
    ),
  );
  if (h0 !== undefined && h1 !== h0 && !reduz()) {
    painel.style.overflow = 'hidden';
    const solta = () => (painel.style.overflow = '');
    anima(painel, [{ height: h0 + 'px' }, { height: h1 + 'px' }], {
      d: 520,
      e: MOLA_SUAVE,
      fill: 'none',
    }).finished.then(solta, solta);
  }
}

/** Liga os painéis enquanto a casca do desenho novo estiver montada. Devolve como desligar. */
export function instalarFolhas(): () => void {
  const observador = new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      if (m.type === 'attributes') {
        const painel = (m.target as Element).closest<HTMLElement>('.q-mais');
        if (painel && folha?.painel === painel && (m.target as Element).getAttribute('aria-selected') === 'true')
          requestAnimationFrame(() => painel.isConnected && trocarAba(painel));
        continue;
      }
      for (const n of m.removedNodes) {
        if (n instanceof HTMLElement && n.classList.contains('q-mais-fundo') && !fantasmas.has(n))
          fechar(n, m.target, m.nextSibling);
      }
      for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement) || fantasmas.has(n)) continue;
        if (n.classList.contains('q-mais-fundo')) abrir(n);
      }
    }
  });
  observador.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-selected'],
  });
  const aoApontar = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.('button, a, [role="button"]');
    if (el) ultimoGatilho = { el, quando: performance.now() };
  };
  window.addEventListener('pointerdown', aoApontar, { capture: true, passive: true });
  window.addEventListener('click', aoApontar, { capture: true, passive: true });
  return () => {
    observador.disconnect();
    window.removeEventListener('pointerdown', aoApontar, { capture: true });
    window.removeEventListener('click', aoApontar, { capture: true });
    principal()?.classList.remove('px-recuado');
    folha = null;
  };
}
