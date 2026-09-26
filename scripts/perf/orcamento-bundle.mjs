#!/usr/bin/env node
/**
 * ORÇAMENTO DO BUNDLE — o JS que o navegador baixa ANTES de pintar qualquer tela (Fase 4).
 *
 *   npx vite build && node scripts/perf/orcamento-bundle.mjs [--dist=dist] [--json]
 *
 * O JS INICIAL é o que o `dist/index.html` manda baixar sem condição: o `<script type="module">`
 * de entrada e cada `<link rel="modulepreload">` (o Vite põe ali toda dependência ESTÁTICA da
 * entrada). O CSS inicial são os `<link rel="stylesheet">`. Tudo o que vem por `import()` (as telas
 * via `lazyComRecarga`, os workers, o wasm) fica fora — entra quando a tela abre.
 *
 * Mede cada arquivo em gzip nível 6 (o padrão do `compression` do servidor) e em brotli q11 (o
 * pré-comprimido do build, `scripts/vite/precomprimir.ts`), e COBRA os tetos de
 * `scripts/perf/suite/slo.json` → `frontend`:
 *   - JS inicial gzip ≤ `jsInicialGzipMaxKB` (o medido + 10%, ver docs/slo.md);
 *   - CSS inicial gzip ≤ `cssInicialGzipMaxKB`;
 *   - nenhum arquivo de `proibidosNoDist` no `dist` (protótipos e scripts de bancada que moram em
 *     `public/` para desenvolvimento e não podem ir para produção).
 * Sai 0 dentro do orçamento, 1 fora (dizendo o quê), 2 sem `dist`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

import { carregarSlo } from './suite/slo.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d

/** Os arquivos iniciais citados no `index.html`. Pura, para o teste. */
export function arquivosIniciais(html) {
  const js = new Set()
  const css = new Set()
  for (const m of html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)) js.add(m[1])
  for (const m of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)) js.add(m[1])
  for (const m of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) css.add(m[1])
  return { js: [...js], css: [...css] }
}

/** `*` como curinga, casando o NOME do arquivo. Pura, para o teste. */
export function casaCuringa(padrao, nome) {
  const re = new RegExp(`^${padrao.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
  return re.test(nome)
}

/** O veredito. Pura, para o teste. */
export function avaliarOrcamento({ jsGzipKB, cssGzipKB, proibidosEncontrados }, frontend) {
  const falhas = []
  if (jsGzipKB > frontend.jsInicialGzipMaxKB)
    falhas.push(`JS inicial ${jsGzipKB} KB gzip > teto de ${frontend.jsInicialGzipMaxKB} KB`)
  if (cssGzipKB > frontend.cssInicialGzipMaxKB)
    falhas.push(`CSS inicial ${cssGzipKB} KB gzip > teto de ${frontend.cssInicialGzipMaxKB} KB`)
  if (proibidosEncontrados.length) falhas.push(`arquivos proibidos no dist: ${proibidosEncontrados.join(', ')}`)
  return falhas
}

const kb = (n) => Math.round((n / 1024) * 10) / 10
function medir(arquivo) {
  const b = readFileSync(arquivo)
  return {
    bruto: b.length,
    gzip: gzipSync(b, { level: 6 }).length,
    br: brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  }
}
function listar(dir, base = dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n)
    return statSync(p).isDirectory() ? listar(p, base) : [path.relative(base, p).replace(/\\/g, '/')]
  })
}

function principal() {
  const dist = path.resolve(RAIZ, arg('dist', 'dist'))
  const indice = path.join(dist, 'index.html')
  if (!existsSync(indice)) {
    console.error(`sem ${indice}: rode npx vite build antes`)
    return 2
  }
  const { frontend } = carregarSlo()
  const { js, css } = arquivosIniciais(readFileSync(indice, 'utf8'))
  const soma = (lista) =>
    lista
      .map((u) => ({ u, ...medir(path.join(dist, u.replace(/^\//, ''))) }))
      .reduce(
        (a, x) => ({ bruto: a.bruto + x.bruto, gzip: a.gzip + x.gzip, br: a.br + x.br, itens: [...a.itens, x] }),
        {
          bruto: 0,
          gzip: 0,
          br: 0,
          itens: [],
        },
      )
  const j = soma(js)
  const c = soma(css)
  const todos = listar(dist)
  const proibidosEncontrados = todos.filter((f) =>
    frontend.proibidosNoDist.some((p) => casaCuringa(p, path.basename(f))),
  )
  const maiores = todos
    .filter((f) => /^assets\/.+\.(js|mjs)$/.test(f))
    .map((f) => ({ f, ...medir(path.join(dist, f)) }))
    .sort((a, b) => b.gzip - a.gzip)
    .slice(0, 12)
  const resultado = {
    jsInicial: {
      arquivos: j.itens.map((x) => ({ arquivo: x.u, brutoKB: kb(x.bruto), gzipKB: kb(x.gzip), brKB: kb(x.br) })),
      brutoKB: kb(j.bruto),
      gzipKB: kb(j.gzip),
      brKB: kb(j.br),
    },
    cssInicial: { brutoKB: kb(c.bruto), gzipKB: kb(c.gzip), brKB: kb(c.br) },
    maioresChunksSobDemanda: maiores.map((x) => ({ arquivo: x.f, brutoKB: kb(x.bruto), gzipKB: kb(x.gzip) })),
    proibidosEncontrados,
    tetos: { jsInicialGzipMaxKB: frontend.jsInicialGzipMaxKB, cssInicialGzipMaxKB: frontend.cssInicialGzipMaxKB },
  }
  const falhas = avaliarOrcamento({ jsGzipKB: kb(j.gzip), cssGzipKB: kb(c.gzip), proibidosEncontrados }, frontend)
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ...resultado, falhas }, null, 2))
  else {
    console.log(
      `JS inicial: ${kb(j.bruto)} KB bruto · ${kb(j.gzip)} KB gzip · ${kb(j.br)} KB brotli (teto ${frontend.jsInicialGzipMaxKB} KB gzip)`,
    )
    for (const x of j.itens) console.log(`  ${x.u}  ${kb(x.bruto)} KB · ${kb(x.gzip)} KB gzip · ${kb(x.br)} KB br`)
    console.log(
      `CSS inicial: ${kb(c.bruto)} KB bruto · ${kb(c.gzip)} KB gzip · ${kb(c.br)} KB brotli (teto ${frontend.cssInicialGzipMaxKB} KB gzip)`,
    )
    console.log('Maiores chunks sob demanda (gzip):')
    for (const x of maiores) console.log(`  ${x.f}  ${kb(x.bruto)} KB · ${kb(x.gzip)} KB gzip`)
  }
  if (falhas.length) {
    console.error(`\nORÇAMENTO DO BUNDLE ESTOURADO:\n  ${falhas.join('\n  ')}`)
    console.error(
      'Se o aumento é de propósito, suba o teto em scripts/perf/suite/slo.json (frontend) e em docs/slo.md, com a justificativa.',
    )
    return 1
  }
  console.log('\norçamento do bundle ok')
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(principal())
