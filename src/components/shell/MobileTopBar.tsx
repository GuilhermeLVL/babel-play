import React from 'react';

import type { DerivedProgress } from '../../lib/progress';
import ControlCluster, { type ControlClusterProps } from './ControlCluster';
import { MarcaBabel } from './ShellBits';

interface MobileTopBarProps {
  /** Mantido na assinatura: o App passa para todas as molduras. */
  progress?: DerivedProgress;
  controls: Omit<ControlClusterProps, 'orientation'>;
}

/**
 * Barra superior do celular — marcação do protótipo aprovado (`.topo-movel`): a marca com o nome
 * e o cluster enxuto (sino, busca, claro/escuro e conta). O CSS do protótipo só a mostra com a janela
 * estreita (`@container` ≤ 760px); na tela grande quem manda é o menu escolhido.
 */
export default function MobileTopBar({ controls }: MobileTopBarProps) {
  return (
    <header data-shell="bar" className="topo-movel">
      <div className="marca" title="Babel Play">
        <MarcaBabel className="" />
        <span>
          Babel<b>Play</b>
        </span>
      </div>
      <ControlCluster {...controls} orientation="column" enxuto />
    </header>
  );
}
