#!/usr/bin/env node
/**
 * BUILD DE PERFIL DO REACT — o bundle de produção com o `react-dom/profiling` e os NOMES dos
 * componentes preservados, para o React Profiler medir commits caros e re-renders por componente
 * (auditoria de performance do frontend, 26/09/2026).
 *
 *   node scripts/perf/telas/build-perfil.mjs --saida=<pasta>
 *   node scripts/perf/telas/medir-telas.mjs --raiz=<pasta> ...
 *
 * Grava `<pasta>/dist` (Vite com a configuração do projeto + `react-dom/client` → `react-dom/profiling`,
 * `esbuild.keepNames`) e copia o `dist-server/` do repositório para `<pasta>/dist-server` — o
 * servidor de produção serve o `dist` do `cwd`, então `medir-telas.mjs --raiz=<pasta>` mede ESTE
 * bundle. O `dist` do projeto não é tocado. Com o perfil, o gancho de `medir-telas.mjs` lê o
 * `actualDuration` de cada fibra e dá o tempo próprio por componente; os TEMPOS absolutos do build de
 * perfil são um pouco maiores que os do build normal — use-o para achar QUEM renderiza, não quanto.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

import { build } from 'vite'

import { RAIZ } from './_servidores.mjs'

const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const saida = path.resolve(arg('saida', path.join(RAIZ, '.perf-perfil')))
mkdirSync(saida, { recursive: true })
if (!existsSync(path.join(RAIZ, 'dist-server/server.cjs'))) throw new Error('rode npm run build antes (falta dist-server)')

await build({
  root: RAIZ,
  configFile: path.join(RAIZ, 'vite.config.ts'),
  logLevel: 'warn',
  resolve: { alias: [{ find: /^react-dom\/client$/, replacement: 'react-dom/profiling' }] },
  esbuild: { keepNames: true },
  build: { outDir: path.join(saida, 'dist'), emptyOutDir: true, reportCompressedSize: false, minify: 'esbuild' },
})
cpSync(path.join(RAIZ, 'dist-server'), path.join(saida, 'dist-server'), { recursive: true })
cpSync(path.join(RAIZ, 'package.json'), path.join(saida, 'package.json'))
console.log(`build de perfil em ${saida}`)
