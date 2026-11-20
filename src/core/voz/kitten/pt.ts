/**
 * FONETIZADOR DO PORTUGUÊS (pt-BR) para o Kitten TTS 2 — escrito do zero, por regras, sem código nem dados do espeak-ng.
 *
 * O modelo foi treinado com a saída do espeak-ng (voz `pt-br`); estas regras miram as MESMAS convenções de símbolo
 * (o alfabeto do `vocab.json`): acento tônico `ˈ` antes da vogal, secundário `ˌ` na 1ª sílaba de palavras longas,
 * `æ` no `-a` átono final, `ʊ`/`y` no `-o`/`-e` átono final, `ʧ`/`ʤ` antes de [i], `x` no R forte, `ɾə` no R antes de
 * consoante, `A`/`I`/`W` nos ditongos `ei`/`ai`/`au`, nasais com til combinante. A medida contra o que o modelo ouviu
 * no treino fica em `scripts/voz/kitten/` (o oráculo roda só na máquina de quem desenvolve).
 *
 * A pronúncia é fato da língua; o que é escolha (vogal aberta ou fechada sem acento gráfico) vem das listas abaixo.
 */
import { cortarFrase, juntar } from './frase';

const T = '̃'; // til combinante (o vocabulário não tem as vogais nasais pré-compostas)
const A_NASAL = `ɐ${T}`;
const U_NASAL = `u${T}`;
const O_NASAL = `o${T}`;

/** Palavras curtas e gramaticais: a forma no meio da frase (o `ˌ` vira `ˈ` antes de pausa). */
const FUNCIONAIS: Readonly<Record<string, string>> = {
  o: 'ʊ',
  a: 'a',
  os: 'ʊs',
  as: 'as',
  e: 'i',
  é: 'ɛ',
  de: 'ʤy',
  do: 'dʊ',
  da: 'da',
  dos: 'dʊs',
  das: 'das',
  em: 'ˈAŋ',
  no: 'nʊ',
  na: 'na',
  nos: 'nʊs',
  nas: 'nas',
  um: `${U_NASAL}ŋ`,
  uns: `${U_NASAL}ŋs`,
  uma: 'ˌumæ',
  umas: 'ˌumæs',
  com: 'koŋ',
  que: 'ky',
  se: 'sy',
  me: 'my',
  te: 'ʧy',
  lhe: 'ʎy',
  lhes: 'ʎys',
  por: 'por',
  para: 'pˌaɾæ',
  pra: 'pra',
  pro: 'prʊ',
  pela: 'pˈelæ',
  pelo: 'pˈelʊ',
  pelas: 'pˈelæs',
  pelos: 'pˈelʊs',
  ao: 'W',
  aos: 'Ws',
  à: 'ˌaː',
  às: 'aːs',
  eu: 'eʊ',
  meu: 'meʊ',
  seu: 'seʊ',
  teu: 'teʊ',
  meus: 'meʊs',
  seus: 'seʊs',
  sua: 'sˌuæ',
  tua: 'tˌuæ',
  suas: 'sˌuæs',
  minha: 'mˌiɲæ',
  minhas: 'mˌiɲæs',
  mas: 'mas',
  sou: 'sow',
  vou: 'vow',
  foi: 'foɪ',
  tem: 'tAŋ',
  são: `s${A_NASAL}ʊ${T}`,
  há: 'a',
  vai: 'vI',
  ou: 'ow',
  como: 'kˌomʊ',
  não: `nˌ${A_NASAL}ʊ${T}`,
  você: 'vosˌe',
  vocês: 'vosˌes',
  está: 'estˌa',
  estou: 'estˌow',
  estava: 'estˌavæ',
  estão: `estˌ${A_NASAL}ʊ${T}`,
  ele: 'ˌely',
  ela: 'ˌɛlæ',
  eles: 'ˌelys',
  elas: 'ˌɛlæs',
  esse: 'ˌesy',
  essa: 'ˈɛsæ',
  este: 'ˌesʧy',
  esta: 'ˌɛstæ',
  pode: 'pˌɔʤy',
  posso: 'pˌɔsʊ',
  tenho: 'tˌeɲʊ',
  era: 'ˌɛɾæ',
  muito: 'mwˈiŋtʊ',
  muita: 'mwˈiŋtæ',
  muitos: 'mwˈiŋtʊs',
  muitas: 'mwˈiŋtæs',
  nós: 'nɔs',
  já: 'ʒˈa',
  ser: 'ser',
  ter: 'ter',
  faz: 'faz',
  fazer: 'fazˌer',
  estar: 'estˌar',
  vamos: 'vˌɐ̃mʊs',
  temos: 'tˌemʊs',
  podemos: 'podˌemʊs',
  estamos: 'estˌɐ̃mʊs',
  estavam: 'estˌavɐ̃ʊ̃',
  nunca: 'nˌũŋkæ',
  sempre: 'sˌAmpry',
  onde: 'ˌoŋʤy',
  até: 'atˌɛ',
  será: 'seɾˌa',
  fui: 'fuɪ',
  vão: 'vɐ̃ʊ̃',
  tinha: 'ʧˌiɲæ',
  nossa: 'nˌɔsæ',
  nosso: 'nˌɔsʊ',
  neste: 'nˌesʧy',
  nesta: 'nˌɛstæ',
};

