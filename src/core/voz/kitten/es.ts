/**
 * FONETIZADOR DO ESPANHOL para o Kitten TTS 2 — escrito do zero, por regras, sem código nem dados do espeak-ng.
 *
 * O modelo aprendeu o espanhol com a saída do espeak-ng (voz `es`, peninsular: `θ` em c/z); as regras miram as mesmas
 * convenções: acento `ˈ` antes da vogal tônica, `ˌ` na 1ª sílaba quando a tônica é a 3ª ou depois, β/ð/ɣ depois de
 * vogal ou consoante contínua (inclusive entre palavras), `ɛ` na tônica antes de nasal de coda, `I`/`A`/`W` nos
 * ditongos `ai`/`ei`/`au`, `j`/`w` nos crescentes.
 */
import { cortarFrase, juntar } from './frase';

/** Gramaticais átonas (sem acento) e as que o modelo ouviu reduzidas. */
const ATONAS: Readonly<Record<string, string>> = {
  el: 'el',
  la: 'la',
  los: 'los',
  las: 'las',
  lo: 'lo',
  le: 'le',
  les: 'les',
  de: 'de',
  del: 'del',
  a: 'a',
  al: 'al',
  en: 'en',
  y: 'i',
  e: 'e',
  o: 'o',
  u: 'u',
  que: 'ke',
  me: 'me',
  te: 'te',
  se: 'se',
  nos: 'nos',
  os: 'os',
  mi: 'mi',
  tu: 'tu',
  su: 'su',
  mis: 'mis',
  tus: 'tus',
  sus: 'sus',
  con: 'kon',
  por: 'poɾ',
  si: 'si',
  sin: 'sin',
  mas: 'mas',
  ni: 'ni',
  un: 'ˈun',
  para: 'pˌaɾa',
  pero: 'pˌeɾo',
  como: 'kˌomo',
  cuando: 'kwˌando',
  desde: 'dˌesde',
  muy: 'mˈuj',
  ser: 'sˈer',
  hay: 'ˈI',
};

const VOGAIS = 'aeiouáéíóúü';
const FORTES = 'aeoáéóíú';
const ehVogal = (c: string | undefined) => !!c && VOGAIS.includes(c);
const ehFraca = (c: string | undefined) => c === 'i' || c === 'u' || c === 'ü' || c === 'y';

type Unidade = { tipo: 'C'; g: string; som?: string } | { tipo: 'V'; g: string };

function unidades(w: string): Unidade[] {
  const u: Unidade[] = [];
  let i = 0;
  while (i < w.length) {
    const c = w[i];
    const d = w[i + 1];
    const depois = w[i + 2];
    /* "y" é vogal no fim da palavra ou entre consoantes ("hoy", "muy", "y"); senão é consoante. */
    const yVogal = c === 'y' && (!d || !ehVogal(d));
    if (ehVogal(c) || yVogal) {
      let j = i;
      while (j < w.length && (ehVogal(w[j]) || (w[j] === 'y' && !ehVogal(w[j + 1])))) j++;
      for (const g of nucleos(w.slice(i, j).replace(/y/g, 'i'))) u.push({ tipo: 'V', g });
      i = j;
      continue;
    }
    if ((c === 'q' || c === 'g') && d === 'u' && 'eiéí'.includes(depois ?? '-')) {
      u.push({ tipo: 'C', g: c, som: c === 'q' ? 'k' : 'ɡ' });
      i += 2;
      continue;
    }
    if (c === 'g' && d === 'ü') {
      u.push({ tipo: 'C', g: 'g' });
      i += 1;
      continue;
    }
    const par = c + (d ?? '');
    if (par === 'ch') u.push({ tipo: 'C', g: par, som: 'ʧ' });
    else if (par === 'll') u.push({ tipo: 'C', g: par, som: 'ʎ' });
    else if (par === 'rr') u.push({ tipo: 'C', g: par, som: 'r' });
    else {
      u.push({ tipo: 'C', g: c });
      i += 1;
      continue;
    }
    i += 2;
  }
  return u;
}

