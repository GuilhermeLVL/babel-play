import { type ReactNode, useEffect } from 'react';

import { FLAG_DIARIO } from '../../../core/planos';
import { carregarFlags, useFlag } from '../../../lib/flags';

/**
 * O PORTÃO DO DIÁRIO (openspec `diario-com-correcao-que-vira-cartao`). Com a flag `diario` desligada, `/diario` leva ao
 * início como um caminho desconhecido, e NENHUM componente do diário é carregado (o filho é a tela lazy, que só desce
 * quando este portão a renderiza). Antes de mandar embora, pergunta ao servidor uma vez: o cache local pode estar velho.
 */
export default function PortaoDoDiario({ aoNegar, children }: { aoNegar: () => void; children: ReactNode }) {
  const ligada = useFlag(FLAG_DIARIO);
  useEffect(() => {
    if (ligada) return;
    let vivo = true;
    void carregarFlags().then((f) => {
      if (vivo && f[FLAG_DIARIO]?.ligada !== true) aoNegar();
    });
    return () => {
      vivo = false;
    };
    // `aoNegar` muda a cada render do App; o que importa é a flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligada]);
  return ligada ? <>{children}</> : null;
}
