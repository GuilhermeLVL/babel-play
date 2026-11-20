/**
 * O CORTE DA FRASE em palavras e pontuação, comum aos fonetizadores (pt, es, en) do Kitten.
 *
 * Cada palavra sai com o contexto que a fonética de junção precisa: a próxima palavra (sem pausa entre elas) e se é a
 * última antes de uma pausa (pontuação ou fim). A pontuação que o modelo conhece (`, . ! ? ; : … —`) fica colada à
 * palavra anterior, como no treino; parênteses viram vírgula; aspas e o resto saem.
 */

export interface PalavraDaFrase {
  /** A palavra em minúsculas, NFC (hífen e apóstrofo internos preservados: "dá-me", "don't"). */
  texto: string;
  /** A palavra seguinte, se não há pausa entre as duas. */
  proxima: string | null;
  /** É a última antes de uma pausa (pontuação ou fim do texto). */
  fimDeGrupo: boolean;
  /** Pontuação (já no alfabeto do modelo) logo depois da palavra. */
  pontuacao: string;
}

const PONTUACAO_DO_MODELO: Readonly<Record<string, string>> = {
  ',': ',',
  '.': '.',
  '!': '!',
  '?': '?',
  ';': ';',
  ':': ':',
  '…': '…',
  '—': '—',
  '–': '—',
  '(': ',',
  ')': ',',
};

/** Letras (com acento), dígitos, apóstrofo e hífen internos. */
const PALAVRA = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/uy;

export function cortarFrase(texto: string): PalavraDaFrase[] {
  const t = texto.normalize('NFC').replace(/\.\.\./g, '…');
  const out: PalavraDaFrase[] = [];
  let i = 0;
  while (i < t.length) {
    PALAVRA.lastIndex = i;
    const m = PALAVRA.exec(t);
    if (m) {
      out.push({ texto: m[0].toLowerCase().replace(/’/g, "'"), proxima: null, fimDeGrupo: false, pontuacao: '' });
      i += m[0].length;
      continue;
    }
    const p = PONTUACAO_DO_MODELO[t[i]];
    const ult = out[out.length - 1];
    /* Pontuação repetida ("?!", ",,") fica uma de cada. */
    if (p && ult && !ult.pontuacao.endsWith(p)) ult.pontuacao += p;
    i++;
  }
  for (let k = 0; k < out.length; k++) {
    const pausa = out[k].pontuacao !== '' || k === out.length - 1;
    out[k].fimDeGrupo = pausa;
    out[k].proxima = pausa ? null : out[k + 1].texto;
  }
  return out;
}

/** Junta as palavras já fonetizadas: espaço entre elas, pontuação colada. */
export function juntar(partes: ReadonlyArray<{ fonemas: string; p: PalavraDaFrase }>): string {
  return partes
    .filter((x) => x.fonemas || x.p.pontuacao)
    .map((x) => `${x.fonemas}${x.p.pontuacao}`)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
