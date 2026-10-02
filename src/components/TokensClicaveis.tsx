import React from 'react';

import type { TokenDeTexto } from '../lib/vocabWord';

/** Palavra de conteúdo: três letras ou mais, só letras. É a que abre o Analista. */
export const ehPalavraDeConteudo = (clean: string): boolean => clean.length >= 3 && /^\p{L}+$/u.test(clean);

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
  /**
   * Só as palavras de conteúdo, como BOTÕES (uma vez cada), sem o texto corrido. É o que as folhas do
   * Quest pedem ("Toque numa palavra"), ao lado da frase já escrita inteira. Sem esta prop o
   * componente mostra a frase de sempre, em qualquer aparelho.
   */
  comoBotoes?: boolean;
}

export default function TokensClicaveis({
  tokens,
  className,
  estaNoDeck,
  onMouseEnter,
  onMouseLeave,
  onExaminar,
  comoBotoes = false,
}: TokensClicaveisProps) {
  /* AS PALAVRAS COMO BOTÕES (as folhas do Quest): o raio do controle não acerta uma palavra solta no
     meio do texto, e nada abre por hover. As palavras de conteúdo viram botões (uma vez cada), e o
     toque abre a folha da palavra; a que já está no caderno vem marcada, como o sublinhado de sempre.
     Quem pede é quem monta (`comoBotoes`): a frase inteira fica por conta dele. */
  if (comoBotoes) {
    const vistas = new Set<string>();
    return (
      <span className={`${className} qs-palavras`}>
        {tokens.map((token) => {
          if (!ehPalavraDeConteudo(token.clean) || vistas.has(token.clean)) return null;
          vistas.add(token.clean);
          return (
            <button
              key={token.id}
              type="button"
              className="qs-palavra"
              data-no-caderno={estaNoDeck(token.clean) || undefined}
              onClick={(e) => {
                e.stopPropagation();
                onExaminar(token.clean);
              }}
            >
              {token.original.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')}
            </button>
          );
        })}
      </span>
    );
  }
  /* Marcação do protótipo (`palavrasDaFala`): texto corrido; as palavras do caderno ganham o
     sublinhado pontilhado (`.palavra`), e toda palavra de conteúdo continua clicável (abre o
     Analista) e mostra a prévia no hover. */
  return (
    <span className={className}>
      {tokens.map((token) => {
        const isContentWord = ehPalavraDeConteudo(token.clean);
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
