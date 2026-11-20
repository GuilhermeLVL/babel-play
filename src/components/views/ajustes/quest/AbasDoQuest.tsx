import { type KeyboardEvent, type ReactNode, useEffect, useRef } from 'react';

export interface AbaDoQuest {
  id: string;
  rotulo: string;
  icone?: ReactNode;
}

/**
 * AS ABAS DE UMA TELA NO HEADSET: `.q-abas` > `.q-aba` (`styles/quest.css`), com a mesma semântica e o
 * mesmo teclado das abas de sempre (`ui/Abas.tsx`): `tablist`/`tab`, só a escolhida na ordem de
 * tabulação, setas, Home e End. Os ids (`aba-<id>`, `painel-<id>`) são os de `PainelDeAba`, que
 * continua sendo o painel.
 */
export default function AbasDoQuest({
  itens,
  ativo,
  aoTrocar,
  rotuloDoGrupo,
  grade = false,
}: {
  itens: readonly AbaDoQuest[];
  ativo: string;
  aoTrocar: (id: string) => void;
  rotuloDoGrupo: string;
  /** No celular as abas viram uma grade de 2 colunas (todas à vista, sem rolar de lado); no desktop, a faixa de sempre. */
  grade?: boolean;
}) {
  /* A faixa rola de lado no celular: a aba escolhida vem para o meio, nunca meio cortada na borda, e as pontas
     onde ainda há aba escondida esmaecem (`data-rola-esq`/`data-rola-dir`, lidos por `quest.css`). */
  const faixa = useRef<HTMLDivElement>(null);
  const marcarPontas = () => {
    const el = faixa.current;
    if (!el || el.classList.contains('q-abas-grade')) return;
    el.dataset.rolaEsq = String(el.scrollLeft > 4);
    el.dataset.rolaDir = String(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  useEffect(() => {
    const lista = faixa.current;
    const aba = lista?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    // Rola SÓ a faixa (`scrollIntoView` rolaria também o `main`, que tem `overflow-x` escondido e empurraria a página de lado).
    if (lista && aba && typeof lista.scrollTo === 'function')
      lista.scrollTo({ left: Math.max(0, aba.offsetLeft - (lista.clientWidth - aba.offsetWidth) / 2) });
    marcarPontas();
    window.addEventListener('resize', marcarPontas);
    return () => window.removeEventListener('resize', marcarPontas);
  }, [ativo]);

  const aoTeclar = (e: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!passo && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const destino =
      e.key === 'Home' ? 0 : e.key === 'End' ? itens.length - 1 : (indice + passo + itens.length) % itens.length;
    aoTrocar(itens[destino].id);
    /* Pelo papel, e não por `children[destino]`: a camada de polimento põe um marcador dentro da faixa de abas,
       e o índice dos filhos deixava de ser o das abas (o foco ia para a aba errada). */
    (
      e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]')[destino] as HTMLElement | undefined
    )?.focus();
  };

  return (
    <div
      ref={faixa}
      className={grade ? 'q-abas q-abas-grade' : 'q-abas'}
      role="tablist"
      aria-label={rotuloDoGrupo}
      onScroll={marcarPontas}
    >
      {itens.map((item, i) => {
        const escolhida = item.id === ativo;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`aba-${item.id}`}
            className="q-aba"
            aria-selected={escolhida}
            aria-controls={`painel-${item.id}`}
            tabIndex={escolhida ? 0 : -1}
            onClick={() => aoTrocar(item.id)}
            onKeyDown={(e) => aoTeclar(e, i)}
          >
            {item.icone}
            {item.rotulo}
          </button>
        );
      })}
    </div>
  );
}
