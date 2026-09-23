import type { ReactNode } from 'react';

/**
 * TELA — a moldura de rolagem e largura de toda view.
 *
 * O DEFEITO QUE ISTO CONSERTA. Cada view repetia `flex-1 overflow-y-auto … p-6 md:p-10 max-w-*xl
 * mx-auto` com larguras e respiros que divergiam (Hub `6xl`, Ajustes `4xl`, outras sem máximo). A
 * referência aprovada (`docs/prototipos/consistencia-telas.html`) tem só duas larguras: `larga`
 * para telas de grade e `estreita` para telas de leitura e formulário.
 */
interface TelaProps {
  largura?: 'larga' | 'estreita';
  children: ReactNode;
  className?: string;
}

const LARGURA = { larga: 'max-w-6xl', estreita: 'max-w-4xl' } as const;

export default function Tela({ largura = 'larga', children, className = '' }: TelaProps) {
  return (
    <div className="flex-1 overflow-y-auto w-full bg-canvas">
      <div className={`p-6 md:p-10 ${LARGURA[largura]} mx-auto w-full ${className}`}>{children}</div>
    </div>
  );
}
