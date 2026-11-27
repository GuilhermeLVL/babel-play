/**
 * O DITADO DE UMA FRASE GRIFADA (openspec `leitura-assistida`, fatia B): a pessoa ouve a frase, escreve de memória e vê as
 * diferenças com o original. Puro e sem efeito colateral: o que ela escreve NUNCA é gravado nem enviado.
 * A comparação ignora maiúsculas e pontuação (mas não acentos: acento é parte da escrita do idioma).
 */
export type PassoDoDitado =
  | { tipo: 'igual'; palavra: string }
  | { tipo: 'trocou'; esperada: string; escrita: string }
  | { tipo: 'faltou'; esperada: string }
  | { tipo: 'sobrou'; escrita: string };

export interface ResultadoDoDitado {
  passos: PassoDoDitado[];
  /** 0..1: palavras certas sobre as esperadas. */
  acerto: number;
  perfeito: boolean;
}

function palavras(texto: string, idioma?: string): string[] {
  const seg = new Intl.Segmenter(idioma || undefined, { granularity: 'word' });
  const r: string[] = [];
  for (const s of seg.segment(texto)) if (s.isWordLike) r.push(s.segment);
  return r;
}

const chave = (p: string) => p.normalize('NFC').toLocaleLowerCase();

export function conferirDitado(original: string, escrito: string, idioma?: string): ResultadoDoDitado {
  const a = palavras(original, idioma);
  const b = palavras(escrito, idioma);
  const n = a.length;
  const m = b.length;
  /* Maior subsequência comum (palavras do original x palavras escritas). */
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      t[i][j] = chave(a[i]) === chave(b[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);

  const brutos: PassoDoDitado[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (chave(a[i]) === chave(b[j])) {
      brutos.push({ tipo: 'igual', palavra: a[i] });
      i++;
      j++;
    } else if (t[i + 1][j] >= t[i][j + 1]) brutos.push({ tipo: 'faltou', esperada: a[i++] });
    else brutos.push({ tipo: 'sobrou', escrita: b[j++] });
  }
  while (i < n) brutos.push({ tipo: 'faltou', esperada: a[i++] });
  while (j < m) brutos.push({ tipo: 'sobrou', escrita: b[j++] });

  /* "faltou" colado a "sobrou" é uma troca (a palavra errada no lugar da certa). */
  const passos: PassoDoDitado[] = [];
  for (let k = 0; k < brutos.length; k++) {
    const p = brutos[k];
    const q = brutos[k + 1];
    if (p.tipo === 'faltou' && q?.tipo === 'sobrou') {
      passos.push({ tipo: 'trocou', esperada: p.esperada, escrita: q.escrita });
      k++;
    } else if (p.tipo === 'sobrou' && q?.tipo === 'faltou') {
      passos.push({ tipo: 'trocou', esperada: q.esperada, escrita: p.escrita });
      k++;
    } else passos.push(p);
  }
  const certas = passos.filter((p) => p.tipo === 'igual').length;
  return {
    passos,
    acerto: n === 0 ? (m === 0 ? 1 : 0) : certas / n,
    perfeito: passos.every((p) => p.tipo === 'igual'),
  };
}
