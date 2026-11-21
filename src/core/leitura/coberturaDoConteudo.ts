/**
 * A COBERTURA DE UM CONTEÚDO QUALQUER (spec `cobertura-em-sessoes-e-livros`): o mesmo número da Leitura ativa
 * (`coberturaDoTexto`), agora para as falas de uma sessão e para o capítulo de um livro, em QUALQUER idioma.
 *
 * O que muda em relação ao texto da Leitura ativa:
 *  - o texto chega em trechos (falas, parágrafos) e o idioma é o do conteúdo, não o do acervo;
 *  - idiomas que não separam palavras por espaço (ja, zh, th, lo, km, my) NÃO têm número: `dividirTexto` parte por
 *    espaço, e uma "palavra" seria a frase inteira. Melhor nada do que um número errado;
 *  - a elisão (`l'homme`, `d'água`) sai antes da conta, como em `palavrasDoTexto`: sem isso "l'homme" nunca
 *    casaria com "homme" e a cobertura de francês e italiano sairia para baixo;
 *  - textos curtos demais não dão número (poucas palavras = percentual de loteria) e os longos são amostrados,
 *    para a conta não travar a tela (`LIMITE_DE_CARACTERES`).
 * Lematização só onde `candidatosDeLema` tem regra (en, pt, es, fr, it, de); nos outros idiomas vale a chave exata.
 */
import { baseLang } from '../texto/idioma';
import { ELISOES, escreveSemEspaco } from '../texto/segmentacao';
import { type CoberturaDoTexto, coberturaDoTexto } from './coberturaDoTexto';

/** Abaixo disto o percentual não diz nada ("3 de 5 palavras = 60%"). */
export const PALAVRAS_MINIMAS_PARA_COBERTURA = 30;

/** Teto de texto contado (cerca de 10 mil palavras). Acima disso a conta usa uma amostra espalhada pelo conteúdo. */
export const LIMITE_DE_CARACTERES = 60_000;

export interface CoberturaDoConteudo extends CoberturaDoTexto {
  /** A conta usou só parte do conteúdo: o total de palavras novas seria do trecho, então a tela não o mostra. */
  amostra: boolean;
}

/** O idioma tem segmentação honesta por espaço? Sem idioma conhecido, não. */
export function idiomaTemCobertura(lang: string | null | undefined): boolean {
  const base = baseLang(lang);
  return !!base && !escreveSemEspaco(base);
}

const elisoes = new Map<string, RegExp | null>();
function semElisoes(texto: string, base: string): string {
  let re = elisoes.get(base);
  if (re === undefined) {
    const lista = ELISOES[base];
    re = lista ? new RegExp(`(?<!\\p{L})(?:${[...lista].join('|')})['’ʼ](?=\\p{L})`, 'giu') : null;
    elisoes.set(base, re);
  }
  return re ? texto.replace(re, '') : texto;
}

/** Os trechos que cabem no teto: todos, ou (acima dele) um a cada `passo`, para a amostra cobrir o conteúdo inteiro. */
function amostrar(trechos: readonly string[], limite: number): { trechos: string[]; amostra: boolean } {
  const total = trechos.reduce((n, s) => n + s.length, 0);
  if (total <= limite) return { trechos: [...trechos], amostra: false };
  const passo = Math.ceil(total / limite);
  const escolhidos = trechos.filter((_, i) => i % passo === 0).map((s) => s.slice(0, limite));
  return { trechos: escolhidos, amostra: true };
}

/**
 * A cobertura dos trechos no idioma `lang`, ou `null` quando o número não seria honesto (idioma sem espaço entre
 * palavras, sem idioma, ou pouco texto).
 */
export function coberturaDoConteudo(
  trechos: readonly string[],
  lang: string,
  conhecidas: ReadonlySet<string>,
  limite = LIMITE_DE_CARACTERES,
): CoberturaDoConteudo | null {
  if (!idiomaTemCobertura(lang)) return null;
  const base = baseLang(lang);
  const { trechos: usados, amostra } = amostrar(trechos, limite);
  const texto = semElisoes(usados.join('\n'), base);
  const r = coberturaDoTexto(texto, base, conhecidas);
  if (r.total < PALAVRAS_MINIMAS_PARA_COBERTURA) return null;
  return { ...r, amostra };
}

/** Os textos das falas no idioma do conteúdo (uma sessão bilíngue não mistura as duas línguas na conta). */
export function textosNoIdioma(falas: ReadonlyArray<{ texto: string; lang?: string | null }>, lang: string): string[] {
  const base = baseLang(lang);
  return falas.filter((f) => !f.lang || baseLang(f.lang) === base).map((f) => f.texto);
}
