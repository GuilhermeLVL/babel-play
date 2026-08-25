import React from 'react';
import ControlCluster, { type ControlClusterProps } from './ControlCluster';
import { Brand } from './ShellBits';
import type { DerivedProgress } from '../../lib/progress';

interface MobileTopBarProps {
  /** Mantido na assinatura: o App passa para todas as molduras; a pílula de ofensiva/seeds saiu daqui a pedido. */
  progress?: DerivedProgress;
  controls: Omit<ControlClusterProps, 'orientation'>;
}

/**
 * Barra superior do celular — só entra quando a moldura de desktop escolhida (rail à esquerda,
 * à direita, ou barra no rodapé) não existe abaixo de `md`. Sem ela, escolher "menu à esquerda"
 * no desktop deixaria o celular sem NENHUM controle: nem tema, nem fonte, nem tutor.
 *
 * No celular a app é sempre a mesma coisa — controles em cima, destinos embaixo — porque é isso
 * que a mão alcança. A preferência de posição do usuário vale para a tela grande.
 */
export default function MobileTopBar({ controls }: MobileTopBarProps) {
  return (
    <header data-shell="bar" className="md:hidden h-[60px] w-full flex items-center gap-3 px-3 bg-surface/90 backdrop-blur-md border-b border-border-subtle/70 z-20 shrink-0 select-none">
      <Brand compact />
      <div className="flex-1" />
      <ControlCluster {...controls} orientation="row" />
    </header>
  );
}
