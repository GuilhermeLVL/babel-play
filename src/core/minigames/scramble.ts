/**
 * FRASE EMBARALHADA — reordenar as palavras de uma frase REAL da sessão.
 *
 * Por que este jogo existe: nenhum exercício do app treinava ORDEM DAS PALAVRAS. Vocabulário,
 * pronúncia, escuta e escrita tinham alguma cobertura; sintaxe, nenhuma. E é justamente onde o
 * português e o inglês divergem de um jeito que a pessoa só percebe produzindo ("a red big car"
 * soa errado sem que ninguém saiba explicar por quê).
 *
 * A frase é sempre uma que a pessoa CAPTUROU — não uma frase de manual. É o que a pesquisa de
 * vocabulário chama de aprender em contexto: recuperar é mais fácil quando o material é o que
 * você de fato ouviu.
 */

export interface RodadaFrase {
  /** Id da fala de origem (rastreabilidade; não vira nota no SRS — é frase, não cartão). */
  sentenceId?: string;
  /** As palavras na ORDEM CERTA. */
  correta: string[];
  /** As mesmas palavras, embaralhadas — o que a pessoa recebe. */
  embaralhada: string[];
  /** A tradução, mostrada como apoio (é o significado que guia a ordem). */
  traducao: string;
  lang: string;
}

/** Frases curtas demais não têm o que ordenar; longas demais viram trabalho braçal. */
export const MIN_PALAVRAS = 4;
export const MAX_PALAVRAS = 10;

/** Divide em palavras preservando a pontuação colada (ela é pista de ordem, e faz parte). */
export function tokenize(frase: string): string[] {
  return frase.trim().split(/\s+/).filter(Boolean);
}

/**
 * Embaralha GARANTINDO que a ordem mude — um embaralhamento que devolve a frase original
 * entregaria a resposta de graça, e acontece com frequência em frases de 4 palavras.
 * Também evita deixar a primeira palavra no lugar, que é meio caminho andado.
 */
export function shuffleWords(palavras: string[], rand: () => number = Math.random): string[] {
  if (palavras.length < 2) return [...palavras];
  const original = palavras.join(' ');
  let melhor: string[] = [...palavras];
  for (let tentativa = 0; tentativa < 12; tentativa++) {
    const a = [...palavras];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    melhor = a;
    if (a.join(' ') !== original && a[0] !== palavras[0]) return a;
  }
  // Último recurso: rotaciona (nunca devolve a ordem original).
  if (melhor.join(' ') === original) return [...palavras.slice(1), palavras[0]];
  return melhor;
}

/**
 * A ordem montada está certa? Compara ignorando caixa e pontuação de borda — quem reordena
 * palavras não deve perder por um ponto final que ficou no bloco errado.
 */
export function checkOrder(montada: string[], correta: string[]): boolean {
  const limpar = (xs: string[]) =>
    xs.map(p => p.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).join(' ');
  return limpar(montada) === limpar(correta);
}

/** Quantas palavras estão na posição certa — o feedback parcial ("faltou pouco"). */
export function acertosPosicionais(montada: string[], correta: string[]): number {
  const limpar = (p: string) => p.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  let n = 0;
  for (let i = 0; i < Math.min(montada.length, correta.length); i++) {
    if (limpar(montada[i]) === limpar(correta[i])) n++;
  }
  return n;
}

/** Uma frase serve para o jogo? (tamanho e tradução disponíveis) */
export function fraseJogavel(texto: string, traducao?: string): boolean {
  const n = tokenize(texto).length;
  return n >= MIN_PALAVRAS && n <= MAX_PALAVRAS && !!(traducao ?? '').trim();
}

/** Monta as rodadas a partir das falas reais da sessão. */
export function buildScrambleRounds(
  sentences: Array<{ id?: string; text: string; translation?: string; lang?: string }>,
  opts: { quantidade?: number; rand?: () => number } = {},
): RodadaFrase[] {
  const rand = opts.rand ?? Math.random;
  const quantidade = opts.quantidade ?? 5;
  return sentences
    .filter(s => fraseJogavel(s.text, s.translation))
    .slice(0, quantidade)
    .map(s => {
      const correta = tokenize(s.text);
      return {
        sentenceId: s.id,
        correta,
        embaralhada: shuffleWords(correta, rand),
        traducao: (s.translation ?? '').trim(),
        lang: s.lang ?? '',
      };
    });
}
