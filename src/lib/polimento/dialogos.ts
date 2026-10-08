/**
 * OS DIÁLOGOS E A BUSCA — porte de `telas2.js:483-525` (diálogos nativos: nascem do botão que os abriu
 * e saem encolhendo; no celular sobem e descem como folha) e de `prototipo.js:619-634` (a busca só
 * anima quando aberta por clique).
 *
 * No protótipo é ele quem fecha o diálogo, então anima e depois fecha. No app o diálogo fecha na hora
 * (`close()`) e o React o tira do documento; para a saída existir, ele é reaberto no mesmo instante,
 * já sem toque, só para sair.
 *
 * Itens da lista `fidelidade/casca-e-telas.md`: B27, B28, B30.
 */
import { anima, EG, MOLA_SUAVE, polido, reduz } from './base';
import { gatilhoRecente } from './folha';

const $$ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode) => [...r.querySelectorAll<T>(s)];
const celular = () => window.matchMedia?.('(max-width: 720px)').matches ?? false;

/** Diálogos que estão saindo: reabertos só para a animação de saída. */
const saindo = new WeakMap<HTMLDialogElement, { inicio: number; ms: number; foco?: Element | null }>();
const abertos = new WeakSet<HTMLDialogElement>();
/** O último elemento com foco fora de um diálogo: é para ele que o foco volta. */
let focoDeFora: Element | null = null;
let ultimaTecla = 0;
let ultimoPonteiro = 0;

const ehBusca = (d: Element) => d.classList.contains('paleta-cmd');
const ehFolha = (d: Element) => d.classList.contains('folha-de-baixo');

