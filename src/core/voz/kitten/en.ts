/**
 * FONETIZADOR DO INGLÊS (en-US) para o Kitten TTS 2, sem espeak-ng.
 *
 * O treino usou o misaki (léxicos próprios) e, para o que faltava, CMUdict e um BART pequeno (`kittenml`
 * `english.py`). Aqui: o CMUdict JÁ convertido para o alfabeto do misaki que vem no repositório do modelo
 * (`g2p/cmu_misaki_us.json`, ~125 mil palavras), as formas fracas das palavras gramaticais (como o misaki as escreve) e,
 * para palavra fora do léxico, regras simples de leitura (melhor que soletrar; o BART fica como melhoria futura).
 */
import { cortarFrase, juntar } from './frase';

export type LexicoEn = Readonly<Record<string, string>>;

/** Formas fracas (no meio da frase); antes de pausa vale a do léxico. */
const FRACAS: Readonly<Record<string, string>> = {
  a: 'ɐ',
  an: 'ən',
  the: 'ðə',
  to: 'tə',
  of: 'ʌv',
  and: 'ænd',
  or: 'ɔɹ',
  but: 'bˌʌt',
  for: 'fɔɹ',
  from: 'fɹʌm',
  at: 'æt',
  in: 'ɪn',
  on: 'ˌɔn',
  as: 'æz',
  is: 'ɪz',
  are: 'ˌɑɹ',
  was: 'wʌz',
  were: 'wɜɹ',
  be: 'bi',
  been: 'bɪn',
  am: 'æm',
  has: 'hæz',
  have: 'hæv',
  had: 'hæd',
  do: 'dˈu',
  does: 'dʌz',
  can: 'kˌæn',
  could: 'kʊd',
  would: 'wˌʊd',
  should: 'ʃˌʊd',
  will: 'wˌɪl',
  shall: 'ʃæl',
  must: 'mˈʌst',
  i: 'ˌI',
  you: 'ju',
  he: 'hi',
  she: 'ʃi',
  it: 'ɪt',
  we: 'wi',
  they: 'ðA',
  me: 'mˌi',
  him: 'hˌɪm',
  her: 'hɜɹ',
  us: 'ˌʌs',
  them: 'ðˌɛm',
  my: 'mI',
  your: 'jʊɹ',
  his: 'hɪz',
  its: 'ɪts',
  our: 'aʊəɹ',
  their: 'ðɛɹ',
  than: 'ðən',
  there: 'ðɛɹ',
  some: 'sˌʌm',
  so: 'sˌO',
  not: 'nˌɑt',
  if: 'ɪf',
  with: 'wɪð',
  by: 'bI',
  up: 'ˌʌp',
  what: 'wˌʌt',
  when: 'wˌɛn',
  where: 'wˌɛɹ',
  why: 'wˌI',
  how: 'hˌW',
  who: 'hˌu',
  "you're": 'jʊɹ',
  "i'm": 'ˌIm',
  "i'll": 'ˌIl',
  "i'd": 'ˌId',
  "i've": 'ˌIv',
  "won't": 'wOnt',
  this: 'ðɪs',
  go: 'ɡˌO',
  get: 'ɡɛt',
  put: 'pˌʊt',
  make: 'mˌAk',
  already: 'ˌɔlɹˈɛdi',
  "it's": 'ˌɪts',
};

/** Antes de pausa, os pronomes ficam fracos (ou com acento secundário), como no treino. */
const NO_FIM: Readonly<Record<string, string>> = {
  you: 'ju',
  it: 'ɪt',
  me: 'mˌi',
  them: 'ðˌɛm',
  him: 'hˌɪm',
  her: 'hˌɜɹ',
  us: 'ˌʌs',
  are: 'ɑɹ',
};

/** No começo da frase, alguns pronomes saem com acento secundário (como no treino). */
const NO_INICIO: Readonly<Record<string, string>> = {
  you: 'jˌu',
  "you're": 'jˌʊɹ',
  he: 'hˌi',
  she: 'ʃˌi',
  we: 'wˌi',
  they: 'ðˌA',
  it: 'ˌɪt',
  my: 'mˌI',
  your: 'jˌʊɹ',
  there: 'ðˌɛɹ',
};

const DIGITOS = ['zˈɪɹO', 'wˈʌn', 'tˈu', 'θɹˈi', 'fˈɔɹ', 'fˈIv', 'sˈɪks', 'sˈɛvən', 'ˈAt', 'nˈIn'];

