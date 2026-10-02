import type { KeyboardEvent, ReactNode } from 'react';

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
}: {
  itens: readonly AbaDoQuest[];
  ativo: string;
  aoTrocar: (id: string) => void;
  rotuloDoGrupo: string;
}) {
  const aoTeclar = (e: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!passo && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const destino =
      e.key === 'Home' ? 0 : e.key === 'End' ? itens.length - 1 : (indice + passo + itens.length) % itens.length;
    aoTrocar(itens[destino].id);
    (e.currentTarget.parentElement?.children[destino] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className="q-abas" role="tablist" aria-label={rotuloDoGrupo}>
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