/** `abrirDialogo()` de `telas2.js:513-524` e `abrirBusca()` de `prototipo.js:631-634`. */
function entrar(d: HTMLDialogElement): void {
  if (abertos.has(d) || saindo.has(d)) return;
  abertos.add(d);
  if (!polido() || reduz()) return;
  if (ehFolha(d)) {
    /* `folhaDeBaixo()` de `telas.js:180-186`: a folha sobe de baixo e o conteúdo vem em cascata. */
    anima(d, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { d: 560, e: MOLA_SUAVE });
    $$('.folha-corpo > *, .folha-acao, .folha-palavras button', d).forEach((x, i) =>
      anima(
        x,
        [
          { opacity: 0, transform: 'translateY(16px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          d: 420,
          atraso: 120 + Math.min(i, 14) * 30,
        },
      ),
    );
    return;
  }
  if (ehBusca(d)) {
    if (ultimaTecla > ultimoPonteiro) return; /* aberta pelo teclado: não anima */
    anima(
      d,
      [
        { opacity: 0, transform: 'scale(0.9) translateY(-24px)', filter: 'blur(8px)' },
        { opacity: 1, transform: 'scale(1) translateY(0)', filter: 'blur(0)' },
      ],
      { d: 480, e: MOLA_SUAVE },
    );
    $$('.cmd-item', d).forEach((b, i) =>
      anima(
        b,
        [
          { opacity: 0, transform: 'translateX(-16px)' },
          { opacity: 1, transform: 'translateX(0)' },
        ],
        {
          d: 420,
          atraso: 120 + i * 45,
        },
      ),
    );
    return;
  }
  if (celular()) {
    /* No celular o painel é uma folha: sobe de baixo. */
    anima(d, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { d: 600, e: MOLA_SUAVE });
    $$('.dlg-corpo > *, .dlg-pe > *', d)
      .slice(0, 10)
      .forEach((x, i) =>
        anima(
          x,
          [
            { opacity: 0, transform: 'translateY(18px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          {
            d: 440,
            atraso: 140 + i * 45,
          },
        ),
      );
    return;
  }
  /* Nasce do botão que abriu: a origem do crescimento é o centro do gatilho. */
  const r = d.getBoundingClientRect();
  const g = gatilhoRecente()?.getBoundingClientRect();
  d.style.transformOrigin = g ? `${g.left + g.width / 2 - r.left}px ${g.top + g.height / 2 - r.top}px` : '50% 50%';
  anima(
    d,
    [
      { opacity: 0, transform: 'scale(0.6)', filter: 'blur(10px)' },
      { opacity: 1, offset: 0.4 },
      { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
    ],
    { d: 560, e: MOLA_SUAVE },
  );
  $$('.dlg-corpo > *, .dlg-pe > *', d).forEach((x, i) =>
    anima(
      x,
      [
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      {
        d: 420,
        atraso: 140 + Math.min(i, 10) * 45,
      },
    ),
  );
}

const duracaoDaSaida = (d: Element) => (ehFolha(d) ? 280 : celular() ? 300 : 200);

/** A animação de saída de `fecharDialogo()` (`telas2.js:484-491`), a partir de `de` ms já corridos. */
function animarSaida(d: HTMLDialogElement, de = 0): Animation {
  const a = ehFolha(d)
    ? /* `fecharFolhaDeBaixo()` de `telas.js:171`. */
      anima(d, [{ transform: 'translateY(100%)' }], { d: 280, e: EG, fill: 'forwards' })
    : celular()
      ? anima(d, [{ transform: 'translateY(100%)' }], { d: 300, e: EG, fill: 'forwards' })
      : anima(d, [{ opacity: 0, transform: 'scale(0.94)', filter: 'blur(6px)' }], { d: 200, fill: 'forwards' });
  if (de > 0) a.currentTime = de;
  return a;
}

function devolverFoco(el: Element | null | undefined): void {
  /* Depois de o navegador terminar o fechamento (ele também mexe no foco). */
  window.setTimeout(() => {
    if (el instanceof HTMLElement && el.isConnected && !document.querySelector('dialog[open]'))
      el.focus({ preventScroll: true });
  }, 0);
}

function reabrir(d: HTMLDialogElement): boolean {
  try {
    d.removeAttribute('open');
    d.showModal();
    return true;
  } catch {
    return false;
  }
}

/** O diálogo acabou de fechar (perdeu `open`): volta para a tela só para sair. */
function sair(d: HTMLDialogElement): void {
  abertos.delete(d);
  if (fechandoDeVez.delete(d)) return;
  if (saindo.has(d) || !polido() || reduz() || ehBusca(d) || !d.isConnected) return;
  /* Ao fechar, o navegador devolve o foco a quem abriu o diálogo. Reabrir para a saída o leva embora:
     no fim ele volta para o último elemento que teve o foco FORA de um diálogo. */
  const foco = focoDeFora;
  if (!reabrir(d)) return;
  const ms = duracaoDaSaida(d);
  saindo.set(d, { inicio: performance.now(), ms, foco });
  d.style.pointerEvents = 'none';
  d.setAttribute('aria-hidden', 'true');
  const fim = () => {
    if (!saindo.has(d)) return;
    saindo.delete(d);
    d.style.pointerEvents = '';
    d.removeAttribute('aria-hidden');
    /* Ainda no documento: o app o mantém montado; fecha de vez. Fora dele: já foi. */
    if (d.isConnected && d.open) {
      fechandoDeVez.add(d);
      d.close();
    }
    if (fantasmas.has(d)) d.remove();
    for (const a of d.getAnimations()) a.cancel();
    devolverFoco(foco);
  };
  window.setTimeout(fim, ms + 200);
  animarSaida(d).finished.then(fim, fim);
}

const fantasmas = new WeakSet<HTMLDialogElement>();
/** O fechamento que encerra a saída: não é um pedido novo para sair. */
const fechandoDeVez = new WeakSet<HTMLDialogElement>();

/** O React tirou do documento um diálogo que ainda está saindo: ele volta ao lugar até terminar. */
function segurar(d: HTMLDialogElement, pai: Node, antesDe: Node | null): void {
  let s = saindo.get(d);
  if (!s) {
    /* Saiu do documento ainda aberto (o app o desmontou sem fechar): a saída começa agora. */
    if (!abertos.has(d) || !polido() || reduz() || ehBusca(d)) return;
    abertos.delete(d);
    s = { inicio: performance.now(), ms: duracaoDaSaida(d), foco: focoDeFora };
    saindo.set(d, s);
    d.style.pointerEvents = 'none';
    d.setAttribute('aria-hidden', 'true');
  }
  if (!pai.isConnected) return;
  const corrido = performance.now() - s.inicio;
  if (corrido >= s.ms) return;
  fantasmas.add(d);
  pai.insertBefore(d, antesDe?.parentNode === pai ? antesDe : null);
  if (!reabrir(d)) return void d.remove();
  /* Sair do documento cancela a animação: ela recomeça do ponto em que estava. */
  if (!d.getAnimations().length) {
    const foco = s.foco;
    const fim = () => {
      if (!saindo.has(d)) return;
      saindo.delete(d);
      d.remove();
      devolverFoco(foco);
    };
    window.setTimeout(fim, s.ms - corrido + 200);
    animarSaida(d, corrido).finished.then(fim, fim);
  }
}

/** Liga os diálogos enquanto a casca do desenho novo estiver montada. Devolve como desligar. */
export function instalarDialogos(): () => void {
  const observador = new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      if (m.type === 'attributes') {
        const d = m.target;
        if (!(d instanceof HTMLDialogElement)) continue;
        if (d.open) entrar(d);
        else sair(d);
        continue;
      }
      for (const n of m.removedNodes) if (n instanceof HTMLDialogElement) segurar(n, m.target, m.nextSibling);
      for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        const lista = n instanceof HTMLDialogElement ? [n] : $$<HTMLDialogElement>('dialog', n);
        for (const d of lista) if (d.open && !fantasmas.has(d)) entrar(d);
      }
    }
  });
  observador.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
  const aoFocar = (e: FocusEvent) => {
    const el = e.target;
    if (el instanceof Element && !el.closest('dialog')) focoDeFora = el;
  };
  document.addEventListener('focusin', aoFocar);
  const aoTeclar = () => (ultimaTecla = performance.now());
  const aoApontar = () => (ultimoPonteiro = performance.now());
  window.addEventListener('keydown', aoTeclar, { capture: true });
  window.addEventListener('pointerdown', aoApontar, { capture: true, passive: true });
  return () => {
    observador.disconnect();
    document.removeEventListener('focusin', aoFocar);
    window.removeEventListener('keydown', aoTeclar, { capture: true });
    window.removeEventListener('pointerdown', aoApontar, { capture: true });
  };
}
