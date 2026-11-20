/**
 * O leitor de `.apkg` do navegador (`src/lib/anki/lerApkg.ts`) rodando em Node: o mesmo `sql.js`, com o
 * `.wasm` achado em `node_modules`. Serve a testes e scripts que precisam ler um baralho a partir de um Buffer.
 */
import { createRequire } from 'node:module'

import initSqlJs, { type SqlJsStatic } from 'sql.js'

import type { LeituraAnki } from '../../src/core/anki'
import { lerApkg as lerApkgNoNavegador } from '../../src/lib/anki/lerApkg'

const require = createRequire(import.meta.url)

let sqlite: Promise<SqlJsStatic> | undefined
export const abrirSqlite = () =>
  (sqlite ??= initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) }))

export function lerApkg(buf: Buffer | Uint8Array, teto?: number): Promise<LeituraAnki> {
  return lerApkgNoNavegador(new Blob([buf as BlobPart]), { abrirSqlite, teto })
}
