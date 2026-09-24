/**
 * AS TRÊS CAPAS PRONTAS DO PROTÓTIPO (`CAPAS` em docs/prototipos/consistencia-telas.html), como
 * imagens: um SVG em data URL com o gradiente. São CONTEÚDO (a capa que a pessoa escolhe e que fica
 * gravada em `meta.imageUrl`), não cor de interface — por isso moram aqui e não num primitivo de UI,
 * onde só vale token de tema.
 */
const GRADIENTES: Array<[string, string]> = [
  ['#3E5C76', '#7FA7C9'],
  ['#4F7A3A', '#A8C686'],
  ['#6B4E9B', '#C3A6E8'],
];

const capaDeGradiente = ([a, b]: [string, string]) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/></svg>`,
  );

/** As três capas prontas (a quarta, "Padrão", é a ausência de imagem). */
export const CAPAS_PRONTAS = GRADIENTES.map(capaDeGradiente);
