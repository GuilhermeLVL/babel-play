import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * O QUE UM WORKER IMPORTA DE `node_modules` ESTÁ DECLARADO NO `optimizeDeps` DO VITE.
 *
 * A varredura do arranque do Vite (modo dev, que é como o e2e da CI sobe o app) segue `import` e
 * `import()`, mas NÃO segue `new Worker(new URL('./x.ts', import.meta.url))`. Um pacote que só um worker
 * importa é descoberto quando o worker sobe pela primeira vez: o Vite re-otimiza e RECARREGA a página.
 * Foi assim que a primeira captura com microfone de um servidor frio perdia a sessão: o worker do fim de
 * fala importa `onnxruntime-web/wasm`, que não estava na lista (só `onnxruntime-web`, outra entrada), e a
 * 1ª tentativa de `captura-no-celular.e2e.ts:236` falhava em toda rodada da CI ("o relógio não anda":
 * a página tinha recarregado), passando na 2ª, com o cache já quente.
 *
 * Este teste lê o código: todo pacote importado por um worker (ou pelo que ele importa por caminho
 * relativo) tem de estar em `optimizeDeps.include` (pré-otimizado no arranque) ou em `exclude` (servido
 * sem otimizar: nunca causa recarga).
 */
const RAIZ = path.resolve(__dirname, '..')
const SRC = path.join(RAIZ, 'src')

function arquivosDe(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const inteiro = path.join(dir, nome)
    if (statSync(inteiro).isDirectory()) return arquivosDe(inteiro)
    return /\.tsx?$/.test(nome) && !/\.(test|d)\.tsx?$/.test(nome) ? [inteiro] : []
  })
}

/** As entradas de worker: o alvo de cada `new Worker(new URL('…', import.meta.url))` do código. */
function entradasDeWorker(): string[] {
  const achadas = new Set<string>()
  for (const arquivo of arquivosDe(SRC)) {
    const texto = readFileSync(arquivo, 'utf8')
    for (const m of texto.matchAll(/new\s+(?:Shared)?Worker\(\s*new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g))
      achadas.add(path.resolve(path.dirname(arquivo), m[1]))
  }
  return [...achadas]
}

const IMPORTA = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g
const resolver = (de: string, alvo: string): string | null => {
  const base = path.resolve(path.dirname(de), alvo)
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')])
    if (existsSync(c) && statSync(c).isFile()) return c
  return null
}

/** Pacote de verdade (está em `node_modules`), e não um atalho do projeto (`@core/…`, `@/…`). */
const ehPacote = (alvo: string): boolean => {
  const partes = alvo.split('/')
  const nome = alvo.startsWith('@') ? partes.slice(0, 2).join('/') : partes[0]
  return existsSync(path.join(RAIZ, 'node_modules', nome, 'package.json'))
}

/** Os pacotes (especificador inteiro, com o subcaminho) que o worker alcança, e por qual arquivo. */
function pacotesDoWorker(entrada: string): Map<string, string> {
  const pacotes = new Map<string, string>()
  const vistos = new Set<string>()
  const fila = [entrada]
  while (fila.length) {
    const arquivo = fila.pop()!
    if (vistos.has(arquivo)) continue
    vistos.add(arquivo)
    // Comentários fora: um `import('x')` citado num comentário não é import.
    const texto = readFileSync(arquivo, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const m of texto.matchAll(IMPORTA)) {
      const alvo = m[1]
      if (alvo.startsWith('.')) {
        const local = resolver(arquivo, alvo.replace(/\?.*$/, ''))
        if (local && /\.tsx?$/.test(local)) fila.push(local)
      } else if (ehPacote(alvo)) {
        pacotes.set(alvo, path.relative(RAIZ, arquivo).replace(/\\/g, '/'))
      }
    }
  }
  return pacotes
}

function listaDoVite(chave: 'include' | 'exclude'): string[] {
  const config = readFileSync(path.join(RAIZ, 'vite.config.ts'), 'utf8')
  const bloco = /optimizeDeps:\s*\{([\s\S]*?)\n {4}\},/.exec(config)?.[1] ?? ''
  const lista = new RegExp(`^\\s*${chave}:\\s*\\[([^\\]]*)\\]`, 'm').exec(bloco)?.[1] ?? ''
  return [...lista.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
}

describe('optimizeDeps do Vite cobre o que os workers importam', () => {
  const entradas = entradasDeWorker()
  const incluidos = listaDoVite('include')
  const excluidos = listaDoVite('exclude')

  it('o teste enxerga os workers e as duas listas', () => {
    expect(entradas.map((e) => path.basename(e))).toContain('fimDeFalaWorker.ts')
    expect(incluidos).toContain('onnxruntime-web')
    expect(excluidos).toContain('@huggingface/transformers')
  })

  it('o worker do fim de fala, que sobe quando o microfone abre, não faz o Vite recarregar a página', () => {
    expect(incluidos).toContain('onnxruntime-web/wasm')
  })

  it('nenhum worker importa um pacote que o Vite só descobriria com o worker no ar', () => {
    const faltam: string[] = []
    for (const entrada of entradas) {
      for (const [pacote, onde] of pacotesDoWorker(entrada)) {
        // `exclude` vale para o pacote inteiro; `include` é por entrada (o subcaminho conta).
        const fora = excluidos.some((e) => pacote === e || pacote.startsWith(`${e}/`))
        if (!fora && !incluidos.includes(pacote)) faltam.push(`${pacote} (em ${onde})`)
      }
    }
    expect([...new Set(faltam)], 'ponha em optimizeDeps.include (ou exclude) no vite.config.ts').toEqual([])
  })
})