/** Regras de leitura para palavra fora do léxico: grafemas comuns do inglês → alfabeto do misaki. */
const REGRAS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^tion/, 'ʃən'],
  [/^sion/, 'ʒən'],
  [/^ough/, 'O'],
  [/^igh/, 'I'],
  [/^ight/, 'It'],
  [/^ee/, 'i'],
  [/^ea/, 'i'],
  [/^oo/, 'u'],
  [/^ou/, 'W'],
  [/^ow/, 'O'],
  [/^oa/, 'O'],
  [/^ai/, 'A'],
  [/^ay/, 'A'],
  [/^ei/, 'A'],
  [/^ey/, 'A'],
  [/^oi/, 'Y'],
  [/^oy/, 'Y'],
  [/^au/, 'ɔ'],
  [/^aw/, 'ɔ'],
  [/^ar/, 'ɑɹ'],
  [/^er/, 'əɹ'],
  [/^ir/, 'ɜɹ'],
  [/^ur/, 'ɜɹ'],
  [/^or/, 'ɔɹ'],
  [/^ch/, 'ʧ'],
  [/^sh/, 'ʃ'],
  [/^th/, 'θ'],
  [/^ph/, 'f'],
  [/^wh/, 'w'],
  [/^ck/, 'k'],
  [/^ng/, 'ŋ'],
  [/^qu/, 'kw'],
  [/^kn/, 'n'],
  [/^wr/, 'ɹ'],
  [/^dg/, 'ʤ'],
  [/^ge/, 'ʤɛ'],
  [/^gi/, 'ʤɪ'],
  [/^ce/, 'sɛ'],
  [/^ci/, 'sɪ'],
  [/^cy/, 'si'],
  [/^a/, 'æ'],
  [/^e$/, ''],
  [/^e/, 'ɛ'],
  [/^i/, 'ɪ'],
  [/^o/, 'ɑ'],
  [/^u/, 'ʌ'],
  [/^y$/, 'i'],
  [/^y/, 'j'],
  [/^c/, 'k'],
  [/^g/, 'ɡ'],
  [/^j/, 'ʤ'],
  [/^r/, 'ɹ'],
  [/^x/, 'ks'],
  [/^([bdfhklmnpstvwz])\1?/, '$1'],
];

function porRegras(w: string): string {
  let out = '';
  let resto = w.replace(/[^a-z]/g, '');
  let primeiraVogal = true;
  while (resto) {
    let feito = false;
    for (const [re, som] of REGRAS) {
      const m = re.exec(resto);
      if (!m) continue;
      let s = m[0].replace(re, som);
      if (primeiraVogal && /[æɛɪɑʌiuOAIWYɔəɜ]/.test(s)) {
        s = s.replace(/([æɛɪɑʌiuOAIWYɔəɜ])/, 'ˈ$1');
        primeiraVogal = false;
      }
      out += s;
      resto = resto.slice(m[0].length);
      feito = true;
      break;
    }
    if (!feito) resto = resto.slice(1);
  }
  return out;
}

function palavraEn(w: string, lexico: LexicoEn): string {
  if (/^\d+$/.test(w)) return [...w].map((d) => DIGITOS[Number(d)]).join(' ');
  const direta = lexico[w];
  if (direta) return direta;
  /* plural/possessivo de palavra conhecida */
  const semS = /^(.+?)('s|s)$/.exec(w);
  if (semS && lexico[semS[1]]) {
    const base = lexico[semS[1]];
    return base + (/[sʃʒʧʤz]$/.test(base) ? 'ᵻz' : /[ptkfθ]$/.test(base) ? 's' : 'z');
  }
  if (w.includes('-'))
    return w
      .split('-')
      .map((p) => palavraEn(p, lexico))
      .join(' ');
  return porRegras(w);
}

/** Texto em en → fonemas no alfabeto do modelo. `lexico` é o `g2p/cmu_misaki_us.json` do repositório do modelo. */
export function fonemasEn(texto: string, lexico: LexicoEn): string {
  const palavras = cortarFrase(texto);
  const fon = palavras.map((p, k) => {
    const inicio = k === 0 || !palavras[k - 1].proxima;
    if (inicio && NO_INICIO[p.texto] && !p.fimDeGrupo) return NO_INICIO[p.texto];
    if (p.fimDeGrupo && NO_FIM[p.texto]) return NO_FIM[p.texto];
    if (!p.fimDeGrupo && FRACAS[p.texto] !== undefined) return FRACAS[p.texto];
    return palavraEn(p.texto, lexico);
  });
  /* "the" antes de vogal: ði */
  for (let k = 0; k < palavras.length; k++)
    if (palavras[k].texto === 'the' && palavras[k].proxima && /^[ˈˌ]?[aeiouæɛɪɑʌɔəAIOWY]/.test(fon[k + 1] ?? ''))
      fon[k] = 'ði';
    else if (palavras[k].texto === 'to' && palavras[k].proxima && /^[ˈˌ]?[aeiouæɛɪɑʌɔəAIOWY]/.test(fon[k + 1] ?? ''))
      fon[k] = 'tʊ';
  return juntar(palavras.map((p, k) => ({ fonemas: fon[k], p })));
}
