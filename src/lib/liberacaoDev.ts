/**
 * A CHAVE MESTRA DE DESENVOLVIMENTO — e o motivo de ela morar sozinha aqui.
 *
 * `liberadoTudo()` destrava todo cosmético para poder ver as telas cheias sem jogar dez horas.
 * Ela é cercada por `import.meta.env.DEV`: num build de produção a função devolve `false` antes de
 * olhar o `localStorage`, então a chave não é uma porta dos fundos — é uma chave que só existe na
 * bancada.
 *
 * POR QUE UM MÓDULO PRÓPRIO (08/09). Ela morava em `desbloqueios.ts`, e `loja.ts` a importava de
 * lá — enquanto `desbloqueios.ts` importava o catálogo de `loja.ts`. Era um CICLO de importação:
 * dois módulos que só carregam se o outro já tiver carregado. Em ESM isso não quebra
 * necessariamente, mas resolve por ordem de avaliação, e "funciona porque o bundler ordenou assim"
 * é a definição de uma falha que aparece quando alguém mexe em outra coisa.
 *
 * Este arquivo não importa NADA. É o que quebra o ciclo: os dois lados passam a depender dele, e
 * ele não depende de ninguém.
 */

const CHAVE_LIBERADO = 'babel.liberado';

/**
 * `true` só em desenvolvimento E com a chave ligada.
 *
 * `import.meta as unknown as ...` é o padrão da casa (ver `lib/supabase.ts`): o tsconfig do
 * servidor não carrega os tipos do Vite, e `import.meta.env` existe em runtime.
 */
export function liberadoTudo(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  if (!env?.DEV) return false;
  try { return localStorage.getItem(CHAVE_LIBERADO) === '1'; } catch { return false; }
}

export function ativarLiberacaoTotal(ligar = true): void {
  try {
    if (ligar) localStorage.setItem(CHAVE_LIBERADO, '1');
    else localStorage.removeItem(CHAVE_LIBERADO);
  } catch { /* sem storage: a bancada segue travada, que é o padrão seguro */ }
}