/** Vogal tônica ABERTA sem acento gráfico (ɛ/ɔ). O resto sai fechado (e/o). */
const ABERTAS = new Set(
  (
    'quero quer querem queres era eram festa festas certo certa certos perto perta chefe chefes terra guerra velho velha ' +
    'velhos velhas belo bela sete dez janela janelas panela tela vela regra pedra perna inverno moderno moderna caderno ' +
    'aberto aberta deserto esperto ferro cego cega neve leve breve greve febre dela nela aquela aquelas daquela naquela ' +
    'dessa desta nessa parece parecem quiser senhora senhoras jovem jovens melhor melhores pior piores maior maiores ' +
    'testa resto gesto mexe mexer segue seguem consegue conseguem pede pedem entrega nega leva levam levo deve devem quebra ' +
    'começa começam começo peça peças pega pegam pego espera esperam espero primavera fera meta planeta seca selva ' +
    'escola escolas agora hora horas embora fora bola bolas nova novas novos gosta gostam gosto gostas pode podem porta ' +
    'portas forte fortes morte sorte norte corpos olhos olha olham obra obras roda moda nossa nossas nosso nossos joga jogam ' +
    'jogo mora moram adora adoram chora choram loja lojas costa costas prova provas nota notas bota rota copa modo logo fogos ' +
    'ovos copo copos pobre pobres dorme dormem morre morrem corre correm volta voltam solta cola sol pó dó mó nó avó ' +
    'meio meia ela elas'
  ).split(' '),
);

const VOGAIS = 'aeiouáéíóúâêôãõàüy';
const ehVogal = (c: string | undefined) => !!c && VOGAIS.includes(c);
const ACENTO_AGUDO_OU_CIRC = /[áéíóúâêô]/;
const SONORAS = new Set(['b', 'd', 'g', 'l', 'm', 'n', 'r', 'v', 'z', 'j']);

type Unidade =
  | { tipo: 'C'; g: string; /** som já decidido para dígrafos (ch, lh, nh, qu, gu…) */ som?: string }
  | { tipo: 'V'; g: string };

