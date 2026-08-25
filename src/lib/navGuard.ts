/**
 * TRAVA DE NAVEGAÇÃO — impede perder trabalho ao sair de uma tela no meio de algo.
 *
 * O problema real: durante uma captura, um clique no menu lateral trocava de tela NA HORA. A
 * gravação era descartada e, com ela, a possibilidade de salvar a sessão — sem aviso nenhum.
 *
 * Como funciona: a tela "em risco" registra uma trava. Antes de navegar, o App pergunta. Se a
 * trava responde `true`, ela ASSUMIU a decisão (vai mostrar o próprio diálogo) e a navegação
 * fica suspensa até alguém chamar `proceed()`. Se responde `false` (ou não há trava), navega.
 *
 * Por que a decisão fica na TELA e não aqui: só o LiveCapture sabe o que "sair" custa (parar as
 * capturas, o que já foi transcrito, se dá para salvar) e só ele tem o modal com essas opções.
 */

/** `proceed` continua a navegação que foi suspensa. Devolver `true` = "eu cuido disto". */
type NavGuard = (proceed: () => void) => boolean;

let guard: NavGuard | null = null;

/** Registra (ou remove, com `null`) a trava da tela atual. */
export function setNavGuard(g: NavGuard | null): void {
  guard = g;
}

/** O App chama antes de navegar. `true` = a navegação foi suspensa pela tela. */
export function askNavGuard(proceed: () => void): boolean {
  return guard ? guard(proceed) : false;
}
