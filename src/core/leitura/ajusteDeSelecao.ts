/**
 * A SELEÇÃO FIRME, em texto puro (openspec `leitura-assistida`, Fatia A). Tudo aqui trabalha com DESLOCAMENTOS num texto
 * (o do bloco: parágrafo, item…), sem DOM: `lib/leitor/selecao.ts` converte o `Range` do documento do livro em
 * deslocamentos, chama estas funções e volta a um `Range`.
 *
 * As regras: início e fim sempre em borda de palavra; ponto sem texto (margem, vão entre colunas) não vira nem início nem
 * fim; o arrasto fica no bloco de onde saiu; a frase e o parágrafo vêm do mesmo texto. `Intl.Segmenter` cuida de
 * acento, apóstrofo ("d'água"), hífen e dos idiomas sem espaço (japonês, chinês) e com escrita da direita (árabe).
 */

export interface Faixa {
  ini: number;
  /** Exclusivo. */
  fim: number;
}

const segmentos = (texto: string, idioma: string | undefined, g: 'word' | 'sentence') => [
  ...new Intl.Segmenter(idioma || undefined, { granularity: g }).segment(texto),
];

/** As palavras (`isWordLike`) do texto, em ordem. */
export function palavrasDoTexto(texto: string, idioma?: string): Faixa[] {
  return segmentos(texto, idioma, 'word')
    .filter((s) => s.isWordLike)
    .map((s) => ({ ini: s.index, fim: s.index + s.segment.length }));
}

/**
 * A palavra no deslocamento `pos` (o caret cai ENTRE letras: vale a da direita e, no fim da palavra, a da esquerda).
 * `null` = espaço, pontuação ou fora do texto.
 */
export function palavraEmOffset(texto: string, pos: number, idioma?: string): Faixa | null {
  const ps = palavrasDoTexto(texto, idioma);
  return ps.find((p) => pos >= p.ini && pos < p.fim) ?? ps.find((p) => pos === p.fim && pos > 0) ?? null;
}

/**
 * Ajusta `[ini, fim)` a bordas de palavra: o início recua ao começo da palavra em que cai (ou avança à próxima, se cair
 * em espaço ou pontuação) e o fim avança ao fim da palavra em que cai (ou recua à última antes dele); a pontuação colada à
 * palavra dentro do intervalo ("orchard.", aspas) é mantida. `null` = nenhuma
 * palavra no intervalo (a seleção é descartada).
 */
export function ajustarAPalavras(texto: string, ini: number, fim: number, idioma?: string): Faixa | null {
  const a = Math.max(0, Math.min(ini, fim));
  const b = Math.min(texto.length, Math.max(ini, fim));
  const dentro = palavrasDoTexto(texto, idioma).filter((p) => p.fim > a && p.ini < b);
  if (dentro.length === 0) return null;
  /* A pontuação COLADA à palavra (o ponto da frase, as aspas) fica, para a frase selecionada não perder o ponto final ao ser
     firmada de novo; espaço e pontuação soltos nas pontas (margem, vão) saem. */
  let ci = dentro[0].ini;
  let cf = dentro[dentro.length - 1].fim;
  while (cf < b && /[\p{P}\p{S}]/u.test(texto[cf])) cf++;
  while (ci > a && /[\p{P}\p{S}]/u.test(texto[ci - 1])) ci--;
  return { ini: ci, fim: cf };
}

/** Recorta `f` ao bloco. `null` = nada sobra. */
export function limitarAoBloco(f: Faixa, bloco: Faixa): Faixa | null {
  const ini = Math.max(f.ini, bloco.ini);
  const fim = Math.min(f.fim, bloco.fim);
  return fim > ini ? { ini, fim } : null;
}

function aparar(texto: string, f: Faixa): Faixa {
  let { ini, fim } = f;
  while (ini < fim && /\s/u.test(texto[ini])) ini++;
  while (fim > ini && /\s/u.test(texto[fim - 1])) fim--;
  return { ini, fim };
}

/** A frase (ou as frases) que cobrem `[ini, fim)`, sem espaço nas pontas. */
export function fraseEmOffsets(texto: string, ini: number, fim: number, idioma?: string): Faixa {
  let a = -1;
  let b = -1;
  for (const s of segmentos(texto, idioma, 'sentence')) {
    const sFim = s.index + s.segment.length;
    if (a < 0 && ini < sFim) a = s.index;
    if (fim <= sFim) {
      b = sFim;
      break;
    }
  }
  return aparar(texto, { ini: a < 0 ? 0 : a, fim: b < 0 ? texto.length : b });
}

/** O parágrafo inteiro (o texto do bloco, sem espaço nas pontas). */
export const paragrafoEmOffsets = (texto: string): Faixa => aparar(texto, { ini: 0, fim: texto.length });

/**
 * Mover uma ALÇA: a palavra vizinha (`dir` = 1 para a próxima, -1 para a anterior) ao ponto `pos` da alça. A alça do
 * início se alinha ao começo da palavra; a do fim, ao fim. Sem vizinha, devolve `pos`.
 */
export function vizinhaDaAlca(texto: string, pos: number, dir: 1 | -1, ponta: 'ini' | 'fim', idioma?: string): number {
  const ps = palavrasDoTexto(texto, idioma);
  const borda = (p: Faixa) => (ponta === 'fim' ? p.fim : p.ini);
  if (dir === 1) {
    const p = ps.find((x) => borda(x) > pos);
    return p ? borda(p) : pos;
  }
  const p = [...ps].reverse().find((x) => borda(x) < pos);
  return p ? borda(p) : pos;
}

/**
 * O arrasto firme: da palavra onde o dedo desceu até a ÚLTIMA palavra realmente tocada no mesmo bloco, qualquer que seja
 * a direção. A deriva do dedo (margem, outra coluna) nunca entra: só pontos que acertaram texto do bloco viram `ultima`.
 */
export function faixaDoArrasto(inicio: Faixa, ultima: Faixa | null): Faixa {
  if (!ultima) return inicio;
  return { ini: Math.min(inicio.ini, ultima.ini), fim: Math.max(inicio.fim, ultima.fim) };
}
