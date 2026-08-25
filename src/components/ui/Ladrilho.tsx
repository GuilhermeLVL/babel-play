import type { ReactNode } from 'react';

/**
 * LADRILHO — um número grande com o que ele significa embaixo, e a base de cálculo junto.
 *
 * O DEFEITO QUE ISTO CONSERTA. Números grandes apareciam em quatro telas (KPIs de Métricas, saldo
 * da antessala, faixa de status do lobby, cards do Hub) e a base de cálculo se perdia no caminho.
 * "58 de cada 100" é verdade sobre as 149 palavras já revisadas, não sobre as 1.902 do baralho — e
 * a diferença entre as duas leituras é a diferença entre uma métrica honesta e uma métrica que
 * infla. O app já tinha `rotuloDaBase()` e `<Confianca>` em `Honestidade.tsx` justamente para isso;
 * o que faltava era um lugar onde esquecer de usá-los fosse difícil.
 *
 * POR ISSO `nota` É UM CAMPO DE PRIMEIRA CLASSE, e não algo que cada tela pendura embaixo se
 * lembrar. Um ladrilho sem nota afirma que o número vale sobre tudo — o que quase nunca é o caso.
 *
 * O QUE ESTE COMPONENTE NÃO FAZ: inventar `0`. Quando o dado ainda não chegou, passe `valor={null}`
 * e ele mostra um esqueleto. Um "0" durante o carregamento é um número falso, e o app já decidiu
 * isso uma vez no `StatPill` do shell — aqui a decisão é a mesma.
 */

interface LadrilhoProps {
  /** `null` = ainda não chegou. Vira esqueleto, nunca "0". */
  valor: number | string | null;
  rotulo: string;
  /** A base de cálculo, o recorte, a ressalva. Renderizado abaixo em texto pequeno. */
  nota?: ReactNode;
  tom?: 'ink' | 'accent' | 'good' | 'warn' | 'error';
  /** Ícone opcional acima do número. */
  icone?: ReactNode;
  className?: string;
}

const COR_DO_VALOR = {
  ink: 'text-ink',
  accent: 'text-accent-ink',
  good: 'text-good-ink',
  warn: 'text-warn-ink',
  error: 'text-error-ink',
} as const;

export default function Ladrilho({
  valor,
  rotulo,
  nota,
  tom = 'ink',
  icone,
  className = '',
}: LadrilhoProps) {
  return (
    <div className={`card-panel bg-surface p-4 ${className}`}>
      {icone && <div className="text-ink-muted mb-2">{icone}</div>}

      {valor === null ? (
        /* Esqueleto: ocupa o mesmo espaço que o número ocupará, para a tela não pular quando o
           dado chegar. `aria-hidden` porque "carregando" é dito pelo `aria-busy` do contêiner. */
        <div className="h-8 w-16 rounded-lg bg-surface-hover animate-pulse" aria-hidden />
      ) : (
        <div className={`font-display font-black text-2xl leading-none tabular-nums ${COR_DO_VALOR[tom]}`}>
          {valor}
        </div>
      )}

      <div className="text-[12px] text-ink-muted mt-1.5 leading-snug">{rotulo}</div>

      {nota && <div className="text-[11px] text-ink-muted mt-1.5 leading-snug">{nota}</div>}
    </div>
  );
}
