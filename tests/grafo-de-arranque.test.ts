/**
 * O GRAFO DE ARRANQUE — o que o chunk de entrada carrega (auditoria de performance do frontend,
 * 26/09/2026).
 *
 * Tudo o que `src/main.tsx` alcança por `import` ESTÁTICO vai para o JS que o navegador baixa e
 * executa antes de pintar a primeira tela (o Vite só separa o que vem por `import()`). Este teste
 * refaz esse grafo lendo as fontes — sem build — e trava fora dele o que só uma parte das pessoas
 * usa. Se um import estático novo reintroduzir um destes módulos no arranque, é aqui que quebra; o
 * orçamento em KB (`scripts/perf/orcamento-bundle.mjs`) só pegaria depois de somar o bastante.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const RAIZ = path.resolve(__dirname, '..')
const SRC = path.join(RAIZ, 'src')

function resolver(de: string, alvo: string): string | null {
  let base: string
  if (alvo.startsWith('@core')) base = path.join(SRC, 'core', alvo.slice(5))
  else if (alvo.startsWith('.')) base = path.resolve(path.dirname(de), alvo)
  else return null // pacote de node_modules
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')])
    if (existsSync(c) && !c.endsWith(path.sep) && /\.(tsx?|json)$/.test(c)) return c
  return null
}

/** Imports estáticos de valor (não `import type`, não `import()`), incluindo reexportações. */
function importsEstaticos(arquivo: string): { locais: string[]; pacotes: string[] } {
  const fonte = readFileSync(arquivo, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const locais: string[] = []
  const pacotes: string[] = []
  const re = /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm
  for (const m of fonte.matchAll(re)) {
    if (m[1]) continue
    const alvo = m[2]
    if (alvo.endsWith('.css')) continue
    const r = resolver(arquivo, alvo)
    if (r) locais.push(r)
    else if (!alvo.startsWith('.') && !alvo.startsWith('@core')) pacotes.push(alvo)
  }
  return { locais, pacotes }
}

function grafoDeArranque() {
  const visto = new Set<string>()
  const pacotes = new Set<string>()
  const fila = [path.join(SRC, 'main.tsx')]
  while (fila.length) {
    const f = fila.pop()!
    if (visto.has(f)) continue
    visto.add(f)
    if (f.endsWith('.json')) continue
    const { locais, pacotes: p } = importsEstaticos(f)
    p.forEach((x) => pacotes.add(x))
    fila.push(...locais)
  }
  const rel = [...visto].map((f) => path.relative(RAIZ, f).replace(/\\/g, '/'))
  return { arquivos: new Set(rel), pacotes }
}

describe('o chunk de entrada', () => {
  const { arquivos, pacotes } = grafoDeArranque()

  it('o grafo é o de verdade (sanidade: alcança o App e o que ele importa)', () => {
    expect(arquivos.has('src/App.tsx')).toBe(true)
    expect(arquivos.has('src/components/Toast.tsx')).toBe(true)
    expect(arquivos.has('src/data/funil.ts')).toBe(true)
  })

  it('a casca e o Início chegam por import(): nem o trilho nem a tela inicial entram no chunk de entrada', () => {
    expect(arquivos.has('src/components/shell/TrilhoDoQuest.tsx')).toBe(false)
    expect(arquivos.has('src/components/views/quest/InicioDoQuest.tsx')).toBe(false)
  })

  it('não carrega o servidor em memória do modo sem conta (vem por import() no funil)', () => {
    const efemero = [...arquivos].filter((f) => f.startsWith('src/data/efemero/') && !f.endsWith('/nucleo.ts'))
    expect(efemero).toEqual([])
    expect(arquivos.has('src/data/migracao.ts')).toBe(false)
    expect(pacotes.has('idb')).toBe(false)
  })
})
