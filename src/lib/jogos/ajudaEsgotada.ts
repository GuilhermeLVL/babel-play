/**
 * UMA AJUDA ACABOU NESTA RODADA? — o sinal entre as ajudas da rodada (`minigames/casca/AjudasGerais.tsx`) e a
 * tela de fim (`FimDaRodada.tsx`), que oferece o premiado "+1 ajuda" (espaço `ajuda-premiada`).
 *
 * O protótipo põe a oferta ao lado da ajuda que zerou, no meio da rodada (`anuncios.js:267-278`); no app a
 * política nega todo anúncio com a rodada em andamento (spec `anuncios-no-gratis`, "Tela ocupada"), então ela vai
 * para o fim, e a ajuda vale na próxima. Estado da página, de propósito: é só "esta rodada".
 */
let esgotouEm: string | null = null;

/** Uma rodada começou: nenhuma ajuda acabou ainda. */
export function rodadaComAjudas(): void {
  esgotouEm = null;
}

/** Uma ajuda chegou a zero na rodada deste jogo. */
export function marcarAjudaEsgotada(jogo: string): void {
  esgotouEm = jogo;
}

/** Alguma ajuda acabou na rodada (deste jogo) que acabou de terminar? */
export function ajudaEsgotadaNaRodada(jogo: string): boolean {
  return esgotouEm === jogo;
}
