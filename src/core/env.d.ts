/**
 * Globais UNIVERSAIS permitidos no núcleo isomórfico (`src/core`).
 *
 * O `tsconfig.json` deste diretório usa `lib: ["ES2022"]` e `types: []` — ou seja,
 * sem DOM e sem Node. Isto é a FRONTEIRA: importar `react`, usar `document`/`window`
 * ou `node:fs` falha o typecheck do core. Aqui declaramos apenas o punhado de
 * globais que existem tanto no browser quanto no Node, para que timers/console
 * (usados por `robustness.ts`) compilem sem abrir a porta para DOM/Node inteiros.
 */

declare const console: {
  log(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  info(...args: unknown[]): void
}

declare function setTimeout(handler: (...args: unknown[]) => void, timeout?: number): number
declare function clearTimeout(id: number): void
declare function setInterval(handler: (...args: unknown[]) => void, timeout?: number): number
declare function clearInterval(id: number): void
declare function queueMicrotask(callback: () => void): void
