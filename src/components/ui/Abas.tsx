import type { ReactNode } from 'react';

/**
 * ABAS — o padrão que o app já usava em quatro lugares sem nunca ter existido como peça.
 *
 * O DEFEITO QUE ISTO CONSERTA. Havia quatro implementações de aba no projeto (métricas, sub-abas
 * de sessão, Studio, e agora Ajustes), todas escritas à mão com a mesma cascata de classes
 * `pb-3 px-4 text-[13px] font-bold border-b-2 …` copiada de uma para a outra. Nenhuma delas era
 * navegável por teclado de verdade: eram `<button aria-pressed>` soltos, sem `role="tablist"`,
 * sem setas, sem `aria-controls`. Quem usa leitor de tela ouvia quatro botões avulsos, não um
 * grupo de abas — e quem usa teclado precisava tabular por todas as abas para chegar ao conteúdo.
 *
 * AS DUAS VARIANTES SÃO DE CONTEXTO, NÃO DE GOSTO. `sublinhado` é a aba de página inteira (topo de
 * Métricas, topo de Ajustes): ela divide a tela e por isso ganha a régua embaixo. `pilula` é a aba
 * dentro de um card, onde uma segunda régua horizontal brigaria com a borda do próprio card.
 *
 * NAVEGAÇÃO POR TECLADO segue o padrão APG: apenas a aba ativa entra na ordem de tabulação
 * (`tabIndex`), e as setas movem entre elas. Sem isso, uma barra de 5 abas custa 5 tabulações
 * antes do conteúdo.
 */

export interface ItemDeAba {
  id: string;
  rotulo: string;
  /** Ícone opcional à esquerda do rótulo. Já vem dimensionado pelo chamador (`w-4 h-4`). */
  icone?: ReactNode;
  /** Contagem à direita. `0` é exibido; `undefined` esconde — "0" é informação, ausência não é. */
  contagem?: number;
}

interface AbasProps {
  itens: ItemDeAba[];
  ativo: string;
  aoTrocar: (id: string) => void;
  variante?: 'sublinhado' | 'pilula';
  /** Rotula o grupo para quem não vê a tela ("Seções de ajustes"). */
  rotuloDoGrupo: string;
  className?: string;
}

export default function Abas({
  itens,
  ativo,
  aoTrocar,
  variante = 'sublinhado',
  rotuloDoGrupo,
  className = '',
}: AbasProps) {
  /**
   * Setas movem o foco E a seleção. É o modo "automático" do APG, correto aqui porque trocar de aba
   * não custa nada: o conteúdo já está em memória. (No modo manual a pessoa precisaria de Enter
   * depois de cada seta — atrito sem contrapartida quando a troca é barata.)
   */
  function aoTeclar(e: React.KeyboardEvent, indice: number) {
    const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!passo && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const destino =
      e.key === 'Home' ? 0
        : e.key === 'End' ? itens.length - 1
          : (indice + passo + itens.length) % itens.length;
    aoTrocar(itens[destino].id);
    // O foco tem de acompanhar a seleção, senão a próxima seta parte do lugar errado.
    const alvo = e.currentTarget.parentElement?.children[destino] as HTMLElement | undefined;
    alvo?.focus();
  }

  const contorno = variante === 'sublinhado'
    ? 'flex gap-2 border-b border-border-subtle'
    : 'flex flex-wrap gap-1.5';

  return (
    <div role="tablist" aria-label={rotuloDoGrupo} className={`${contorno} ${className}`}>
      {itens.map((item, i) => {
        const selecionado = item.id === ativo;

        /* As classes são as MESMAS que Metrics.tsx já usava — este primitivo nasce sem mudar um
           pixel, para que a adoção possa ser conferida por comparação direta. */
        const estilo = variante === 'sublinhado'
          ? `pb-3 px-4 text-[13px] font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
            selecionado ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'
          }`
          : `kpi-pill ${selecionado ? 'active' : ''}`;

        return (
          <button
            key={item.id}
            role="tab"
            id={`aba-${item.id}`}
            aria-selected={selecionado}
            aria-controls={`painel-${item.id}`}
            tabIndex={selecionado ? 0 : -1}
            onClick={() => aoTrocar(item.id)}
            onKeyDown={(e) => aoTeclar(e, i)}
            className={`${estilo} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
          >
            {item.icone}
            {item.rotulo}
            {/* Sem `opacity-70`. A contagem já herda `text-ink-muted` da aba não selecionada, e a
                opacidade compunha por cima: no tema vercel escuro o par `--ink-muted` sobre
                `--surface` cai de 5,57:1 para 3,23:1, abaixo dos 4,5:1 exigidos. Medido em axe
                color-contrast. A hierarquia visual vem do tamanho e da posição, não de apagar o
                texto duas vezes. */}
            {item.contagem !== undefined && (
              <span className="tabular-nums">{item.contagem}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * O painel que a aba controla. Existe para que o par `aria-controls`/`aria-labelledby` não dependa
 * de cada chamador lembrar de escrever os dois ids na mão — foi assim que as abas antigas ficaram
 * sem eles.
 */
export function PainelDeAba({
  id,
  ativo,
  children,
  className = '',
}: {
  id: string;
  ativo: string;
  children: ReactNode;
  className?: string;
}) {
  if (id !== ativo) return null;
  return (
    <div role="tabpanel" id={`painel-${id}`} aria-labelledby={`aba-${id}`} tabIndex={0} className={className}>
      {children}
    </div>
  );
}
