import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { usePosicaoFlutuante } from '../lib/posicaoFlutuante';

/**
 * Dica contextual — o ícone "ⓘ" que revela a LÓGICA daquela ação. Serve à invariante de
 * honestidade do app: dizer o que de fato acontece (ex.: legenda vs. Whisper) em vez de deixar
 * adivinhar.
 *
 * DOIS DEFEITOS CORRIGIDOS AQUI, os dois medidos:
 *
 * 1. ERA RECORTADA. O balão vivia dentro da árvore, e as telas que o usam são `.card-panel` —
 *    classe que tem `overflow: hidden`. Numa janela de 420px, DUAS das quatro dicas do diálogo de
 *    importação vazavam 31px e apareciam cortadas. É o mesmo defeito que a lista de idiomas e o
 *    menu da Biblioteca tinham; a correção é a mesma: portal no `body` com posição de viewport.
 *
 * 2. ERA INVISÍVEL NO TOQUE. Abria só com `:hover`, que não existe em tela sensível ao toque —
 *    ou seja, em celular a explicação simplesmente não existia. Agora abre no toque e no foco
 *    também, e o toque não dispara o botão que a contém.
 *
 * O gatilho continua sendo um `<span>` de propósito: assim pode viver DENTRO de outro botão (os
 * tiles são botões) sem aninhar elementos interativos.
 */
export default function InfoHint({
  text,
  className = '',
}: {
  text: string;
  /**
   * Mantido só por compatibilidade com quem já passa a prop. A posição agora é calculada — fixar
   * um lado no código foi exatamente o que quebrava quando o ícone mudava de canto.
   */
  align?: 'left' | 'right';
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const gatilhoRef = useRef<HTMLSpanElement | null>(null);
  const caixa = usePosicaoFlutuante(aberto, gatilhoRef, { largura: 224, alturaEstimada: 90 });

  return (
    <span
      ref={gatilhoRef}
      className={`relative inline-flex ${className}`}
      aria-label={text}
      tabIndex={0}
      role="button"
      onMouseEnter={() => setAberto(true)}
      onMouseLeave={() => setAberto(false)}
      onFocus={() => setAberto(true)}
      onBlur={() => setAberto(false)}
      // `stopPropagation` e `preventDefault`: o ícone mora dentro de botões, e sem isto tocar na
      // dica dispararia a ação do tile em vez de explicá-la.
      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setAberto(a => !a); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setAberto(a => !a); }
        if (e.key === 'Escape') setAberto(false);
      }}
    >
      <Info className="w-3.5 h-3.5 text-ink-muted/70 hover:text-accent transition-colors" />
      {aberto && caixa && createPortal(
        <span
          role="tooltip"
          style={{ top: caixa.top, left: caixa.left, width: caixa.largura }}
          className="fixed z-[75] pointer-events-none rounded-lg bg-surface border border-border-subtle shadow-2xl p-2.5
                     text-left text-[11px] font-normal leading-snug text-ink-muted normal-case
                     animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}