/** Vogais em núcleos: forte+forte é hiato; com fraca átona é ditongo (ou tritongo). */
function nucleos(run: string): string[] {
  const out: string[] = [];
  let atual = '';
  for (const c of run) {
    if (!atual) {
      atual = c;
      continue;
    }
    const ultima = atual[atual.length - 1];
    const forteNoAtual = [...atual].some((x) => FORTES.includes(x));
    const junta = ehFraca(c) ? ultima !== c : ehFraca(ultima) && !forteNoAtual;
    if (junta && !(FORTES.includes(c) && forteNoAtual)) atual += c;
    else {
      out.push(atual);
      atual = c;
    }
  }
  if (atual) out.push(atual);
  return out;
}

function tonica(w: string, nuc: string[]): number {
  if (nuc.length <= 1) return 0;
  const agudo = nuc.findIndex((g) => /[áéíóú]/.test(g));
  if (agudo >= 0) return agudo;
  return /[aeiouns]$/.test(w) && !/y$/.test(w) ? nuc.length - 2 : nuc.length - 1;
}

const DITONGOS: Readonly<Record<string, string>> = {
  ai: 'I',
  ái: 'I',
  ei: 'A',
  éi: 'A',
  au: 'W',
  áu: 'W',
  oi: 'oɪ',
  ói: 'oɪ',
  eu: 'eʊ',
  éu: 'eʊ',
};
const SIMPLES: Readonly<Record<string, string>> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' };

/** O som de um núcleo e onde fica a vogal (para a marca de acento). */
function somDoNucleo(g: string): { antes: string; vogal: string } {
  if (DITONGOS[g]) return { antes: '', vogal: DITONGOS[g] };
  if (g.length === 1) return { antes: '', vogal: SIMPLES[g] ?? g };
  /* crescentes ("ie", "ue", "ia", "uo"…) e o "ui"/"iu": a 1ª é semivogal */
  const glides = [...g];
  let i = glides.findIndex((c) => FORTES.includes(c));
  if (i < 0) i = glides.length - 1;
  const antes = glides
    .slice(0, i)
    .map((c) => (c === 'i' ? 'j' : 'w'))
    .join('');
  const resto = glides.slice(i + 1).map((c) => (c === 'i' ? 'ɪ' : c === 'u' ? 'ʊ' : (SIMPLES[c] ?? c)));
  const v = glides[i];
  const vogal = (SIMPLES[v] ?? v) + resto.join('');
  return { antes, vogal: vogal === 'ai' ? 'I' : vogal === 'ei' ? 'A' : vogal === 'oi' ? 'oɪ' : vogal };
}

/**
 * Fonemas de uma palavra, com as oclusivas sonoras ainda marcadas como `B`/`D`/`G` no começo (a forma depende do som
 * anterior, na outra palavra); as do meio já saem resolvidas.
 */
