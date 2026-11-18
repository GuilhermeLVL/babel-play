/**
 * DADOS PESSOAIS NA ESCRITA DA LEITURA ATIVA (spec `leitura-ativa-escrita`; design, decisão 10). Uma regra só para
 * os dois lados: o cliente sublinha o trecho e bloqueia o envio; o servidor repete e recusa com 422 `dado_pessoal`
 * sem chamar a IA (o cliente não é confiável).
 *
 * Procura e-mail, telefone (≥ 8 dígitos, com ou sem separadores), `@usuario`, endereço web e nome de escola
 * ("Escola/Colégio/Instituto …" ou "… School" seguido ou precedido de nome próprio). As regras são ESTREITAS de
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

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const URL_COM_ESQUEMA = /\b(?:https?:\/\/|www\.)[^\s<>"']+/giu;
/** Domínio sem "http": só com os sufixos comuns, para "Mr." ou "3.5" não virarem endereço. */
const DOMINIO =
  /\b[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|net|org|edu|gov|io|me|app|dev|info|br|pt|us|uk|es)(?:\.br)?\b(?:\/[^\s<>"']*)?/giu;
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

function todos(re: RegExp, texto: string, tipo: TipoDeDadoPessoal, aceitar?: (s: string) => boolean): TrechoPessoal[] {
  const out: TrechoPessoal[] = [];
  for (const m of texto.matchAll(re)) {
    let s = m[0];
    /* A pontuação no fim ("lia.com.br.") é da frase, não do dado. */
    s = s.replace(/[.,;:!?)]+$/u, '');
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
    ...todos(URL_COM_ESQUEMA, texto, 'url'),
    ...todos(DOMINIO, texto, 'url'),
    ...todos(USUARIO, texto, 'usuario'),
    ...todos(
      CANDIDATO_A_TELEFONE,
      texto,
      'telefone',
      (s) => digitos(s) >= MINIMO_DE_DIGITOS_DO_TELEFONE && !/^\d{4}\s\d{4}$/.test(s),
    ),
    ...todos(ESCOLA_ANTES, texto, 'escola'),
    ...todos(ESCOLA_DEPOIS, texto, 'escola'),
  ];
  const aceitos: TrechoPessoal[] = [];
  for (const t of achados) {
    if (aceitos.some((a) => t.inicio < a.fim && a.inicio < t.fim)) continue;
    aceitos.push(t);
  }
  return aceitos.sort((a, b) => a.inicio - b.inicio);
}

export const temDadoPessoal = (texto: string): boolean => dadosPessoaisNoTexto(texto).length > 0;
