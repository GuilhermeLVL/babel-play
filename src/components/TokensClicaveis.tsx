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
  /* Marcação do protótipo (`palavrasDaFala`): texto corrido; as palavras do caderno ganham o
     sublinhado pontilhado (`.palavra`), e toda palavra de conteúdo continua clicável (abre o
     Analista) e mostra a prévia no hover. */
  return (
    <span className={className}>
      {tokens.map((token) => {
        const isContentWord = token.clean.length >= 3 && /^\p{L}+$/u.test(token.clean);
        if (!isContentWord) return <React.Fragment key={token.id}>{token.original} </React.Fragment>;
        return (
          <React.Fragment key={token.id}>
            <span
              className={estaNoDeck(token.clean) ? 'palavra' : 'w'}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => onMouseEnter(e, token.clean)}
              onMouseLeave={onMouseLeave}
              onClick={(e) => {
                e.stopPropagation();
                onExaminar(token.clean);
              }}
            >
              {token.original}
            </span>{' '}
          </React.Fragment>
        );
      })}
    </span>
  );
}
