/**
 * A CAMADA DE POLIMENTO — a base que as peças portadas do protótipo usam.
 *
 * O protótipo aprovado (`docs/prototipos/polimento-movimento.html`) é a especificação: cada função
 * daqui é a de `prototipo.js`, com os mesmos números, e o comentário diz a linha de onde veio. O que
 * muda é só o que no protótipo era página de demonstração (a chave "Polido × Atual" da barra, a câmera
 * lenta) e aqui é app:
 *
 *   - "Polido" (`html[data-px='on']`) é o desenho novo com as animações ligadas. O interruptor
 *     "Animações" do app faz o papel da chave do protótipo.
 *   - `reduz()` segue o sistema, como o botão "Seguir o sistema" ligado no protótipo
 *     (`prototipo.js:22-25`; decisão registrada em `auditoria.html:292`).
 *
 * Vale em todo aparelho, inclusive no headset e no modo leve (decisão do dono, 08/10/2026).
 */
/** As três curvas de `prototipo.js:35-37`. */
export const EO = 'cubic-bezier(0.23, 1, 0.32, 1)';
export const EIO = 'cubic-bezier(0.77, 0, 0.175, 1)';
export const EG = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** `mola()` de `prototipo.js:39-48`: resposta ao degrau subamortecida, 45 pontos, 4 casas. */
export function mola(zeta: number, n = 44): string {
  const zw = 6.9;
  const wd = (zw / zeta) * Math.sqrt(1 - zeta * zeta);
  const p: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    p.push(i === n ? 1 : +(1 - Math.exp(-zw * t) * (Math.cos(wd * t) + (zw / wd) * Math.sin(wd * t))).toFixed(4));
  }
  return `linear(${p.join(', ')})`;
}
/* `prototipo.js:49-51`: sem `linear()` no navegador, as reservas do protótipo. */
const temLinear =
  typeof CSS !== 'undefined' && !!CSS.supports && CSS.supports('transition-timing-function', 'linear(0, 1)');
export const MOLA = temLinear ? mola(0.5) : 'cubic-bezier(0.34, 1.56, 0.64, 1)';
export const MOLA_SUAVE = temLinear ? mola(0.72) : EG;

const html = (): HTMLElement => document.documentElement;

/** `polido()` de `prototipo.js:20`. */
export function polido(): boolean {
  return typeof document !== 'undefined' && html().dataset.px === 'on';
}

