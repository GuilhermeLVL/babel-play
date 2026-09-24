/**
 * A RAIZ DO APP — o `#app` do protótipo, onde moram os flutuantes do shell (`.menu-conta`, `.notif`,
 * `.toast`). O CSS do protótipo os posiciona em `absolute` relativo a ela (e troca a posição no
 * celular por `@container`), então eles são montados ali por portal, e não dentro do menu lateral,
 * que os recortaria.
 */
export function raizDoApp(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>('[data-raiz-do-app]') ?? document.body;
}
