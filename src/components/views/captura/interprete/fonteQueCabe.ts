/**
 * A FRASE DA METADE CABE NA METADE (conversa-de-verdade, 5.1). No celular, a tradução de duas frases na metade de
 * baixo saía cortada no topo (CONV-08): a fonte grande (até 34 px) não cabia, e o `justify-content: center` de uma
 * coluna que rola corta o que passa por cima. A fonte encolhe em passos de 2 px até a frase caber, sem passar de
 * 18 px; o que ainda não couber rola (`safe center` no CSS).
 *
 * Mexe só na variável `--int-fonte` da `.int-frase`: o CSS a usa na tradução e na fala.
 */

/** Abaixo disto a fonte não desce: a frase rola. */
export const FONTE_MINIMA_DA_FRASE_PX = 18;
const PASSO_PX = 2;

/** Encolhe a fonte da frase até caber. Sem layout (o servidor, o jsdom), não faz nada. */
export function ajustarFonteParaCaber(frase: HTMLElement, minimo = FONTE_MINIMA_DA_FRASE_PX): void {
  frase.style.removeProperty('--int-fonte');
  if (!frase.clientHeight || frase.scrollHeight <= frase.clientHeight) return;
  const texto = frase.querySelector<HTMLElement>('.int-traducao, .int-ao-vivo, .int-fora-do-par');
  if (!texto) return;
  let px = parseFloat(getComputedStyle(texto).fontSize) || 0;
  while (px > minimo && frase.scrollHeight > frase.clientHeight) {
    px = Math.max(minimo, px - PASSO_PX);
    frase.style.setProperty('--int-fonte', `${px}px`);
  }
}
