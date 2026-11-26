/**
 * AS PALAVRAS PARA PRATICAR do fim da leitura (spec `leitura-ativa-perguntas-e-pratica`; Microsoft Reading Coach).
 * Até 5, nesta ordem: as que o Frasy não ouviu bem na voz alta, as que a pessoa tocou, e as palavras-alvo do texto
 * que ela ainda não conhece. Sem repetir (pelo lema: "apples" e "apple" são uma só). A que já está no caderno vem
 * desmarcada: ela já tem cartão, e marcar criaria um duplicado.
 */
import { chaveAtiva } from '../texto/chaveAtiva';
import { mesmoLema } from './textoDaLeitura';

export const MAXIMO_DE_PALAVRAS_PARA_PRATICAR = 5;

export type MotivoDaPratica = 'pulada' | 'tocada' | 'nova';

export interface PalavraParaPraticar {
  /** Como aparece no texto, sem a pontuação das bordas. */
  palavra: string;
  motivo: MotivoDaPratica;
  /** Vai para a revisão (desmarcar é um toque). */
  marcada: boolean;
}

const semBordas = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

export function palavrasParaPraticar(e: {
  puladas: readonly string[];
  tocadas: readonly string[];
  alvoDesconhecidas: readonly string[];
  /** A palavra (chave) já está no caderno, em qualquer estado? */
  noCaderno: (chave: string) => boolean;
  lang: string;
}): PalavraParaPraticar[] {
  const out: PalavraParaPraticar[] = [];
  const grupos: [readonly string[], MotivoDaPratica][] = [
    [e.puladas, 'pulada'],
    [e.tocadas, 'tocada'],
    [e.alvoDesconhecidas, 'nova'],
  ];
  for (const [lista, motivo] of grupos) {
    for (const bruta of lista) {
      if (out.length >= MAXIMO_DE_PALAVRAS_PARA_PRATICAR) return out;
      const palavra = semBordas(bruta).toLowerCase();
      if (!chaveAtiva(palavra, e.lang)) continue;
      if (out.some((x) => mesmoLema(x.palavra, palavra, e.lang))) continue;
      out.push({ palavra, motivo, marcada: !e.noCaderno(chaveAtiva(palavra, e.lang)) });
    }
  }
  return out;
}
