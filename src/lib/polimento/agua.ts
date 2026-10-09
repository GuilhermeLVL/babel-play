/**
 * TEMA ÁGUA — quem liga e desliga a cena (`ligarAgua` e o observador de `agua.js:208-219`).
 *
 * A cena (dois canvas, a física, o laço) mora em `aguaCena.ts`, que só é baixado quando o tema em
 * vigor no documento é a Água, seja equipado, seja em prova no Personalizar: os dois caminhos pintam
 * `html[data-theme]`, e é esse atributo que se observa. Ao sair do tema, ou quando a camada desliga
 * (animações desligadas, Modo desempenho: `polido()` falso), a cena é desmontada e fica só a paleta.
 *
 * Aqui não há nada por quadro: um observador de dois atributos, parado enquanto ninguém troca de tema.
 *
 * O `mergulho` (som e vibração de equipar, `agua.js:276`) não sai daqui: a prova também muda o
 * atributo, e ela não mergulha. Quem equipa é `persistTheme` (`src/lib/theme.ts`).
 *
 * Itens da lista `fidelidade/casca-e-telas.md`: F27.
 */
import { polido } from './base';

/** `aguaLigada()` de `agua.js:25`. */
const aguaLigada = (): boolean => document.documentElement.dataset.theme === 'agua' && polido();

/** Liga a cena da Água enquanto a casca do desenho novo estiver montada. Devolve como desligar. */
export function instalarAgua(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  let vivo = true;
  /** O que se quer agora; a cena chega um instante depois, e o pedido pode ter mudado no caminho. */
  let quer = false;
  let desmontar: (() => void) | null = null;

  const ligarAgua = () => {
    const deve = vivo && aguaLigada();
    if (deve === quer) return;
    quer = deve;
    if (!deve) {
      desmontar?.();
      desmontar = null;
      return;
    }
    void import('./aguaCena')
      .then((m) => {
        if (quer && vivo && !desmontar) desmontar = m.montarCena();
      })
      /* Sem a cena o tema só não se mexe: as cores e o fundo continuam. */
      .catch(() => {
        quer = false;
      });
  };

  const observador = new MutationObserver(ligarAgua);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-px'] });
  ligarAgua();

  return () => {
    vivo = false;
    observador.disconnect();
    quer = false;
    desmontar?.();
    desmontar = null;
  };
}
