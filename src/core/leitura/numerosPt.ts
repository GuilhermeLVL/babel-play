/**
 * NÚMEROS POR EXTENSO EM PORTUGUÊS DO BRASIL (pré-processador de voz) — cardinais, ordinais, romanos, moeda e data.
 * Puro: sem `Intl`, sem DOM, sem rede. Quem monta o texto lido pela voz é o pré-processador; aqui só há as palavras.
 */

type GeneroNumero = 'm' | 'f';

const UNIDADES = [
  'zero',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'treze',
  'catorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos',
];

function palavraDaUnidade(u: number, genero: GeneroNumero): string {
  if (genero === 'f' && u === 1) return 'uma';
  if (genero === 'f' && u === 2) return 'duas';
  return UNIDADES[u];
}

/** Palavras de 1 a 999 (o "cem" redondo e o "e" entre centena, dezena e unidade incluídos). */
function ate999(n: number, genero: GeneroNumero): string {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(genero === 'f' ? CENTENAS[c].replace(/os$/, 'as') : CENTENAS[c]);
  if (resto > 0 && resto < 20) {
    partes.push(palavraDaUnidade(resto, genero));
  } else if (resto >= 20) {
    partes.push(DEZENAS[Math.floor(resto / 10)]);
    if (resto % 10 > 0) partes.push(palavraDaUnidade(resto % 10, genero));
  }
  return partes.join(' e ');
}

/** Cardinal por extenso, de 0 a 999 999 999 999. O gênero vale para "um/uma", "dois/duas" e as centenas. */
export function cardinalPt(n: number, genero: GeneroNumero = 'm'): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999_999) {
    throw new RangeError(`cardinalPt: fora do alcance (${n})`);
  }
  if (n === 0) return 'zero';
  const grupos = [
    { valor: Math.floor(n / 1_000_000_000) % 1000, singular: 'bilhão', plural: 'bilhões' },
    { valor: Math.floor(n / 1_000_000) % 1000, singular: 'milhão', plural: 'milhões' },
    { valor: Math.floor(n / 1000) % 1000, singular: 'mil', plural: 'mil' },
    { valor: n % 1000, singular: '', plural: '' },
  ].filter((g) => g.valor > 0);
  const partes = grupos.map((g) => {
    if (g.singular === '') return ate999(g.valor, genero);
    if (g.singular === 'mil') return g.valor === 1 ? 'mil' : `${ate999(g.valor, genero)} mil`;
    return `${ate999(g.valor, 'm')} ${g.valor === 1 ? g.singular : g.plural}`;
  });
  if (partes.length === 1) return partes[0];
  // "e" antes do último grupo quando ele é menor que 100 ou uma centena redonda; senão, só espaço
  const ultimo = grupos[grupos.length - 1].valor;
  const liga = ultimo < 100 || ultimo % 100 === 0 ? ' e ' : ' ';
  return `${partes.slice(0, -1).join(' ')}${liga}${partes[partes.length - 1]}`;
}

const ORD_UNIDADES = ['', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo', 'nono'];
const ORD_DEZENAS = [
  '',
  'décimo',
  'vigésimo',
  'trigésimo',
  'quadragésimo',
  'quinquagésimo',
  'sexagésimo',
  'septuagésimo',
  'octogésimo',
  'nonagésimo',
];
const ORD_CENTENAS = [
  '',
  'centésimo',
  'ducentésimo',
  'trecentésimo',
  'quadringentésimo',
  'quingentésimo',
  'sexcentésimo',
  'septingentésimo',
  'octingentésimo',
  'noningentésimo',
];

/** Ordinal por extenso, de 1 a 999 ("vigésimo primeiro", "centésima"). */
export function ordinalPt(n: number, genero: GeneroNumero = 'm'): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) throw new RangeError(`ordinalPt: fora do alcance (${n})`);
  const palavras = [ORD_CENTENAS[Math.floor(n / 100)], ORD_DEZENAS[Math.floor((n % 100) / 10)], ORD_UNIDADES[n % 10]];
  const texto = palavras.filter((p) => p !== '').join(' ');
  return genero === 'f' ? texto.replace(/o\b/g, 'a') : texto;
}

const VALOR_ROMANO: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
const ROMANO_CANONICO = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

/** Valor de um numeral romano canônico (1 a 3999), ou `null` se não for um. */
export function romanoParaNumero(s: string): number | null {
  if (s === '' || !ROMANO_CANONICO.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = VALOR_ROMANO[s[i]];
    const proximo = i + 1 < s.length ? VALOR_ROMANO[s[i + 1]] : 0;
    total += v < proximo ? -v : v;
  }
  return total;
}

const MOEDAS = {
  BRL: { singular: 'real', plural: 'reais' },
  USD: { singular: 'dólar', plural: 'dólares' },
};

/** Valor em dinheiro por extenso ("mil e um reais e cinquenta centavos"; "um milhão de reais"). */
export function moedaPt(reais: number, centavos: number, moeda: 'BRL' | 'USD'): string {
  const m = MOEDAS[moeda];
  const partes: string[] = [];
  if (reais > 0 || centavos === 0) {
    const redondoEmMilhoes = reais >= 1_000_000 && reais % 1_000_000 === 0;
    partes.push(`${cardinalPt(reais)}${redondoEmMilhoes ? ' de' : ''} ${reais === 1 ? m.singular : m.plural}`);
  }
  if (centavos > 0) partes.push(`${cardinalPt(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  return partes.join(' e ');
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** Data por extenso: dia 1 é ordinal ("primeiro"), os demais cardinais; o ano é opcional. */
export function dataPt(dia: number, mes: number, ano: number | null): string {
  if (mes < 1 || mes > 12) throw new RangeError(`dataPt: mês inválido (${mes})`);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) throw new RangeError(`dataPt: dia inválido (${dia})`);
  const base = `${dia === 1 ? 'primeiro' : cardinalPt(dia)} de ${MESES[mes - 1]}`;
  return ano === null ? base : `${base} de ${cardinalPt(ano)}`;
}
