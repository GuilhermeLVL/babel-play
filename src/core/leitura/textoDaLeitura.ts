/**
 * O TEXTO DA LEITURA ATIVA EM PALAVRAS (openspec `leitura-ativa-textos-simples`) — o corte que a tela pinta, a
 * cobertura conta e o alinhador da voz alta segue. Uma regra só para os três: as frases saem de `frasesDoTexto` (a
 * mesma da narração), as palavras do espaço (como `palavrasDaFrase`), com a posição no texto para a tela montar um
 * `<span>` por palavra sem perder a pontuação.
 *
 * Puro: sem DOM, sem rede.
 */
import { chaveAtiva } from '../texto/chaveAtiva';
import { candidatosDeLema } from '../texto/lemas';
import { type FraseDoTexto, frasesDoTexto } from './narracao';

export interface PalavraDaLeitura {
  /** Como está escrita, com a pontuação colada ("apples."). */
  texto: string;
  /** A chave comparável na versão ativa (`chaveAtiva`): sem caixa nem pontuação; acento só na v1 ou fora das marcas da v2. */
  chave: string;
  /** Posição no texto (unidades de código, como `String#slice`). */
  inicio: number;
  fim: number;
  /** O índice da frase em `frases`. */
  frase: number;
  /** Nome próprio: a mesma chave aparece com maiúscula fora do começo de uma frase ("Lia", "Ben"). */
  nomeProprio: boolean;
}

export interface TextoDividido {
  frases: FraseDoTexto[];
  palavras: PalavraDaLeitura[];
}

/** Palavra que vale contar e seguir: tem letra (número solto e travessão ficam de fora). */
const temLetra = (s: string) => /\p{L}/u.test(s);

export function dividirTexto(texto: string, lang = 'en'): TextoDividido {
  const frases = frasesDoTexto(texto, lang);
  const palavras: PalavraDaLeitura[] = [];
  const nomes = new Set<string>();
  frases.forEach((f, iFrase) => {
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    let primeira = true;
    while ((m = re.exec(f.texto))) {
      const bruta = m[0];
      const chave = chaveAtiva(bruta, lang);
      if (!chave || !temLetra(bruta)) continue;
      const inicio = f.inicio + m.index;
      const maiuscula = /^[^\p{L}]*\p{Lu}/u.test(bruta);
      if (maiuscula && !primeira && chave !== 'i') nomes.add(chave);
      palavras.push({ texto: bruta, chave, inicio, fim: inicio + bruta.length, frase: iFrase, nomeProprio: false });
      primeira = false;
    }
  });
  for (const p of palavras) p.nomeProprio = nomes.has(p.chave) && /^[^\p{L}]*\p{Lu}/u.test(p.texto);
  return { frases, palavras };
}

/** As chaves possíveis de lema de uma palavra (a forma e os candidatos de `candidatosDeLema`), sem repetir. */
export function chavesDeLema(palavra: string, lang: string): string[] {
  const chave = chaveAtiva(palavra, lang);
  const lista = [chave, ...candidatosDeLema(palavra, lang).map((c) => chaveAtiva(c, lang))];
  return lista.filter((x, i) => x && lista.indexOf(x) === i);
}

/**
 * As duas palavras são a mesma, contando a flexão ("apples" ↔ "apple", "went" ↔ "go")? Compara a forma de uma
 * com os lemas da outra, nos dois sentidos — nunca lema com lema, que juntaria "news" e "new" por acidente.
 */
export function mesmoLema(a: string, b: string, lang: string): boolean {
  const ca = chaveAtiva(a, lang);
  const cb = chaveAtiva(b, lang);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  return chavesDeLema(a, lang).includes(cb) || chavesDeLema(b, lang).includes(ca);
}