/** Separa a palavra em consoantes (com dígrafos) e núcleos vocálicos (com ditongos). */
function unidades(w: string): Unidade[] {
  const u: Unidade[] = [];
  let i = 0;
  while (i < w.length) {
    const c = w[i];
    const d = w[i + 1];
    const depois = w[i + 2];
    if (ehVogal(c)) {
      let j = i;
      while (ehVogal(w[j])) j++;
      nucleos(w.slice(i, j), w.slice(j)).forEach((g) => u.push({ tipo: 'V', g }));
      i = j;
      continue;
    }
    if ((c === 'q' || c === 'g') && (d === 'u' || d === 'ü') && ehVogal(depois)) {
      const mudo = d === 'u' && 'eiéêí'.includes(depois);
      u.push({ tipo: 'C', g: c + d, som: (c === 'q' ? 'k' : 'ɡ') + (mudo ? '' : 'w') });
      i += 2;
      continue;
    }
    const par = c + (d ?? '');
    if (par === 'ch') u.push({ tipo: 'C', g: par, som: 'ʃ' });
    else if (par === 'lh') u.push({ tipo: 'C', g: par, som: 'lj' });
    else if (par === 'nh') u.push({ tipo: 'C', g: par, som: 'ɲ' });
    else if (par === 'rr') u.push({ tipo: 'C', g: par, som: 'x' });
    else if (par === 'ss' || par === 'sç' || par === 'xc' || (par === 'sc' && 'eiéêí'.includes(depois ?? '-')))
      u.push({ tipo: 'C', g: par, som: 's' });
    else {
      u.push({ tipo: 'C', g: c });
      i += 1;
      continue;
    }
    i += 2;
  }
  return u;
}

const NASAIS_DUPLAS = new Set(['ão', 'ãe', 'õe', 'ãi', 'õi']);

/** Uma sequência de vogais em núcleos: ditongos decrescentes juntos, hiatos separados. */
function nucleos(run: string, resto: string): string[] {
  const out: string[] = [];
  let j = 0;
  while (j < run.length) {
    const c = run[j];
    const d = run[j + 1];
    if (d && NASAIS_DUPLAS.has(c + d)) {
      out.push(c + d);
      j += 2;
      continue;
    }
    if (d && (d === 'i' || d === 'u') && c !== d) {
      /* "ainda", "ruim", "juiz", "rainha": o i/u antes de nh, ou de m/n/r/l/z que fecha a sílaba, é hiato. */
      const aposGlide = j + 2 < run.length ? run.slice(j + 2) : resto;
      const fechaSilaba = /^(nh|[mnrlz](?![aeiouáéíóúâêôãõ]))/.test(aposGlide);
      if (!fechaSilaba || j + 2 < run.length) {
        out.push(c + d);
        j += 2;
        continue;
      }
    }
    out.push(c);
    j += 1;
  }
  return out;
}

/** O núcleo tônico: acento gráfico; senão til; senão a regra da terminação. */
function tonica(w: string, nuc: string[]): number {
  if (nuc.length <= 1) return 0;
  const agudo = nuc.findIndex((g) => ACENTO_AGUDO_OU_CIRC.test(g));
  if (agudo >= 0) return agudo;
  const til = nuc.findIndex((g) => /[ãõ]/.test(g));
  if (til >= 0) return til;
  const base = w.replace(/s$/, '');
  if (/([aeo]|am|em|en)$/.test(base)) return nuc.length - 2;
  return nuc.length - 1;
}

const SIMPLES: Readonly<Record<string, string>> = {
  ai: 'I',
  ái: 'I',
  ei: 'A',
  êi: 'A',
  éi: 'ɛɪ',
  oi: 'oɪ',
  ói: 'ɔɪ',
  ôi: 'oɪ',
  ui: 'uɪ',
  au: 'W',
  áu: 'W',
  eu: 'eʊ',
  êu: 'eʊ',
  éu: 'ɛʊ',
  ou: 'ow',
  ôu: 'ow',
  iu: 'iʊ',
  ão: `${A_NASAL}ʊ${T}`,
  ãe: `${A_NASAL}y`,
  õe: `${O_NASAL}j`,
  ãi: `${A_NASAL}j`,
  õi: `${O_NASAL}j`,
};

