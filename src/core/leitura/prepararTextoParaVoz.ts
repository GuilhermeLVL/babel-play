/**
 * PRÉ-PROCESSADOR DE TEXTO PARA VOZ — prepara o texto de um livro antes de ir ao sintetizador (pt-BR).
 * Puro: sem DOM, sem rede, sem `Intl`. Pipeline de regras na ordem: dicionário → ortografia → travessão →
 * reticências → moeda/data/% → ordinais → romanos → números → abreviações → siglas → espaços.
 * Idempotente: `f(f(x)) === f(x)`. Em `en`/`es` só valem as regras neutras (travessão, reticências, espaços)
 * e o dicionário do próprio livro. A versão vai ao manifesto: mudar uma regra exige subir `VERSAO_DO_PREPROCESSADOR`.
 */

import { cardinalPt, dataPt, moedaPt, ordinalPt, romanoParaNumero } from './numerosPt';

export type IdiomaDeVoz = 'pt' | 'en' | 'es';

export interface OpcoesDoPreparo {
  /** Troca de palavra inteira (pronúncia de nomes próprios); preserva a maiúscula inicial. */
  dicionario?: Readonly<Record<string, string>>;
  /** `modernizada` atualiza grafias antigas ("annos" → "anos"); `original` (padrão) não mexe. */
  ortografia?: 'original' | 'modernizada';
}

export const VERSAO_DO_PREPROCESSADOR = '1';

const LETRA = String.raw`\p{L}\p{N}_`;

const MODERNIZACAO: Readonly<Record<string, string>> = {
  annos: 'anos',
  anno: 'ano',
  hontem: 'ontem',
  immenso: 'imenso',
  immensa: 'imensa',
  tambem: 'também',
  elle: 'ele',
  ella: 'ela',
  elles: 'eles',
  ellas: 'elas',
  mez: 'mês',
  quasi: 'quase',
  phrase: 'frase',
  pharmacia: 'farmácia',
};

const ABREVIACOES: ReadonlyArray<readonly [string, string]> = [
  ['Srta.', 'Senhorita'],
  ['Sra.', 'Senhora'],
  ['Sr.', 'Senhor'],
  ['Dra.', 'Doutora'],
  ['Dr.', 'Doutor'],
  ['Profa.', 'Professora'],
  ['Prof.', 'Professor'],
  ['cap.', 'capítulo'],
  ['nº', 'número'],
];

/** Siglas que se leem como palavra: ficam como estão. */
const SIGLAS_PRONUNCIAVEIS = new Set(['ONU', 'NASA', 'OTAN', 'UNESCO', 'UNICEF', 'FIFA', 'OPEP', 'PIX', 'MIL']);

const NOMES_DAS_LETRAS: Readonly<Record<string, string>> = {
  A: 'a',
  B: 'bê',
  C: 'cê',
  D: 'dê',
  E: 'é',
  F: 'efe',
  G: 'gê',
  H: 'agá',
  I: 'i',
  J: 'jota',
  K: 'cá',
  L: 'éle',
  M: 'ême',
  N: 'êne',
  O: 'ó',
  P: 'pê',
  Q: 'quê',
  R: 'érre',
  S: 'ésse',
  T: 'tê',
  U: 'u',
  V: 'vê',
  W: 'dáblio',
  X: 'xis',
  Y: 'ípsilon',
  Z: 'zê',
};

const MAIOR_NUMERO = 999_999_999_999;

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function comMaiusculaDoOriginal(original: string, troca: string): string {
  const inicial = original.charAt(0);
  if (inicial === inicial.toUpperCase() && inicial !== inicial.toLowerCase()) {
    return troca.charAt(0).toUpperCase() + troca.slice(1);
  }
  return troca.charAt(0).toLowerCase() + troca.slice(1);
}

/** Troca palavras inteiras (sem diferenciar caixa) preservando a maiúscula inicial. */
function trocarPalavras(texto: string, mapa: Readonly<Record<string, string>>): string {
  const chaves = Object.keys(mapa).filter((k) => k !== '');
  if (chaves.length === 0) return texto;
  const porMinuscula = new Map(chaves.map((k) => [k.toLowerCase(), mapa[k]]));
  chaves.sort((a, b) => b.length - a.length);
  const re = new RegExp(`(?<![${LETRA}])(?:${chaves.map(escaparRegex).join('|')})(?![${LETRA}])`, 'giu');
  return texto.replace(re, (achada) => {
    const troca = porMinuscula.get(achada.toLowerCase());
    return troca === undefined ? achada : comMaiusculaDoOriginal(achada, troca);
  });
}

function travessao(texto: string): string {
  // começo de linha: o traço de fala some ("-" só com espaço depois, para não pegar "-3")
  const semAbertura = texto.replace(/^[ \t]*(?:-{2,}|—|-(?=[ \t]))[ \t]*/gm, '');
  // no meio da frase: vira vírgula (ou só espaço depois de pontuação; nada no fim da linha)
  return semAbertura.replace(/[ \t]*(?:-{2,}|—)[ \t]*/g, (m, deslocamento: number, todo: string) => {
    const anterior = todo.charAt(deslocamento - 1);
    const seguinte = todo.charAt(deslocamento + m.length);
    if (seguinte === '' || seguinte === '\n') return '';
    if (/[,.;:!?…]/.test(anterior)) return ' ';
    return ', ';
  });
}

function reticencias(texto: string): string {
  return texto.replace(/\.{3,}/g, '…');
}

