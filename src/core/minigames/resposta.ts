import { comBaseLatina } from '../texto/palavra';

/**
 * CONFERIR UMA RESPOSTA ESCRITA — a régua única dos jogos em que se digita a palavra.
 *
 * Nasceu no QA dos jogos (2026-09-26). O Rali comparava com `chaveDoTermo`, que apaga o acento
 * dos DOIS lados: "avó" passava como resposta de "grandfather", porque avó e avô viram a mesma
 * chave. E recusava "bedroom" para "quarto", embora o próprio acervo tenha as duas palavras com
 * essa tradução — a pista não desempata, e o jogo punia quem lembrou a outra.
 *
 * A RÉGUA, em ordem:
 *  1. caixa, espaço, hífen, apóstrofo e pontuação NUNCA contam ("ice-cream" = "ice cream");
 *  2. igual com acento → `exata`; igual a outra palavra do acervo com a mesma pista → `alternativa`;
 *  3. quem escreveu SEM acento nenhum e só o acento falta → `sem-acento`: aceita (nem todo teclado
 *     escreve "ç"), e a tela mostra a grafia certa em `forma`;
 *  4. acento TROCADO é erro — "avó" escrito não vira "avô" por aproximação.
 *
 * "Acento" aqui é só o bloco de diacríticos combinantes (U+0300–U+036F) e as letras latinas que o
 * NFD não decompõe (`ß`, `ø`, `œ`…, via `comBaseLatina`). Marca de outro alfabeto — o dakuten
 * japonês, por exemplo — faz parte da letra: `たへる` não é `たべる` mal escrito.
 */

export type VereditoDaResposta = 'exata' | 'alternativa' | 'sem-acento' | 'errada';

export interface ConferenciaDaResposta {
  veredito: VereditoDaResposta;
  aceita: boolean;
  /** A grafia que a tela deve mostrar como a certa (a esperada, ou a alternativa que casou). */
  forma: string;
}

const ACENTOS = /[̀-ͯ]/g;
/* Sem `g`: `test` com regex global guarda `lastIndex` entre chamadas e alterna o resultado. */
const TEM_ACENTO = /[̀-ͯ]/;

/** Caixa e pontuação fora; acento DENTRO. */
function chaveComAcento(s: string): string {
  return (s ?? '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, '');
}

/** Caixa, pontuação e acento latino fora. Marcas de outros alfabetos ficam. */
export function chaveSemAcento(s: string): string {
  return comBaseLatina(s ?? '')
    .normalize('NFD')
    .replace(ACENTOS, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]/gu, '')
    .normalize('NFC');
}

/** O texto tem algum acento latino (ou letra latina "com traço")? */
function temAcento(s: string): boolean {
  const t = (s ?? '').normalize('NFD');
  return TEM_ACENTO.test(t) || comBaseLatina(t) !== t;
}

export function conferirResposta(
  escrito: string,
  esperada: string,
  alternativas: readonly string[] = [],
): ConferenciaDaResposta {
  const errada: ConferenciaDaResposta = { veredito: 'errada', aceita: false, forma: esperada };
  const e = chaveComAcento(escrito);
  if (!chaveSemAcento(escrito)) return errada;

  const alvos: Array<[string, 'exata' | 'alternativa']> = [
    [esperada, 'exata'],
    ...alternativas.filter((a) => (a ?? '').trim()).map((a): [string, 'alternativa'] => [a, 'alternativa']),
  ];
  for (const [alvo, tipo] of alvos) {
    if (e === chaveComAcento(alvo)) return { veredito: tipo, aceita: true, forma: alvo };
  }
  if (!temAcento(escrito)) {
    const s = chaveSemAcento(escrito);
    for (const [alvo] of alvos) {
      if (s === chaveSemAcento(alvo)) return { veredito: 'sem-acento', aceita: true, forma: alvo };
    }
  }
  return errada;
}