function palavraPt(w: string): string {
  if (w.includes('-')) {
    /* "dá-me", "diga-lhe": o clítico vai colado e átono. */
    const [cabeca, ...cliticos] = w.split('-');
    return [palavraPt(cabeca), ...cliticos.map((c) => (FUNCIONAIS[c] ?? palavraPt(c)).replace(/[ˈˌ]/g, ''))].join('');
  }
  const fixa = FUNCIONAIS[w];
  if (fixa !== undefined) return fixa;
  if (!/^\p{L}+$/u.test(w)) return w.replace(/[^\p{L}]/gu, '');

  const u = unidades(w);
  const idxNuc = u.flatMap((x, i) => (x.tipo === 'V' ? [i] : []));
  if (!idxNuc.length) return soletrarPt(w);
  const nuc = idxNuc.map((i) => u[i].g);
  const s = tonica(w, nuc);
  const n = nuc.length;
  const aberta = ABERTAS.has(w);

  const sons: string[] = new Array(u.length).fill('');
  /* 1º as vogais (as consoantes olham o som da vogal seguinte). */
  idxNuc.forEach((ui, k) => {
    const g = u[ui].g;
    const tonico = k === s;
    const postonico = k > s;
    const ultimo = k === n - 1;
    const seguinte = u[ui + 1];
    const depois = u[ui + 2];
    const coda = seguinte?.tipo === 'C' && !seguinte.som && (!depois || depois.tipo === 'C') ? seguinte.g : '';
    const codaNasal = coda === 'm' || coda === 'n';
    const fimDaPalavra = ultimo && (!seguinte || (seguinte.g === 's' && !depois));
    const onsetNasal =
      seguinte?.tipo === 'C' &&
      (seguinte.g === 'm' || seguinte.g === 'n' || seguinte.g === 'nh') &&
      depois?.tipo === 'V';
    let som: string;
    if (SIMPLES[g]) {
      som = SIMPLES[g];
      if (g === 'ei' && tonico && /eia$/.test(w)) som = 'ɛɪ';
    } else if (ultimo && postonico && codaNasal && !depois) {
      /* -am, -em, -ens átonos: "falam", "homem", "jovens". */
      som = g === 'a' ? `${A_NASAL}ʊ${T}` : g === 'e' ? 'Aŋ' : vogalNasal(g) + 'ŋ';
    } else if (codaNasal) {
      som = vogalNasal(g);
    } else if (postonico && fimDaPalavra) {
      som = g === 'a' ? 'æ' : g === 'e' ? 'y' : g === 'o' ? 'ʊ' : g === 'u' ? 'ʊ' : vogalOral(g, false, false);
    } else if (postonico && (g === 'i' || g === 'u') && u[ui + 1]?.tipo === 'V') {
      som = g === 'i' ? 'j' : 'w'; // "história", "árdua"
    } else if (postonico && g === 'a') {
      som = 'æ';
    } else if (tonico && onsetNasal && (g === 'a' || g === 'â')) {
      som = A_NASAL;
    } else if (!tonico && onsetNasal && g === 'a') {
      som = seguinte.g === 'm' ? 'æ' : A_NASAL;
    } else if (tonico && (g === 'e' || g === 'o')) {
      const lFinal = seguinte?.g === 'l' && !depois;
      som = aberta || lFinal ? (g === 'e' ? 'ɛ' : 'ɔ') : g;
    } else {
      som = vogalOral(g, tonico, aberta);
    }
    sons[ui] = som;
  });

  /* Depois as consoantes. */
  for (let i = 0; i < u.length; i++) {
    const x = u[i];
    if (x.tipo !== 'C') continue;
    const ant = u[i - 1];
    const prox = u[i + 1];
    const inicio = i === 0;
    const antesDeConsoante = prox?.tipo === 'C';
    const entreVogais = ant?.tipo === 'V' && prox?.tipo === 'V';
    const somDaProx = prox?.tipo === 'V' ? sons[i + 1] : '';
    const iDepois = /^[ijy]/.test(somDaProx);
    if (x.som) {
      sons[i] = x.som;
      continue;
    }
    const c = x.g;
    let som: string;
    switch (c) {
      case 't':
        som = iDepois ? 'ʧ' : 't';
        break;
      case 'd':
        som = iDepois ? 'ʤ' : 'd';
        break;
      case 'c':
        som = prox?.tipo === 'V' && /^[eiéêí]/.test(prox.g) ? 's' : 'k';
        break;
      case 'ç':
        som = 's';
        break;
      case 'g':
        som = prox?.tipo === 'V' && /^[eiéêí]/.test(prox.g) ? 'ʒ' : 'ɡ';
        break;
      case 'j':
        som = 'ʒ';
        break;
      case 'h':
        som = '';
        break;
      case 'l':
        if (prox?.tipo === 'V') som = 'l';
        else if (/ɔ$/.test(sons[i - 1] ?? '')) som = 'l';
        else som = 'ʊ';
        break;
      case 'm':
      case 'n':
        if (prox?.tipo === 'V') som = c;
        else if (ant?.tipo === 'V' && /ʊ̃$|Aŋ$|ŋ$/.test(sons[i - 1])) som = '';
        else if (prox && (prox.g === 'p' || prox.g === 'b')) som = 'm';
        else som = 'ŋ';
        break;
      case 'r':
        if (inicio || (ant?.tipo === 'C' && 'nls'.includes(ant.g))) som = 'x';
        else if (ant?.tipo === 'C') som = 'r';
        else if (entreVogais) som = 'ɾ';
        else if (antesDeConsoante) som = 'ɾə';
        else som = 'r';
        break;
      case 's':
      case 'z':
        if (inicio) som = 's';
        else if (entreVogais) som = 'z';
        else if (prox?.tipo === 'V') som = c === 'z' ? 'z' : 's';
        else if (antesDeConsoante) som = SONORAS.has(prox.g[0]) ? 'z' : 's';
        else som = 's';
        break;
      case 'x':
        som = xPt(w, u, i);
        break;
      case 'w':
        som = 'w';
        break;
      case 'k':
      case 'q':
        som = 'k';
        break;
      default:
        som = c;
    }
    sons[i] = som;
  }

  /* As marcas de acento: `ˈ` na tônica; `ˌ` na 1ª sílaba de palavra com 3+ sílabas e tônica depois dela. */
  idxNuc.forEach((ui, k) => {
    if (k === s && (n > 1 || !FUNCIONAIS[w])) sons[ui] = 'ˈ' + sons[ui];
    else if (k === 0 && n >= 3 && s >= 1) sons[ui] = 'ˌ' + sons[ui];
  });
  /* o "l" de coda depois de "a" é o ditongo "au" (W). */
  return sons.join('').replace(/aʊ/g, 'W');
}

