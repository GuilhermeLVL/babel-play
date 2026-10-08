/**
 * A REVELAÇÃO EM CÍRCULO — quando a tela inteira muda de cor (claro para escuro, um tema novo), a
 * cor nova se abre a partir de onde a pessoa tocou, em vez de a tela piscar de uma vez.
 *
 * Usa View Transitions: o navegador fotografa a tela de antes, aplica a mudança, e nós recortamos a
 * de depois num círculo que cresce. Onde a API não existe (Firefox antigo, o headset), fora do
 * desenho novo ou na faixa contida do movimento, a mudança acontece na hora, como sempre.
 */
import { movimentoRico } from './animar';
import { VAI_E_VEM } from './mola';

type DocumentoComTransicao = Document & {
  startViewTransition?: (muda: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

let ultimoToque: { x: number; y: number } | null = null;

/** Guarda onde foi o último toque, para o círculo nascer dali. Devolve como desinstalar. */
export function instalarOrigemDoToque(): () => void {
  const guardar = (e: PointerEvent) => {
    ultimoToque = { x: e.clientX, y: e.clientY };
  };
  window.addEventListener('pointerdown', guardar, { capture: true, passive: true });
  return () => {
    window.removeEventListener('pointerdown', guardar, { capture: true });
    ultimoToque = null;
  };
}

/** O raio que cobre a janela inteira a partir de um ponto: a distância até o canto mais longe. */
export function raioAteOCanto(x: number, y: number, largura: number, altura: number): number {
  return Math.hypot(Math.max(x, largura - x), Math.max(y, altura - y));
}

/**
 * Roda `muda` (que precisa trocar o DOM de forma síncrona) e revela o resultado em círculo.
 * `duracao` em ms.
 */
export function revelarEmCirculo(muda: () => void | Promise<void>, duracao = 800): void {
  const doc = document as DocumentoComTransicao;
  const raiz = document.documentElement;
  if (typeof doc.startViewTransition !== 'function' || raiz.dataset.questNovo !== 'true' || !movimentoRico()) {
    muda();
    return;
  }
  const { x, y } = ultimoToque ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const raio = raioAteOCanto(x, y, window.innerWidth, window.innerHeight);
  raiz.classList.add('q-vt');
  const transicao = doc.startViewTransition(muda);
  transicao.ready
    .then(() => {
      raiz.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${raio}px at ${x}px ${y}px)`] },
        { duration: duracao, easing: VAI_E_VEM, pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => undefined);
  const limpar = () => raiz.classList.remove('q-vt');
  transicao.finished.then(limpar, limpar);
}
