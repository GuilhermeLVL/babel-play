import { type ReactNode, useEffect } from 'react';

import { FLAG_LEITURA_ATIVA } from '../../../core/planos';
import { carregarFlags, useFlag } from '../../../lib/flags';

/**
 * O PORTÃO DA LEITURA ATIVA (spec `leitura-ativa-acesso`). Com a flag `leitura_ativa` desligada, `/leitura` leva ao
 * início como um caminho desconhecido, e NENHUM componente da Leitura ativa é carregado (o filho é a tela lazy, que
 * só desce quando este portão o renderiza). Antes de mandar embora, pergunta ao servidor uma vez: o cache local pode
 * estar velho (a flag acabou de ser ligada).
 */
export default function PortaoDaLeituraAtiva({ aoNegar, children }: { aoNegar: () => void; children: ReactNode }) {
  const ligada = useFlag(FLAG_LEITURA_ATIVA);
  useEffect(() => {
    if (ligada) return;
    let vivo = true;
    void carregarFlags().then((f) => {
      if (vivo && f[FLAG_LEITURA_ATIVA]?.ligada !== true) aoNegar();
    });
    return () => {
      vivo = false;
    };
    // `aoNegar` muda a cada render do App; o que importa é a flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligada]);
  return ligada ? <>{children}</> : null;
}