function vogalNasal(g: string): string {
  switch (g) {
    case 'a':
    case 'â':
    case 'ã':
      return A_NASAL;
    case 'e':
    case 'ê':
    case 'é':
      return 'A';
    case 'u':
    case 'ú':
      return U_NASAL;
    case 'o':
    case 'ô':
    case 'ó':
      return 'o';
    default:
      return 'i';
  }
}

function vogalOral(g: string, tonico: boolean, aberta: boolean): string {
  switch (g) {
    case 'á':
    case 'à':
      return 'a';
    case 'â':
      return 'a';
    case 'ã':
      return A_NASAL;
    case 'é':
      return 'ɛ';
    case 'ê':
      return 'e';
    case 'í':
    case 'y':
      return 'i';
    case 'ó':
      return 'ɔ';
    case 'ô':
      return 'o';
    case 'õ':
      return O_NASAL;
    case 'ú':
    case 'ü':
      return 'u';
    case 'e':
      return tonico && aberta ? 'ɛ' : 'e';
    case 'o':
      return tonico && aberta ? 'ɔ' : 'o';
    default:
      return g;
  }
}

const X_KS = new Set([
  'táxi',
  'táxis',
  'tóxico',
  'tóxica',
  'fixo',
  'fixa',
  'sexo',
  'boxe',
  'axila',
  'látex',
  'fax',
  'xérox',
]);
const X_S = new Set(['próximo', 'próxima', 'próximos', 'próximas', 'máximo', 'máxima', 'auxílio', 'trouxe', 'sintaxe']);

