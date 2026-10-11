/**
 * AS TELAS ENXUTAS — o movimento que o protótipo `telas-enxutas` acrescenta a Capturar e Jogar
 * (`enxuto.js`). Os números são os de lá; cada função diz a linha de onde veio.
 */
import { anima, MOLA, polido, reduz } from './base';

/** `entraSuave()` de `enxuto.js:34-37`: sobe 14 px em 480 ms, 60 ms entre uma peça e a seguinte. */
export function entraSuave(els: readonly (Element | null | undefined)[], atraso = 0): void {
  if (!polido() || reduz()) return;
  els
    .filter((x): x is Element => !!x)
    .forEach((x, i) =>
      anima(
        x,
        [
          { opacity: 0, transform: 'translateY(14px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { d: 480, atraso: atraso + i * 60 },
      ),
    );
}

/** O botão de pausa afunda e volta quando muda (`pausarOuRetomar()`, `enxuto.js:137-138`). */
export function pulsarPausa(b: Element | null): void {
  if (!b || !polido() || reduz()) return;
  anima(b, [{ transform: 'scale(1)' }, { transform: 'scale(0.9)' }, { transform: 'scale(1)' }], { d: 420, e: MOLA });
}

/** Trocar de seção em "Buscar e organizar": o miolo e o pé sobem em cascata (`por()`, `enxuto.js:329`). */
export function entrarSecao(d: Element | null): void {
  if (!d || !polido() || reduz()) return;
  d.querySelectorAll('.dlg-corpo > *, .dlg-pe > *').forEach((x, n) =>
    anima(
      x,
      [
        { opacity: 0, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { d: 380, atraso: Math.min(n, 10) * 40 },
    ),
  );
}
