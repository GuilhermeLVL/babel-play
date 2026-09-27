import { escreveSemEspaco, palavrasDoTexto } from '../texto/segmentacao';

/**
 * AS PALAVRAS DE UMA FRASE, COMO ESCRITAS — para os jogos que MONTAM ou CONFEREM a frase inteira
 * (Frase embaralhada, Ditado, Karaokê, Caça-conectores).
 *
 * O corte vem do idioma da fala (integração com "idioma da sessão", 2026-09-26). Em idioma que
 * escreve sem espaço (japonês, chinês, tailandês…) quem corta é `palavrasDoTexto`, com o segmentador
 * do ICU: `split(/\s+/)` devolvia a frase inteira como UMA palavra.
 *
 * Em idioma com espaço o corte continua no espaço, e isso é de propósito. `palavrasDoTexto` devolve o
 * VERBETE ("John's" → "John", "d'água" → "água", "fazê-lo" → "fazer") — certo para vocabulário e
 * para o bingo, errado aqui: as peças da Frase embaralhada, remontadas, têm de reproduzir a frase
 * que a pessoa ouviu, com a pontuação colada (que também é pista de ordem).
 */
export function palavrasDaFrase(texto: string | null | undefined, idioma = ''): string[] {
  if (escreveSemEspaco(idioma)) return palavrasDoTexto(texto, idioma);
  return (texto ?? '').trim().split(/\s+/).filter(Boolean);
}

/** Junta as peças de volta: sem espaço nos idiomas que não o usam. */
export function juntarPalavras(palavras: readonly string[], idioma = ''): string {
  return palavras.join(escreveSemEspaco(idioma) ? '' : ' ');
}
