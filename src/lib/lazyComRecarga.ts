import { type ComponentType, createElement, lazy, useState } from 'react';

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

/*
 * O GENERICO E SOBRE AS PROPS, nao sobre o componente. `T extends ComponentType<unknown>` parecia
 * mais estrito e era o oposto: props sao CONTRAVARIANTES, entao um componente que recebe props
 * (`LiveCapture`, `Play`, `Loja`...) nao e atribuivel a `ComponentType<unknown>`, e as 30 chamadas
 * de `App.tsx` so passavam porque o `tsconfig` da raiz nao tinha `strict`. Com `P` inferido do
 * proprio modulo, o tipo das props sobrevive ate o ponto de uso.
 */
/*
 * O PEDAÇO JÁ BAIXADO NÃO SUSPENDE (auditoria de 23/10/2026, B3). O `lazy` do React só sabe que o módulo
 * chegou depois de chamar a fábrica dele e esperar a promessa: na primeira vez que a tela monta ele
 * suspende MESMO com o pedaço já pré-carregado (`polimento/precarga.ts`), e o React segura o fallback do
 * `Suspense` por ~300 ms. Era o vazio de ~350 ms na primeira visita a cada tela.
 *
 * Agora quem carrega guarda o componente (`carregar`, que a pré-carga também usa), e o embrulho abaixo o
 * desenha direto quando ele já está aqui. A escolha é feita UMA vez por montagem (`useState`): trocar de
 * `lazy` para o direto numa tela já montada remontaria a tela e perderia o estado dela.
 */
export function lazyComRecarga<P>(carregar: () => Promise<{ default: ComponentType<P> }>) {
  let pronto: ComponentType<P> | null = null;
  const carregarEGuardar = async () => {
    const m = await carregar();
    pronto = m.default;
    return m;
  };
  const Preguicoso = lazy(async () => {
    try {
      const m = await carregarEGuardar();
      try {
        sessionStorage.removeItem(CHAVE);
      } catch {
        /* sem storage */
      }
      return m;
    } catch (erro) {
      let jaRecarregou = false;
      try {
        jaRecarregou = sessionStorage.getItem(CHAVE) === '1';
      } catch {
        /* sem storage */
      }
      if (!jaRecarregou && typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(CHAVE, '1');
        } catch {
          /* sem storage */
        }
        window.location.reload();
        // Enquanto a página recarrega, devolve algo vazio para o Suspense não estourar.
        return new Promise<{ default: ComponentType<P> }>(() => {});
      }
      throw erro;
    }
  });
  function ComRecarga(props: P & object) {
    const [direto] = useState(() => pronto);
    return createElement((direto ?? Preguicoso) as ComponentType<P & object>, props);
  }
  /** Baixa o pedaço e guarda o componente: a primeira montagem depois disso não suspende. */
  ComRecarga.carregar = carregarEGuardar;
  return ComRecarga;
}
