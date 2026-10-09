/**
 * A BIBLIOTECA DO DESENHO NOVO — o movimento de `redesenharBib()` de `telas.js:436-454`
 * (itens D48 e D49 de `fidelidade/casca-e-telas.md`), com os mesmos números.
 *
 * No protótipo a tela é um `innerHTML` trocado a cada toque; aqui quem troca é o React, e esta função
 * roda logo depois de ele pintar (`useLayoutEffect` em `BibliotecaDoQuest`). A pílula das abas é da
 * camada comum (`telas.ts`), que já a põe em toda `.q-abas`.
 */
import { anima, polido, reduz } from './base';

/** O que mudou na tela: a gravação escolhida (`detalhe`) ou a lista (`lista`: página, filtro, busca). */
export type ComoRedesenhar = 'detalhe' | 'lista';

/** Os dois movimentos de `telas.js:446-453`. `dir` é o sentido da página (−1 volta, 1 avança). */
export function redesenharBib(tela: ParentNode | null, como: ComoRedesenhar, dir = 1): void {
  if (!tela || !polido() || reduz()) return;
  if (como === 'detalhe') {
    /* `telas.js:447-450`: o painel volta do desfoque e os fatos e as ações sobem em cascata. */
    const det = tela.querySelector('.q-bib-det');
    if (!det) return;
    anima(
      det,
      [
        { opacity: 0.2, transform: 'scale(0.97)', filter: 'blur(8px)' },
        { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
      ],
      { d: 460 },
    );
    det.querySelectorAll('.q-bib-fatos > div, .q-bib-acoes > *').forEach((x, i) =>
      anima(
        x,
        [
          { opacity: 0, transform: 'translateY(12px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { d: 420, atraso: 60 + i * 45 },
      ),
    );
    return;
  }
  /* `telas.js:451-453`: as linhas entram pelo lado da página pedida. */
  tela.querySelectorAll('.q-lista > .q-linha').forEach((x, i) =>
    anima(
      x,
      [
        { opacity: 0, transform: `translateX(${46 * dir}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { d: 460, atraso: i * 55 },
    ),
  );
}