function xPt(w: string, u: Unidade[], i: number): string {
  if (X_KS.has(w)) return 'ks';
  if (X_S.has(w)) return 's';
  const ant = u[i - 1];
  const prox = u[i + 1];
  if (i === 0) return 'ʃ';
  /* "exemplo", "exato" → z; "explicar", "texto" → s. */
  if (ant?.tipo === 'V' && /^[eê]$/.test(ant.g) && i === 1) return prox?.tipo === 'V' ? 'z' : 's';
  if (ant?.tipo === 'V' && /^[eé]$/.test(ant.g) && prox?.tipo === 'C') return 's';
  return 'ʃ';
}

const LETRAS: Readonly<Record<string, string>> = {
  b: 'bˈe',
  c: 'sˈe',
  d: 'dˈe',
  f: 'ˈɛfy',
  g: 'ʒˈe',
  h: 'aɡˈa',
  j: 'ʒˈɔtæ',
  k: 'kˈa',
  l: 'ˈɛly',
  m: 'ˈemy',
  n: 'ˈeny',
  p: 'pˈe',
  q: 'kˈe',
  r: 'ˈɛxy',
  s: 'ˈɛsy',
  t: 'tˈe',
  v: 'vˈe',
  w: 'dˈabliʊ',
  x: 'ʃˈis',
  z: 'zˈe',
};
function soletrarPt(w: string): string {
  return [...w].map((c) => LETRAS[c] ?? '').join(' ');
}

/** O -o/-e átono final (ʊ/y depois de consoante) vira semivogal (w/j). Depois de vogal ou nasal ("eu", "mãe"), não. */
function semivogalNoFim(f: string): string {
  const ult = f.slice(-1);
  const antes = f.slice(-2, -1);
  if ((ult !== 'ʊ' && ult !== 'y') || !antes || /[aeiouɐɛɔæAIOWˈˌ]/.test(antes) || antes === T) return f;
  return f.slice(0, -1) + (ult === 'ʊ' ? 'w' : 'j');
}

const COMECA_COM_VOGAL = /^[ˈˌ]?[aeiouɐɛɔæAIOWʊyəɪ]/;
const COMECA_SONORA = /^[ˈˌ]?[aeiouɐɛɔæAIOWʊyəɪbdɡvzʒlmnɲɾʎʤ]/;

/** Texto em pt → fonemas no alfabeto do modelo. */
export function fonemasPt(texto: string): string {
  const palavras = cortarFrase(texto);
  const fon = palavras.map((p) => {
    let f = palavraPt(p.texto);
    /* Antes de pausa, a forma reduzida de "você", "não", "eu"… volta a ser tônica. */
    if (p.fimDeGrupo && FUNCIONAIS[p.texto] !== undefined && !f.includes('ˈ')) {
      if (f.includes('ˌ')) f = f.replace('ˌ', 'ˈ');
      else if (p.texto.length > 1 && !/^(de|do|da|que|se|me|te|lhe|por|com|um|o|a|e|os|as|no|na)$/.test(p.texto))
        f = f.replace(/([aeiouɐɛɔæAIOWʊ])/, 'ˈ$1');
    }
    return f;
  });
  /* A junção entre palavras sem pausa: -o/-e átonos viram semivogal antes de vogal TÔNICA; -s/-z soa z antes de
     sonora; o -r final vira tepe antes de vogal. */
  for (let k = 0; k < palavras.length; k++) {
    if (!palavras[k].proxima) continue;
    const prox = fon[k + 1] ?? '';
    let f = fon[k];
    const funcional = FUNCIONAIS[palavras[k].texto] !== undefined;
    if (palavras[k].texto === 'o' && COMECA_COM_VOGAL.test(prox)) f = 'u';
    else if (
      COMECA_COM_VOGAL.test(prox) &&
      (!funcional || (/^(de|te|me|se|lhe)$/.test(palavras[k].texto) && /^[ˈˌ]/.test(prox)))
    )
      f = semivogalNoFim(f);
    if (COMECA_COM_VOGAL.test(prox)) f = f.replace(/r$/, 'ɾ');
    if (COMECA_SONORA.test(prox)) f = f.replace(/s$/, 'z');
    fon[k] = f;
  }
  return juntar(palavras.map((p, k) => ({ fonemas: fon[k], p })));
}
