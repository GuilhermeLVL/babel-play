import React from 'react';
import type { TokenDeTexto } from '../lib/vocabWord';

/**
 * A LINHA DE PALAVRAS CLICÁVEIS do transcrito da Análise.
 *
 * `Analysis.tsx` desenhava este bloco DUAS vezes, 40 linhas idênticas cada — era o maior clone que
 * o `jscpd` media no repositório. Não eram duas telas parecidas: era o MESMO trecho escrito de novo
 * porque `displayOrder` tem dois ramos (`original-first` e o inverso) e cada ramo recriava a lista
 * inteira só para trocar a ORDEM em que original e tradução aparecem.
 *
 * O que muda entre os dois ramos é uma classe de margem. Por isso `className` é prop e o resto não:
 * o realce de "já está no deck", o limiar de palavra de conteúdo e os três handlers são contrato
 * com o usuário, e mantê-los em duplicata era esperar que alguém corrigisse um só dos lados.
 */
export interface TokensClicaveisProps {
  tokens: TokenDeTexto[];
  /** Classes do contêiner — muda entre os ramos de `displayOrder` (só a margem). */
  className: string;
  /** A palavra já está fichada e no deck? Decide o realce verde. */
  estaNoDeck: (clean: string) => boolean;
  onMouseEnter: (e: React.MouseEvent<HTMLSpanElement>, clean: string) => void;
  onMouseLeave: () => void;
  /** Clique abre o Analista de Vocabulário na palavra. */
  onExaminar: (clean: string) => void;
}

export default function TokensClicaveis({
  tokens,
  className,
  estaNoDeck,
  onMouseEnter,
  onMouseLeave,
  onExaminar,
}: TokensClicaveisProps) {
  return (
    <div className={className}>
      {tokens.map(token => {
        // Toda palavra de conteúdo (>=3 letras, alfabética) é interativa:
        // hover carrega imagem/tradução/contexto reais. Termos já no deck
        // ficam realçados em verde.
        const isContentWord = token.clean.length >= 3 && /^[a-z]+$/.test(token.clean);
        const isWordInDeck = estaNoDeck(token.clean);

        if (isContentWord) {
          return (
            <span
              key={token.id}
              onMouseEnter={(e) => onMouseEnter(e, token.clean)}
              onMouseLeave={onMouseLeave}
              onClick={(e) => {
                e.stopPropagation();
                onExaminar(token.clean);
              }}
              className={`cursor-pointer inline-block rounded px-1 transition-colors duration-200 ${
                isWordInDeck
                  ? 'bg-good-soft/40 text-good font-bold underline decoration-dashed decoration-good underline-offset-4'
                  : 'hover:bg-accent-soft/50 hover:text-accent'
              }`}
            >
              {token.original}
            </span>
          );
        } else {
          return (
            <span
              key={token.id}
              className="inline-block px-0.5"
            >
              {token.original}
            </span>
          );
        }
      })}
    </div>
  );
}
