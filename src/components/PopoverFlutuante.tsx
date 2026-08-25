import React from 'react';

/**
 * A MOLDURA do popover que segue a palavra sob o cursor — só a moldura.
 *
 * `Analysis.tsx` e `Reading.tsx` repetiam 17 linhas idênticas aqui: o posicionamento fixo, a
 * largura de 320 px, a animação de entrada e — o que de fato importa — o par
 * `onMouseEnter`/`onMouseLeave` que cancela o timer de fechamento. Esse par é o que permite
 * atravessar o vão entre a palavra e o cartão sem que ele suma no caminho; divergir num dos lados
 * quebraria o popover de um jeito que nenhum teste de unidade pegaria.
 *
 * O QUE NÃO FOI UNIFICADO, E POR QUÊ. O CONTEÚDO dos dois popovers divergiu de verdade, e continua
 * separado: a Análise mostra um cartão rico (imagem, significados, estado de carregamento por
 * palavra, vindo de `hoverData`) e a Leitura mostra só a prévia de imagem (`wordPreview`, com
 * "sem imagem" honesto quando o Openverse não devolve nada). São duas informações diferentes sobre
 * a mesma palavra, não duas versões da mesma coisa. Forçá-las a um componente só exigiria um
 * `modo` com dois ramos mutuamente exclusivos dentro — trocar duplicação honesta por acoplamento
 * escondido. Por isso aqui entra `children`: a moldura é comum, o recheio não é.
 *
 * O estado chega por prop, e não por hook interno, porque as duas telas coexistem: `Reading` é
 * renderizado DENTRO de `Analysis` na aba Leitura, cada uma com o seu `hoveredWord`. Um hook aqui
 * daria a impressão de estado compartilhado sem sê-lo.
 */
export interface PopoverFlutuanteProps {
  /** Posição já calculada por `lib/posicaoFlutuante` (viewport, em px). */
  posicao: { top: number; left: number };
  /** Cursor entrou no cartão: cancela o fechamento pendente. */
  onEntrar: () => void;
  /** Cursor saiu: fecha. */
  onSair: () => void;
  children: React.ReactNode;
}

export default function PopoverFlutuante({ posicao, onEntrar, onSair, children }: PopoverFlutuanteProps) {
  return (
    <div
      className="fixed z-50 animate-in fade-in zoom-in-95 duration-200 shadow-2xl rounded-xl overflow-hidden bg-surface border border-border-subtle"
      style={{
        top: `${posicao.top}px`,
        left: `${posicao.left}px`,
        width: '320px'
      }}
      onMouseEnter={onEntrar}
      onMouseLeave={onSair}
    >
      {children}
    </div>
  );
}
