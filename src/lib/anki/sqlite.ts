/**
 * O SQLITE DO NAVEGADOR (`sql.js`, SQLite compilado para WASM) que lê a coleção de um `.apkg`.
 *
 * O `.wasm` (~670 KB) só é baixado quando a pessoa importa um `.apkg`: este módulo só é importado pelo
 * worker do leitor (`leitorDeApkg.worker.ts`), e o próprio `sql.js` entra por `import()` na primeira
 * chamada. `lerApkg` recebe a função por injeção (`AbrirSqlite`) para os testes usarem o mesmo `sql.js`
 * em Node, com o `.wasm` achado em `node_modules`.
 */
import type { SqlJsStatic } from 'sql.js';
// Com a condição `browser` o Vite resolve `sql.js` para `sql-wasm-browser.js`, que pede este `.wasm`.
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';

export type AbrirSqlite = () => Promise<SqlJsStatic>;

let carregando: Promise<SqlJsStatic> | undefined;

/** Memoizado: o WASM é instanciado uma vez por worker. Uma falha não fica guardada (a próxima tenta de novo). */
export const abrirSqliteNoNavegador: AbrirSqlite = () => {
  if (!carregando) {
    carregando = import('sql.js').then(({ default: initSqlJs }) => initSqlJs({ locateFile: () => wasmUrl }));
    carregando.catch(() => {
      carregando = undefined;
    });
  }
  return carregando;
};
