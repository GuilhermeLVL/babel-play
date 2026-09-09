import { useSyncExternalStore } from 'react';

import { assinarIdioma, idiomaDaInterface, t, tp } from './i18n';

/**
 * Liga o `t()` ao React.
 *
 * `useSyncExternalStore` em vez de um contexto: o idioma da interface é estado de aplicação inteira
 * que muda raramente, e um provider obrigaria a envolver a árvore e a passar o valor por baixo de
 * cada componente memoizado. Aqui quem usa `t` re-renderiza na troca, e quem não usa fica parado.
 *
 * Devolve `t` e `tp` já vinculados ao idioma corrente, para o componente não precisar importar dois
 * módulos nem lembrar de reagir à troca.
 */
export function useI18n() {
  useSyncExternalStore(assinarIdioma, idiomaDaInterface, () => 'pt');
  return { t, tp, idioma: idiomaDaInterface() };
}
