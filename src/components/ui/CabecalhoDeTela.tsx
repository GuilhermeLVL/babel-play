import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * CABEÇALHO DE TELA — sobrancelha com ícone, o único `<h1>` da tela, subtítulo, ações e abas.
 *
 * O DEFEITO QUE ISTO CONSERTA. Dezesseis views escreviam o próprio cabeçalho à mão, e cada uma
 * chegou a um tamanho de título, a um respiro e a uma cor de sobrancelha diferentes — o que o dono
 * chamou de "o design é bonito, mas não está consistente em todas as telas". O molde é o da tela
 * de Ajustes e do Início (decisão do dono, 22/09/2026).
 *
 * A sobrancelha usa `text-accent-ink` e não `text-accent`: a cor cheia sobre a superfície mede
 * 1,82:1 (registrado em `index.css`), e texto pequeno precisa de 4,5:1.
 */
interface CabecalhoDeTelaProps {
  titulo: ReactNode;
  /** O rótulo curto acima do título (ex.: "Seu estudo"). Opcional: o perfil `pro` do Início não tem. */
  sobrancelha?: ReactNode;
  icone?: LucideIcon;
  sub?: ReactNode;
  /** Botões à direita do título (quebram para baixo em telas estreitas). */
  acoes?: ReactNode;
  /** As abas da tela, logo abaixo do cabeçalho. */
  abas?: ReactNode;
  /** Volta para a tela de origem (sub-telas: sessão, revisão, rodada). */
  voltar?: { rotulo: string; aoClicar: () => void };
  className?: string;
}

export default function CabecalhoDeTela({
  titulo,
  sobrancelha,
  icone: Icone,
  sub,
  acoes,
  abas,
  voltar,
  className = '',
}: CabecalhoDeTelaProps) {
  return (
    <header className={`mb-7 ${className}`}>
      {voltar && (
        <button
          type="button"
          onClick={voltar.aoClicar}
          className="inline-flex items-center gap-1.5 min-h-8 -mt-1 mb-2 rounded-lg text-[13px] font-display font-bold text-ink-muted hover:text-ink cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          {voltar.rotulo}
        </button>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-[1_1_360px]">
          {sobrancelha && (
            <span className="label-mono text-accent-ink flex items-center gap-1.5">
              {Icone && <Icone className="w-3.5 h-3.5" aria-hidden />}
              <span>{sobrancelha}</span>
            </span>
          )}
          <h1 className="font-display font-black text-[25px] md:text-[30px] leading-[1.12] tracking-[-0.02em] [word-spacing:0.06em] text-ink my-1.5 text-balance">
            {titulo}
          </h1>
          {sub && <p className="text-ink-muted text-sm max-w-[64ch]">{sub}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      {abas && <div className="mt-6">{abas}</div>}
    </header>
  );
}
