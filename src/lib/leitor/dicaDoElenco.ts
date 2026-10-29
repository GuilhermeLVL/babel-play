/**
 * A DICA DO ELENCO (flag `avatar_elenco`): a pessoa já viu e dispensou o convite "dê uma voz a cada personagem"?
 * Fica só no aparelho; sem armazenamento (ou bloqueado), a dica volta a cada visita, o que é inofensivo.
 */
const CHAVE = 'leitor:dica-elenco';

export function dicaDoElencoJaVista(): boolean {
  try {
    return localStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

export function marcarDicaDoElencoVista(): void {
  try {
    localStorage.setItem(CHAVE, '1');
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}
