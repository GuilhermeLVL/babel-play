import React from 'react';

/**
 * A FRASE DE CONTEXTO COM A PALAVRA APAGADA — o enunciado dos exercícios de digitação e de
 * múltipla escolha.
 *
 * `Study.tsx` tinha os dois idênticos, 12 linhas cada, e o `jscpd` os media como clone. Os dois
 * exercícios fazem a mesma pergunta ("que palavra falta aqui?") e só diferem no que vem em volta:
 * o rótulo acima e a margem do "Tradução:" abaixo — que por isso ficaram nos chamadores.
 *
 * O `split` com grupo de captura é o que preserva os pedaços entre as ocorrências; a regex é `gi`
 * porque a palavra pode aparecer no meio da frase com outra caixa.
 *
 * NÃO cobre as outras duas ocorrências parecidas do mesmo `split` neste arquivo (a frente do
 * cartão de revisão e a "Frase Contexto" do verso): elas divergem no que é o ponto do componente —
 * uma desenha `[ ... ]` num selo maior, a outra mostra a palavra REAL em negrito, porque ali a
 * resposta já foi revelada. São enunciados diferentes, não formatações diferentes do mesmo
 * enunciado, e uni-los exigiria um parâmetro que decide o significado da tela.
 */
export interface FraseComLacunaProps {
  /** Frase de contexto do cartão. `undefined`/vazia → só a lacuna. */
  sentence?: string;
  /** Palavra a apagar. */
  word: string;
}

export default function FraseComLacuna({ sentence, word }: FraseComLacunaProps) {
  return (
    <div className="text-lg md:text-xl font-medium text-ink leading-relaxed text-center px-4 my-4">
      {sentence ? (
        sentence.split(new RegExp(`(${word})`, 'gi')).map((chunk, index) => {
          if (chunk.toLowerCase() === word.toLowerCase()) {
            return <span key={index} className="px-3 py-1 bg-accent-soft text-accent-ink border-b-2 border-accent border-dashed font-bold font-mono">___</span>;
          }
          return <span key={index}>{chunk}</span>;
        })
      ) : (
        <span className="font-bold text-accent">___</span>
      )}
    </div>
  );
}
