/**
 * Mede o fonetizador do app (`src/core/voz/kitten/fonemas.ts`) contra o oráculo (`oraculo_espeak.py`, saída local fora
 * do git): taxa de erro por símbolo (CER, Levenshtein sobre code points), frases idênticas e as palavras que mais
 * divergem. Uso: npx tsx scripts/voz/kitten/avaliar-fonetizador.ts <oraculo.jsonl> <pt|es|en> [n-divergencias] [lexico-en.json]
 */
import { readFileSync } from 'node:fs';

import { fonemasDoTexto } from '../../../src/core/voz/kitten/fonemas';

const [arq, idioma, nDiv = '40', lexArq] = process.argv.slice(2);
const lexico = lexArq ? (JSON.parse(readFileSync(lexArq, 'utf8')) as Record<string, string>) : undefined;

function lev(a: string[], b: string[]): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = t;
    }
  }
  return d[b.length];
}

let erros = 0;
let total = 0;
let iguais = 0;
let n = 0;
const div = new Map<string, number>();
for (const l of readFileSync(arq, 'utf8').split('\n')) {
  if (!l) continue;
  const o = JSON.parse(l) as { idioma: string; texto: string; fonemas: string };
  if (o.idioma !== idioma) continue;
  const ref = o.fonemas.replace(/ \| /g, ' ');
  const meu = fonemasDoTexto(o.texto, idioma, lexico);
  const a = [...ref];
  const b = [...meu];
  erros += lev(a, b);
  total += a.length;
  n++;
  if (ref === meu) iguais++;
  const wr = ref.split(' ');
  const wm = meu.split(' ');
  if (wr.length === wm.length)
    wr.forEach((x, i) => {
      if (x !== wm[i]) {
        const k = `${x}  ≠  ${wm[i]}`;
        div.set(k, (div.get(k) ?? 0) + 1);
      }
    });
}
console.log(
  JSON.stringify({ idioma, frases: n, cer: +(erros / total).toFixed(4), identicas: +(iguais / n).toFixed(4) }),
);
for (const [k, c] of [...div].sort((a, b) => b[1] - a[1]).slice(0, Number(nDiv))) console.log(c, k);
