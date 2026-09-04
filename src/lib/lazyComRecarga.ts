import { lazy, type ComponentType } from 'react';

/**
 * `lazy()` que SOBREVIVE a um deploy.
 *
 * O DEFEITO (relatado pelo dono, 2026-08-28): logo depois de uma captura, a tela da sessão vinha
 * PRETA na primeira vez e funcionava na segunda. A aba estava aberta com o `index.html` de antes
 * do deploy; ao pedir a tela de sessão, o `import()` buscou um chunk com hash que já não existia
 * no servidor (404) e a promessa rejeitou dentro do Suspense, sem ninguém para pintar nada.
 *
 * A saída é a padrão para SPAs com hash no nome do chunk: se o carregamento falhar, RECARREGAR
 * a página uma vez (traz o index novo com os hashes novos). O guarda em sessionStorage evita
 * laço infinito quando a falha é outra (rede caída de verdade): na segunda falha o erro sobe
 * para o ErrorBoundary, que mostra a tela de recuperação em vez do preto.
 */
const CHAVE = 'babel.recarga-por-chunk';

export function lazyComRecarga<T extends ComponentType<unknown>>(carregar: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const m = await carregar();
      try { sessionStorage.removeItem(CHAVE); } catch { /* sem storage */ }
      return m;
    } catch (erro) {
      let jaRecarregou = false;
      try { jaRecarregou = sessionStorage.getItem(CHAVE) === '1'; } catch { /* sem storage */ }
      if (!jaRecarregou && typeof window !== 'undefined') {
        try { sessionStorage.setItem(CHAVE, '1'); } catch { /* sem storage */ }
        window.location.reload();
        // Enquanto a página recarrega, devolve algo vazio para o Suspense não estourar.
        return new Promise<{ default: T }>(() => {});
      }
      throw erro;
    }
  });
}
