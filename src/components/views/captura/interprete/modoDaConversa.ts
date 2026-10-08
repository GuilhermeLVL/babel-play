/**
 * O MODO DA CONVERSA do intérprete e a última escolha da pessoa, neste aparelho. Mora à parte da tela
 * (`ModoInterprete`) porque a tela pronta do desenho novo (`PaginaDoInterprete`) lê e grava a mesma
 * escolha, e não pode puxar a conversa inteira para o pedaço dela.
 */

/** Como a conversa anda: o app ouve e reconhece quem fala (automático), ou cada um toca a sua metade. */
export type ModoDaConversa = 'automatico' | 'toque';

/* Conveniência: sem armazenamento, vale o padrão. */
const CHAVE_DO_MODO = 'babel.interprete.modo';

export function modoGuardado(): ModoDaConversa | null {
  try {
    const v = localStorage.getItem(CHAVE_DO_MODO);
    return v === 'automatico' || v === 'toque' ? v : null;
  } catch {
    return null;
  }
}

export function guardarModo(modo: ModoDaConversa) {
  try {
    localStorage.setItem(CHAVE_DO_MODO, modo);
  } catch {
    /* sem armazenamento: a escolha vale só nesta tela */
  }
}
