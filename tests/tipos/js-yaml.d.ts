/**
 * Os tipos do `js-yaml` que os testes usam (`tests/integration/alertas-e-painel.test.ts`).
 *
 * O pacote chega como dependência transitiva e não traz `.d.ts`; `@types/js-yaml` não está no
 * lock. Declarar só o que é usado mantém o `typecheck:estrito` sem `any` implícito e sem instalar
 * nada: `load` devolve `unknown`, e quem lê faz a asserção da forma que espera.
 */
declare module 'js-yaml' {
  export function load(texto: string): unknown;
  const yaml: { load: typeof load };
  export default yaml;
}
