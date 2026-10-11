/**
 * O MOVIMENTO DA REVISÃO ENXUTA E DAS PRÁTICAS — porte de `cartoes2.js` e `cartoes4.js` do protótipo
 * `cartoes-enxuto-src`, função por função, com os mesmos números.
 *
 * No protótipo a tela inteira é refeita e só o cartão se move (`ctPintarRodada`, `cartoes2.js:314-351`).
 * No app quem refaz a tela é o React; aqui ficam as animações que ele dispara depois de pintar, os
 * gestos do cartão no celular e a varredura das ondas. Com a camada desligada ou com movimento
 * reduzido, nada disto roda e a tela fica no estado final.
 */
import { anima, contar, limpar, MOLA, MOLA_SUAVE, polido, reduz } from './base';
import { centro, molaFisica, rajada } from './captura';
import { flutuar } from './jogos';
import { confete } from './planos';
import { sentir, vibrar } from './sentidos';

const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode) => r.querySelector<T>(s);
const $$ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode) => [...r.querySelectorAll<T>(s)];

const mexe = () => polido() && !reduz();
const celular = () => window.matchMedia?.('(max-width: 720px)').matches ?? false;

/** `ENTRA()` de `prototipo.js:278`. */
const ENTRA = (y: number): Keyframe[] => [
  { opacity: 0, transform: `translateY(${y}px) scale(0.96)`, filter: 'blur(8px)' },
  { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
];

export type ComoPintar = 'proximo' | 'voltar' | 'resposta' | 'frase' | 'aviso';

/** A barra de progresso anda de onde estava até onde está (`cartoes2.js:323`). */
export function andarBarra(raiz: ParentNode, antes: number): void {
  const barra = $('.qr-progresso .q-barra > span', raiz);
  if (barra && mexe()) anima(barra, [{ width: antes + '%' }, { width: barra.style.width }], { d: 520, e: MOLA_SUAVE });
}

/** O que se move depois de pintar a rodada (`ctPintarRodada`, `cartoes2.js:328-350`). */
export function pintarRodada(raiz: HTMLElement, como: ComoPintar, o: { dir?: number; seguidas?: number } = {}): void {
  if (!mexe()) return;
  const cartao = $('.qr-cartao', raiz);
  if (!cartao) return;
  const dir = o.dir ?? 1;
  if (como === 'proximo' || como === 'voltar') {
    anima(
      cartao,
      [
        { opacity: 0, transform: `translateX(${70 * dir}px) scale(0.97)`, filter: 'blur(6px)' },
        { opacity: 1, transform: 'translateX(0) scale(1)', filter: 'blur(0)' },
      ],
      { d: 520, e: MOLA_SUAVE },
    );
    $$(
      '.termo, .ct-ipa, .ct-frase, .cx-onde, .qr-lacuna, .qr-producao > *, .resp, .qr-cartao > .exemplo',
      cartao,
    ).forEach((x, i) =>
      anima(
        x,
        [
          { opacity: 0, transform: 'translateY(10px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { d: 380, atraso: 90 + i * 40 },
      ),
    );
    const combo = $('.ct-combo', raiz);
    if (combo && (o.seguidas ?? 0) % 3 === 0)
      anima(combo, [{ transform: 'scale(0.6)' }, { transform: 'scale(1)' }], { d: 520, e: MOLA });
    /* o desfazer "acende" depois de cada nota: é ele que dá confiança para responder depressa */
    const des = $('.cx-desfazer:not(:disabled)', raiz);
    if (des && como === 'proximo')
      anima(des, [{ transform: 'scale(0.7) rotate(-40deg)' }, { transform: 'scale(1) rotate(0)' }], { d: 520, e: MOLA });
  } else if (como === 'resposta') {
    const r = $('.resp', cartao);
    if (!r) return;
    anima(
      r,
      [
        { opacity: 0, transform: 'translateY(-10px)', filter: 'blur(6px)' },
        { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
      ],
      { d: 420 },
    );
    $$('.cx-icones .q-ctl', cartao).forEach((x, i) =>
      anima(
        x,
        [
          { opacity: 0, transform: 'scale(0.5)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { d: 460, atraso: 80 + i * 70, e: MOLA },
      ),
    );
    $$('.fsrs button, .qr-principal, .cx-juntar', r).forEach((x, i) =>
      anima(
        x,
        [
          { opacity: 0, transform: 'translateY(14px) scale(0.94)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ],
        { d: 460, atraso: 120 + i * 55, e: MOLA_SUAVE },
      ),
    );
  } else if (como === 'frase') {
    const fz = $('.ct-frase', cartao);
    if (fz)
      anima(
        fz,
        [
          { opacity: 0, transform: 'translateY(8px)', filter: 'blur(4px)' },
          { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
        ],
        { d: 380 },
      );
  } else if (como === 'aviso') {
    const a = $('.cx-aviso', raiz);
    if (a)
      anima(
        a,
        [
          { opacity: 0, transform: 'translateY(-12px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { d: 420 },
      );
  }
}

/** A cena chega ao verso (`cartoes2.js:341-342`, e a rajada de "Juntar a cena", `:690-691`). */
export function chegarCena(raiz: ParentNode, comRajada = false): void {
  const cena = $('.cx-cena-quadro', raiz);
  if (!cena || !mexe()) return;
  anima(
    cena,
    [
      { opacity: 0, transform: 'scale(0.9) rotate(-2deg)' },
      { opacity: 1, transform: 'scale(1) rotate(0)' },
    ],
    { d: 560, atraso: 60, e: MOLA_SUAVE },
  );
  if (comRajada) rajada(...centro(cena), 14, 0.9);
}

/**
 * O cartão sai antes de a nota valer (`ctDarNota`, `cartoes2.js:425-432`): o texto da nota sobe do
 * botão, o cartão escorrega para o lado da nota em 190 ms. Devolve quando a saída acabou.
 */
export async function sairComANota(
  raiz: HTMLElement,
  o: { errou: boolean; origem?: Element | null; texto?: string },
): Promise<void> {
  if (!mexe()) return;
  const dir = o.errou ? -1 : 1;
  if (o.origem?.isConnected && o.texto) flutuar(o.origem, o.texto, o.errou ? 'erro' : 'good');
  const cartao = $('.qr-cartao', raiz);
  if (!cartao) return;
  await anima(
    cartao,
    [{ opacity: 0, transform: `translateX(${-90 * -dir}px) rotate(${4 * dir}deg) scale(0.96)`, filter: 'blur(4px)' }],
    { d: 190, e: 'ease-in', fill: 'forwards' },
  ).finished.catch(() => undefined);
}

/** O cartão que saiu volta ao lugar para receber o próximo (o React reaproveita o mesmo elemento). */
export function soltarCartao(raiz: ParentNode): void {
  const cartao = $('.qr-cartao', raiz);
  if (!cartao) return;
  limpar(cartao);
  cartao.style.transition = '';
  cartao.style.transform = '';
  cartao.style.opacity = '';
}

/** O acerto de Digitar, Escolher e das práticas: a rajada no ícone do veredito (`cartoes2.js:470`). */
export function rajadaDoVeredito(raiz: ParentNode): void {
  const v = $('.qr-veredito.certo svg', raiz);
  if (v && mexe()) rajada(...centro(v), 12, 0.8);
}

/**
 * Os gestos do cartão no celular (`ctArmarCartao`, `cartoes2.js:796-867`): tocar mostra a resposta,
 * arrastar para o lado dá a nota (esquerda erra, direita lembra), segurar abre as ações.
 * Devolve como desarmar.
 */
export function armarCartao(
  cartao: HTMLElement,
  o: {
    /** O formato é "Lembrar"? Só nele o gesto vale. */
    pode: () => boolean;
    mostrando: () => boolean;
    aoMostrar: () => void;
    aoDarNota: (nota: 'e' | 'b') => void;
    aoSegurar: () => void;
  },
): () => void {
  let a: { id: number; x: number; y: number; dx: number; indo: boolean; hist: Array<[number, number]>; t: number } | null =
    null;
  let seg = 0;
  const selos = { e: $('.ct-carimbo.e', cartao), b: $('.ct-carimbo.b', cartao) };
  const por = (dx: number) => {
    cartao.style.transform = dx ? `translateX(${dx}px) rotate(${dx / 26}deg)` : '';
    const forca = Math.min(1, Math.abs(dx) / 110);
    if (selos.e) selos.e.style.opacity = String(dx < 0 ? forca : 0);
    if (selos.b) selos.b.style.opacity = String(dx > 0 ? forca : 0);
  };
  const descer = (e: PointerEvent) => {
    if (a || e.button || (e.target as Element).closest('button, input, a, select')) return;
    if (e.pointerType === 'mouse' && !celular()) return;
    a = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      dx: 0,
      indo: false,
      hist: [[performance.now(), e.clientX]],
      t: performance.now(),
    };
    clearTimeout(seg);
    seg = window.setTimeout(() => {
      if (!a || a.indo) return;
      a = null;
      vibrar(10);
      o.aoSegurar();
    }, 520);
  };
  const mover = (e: PointerEvent) => {
    if (!a || e.pointerId !== a.id) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (!a.indo) {
      if (Math.hypot(dx, dy) < 8) return;
      clearTimeout(seg);
      if (Math.abs(dy) > Math.abs(dx) || !o.pode() || !o.mostrando()) {
        a = null;
        return;
      }
      a.indo = true;
      cartao.setPointerCapture?.(e.pointerId);
      limpar(cartao);
      cartao.classList.add('ct-arrastando');
    }
    a.dx = dx;
    a.hist.push([performance.now(), e.clientX]);
    if (a.hist.length > 6) a.hist.shift();
    por(dx);
  };
  const soltar = (e: PointerEvent) => {
    if (!a || e.pointerId !== a.id) return;
    const g = a;
    a = null;
    clearTimeout(seg);
    if (!g.indo) {
      /* toque simples no cartão: mostra a resposta */
      if (e.type === 'pointerup' && o.pode() && !o.mostrando() && performance.now() - g.t < 400) o.aoMostrar();
      return;
    }
    cartao.classList.remove('ct-arrastando');
    const [t0, x0] = g.hist[0];
    const [t1, x1] = g.hist[g.hist.length - 1];
    const vel = t1 > t0 ? ((x1 - x0) / (t1 - t0)) * 1000 : 0;
    const projetado = g.dx + vel * 0.18;
    if (Math.abs(projetado) > 120 && e.type === 'pointerup') {
      const nota = projetado > 0 ? 'b' : 'e';
      vibrar(nota === 'b' ? 10 : [20, 30, 20]);
      cartao.style.transition = 'transform 180ms ease-in, opacity 180ms ease-in';
      cartao.style.transform = `translateX(${Math.sign(projetado) * 420}px) rotate(${Math.sign(projetado) * 14}deg)`;
      cartao.style.opacity = '0';
      window.setTimeout(() => o.aoDarNota(nota), 150);
      return;
    }
    if (!mexe()) return por(0);
    molaFisica(g.dx, 0, vel, (x) => cartao.isConnected && por(Math.abs(x) < 0.5 ? 0 : x), 0.7, 0.36);
  };
  cartao.addEventListener('pointerdown', descer);
  cartao.addEventListener('pointermove', mover);
  cartao.addEventListener('pointerup', soltar);
  cartao.addEventListener('pointercancel', soltar);
  return () => {
    clearTimeout(seg);
    cartao.removeEventListener('pointerdown', descer);
    cartao.removeEventListener('pointermove', mover);
    cartao.removeEventListener('pointerup', soltar);
    cartao.removeEventListener('pointercancel', soltar);
  };
}

/** A entrada do fim da sessão (`ctEntradaDoFim`, `cartoes2.js:906-918`). */
export function entradaDoFim(raiz: HTMLElement, o: { festa?: boolean } = {}): void {
  if (!mexe()) return;
  $$(':scope > *:not(.q-cab):not(.cx-fim-pe):not(dialog)', raiz).forEach((x, i) =>
    anima(x, ENTRA(26), { d: 620, atraso: 80 + i * 70 }),
  );
  const ic0 = $('.qr-fecho .q-ic', raiz);
  if (ic0)
    anima(ic0, [{ transform: 'scale(0.3) rotate(-24deg)' }, { transform: 'scale(1) rotate(0deg)' }], {
      d: 820,
      atraso: 200,
      e: MOLA,
    });
  $$('.qr-numeros .q-num b', raiz).forEach((b, i) => {
    const m = (b.textContent ?? '').match(/^(\+?)(\d+)(%?)$/);
    if (m) contar((v) => (b.textContent = m[1] + v + m[3]), 0, +m[2], 900 + i * 80);
  });
  $$('.cx-subiu .q-chip', raiz).forEach((x, i) =>
    anima(
      x,
      [
        { opacity: 0, transform: 'scale(0.7)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { d: 420, atraso: 520 + i * 45, e: MOLA },
    ),
  );
  if (o.festa !== false) window.setTimeout(() => raiz.isConnected && confete(70), 320);
}

/** O fecho de uma prática (`cxArmarPratica`, `cartoes4.js:703-711`). */
export function entradaDoFechoDaPratica(raiz: HTMLElement): void {
  sentir('sucesso');
  if (!mexe()) return;
  $$(':scope > *:not(.q-cab):not(.cx-fim-pe):not(dialog)', raiz).forEach((x, i) =>
    anima(x, ENTRA(26), { d: 620, atraso: 80 + i * 80 }),
  );
  const ic0 = $('.qr-fecho .q-ic', raiz);
  if (ic0)
    anima(ic0, [{ transform: 'scale(0.3) rotate(-24deg)' }, { transform: 'scale(1) rotate(0deg)' }], {
      d: 820,
      atraso: 200,
      e: MOLA,
    });
  window.setTimeout(() => raiz.isConnected && confete(36), 320);
}

/** O cartão da prática entra ou mostra o resultado (`cxArmarPratica`, `cartoes4.js:712-720`). */
export function pintarPratica(raiz: HTMLElement, como: 'proximo' | 'resposta'): void {
  if (!mexe()) return;
  const cartao = $('.qr-cartao', raiz);
  if (!cartao) return;
  if (como === 'proximo') {
    anima(
      cartao,
      [
        { opacity: 0, transform: 'translateX(70px) scale(0.97)', filter: 'blur(6px)' },
        { opacity: 1, transform: 'translateX(0) scale(1)', filter: 'blur(0)' },
      ],
      { d: 520, e: MOLA_SUAVE },
    );
    $$(':scope > *', cartao).forEach((x, i) =>
      anima(
        x,
        [
          { opacity: 0, transform: 'translateY(10px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { d: 380, atraso: 90 + i * 45 },
      ),
    );
    return;
  }
  $$(':scope > *', cartao).forEach((x, i) =>
    anima(
      x,
      [
        { opacity: 0, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { d: 400, atraso: i * 55 },
    ),
  );
  const enc = $('.cx-encaixou mark', cartao);
  if (enc)
    anima(
      enc,
      [
        { transform: 'translateY(26px) scale(1.5)', opacity: 0 },
        { transform: 'translateY(0) scale(1)', opacity: 1 },
      ],
      { d: 620, atraso: 120, e: MOLA },
    );
  rajadaDoVeredito(raiz);
}

/** A frase aparece depois de dita (`revela`, `cartoes4.js:724-729`). */
export function revelarFrase(el: HTMLElement | null): void {
  if (el && mexe())
    anima(
      el,
      [
        { opacity: 0, transform: 'translateY(10px)', filter: 'blur(5px)' },
        { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
      ],
      { d: 420 },
    );
}

/** Os botões que chegam (as notas de "Falar", `cartoes4.js:735`). */
export function chegarBotoes(caixa: HTMLElement | null): void {
  if (!caixa) return;
  caixa.scrollIntoView?.({ block: 'nearest', behavior: reduz() ? 'auto' : 'smooth' });
  if (!mexe()) return;
  $$('button', caixa).forEach((x, i) =>
    anima(
      x,
      [
        { opacity: 0, transform: 'translateY(14px) scale(0.94)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ],
      { d: 460, atraso: i * 60, e: MOLA_SUAVE },
    ),
  );
}

/**
 * A varredura da onda (`varrer`, `cartoes4.js:228-233`): a camada colorida aparece da esquerda para a
 * direita no tempo do som.
 */
export function varrerOnda(raiz: ParentNode, trilha: HTMLElement, ms: number): void {
  $$('.tocando', raiz).forEach((x) => x.classList.remove('tocando'));
  trilha.classList.add('tocando');
  const cor = $('.cx-onda-cor', trilha);
  if (cor && mexe() && typeof cor.animate === 'function')
    cor.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: ms, easing: 'linear' });
}

/** Um bloco da folha troca de conteúdo (`trocar`, `cartoes2.js:574-577`) ou chega (`cartoes4.js:318`). */
export function chegarFilhos(corpo: HTMLElement | null): void {
  if (!corpo || !mexe()) return;
  $$(':scope > *', corpo).forEach((x, i) =>
    anima(
      x,
      [
        { opacity: 0, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { d: 360, atraso: i * 50 },
    ),
  );
}

/** A ficha nova na linha do tempo das gravações (`cartoes4.js:359-360`). */
export function chegarFicha(el: HTMLElement | null): void {
  if (el && mexe())
    anima(
      el,
      [
        { transform: 'scale(0.6)', opacity: 0 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { d: 480, e: MOLA },
    );
}

/** O palpite do aparelho aparece (`cartoes4.js:318`). */
export function chegarPalpite(el: HTMLElement | null): void {
  if (el && mexe())
    anima(
      el,
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { d: 360 },
    );
}
