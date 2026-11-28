/**
 * A PREFERÊNCIA DO FORMATO LACUNA (flag `estudo_revisao_v2`, openspec `cartoes` 3.2): esconder a palavra na frase do
 * "Lembrar". Fica só neste aparelho (`localStorage`), desligada de fábrica, e nunca sobe ao servidor.
 */
const CHAVE = 'revisao.formatoLacuna';

export function lerLacuna(): boolean {
  try {
    return localStorage.getItem(CHAVE) === 'true';
  } catch {
    return false;
  }
}

export function gravarLacuna(ligada: boolean): void {
  try {
    localStorage.setItem(CHAVE, String(ligada));
  } catch {
    /* sem armazenamento: a escolha vale só nesta abertura */
  }
}