/** `reduz()` de `prototipo.js:25`: a pessoa pediu menos movimento ao sistema (e não religou no app). */
export function reduz(): boolean {
  if (typeof window === 'undefined') return true;
  if (document.body.classList.contains('performance-mode')) return true;
  if (document.body.classList.contains('animations-on')) return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export interface OpcoesDoAnima {
  /** Duração em ms (240 no protótipo). */
  d?: number;
  atraso?: number;
  /** Curva; a padrão é `EO`. */
  e?: string;
  fill?: FillMode;
}

/** `anima()` de `prototipo.js:55-61`: 240 ms, `EO`, `fill: backwards`. */
export function anima(el: Element, quadros: Keyframe[], o: OpcoesDoAnima = {}): Animation {
  /* Onde o navegador não anima por este caminho, a peça fica no estado final e quem espera segue. */
  if (typeof el.animate !== 'function') return PARADA;
  return el.animate(quadros, {
    duration: o.d ?? 240,
    delay: o.atraso ?? 0,
    easing: o.e ?? EO,
    fill: o.fill ?? 'backwards',
  });
}

/** A animação que já acabou: o que `anima` devolve onde não há como animar. */
const PARADA = {
  finished: Promise.resolve(),
  cancel: () => undefined,
  pause: () => undefined,
  play: () => undefined,
  finish: () => undefined,
} as unknown as Animation;

/** `limpar()` de `prototipo.js:64-68`: cancela as animações do elemento e engole a rejeição. */
export function limpar(el: Element): void {
  for (const a of el.getAnimations?.() ?? []) {
    a.finished.catch(() => undefined);
    a.cancel();
  }
}

/** `contar()` de `prototipo.js:141-152`: o número sobe com a curva cúbica `1 − (1−p)³`. */
export function contar(pinta: (v: number) => void, de: number, ate: number, ms = 600): void {
  if (reduz() || de === ate) return pinta(ate);
  const t0 = performance.now();
  const passo = (t: number) => {
    const p = Math.min(1, (t - t0) / ms);
    pinta(Math.round(de + (ate - de) * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

/**
 * Liga a camada enquanto a casca do desenho novo estiver montada: põe `data-px`, as duas molas
 * (`prototipo.js:49-53`) e carrega o CSS trazido do protótipo. O CSS vem num pedaço à parte, depois
 * da primeira pintura, para não entrar no orçamento do CSS inicial. Devolve como desligar.
 */
/** As regras `@media` de preferência do sistema, com o texto original guardado para devolver. */
const originais = new WeakMap<CSSMediaRule, string>();

/**
 * `aplicarAcess()` de `prototipo.js:26-33`: as regras `prefers-reduced-*` e `prefers-contrast` da
 * camada só valem quando a pessoa NÃO ligou as animações de propósito no app.
 *
 * É a mesma regra que o app já tinha para o movimento (`body.animations-on` vence o sistema), agora
 * também para a transparência: um Windows com "efeitos de transparência" desligado deixaria os painéis
 * opacos, diferentes do desenho, sem a pessoa ter pedido isso ao app. Com as animações ligadas no app
 * a camada é a do protótipo; desligadas, a camada inteira sai.
 */
export function aplicarAcess(): void {
  const segue = !document.body.classList.contains('animations-on');
  const visitar = (regras: CSSRuleList) => {
    for (const r of regras) {
      /* As folhas do app vêm dentro de `@layer` e de outras regras de grupo: desce nelas. */
      if (!(r instanceof CSSMediaRule)) {
        const dentro = (r as CSSGroupingRule).cssRules;
        if (dentro?.length) visitar(dentro);
        continue;
      }
      const texto = originais.get(r) ?? r.media.mediaText;
      /* MOVIMENTO: vale para o app inteiro, não só para a camada. Com "reduzir movimento" no sistema, as
         folhas de sempre (`quest.css`, `questBase.css`, `prototipo.css`…) tiravam as transições dos
         ícones, do menu e dos cartões, e os laços (anéis, brilho das barras) nem começavam: era o que o
         dono via "sumir" (08/10/2026). Quem ligou as animações no app vê todas; quem quer menos usa o
         Modo desempenho. A regra `reduce` deixa de valer e a `no-preference` passa a valer sempre. */
      if (/prefers-reduced-motion/.test(texto)) {
        originais.set(r, texto);
        r.media.mediaText = segue ? texto : /no-preference/.test(texto) ? 'all' : 'not all';
        visitar(r.cssRules);
        continue;
      }
      /* TRANSPARÊNCIA E CONTRASTE: só as regras da camada (as outras são leitura, e leitura não se mexe). */
      if (/prefers-(reduced|contrast)/.test(texto) && r.cssText.includes('data-px')) {
        originais.set(r, texto);
        r.media.mediaText = segue ? texto : 'not all';
        continue;
      }
      visitar(r.cssRules);
    }
  };
  for (const folha of document.styleSheets) {
    try {
      visitar(folha.cssRules);
    } catch {
      /* folha de outra origem: não é da camada */
    }
  }
}

/** Avisa que o CSS da camada entrou: as medidas tiradas antes dele não valem mais. */
export const EVENTO_DOS_ESTILOS = 'px:estilos';

export function instalarPolimento(): () => void {
  const raiz = html();
  const marcar = () => {
    /* O Modo desempenho desliga a camada inteira, como o interruptor das animações. */
    const corpo = document.body.classList;
    raiz.dataset.px = corpo.contains('animations-off') || corpo.contains('performance-mode') ? 'off' : 'on';
    aplicarAcess();
  };
  raiz.style.setProperty('--px-mola', MOLA);
  raiz.style.setProperty('--px-mola-suave', MOLA_SUAVE);
  marcar();
  /* O CSS chega um instante depois: as regras de preferência são acertadas quando ele entra. */
  void import('./estilos')
    .then(() =>
      requestAnimationFrame(() => {
        aplicarAcess();
        /* Quem mediu a tela antes de o CSS chegar (a pílula do trilho) mede de novo. */
        document.dispatchEvent(new Event(EVENTO_DOS_ESTILOS));
      }),
    )
    /* Sem o CSS a camada só não enfeita: a tela continua inteira. */
    .catch(() => undefined);
  const observador = new MutationObserver(marcar);
  observador.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  /* Cada tela traz a sua folha de estilo quando abre: as regras novas são acertadas quando chegam. */
  let pedido = 0;
  const folhas = new MutationObserver(() => {
    cancelAnimationFrame(pedido);
    pedido = requestAnimationFrame(aplicarAcess);
  });
  folhas.observe(document.head, { childList: true, subtree: true, characterData: true });
  return () => {
    observador.disconnect();
    folhas.disconnect();
    cancelAnimationFrame(pedido);
    delete raiz.dataset.px;
  };
}
