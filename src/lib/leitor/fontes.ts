/**
 * AS FONTES DO LEITOR DENTRO DO LIVRO. O capítulo é um documento `blob:` num `iframe` e não enxerga as
 * `@font-face` da página: as faces vão no CSS do próprio livro (`cssDoLivro`), com URL absoluta para o
 * arquivo que o Vite publica. Só as faces latinas (latin + latin-ext): cobrem os idiomas de alfabeto
 * latino da trilha; os demais caem na fonte do sistema da mesma família.
 *
 * Atkinson Hyperlegible (Braille Institute, SIL OFL 1.1, `@fontsource/atkinson-hyperlegible`): a opção
 * de legibilidade para baixa visão e dislexia. Merriweather e Inter (OFL 1.1) já são fontes do app.
 */
import atkinson400i from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-italic.woff2?url';
import atkinson400 from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2?url';
import atkinson700 from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2?url';
import atkinsonExt400 from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-ext-400-normal.woff2?url';
import interExt from '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?url';
import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import merriExt from '@fontsource-variable/merriweather/files/merriweather-latin-ext-wght-normal.woff2?url';
import merriLatin from '@fontsource-variable/merriweather/files/merriweather-latin-wght-normal.woff2?url';

import type { FonteDeLeitura } from '../../core/leitura/perfilDeLeitura';

const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

const abs = (u: string) => new URL(u, globalThis.location?.href ?? 'http://localhost/').href;
const face = (familia: string, url: string, peso: string, estilo: string, faixa: string) =>
  `@font-face{font-family:'${familia}';font-style:${estilo};font-display:swap;font-weight:${peso};src:url(${abs(url)}) format('woff2');unicode-range:${faixa};}`;

/** O bloco de `@font-face` da fonte escolhida (vazio para "original": vale a fonte do livro). */
export function facesDaFonte(fonte: FonteDeLeitura): string {
  switch (fonte) {
    case 'serifa':
      return [
        face('Merriweather Variable', merriExt, '300 900', 'normal', LATIN_EXT),
        face('Merriweather Variable', merriLatin, '300 900', 'normal', LATIN),
      ].join('\n');
    case 'sem-serifa':
      return [
        face('Inter Variable', interExt, '100 900', 'normal', LATIN_EXT),
        face('Inter Variable', interLatin, '100 900', 'normal', LATIN),
      ].join('\n');
    case 'atkinson':
      return [
        face('Atkinson Hyperlegible', atkinsonExt400, '400', 'normal', LATIN_EXT),
        face('Atkinson Hyperlegible', atkinson400, '400', 'normal', LATIN),
        face('Atkinson Hyperlegible', atkinson400i, '400', 'italic', LATIN),
        face('Atkinson Hyperlegible', atkinson700, '700', 'normal', LATIN),
      ].join('\n');
    default:
      return '';
  }
}
