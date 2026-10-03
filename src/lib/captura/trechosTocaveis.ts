/**
 * OS TRECHOS TOCÁVEIS (Intérprete v3, Fase 1) — o texto de uma bolha partido em palavras que se tocam
 * para ouvir. Juntar os trechos devolve o texto original: espaço e pontuação ficam como trechos que NÃO
 * são palavra.
 *
 * Usa o `Intl.Segmenter` do aparelho. Sem ele, idiomas SEM espaço entre palavras (chinês, japonês,
 * tailandês) viram UM trecho só, que não é palavra: o alvo do toque é a frase inteira, e não um
 * caractere solto. Os demais caem para a divisão por espaço.
 */
export interface TrechoTocavel {
  texto: string;
  /** É uma palavra (toque para ouvir só ela); `false` = espaço, pontuação ou a frase inteira. */
  palavra: boolean;
}

/** Quem parte o texto em palavras; `null` = o aparelho não tem (ou o teste desliga). */
export type Segmentador = (texto: string, lang: string) => TrechoTocavel[];

const SEM_ESPACO = new Set(['zh', 'ja', 'th', 'lo', 'km', 'my']);
const baseDoIdioma = (lang: string): string => lang.trim().toLowerCase().split(/[-_]/)[0] ?? '';

const segmentadorDoAparelho: Segmentador | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? (texto, lang) => {
        const segmentos = new Intl.Segmenter(lang || undefined, { granularity: 'word' }).segment(texto);
        return Array.from(segmentos, (s) => ({ texto: s.segment, palavra: !!s.isWordLike }));
      }
    : null;

function porEspaco(texto: string): TrechoTocavel[] {
  const trechos: TrechoTocavel[] = [];
  for (const m of texto.matchAll(/[\p{L}\p{N}'’-]+|[^\p{L}\p{N}'’-]+/gu)) {
    trechos.push({ texto: m[0], palavra: /[\p{L}\p{N}]/u.test(m[0]) });
  }
  return trechos;
}

export function trechosTocaveis(
  texto: string,
  lang: string,
  opcoes: { segmentador?: Segmentador | null } = {},
): TrechoTocavel[] {
  if (!texto) return [];
  const segmentador = opcoes.segmentador === undefined ? segmentadorDoAparelho : opcoes.segmentador;
  if (segmentador) return segmentador(texto, lang);
  if (SEM_ESPACO.has(baseDoIdioma(lang))) return [{ texto, palavra: false }];
  return porEspaco(texto);
}
