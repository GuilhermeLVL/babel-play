/**
 * PRIMITIVOS DE INTERFACE — o vocabulário compartilhado das telas.
 *
 * Regra de admissão: só entra aqui o que já existia em DUAS ou mais telas escrito à mão e divergiu.
 * Um primitivo com um consumidor só é abstração especulativa — e o projeto já pagou por isso antes
 * (`tailwindcss-animate` deixou 235 classes que nunca fizeram nada).
 *
 * Regra de cor: estes componentes só usam TOKENS (`--ink`, `--accent-ink`, `--surface`…). Nenhum
 * `text-white`, `bg-gray-*` ou hex literal — os sete temas × claro/escuro trocam os tokens, não as
 * classes, e um literal aqui vira texto invisível em algum tema. `tests/primitivosDeUi.test.tsx`
 * reprova a build se isso escapar.
 */

export { default as Abas, PainelDeAba } from './Abas';
export type { ItemDeAba } from './Abas';

export { default as Segmentado } from './Segmentado';
export type { OpcaoSegmentada, TomDeOpcao } from './Segmentado';

export { default as Barra } from './Barra';
export { default as Ladrilho } from './Ladrilho';
export { default as Vazio } from './Vazio';