function palavraEs(w: string): string {
  const fixa = ATONAS[w];
  if (fixa !== undefined) return lenirInicio(fixa);
  if (/-/.test(w)) return w.split('-').map(palavraEs).join(' ');
  if (!/^\p{L}+$/u.test(w)) return w.replace(/[^\p{L}]/gu, '');
  if (/mente$/.test(w) && w.length > 6) {
    /* advérbio em -mente: dois acentos, o da base e o do sufixo */
    const base = palavraEs(w.slice(0, -5)).replace(/ˌ/g, '');
    return base + 'mˈente';
  }
  const u = unidades(w);
  const idxNuc = u.flatMap((x, i) => (x.tipo === 'V' ? [i] : []));
  if (!idxNuc.length) return w;
  const nuc = idxNuc.map((i) => u[i].g);
  const s = tonica(w, nuc);
  const n = nuc.length;
  const sons: string[] = new Array(u.length).fill('');

  idxNuc.forEach((ui, k) => {
    const { antes, vogal: base } = somDoNucleo(u[ui].g);
    let vogal = base;
    const prox = u[ui + 1];
    const depois = u[ui + 2];
    if (k === s && vogal === 'e' && prox?.tipo === 'C' && prox.g === 'n' && depois?.tipo === 'C') vogal = 'ɛ';
    if (k === s && (n > 1 || !ATONAS[w])) vogal = 'ˈ' + vogal;
    else if (k === 0 && n >= 3 && s >= 2) vogal = 'ˌ' + vogal;
    sons[ui] = antes + vogal;
  });

  for (let i = 0; i < u.length; i++) {
    const x = u[i];
    if (x.tipo !== 'C') continue;
    if (x.som) {
      sons[i] = x.som;
      continue;
    }
    const ant = u[i - 1];
    const prox = u[i + 1];
    const c = x.g;
    const antesDeEI = prox?.tipo === 'V' && /^[eiéí]/.test(prox.g);
    /* β/ð/ɣ depois de vogal ou consoante que não seja nasal (e, no d, l); no começo da palavra decide a frase. */
    const lene = (forte: string, fraca: string) => {
      if (i === 0) return forte === 'b' ? 'B' : forte === 'd' ? 'D' : 'G';
      if (ant?.tipo === 'V') return fraca;
      if (ant && (ant.g === 'm' || ant.g === 'n')) return forte;
      if (forte === 'd' && ant?.g === 'l') return forte;
      return fraca;
    };
    let som: string;
    switch (c) {
      case 'b':
      case 'v':
        som = lene('b', 'β');
        break;
      case 'd':
        som = i === u.length - 1 ? 'd' : lene('d', 'ð'); // o -d final fica oclusivo ("verdad", "usted")
        break;
      case 'g':
        som = antesDeEI ? 'x' : lene('ɡ', 'ɣ');
        break;
      case 'c':
        som = antesDeEI ? 'θ' : 'k';
        break;
      case 'z':
        som = 'θ';
        break;
      case 'j':
        som = 'x';
        break;
      case 'h':
        som = '';
        break;
      case 'ñ':
        som = 'ɲ';
        break;
      case 'y':
        som = 'ʝ';
        break;
      case 'q':
      case 'k':
        som = 'k';
        break;
      case 'x':
        som = 'ks';
        break;
      case 'r':
        som = i === 0 || (ant?.tipo === 'C' && 'nls'.includes(ant.g)) ? 'r' : 'ɾ';
        break;
      case 'n':
        if (prox?.tipo === 'C' && 'bpmv'.includes(prox.g)) som = 'm';
        else if (prox?.tipo === 'C' && (prox.g === 'j' || (prox.g === 'g' && !prox.som))) som = 'ŋ';
        else if (prox?.tipo === 'C' && prox.som === 'ɡ') som = 'ŋ';
        else som = 'n';
        break;
      case 'w':
        som = 'w';
        break;
      default:
        som = c;
    }
    sons[i] = som;
  }
  return sons.join('');
}

/** Na forma fixa, a 1ª letra b/d/g também depende da frase. */
function lenirInicio(f: string): string {
  return f.replace(/^([ˈˌ]?)([bdɡ])/, (_m, a: string, c: string) => a + (c === 'b' ? 'B' : c === 'd' ? 'D' : 'G'));
}

const VOGAL_OU_CONTINUA = /[aeiouɛIAWɪʊjwlrɾsθfxʝʎβðɣ]$/;

/** Texto em es → fonemas no alfabeto do modelo. */
export function fonemasEs(texto: string): string {
  const palavras = cortarFrase(texto);
  const fon = palavras.map((p) => {
    let f = palavraEs(p.texto);
    if (p.texto === 'un' && p.proxima && /^[bpmv]/.test(p.proxima)) f = 'ˈum';
    return f;
  });
  /* As oclusivas do começo: depois de pausa ou nasal, oclusiva; depois de vogal ou contínua, aproximante. */
  for (let k = 0; k < fon.length; k++) {
    const ant = k > 0 && palavras[k - 1].proxima ? fon[k - 1] : '';
    const lene = ant !== '' && VOGAL_OU_CONTINUA.test(ant) && !(/l$/.test(ant) && /^[ˈˌ]?D/.test(fon[k]));
    fon[k] = fon[k].replace(
      /^([ˈˌ]?)([BDG])/,
      (_m, a: string, c: string) => a + (lene ? { B: 'β', D: 'ð', G: 'ɣ' }[c]! : { B: 'b', D: 'd', G: 'ɡ' }[c]!),
    );
  }
  return juntar(palavras.map((p, k) => ({ fonemas: fon[k], p })));
}
