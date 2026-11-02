/**
 * FLAG DESLIGADA = NENHUM CHUNK NOVO (F2): o código do CDN de áudio (`src/lib/leitor/audiolivro/`) e o botão de baixar
 * só chegam por `import()`, depois da flag `audiolivros` e da visibilidade do livro (`audiolivroDoLivro`).
 *
 *  1. FONTE (sempre): fora da própria pasta, ninguém importa `lib/leitor/audiolivro/*` como VALOR de forma estática
 *     (tipo pode: some no build), exceto o `BotaoBaixarCapitulo`, que só é alcançado por `lazy(import())`.
 *  2. BUILD (quando existe `dist/`): o JS inicial do `dist/index.html` não traz o código do áudio.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { arquivosIniciais } from '../scripts/perf/orcamento-bundle.mjs'

const RAIZ = path.resolve(__dirname, '..')
const fonte = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8')
function arquivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? arquivos(path.join(dir, d.name)) : [path.join(dir, d.name)],
  )
}
const rel = (abs: string) => path.relative(RAIZ, abs).split(path.sep).join('/')

/** `import { x } from '…/audiolivro/…'` (valor), não `import type`. */
const ESTATICO = /^\s*import\s+(?!type\b)[^'"]*from\s+['"][^'"]*leitor\/audiolivro\/[^'"]+['"]/m
const ESTATICO_DO_BOTAO = /^\s*import\s+(?!type\b)[^'"]*from\s+['"][^'"]*\/BotaoBaixarCapitulo['"]/m

describe('o áudio dos audiolivros fora do bundle principal', () => {
  const codigo = arquivos(path.join(RAIZ, 'src'))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map(rel)

  it('só o botão de baixar (lazy) importa a pasta audiolivro como valor', () => {
    const intrusos = codigo.filter(
      (f) =>
        !f.startsWith('src/lib/leitor/audiolivro/') &&
        f !== 'src/components/views/leitor/BotaoBaixarCapitulo.tsx' &&
        ESTATICO.test(fonte(f)),
    )
    expect(intrusos).toEqual([])
  })

  it('o botão de baixar só chega por import() dinâmico', () => {
    expect(codigo.filter((f) => ESTATICO_DO_BOTAO.test(fonte(f)))).toEqual([])
    expect(fonte('src/components/views/leitor/LeitorDoLivro.tsx')).toMatch(/import\('\.\/BotaoBaixarCapitulo'\)/)
  })

  it('a porta abre o áudio por import() e só depois da flag e da visibilidade', () => {
    const porta = fonte('src/lib/leitor/audiolivroDoLivro.ts')
    expect(porta).toMatch(/import\('\.\/audiolivro\/doLivro'\)/)
    expect(porta).toMatch(/temAudioVisivel/)
    expect(fonte('src/components/views/leitor/LeitorDoLivro.tsx')).toMatch(/FLAG_AUDIOLIVROS/)
  })

  it.runIf(existsSync(path.join(RAIZ, 'dist/index.html')))('o JS inicial do build não traz o código do áudio', () => {
    const { js } = arquivosIniciais(fonte('dist/index.html'))
    for (const f of js) {
      const conteudo = readFileSync(path.join(RAIZ, 'dist', f.replace(/^\//, '')), 'utf8')
      expect(conteudo, f).not.toContain('frasy-audiolivros-v1')
      expect(conteudo, f).not.toContain('frasy-audiolivro')
    }
  })
})
