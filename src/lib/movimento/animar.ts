/**
 * ONDE O MOVIMENTO RICO VALE, e a porta única para animar por código.
 *
 * O desenho novo nasceu no headset, com a regra "120 a 180 ms, no lugar" (`docs/design/quest-desenho.md`):
 * lá cada pixel que se mexe custa pintura e enjoa. No computador e no celular a conta é outra, e o
 * protótipo de polimento mostrou que molas, painéis que nascem do botão e listas em cascata fazem o
 * app parecer vivo. Então o movimento rico é uma CAMADA, ligada só quando as três condições valem:
 *
 *   - não é o headset;
 *   - o aparelho não está no modo leve (`reduzirEfeitos`: celular fraco, 2 núcleos, Modo desempenho);
 *   - a pessoa não pediu menos movimento (interruptor de animações ou o sistema).
 *
 * Fora disso continua valendo a regra de sempre: transição curta, no lugar. Nada aqui a desliga.
 * O CSS lê a marca `<html data-movimento="rico|contido">`; o código pergunta a `movimentoRico()`.
 */
import { EVENTO_REDUZIR_EFEITOS } from '../dispositivo/perfil';
import { reduz } from '../polimento/base';
import { SAIDA } from './mola';

/**
 * DESDE 08/10/2026 (passada de fidelidade) o movimento rico vale em TODO aparelho, inclusive no headset e
 * no modo leve: é decisão do dono, que quer o desenho do protótipo por inteiro. Só o desliga quem
 * desligou as animações no app, ou quem pediu menos movimento ao sistema e não as religou.
 */
export function movimentoRico(): boolean {
  if (typeof document === 'undefined') return false;
  return !document.body.classList.contains('animations-off') && !reduz();
}

function marcar(): void {
  document.documentElement.dataset.movimento = movimentoRico() ? 'rico' : 'contido';
}

/**
 * Mantém `<html data-movimento>` em dia enquanto a casca do desenho novo está montada. O interruptor
 * de animações só troca uma classe no `<body>` (sem evento), por isso o observador; o Modo desempenho
 * avisa por evento; o sistema, pela media query. Devolve como desinstalar.
 */
export function instalarMarcaDeMovimento(): () => void {
  marcar();
  const observador = new MutationObserver(marcar);
  observador.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener(EVENTO_REDUZIR_EFEITOS, marcar);
  const sistema = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  sistema?.addEventListener?.('change', marcar);
  return () => {
    observador.disconnect();
    window.removeEventListener(EVENTO_REDUZIR_EFEITOS, marcar);
    sistema?.removeEventListener?.('change', marcar);
    delete document.documentElement.dataset.movimento;
  };
}

export interface OpcoesDeAnimacao {
  /** Duração em ms (padrão 240). */
  ms?: number;
  atraso?: number;
  /** Curva; o padrão é a de entrada (`SAIDA`). Molas: `MOLA`, `MOLA_SUAVE`. */
  curva?: string;
  /** `backwards` (padrão) segura o primeiro quadro durante o atraso; `forwards` segura o último. */
  preenchimento?: FillMode;
}

/**
 * Anima `el` pelo WAAPI, só `transform`/`opacity`/`filter`/`clip-path` (quem chama cuida disso).
 * Devolve `null`, sem tocar no elemento, quando o movimento rico não vale: quem chama já deixou o
 * estado final aplicado, então "não animar" é simplesmente chegar lá na hora.
 */
export function animar(
  el: Element | null | undefined,
  quadros: Keyframe[],
  opcoes: OpcoesDeAnimacao = {},
): Animation | null {
  if (!el || typeof el.animate !== 'function' || !movimentoRico()) return null;
  return el.animate(quadros, {
    duration: opcoes.ms ?? 240,
    delay: opcoes.atraso ?? 0,
    easing: opcoes.curva ?? SAIDA,
    fill: opcoes.preenchimento ?? 'backwards',
  });
}

/**
 * Cancela o que estiver animando em `el`. Cancelar rejeita a promessa `finished` de cada animação;
 * sem engolir isso aqui, todo cancelamento vira um "unhandled rejection" no console.
 */
export function pararAnimacoes(el: Element | null | undefined): void {
  if (!el || typeof el.getAnimations !== 'function') return;
  for (const a of el.getAnimations()) {
    a.finished.catch(() => undefined);
    a.cancel();
  }
}