/** "1.234,56" / "50" → palavras; `null` se passar do alcance do cardinal. */
function numeroPorExtenso(inteiro: string, fracao: string | undefined): string | null {
  const n = Number(inteiro.replace(/\./g, ''));
  if (!Number.isSafeInteger(n) || n > MAIOR_NUMERO) return null;
  let palavras = cardinalPt(n);
  if (fracao !== undefined) {
    const zeros = /^0*/.exec(fracao)?.[0].length ?? 0;
    const resto = fracao.slice(zeros);
    const partes = Array<string>(zeros).fill('zero');
    if (resto !== '') {
      const f = Number(resto);
      if (!Number.isSafeInteger(f) || f > MAIOR_NUMERO) return null;
      partes.push(cardinalPt(f));
    }
    palavras += ` vírgula ${partes.join(' ')}`;
  }
  return palavras;
}

const NUMERO = String.raw`(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?`;

function moedaDataPorcento(texto: string): string {
  return texto
    .replace(
      /(US|R)\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?(?!\d)/g,
      (m, tipo: string, reais: string, cent?: string) => {
        const r = Number(reais.replace(/\./g, ''));
        if (!Number.isSafeInteger(r) || r > MAIOR_NUMERO) return m;
        return moedaPt(r, cent === undefined ? 0 : Number(cent), tipo === 'US' ? 'USD' : 'BRL');
      },
    )
    .replace(/(?<![\d/])(\d{1,2})\/(\d{1,2})\/(\d{4})(?![\d/])/g, (m, d: string, mes: string, a: string) => {
      try {
        return dataPt(Number(d), Number(mes), Number(a));
      } catch {
        return m;
      }
    })
    .replace(new RegExp(`(?<![${LETRA}.,])${NUMERO}\\s?%`, 'gu'), (m, inteiro: string, fracao?: string) => {
      const palavras = numeroPorExtenso(inteiro, fracao);
      return palavras === null ? m : `${palavras} por cento`;
    });
}

function ordinais(texto: string): string {
  return texto.replace(/(?<![\d])(\d{1,3})([ºª])/g, (m, n: string, marca: string) => {
    const valor = Number(n);
    if (valor < 1) return m;
    return ordinalPt(valor, marca === 'ª' ? 'f' : 'm');
  });
}

function romanos(texto: string): string {
  // gatilho explícito: sempre cardinal ("Capítulo IV" → "quatro", "século XIX" → "dezenove")
  const gatilho = new RegExp(
    `(?<![${LETRA}])(capítulo|século|tomo|livro|parte|canto|ato|cena|volume|cap\\.?)(\\s+)([IVXLC]+)(?![${LETRA}])`,
    'giu',
  );
  const comGatilho = texto.replace(gatilho, (m, palavra: string, espaco: string, romano: string) => {
    const valor = romanoParaNumero(romano);
    return valor === null ? m : `${palavra}${espaco}${cardinalPt(valor)}`;
  });
  // nome próprio capitalizado antes: ordinal até 10, cardinal de 11 em diante ("Pedro II", "Luís XIV")
  const nome = new RegExp(`(?<![${LETRA}])(\\p{Lu}\\p{Ll}+)(\\s+)([IVXLC]+)(?![${LETRA}])`, 'gu');
  return comGatilho.replace(nome, (m, palavra: string, espaco: string, romano: string) => {
    const valor = romanoParaNumero(romano);
    if (valor === null || valor > 39) return m;
    return `${palavra}${espaco}${valor <= 10 ? ordinalPt(valor) : cardinalPt(valor)}`;
  });
}

function numeros(texto: string): string {
  return texto.replace(new RegExp(`(?<![${LETRA}.,])${NUMERO}`, 'gu'), (m, inteiro: string, fracao?: string) => {
    return numeroPorExtenso(inteiro, fracao) ?? m;
  });
}

function abreviacoes(texto: string): string {
  let saida = texto;
  for (const [abreviada, extenso] of ABREVIACOES) {
    const re = new RegExp(`(?<![${LETRA}])${escaparRegex(abreviada)}(?![${LETRA}])`, 'gu');
    saida = saida.replace(re, extenso);
  }
  // "etc." mantém o ponto final quando fecha a frase
  return saida
    .replace(/(?<![\p{L}])etc\.(?=\s+\p{Lu}|\s*$)/gmu, 'etcétera.')
    .replace(/(?<![\p{L}])etc\./gu, 'etcétera');
}

function siglas(texto: string): string {
  return texto.replace(new RegExp(`(?<![${LETRA}])\\p{Lu}{3,6}(?![${LETRA}])`, 'gu'), (sigla) => {
    if (SIGLAS_PRONUNCIAVEIS.has(sigla) || romanoParaNumero(sigla) !== null) return sigla;
    const letras = [...sigla].map((l) => NOMES_DAS_LETRAS[l]);
    return letras.some((l) => l === undefined) ? sigla : letras.join(' ');
  });
}

function espacos(texto: string): string {
  return texto
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
}

/** Texto do livro → texto que a voz lê. Idempotente; `en`/`es` só recebem as regras neutras. */
export function prepararTextoParaVoz(texto: string, idioma: IdiomaDeVoz, opcoes: OpcoesDoPreparo = {}): string {
  let t = texto;
  if (opcoes.dicionario) t = trocarPalavras(t, opcoes.dicionario);
  if (idioma === 'pt' && opcoes.ortografia === 'modernizada') t = trocarPalavras(t, MODERNIZACAO);
  t = reticencias(travessao(t));
  if (idioma === 'pt') {
    t = numeros(romanos(ordinais(moedaDataPorcento(t))));
    t = siglas(abreviacoes(t));
  }
  return espacos(t);
}
