/**
 * DADOS PESSOAIS NA ESCRITA DA LEITURA ATIVA (spec `leitura-ativa-escrita`; design, decisão 10). Uma regra só para
 * os dois lados: o cliente sublinha o trecho e bloqueia o envio; o servidor repete e recusa com 422 `dado_pessoal`
 * sem chamar a IA (o cliente não é confiável).
 *
 * Procura e-mail (também por extenso, "lia at gmail dot com"), telefone (≥ 8 dígitos, com ou sem separadores),
 * `@usuario`, endereço web e nome de escola ("Escola/Colégio/Instituto …" ou "… School" seguido ou precedido de nome
 * próprio; "the Lincoln school"; e em minúsculas, "escola estadual monteiro lobato"). As regras são ESTREITAS de
 * propósito: falso positivo irrita quem está aprendendo, e número curto ("2 bananas", "7 o'clock", "2012") não
 * dispara.
 *
 * Puro: sem DOM, sem rede.
 */

export type TipoDeDadoPessoal = 'email' | 'telefone' | 'usuario' | 'url' | 'escola';

export interface TrechoPessoal {
  tipo: TipoDeDadoPessoal;
  /** Posição no texto (unidades de código, como `String#slice`). */
  inicio: number;
  fim: number;
}

const EMAIL = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
/** O e-mail por extenso, do jeito de quem não acha o "@": "lia at gmail dot com", "lia arroba gmail ponto com". */
const EMAIL_POR_EXTENSO =
  /(?<![\p{L}\p{N}])[\p{L}\p{N}._-]+\s+(?:at|arroba)\s+[\p{L}\p{N}-]+(?:\s+(?:dot|ponto)\s+[\p{L}]{2,4})+(?![\p{L}\p{N}])/giu;
const URL_COM_ESQUEMA = /\b(?:https?:\/\/|www\.)[^\s<>"']+/giu;
/**
 * Domínio sem "http": só com os sufixos comuns e em minúsculas (endereço se digita assim), para "Mr.", "3.5" ou o
 * ponto sem espaço entre frases ("apples.Me too") não virarem endereço. Fora os sufixos que são palavras do inglês
 * ("me", "us"): "read.me" não é endereço.
 */
const DOMINIO =
  /\b[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|net|org|edu|gov|io|app|dev|info|br|pt|uk|es)(?:\.br)?\b(?:\/[^\s<>"']*)?/gu;
const USUARIO = /(?<![\p{L}\p{N}._%+-])@[A-Za-z0-9_](?:[A-Za-z0-9_.]*[A-Za-z0-9_])?/gu;
/** Começa com dígito, "+" ou "(": dígitos com separadores simples entre eles. Conta os dígitos depois. */
const CANDIDATO_A_TELEFONE = /(?<![\p{L}\p{N}])(?:\+\s?)?\(?\d(?:[\d]|[\s.-]\(?\d|\)\s?\d|\(\d)*\d(?![\p{L}\p{N}])/gu;
const MINIMO_DE_DIGITOS_DO_TELEFONE = 8;

const NOME = "\\p{Lu}[\\p{L}'’-]*";
const LIGACAO = '(?:de|da|do|das|dos|e)';
const NOME_LONGO = `${NOME}(?:\\s+(?:${LIGACAO}\\s+)?${NOME})*`;
/** "Escola Estadual Monteiro Lobato", "Colégio Santa Maria", "Escola de Música do Bairro". */
const ESCOLA_ANTES = new RegExp(
  `(?<![\\p{L}])(?:[Ee]scola|[Cc]ol[eé]gio|[Ii]nstituto|[Ss]chool)(?:\\s+(?:${LIGACAO}\\s+)?${NOME})+`,
  'gu',
);
/** "Lincoln High School", "Saint Mary College". */
const ESCOLA_DEPOIS = new RegExp(`(?<![\\p{L}])${NOME_LONGO}\\s+(?:School|College|Academy)(?![\\p{L}])`, 'gu');
/** "the Lincoln school": o nome próprio depois de "the" e "school" em minúscula (sem o "the", "The school" casaria). */
const ESCOLA_COM_THE = new RegExp(
  `(?<=(?<![\\p{L}])[Tt]he\\s+)${NOME_LONGO}\\s+(?:school|college|academy)(?![\\p{L}])`,
  'gu',
);
/**
 * Escola pública escrita em minúsculas, como criança escreve: "escola estadual monteiro lobato". O tipo da escola
 * ("estadual", "municipal"…) é o que torna o trecho um nome; seguem até 3 palavras que não sejam do inglês corrente.
 */
const ESCOLA_MINUSCULA =
  /(?<![\p{L}])(?:escola|col[eé]gio|instituto)\s+(?:estadual|municipal|federal|particular|t[eé]cnic[ao])(?:\s+(?!(?:every|and|in|on|at|the|is|it|i|with|to|near|because|but|for|day|today)(?![\p{L}]))[\p{L}'’-]+){0,3}/giu;

/** Tira a pontuação do fim sem regex com `+$` (que é quadrática em "!!!!!x"). */
function semPontuacaoFinal(s: string): string {
  let fim = s.length;
  while (fim > 0 && '.,;:!?)'.includes(s[fim - 1])) fim--;
  return s.slice(0, fim);
}

function todos(re: RegExp, texto: string, tipo: TipoDeDadoPessoal, aceitar?: (s: string) => boolean): TrechoPessoal[] {
  const out: TrechoPessoal[] = [];
  for (const m of texto.matchAll(re)) {
    let s = m[0];
    /* A pontuação no fim ("lia.com.br.") é da frase, não do dado. */
    s = semPontuacaoFinal(s);
    if (!s || (aceitar && !aceitar(s))) continue;
    const inicio = m.index ?? 0;
    out.push({ tipo, inicio, fim: inicio + s.length });
  }
  return out;
}

const digitos = (s: string) => s.replace(/\D/g, '').length;

/** Os trechos com dado pessoal, em ordem e sem sobreposição (o primeiro achado, na ordem de prioridade, fica). */
export function dadosPessoaisNoTexto(texto: string): TrechoPessoal[] {
  if (!texto) return [];
  const achados = [
    ...todos(EMAIL, texto, 'email'),
    ...todos(EMAIL_POR_EXTENSO, texto, 'email'),
    ...todos(URL_COM_ESQUEMA, texto, 'url'),
    ...todos(DOMINIO, texto, 'url'),
    ...todos(USUARIO, texto, 'usuario'),
    ...todos(
      CANDIDATO_A_TELEFONE,
      texto,
      'telefone',
      /* "2024 2025" são dois anos, não um telefone fixo ("9876 5432" é). */
      (s) => digitos(s) >= MINIMO_DE_DIGITOS_DO_TELEFONE && !/^(?:19|20)\d\d\s(?:19|20)\d\d$/.test(s),
    ),
    ...todos(ESCOLA_ANTES, texto, 'escola'),
    ...todos(ESCOLA_DEPOIS, texto, 'escola'),
    ...todos(ESCOLA_COM_THE, texto, 'escola'),
    ...todos(ESCOLA_MINUSCULA, texto, 'escola'),
  ];
  const aceitos: TrechoPessoal[] = [];
  for (const t of achados) {
    if (aceitos.some((a) => t.inicio < a.fim && a.inicio < t.fim)) continue;
    aceitos.push(t);
  }
  return aceitos.sort((a, b) => a.inicio - b.inicio);
}

export const temDadoPessoal = (texto: string): boolean => dadosPessoaisNoTexto(texto).length > 0;
