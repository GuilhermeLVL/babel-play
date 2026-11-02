/**
 * FLAG DESLIGADA = NENHUM CHUNK DO MOTOR (openspec `voz-no-aparelho`): o adaptador do Supertonic, o worker e o motor
 * (`lib/voz/motorNoAparelho.ts`) só chegam por `import()`, em `carregarMotor()`, que recusa sem a flag, sem o perfil e
 * sem a raiz dos pesos.
 *
 *  1. FONTE (sempre): ninguém importa o adaptador nem o motor como VALOR de forma estática (tipo pode: some no build),
 *     fora deles mesmos.
 *  2. BUILD (quando existe `dist/`): o JS inicial do `dist/index.html` não traz o código do motor.
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

const DO_MOTOR = [
  'src/gateway/adapters/supertonicLocal.ts',
  'src/gateway/adapters/supertonicLocal.worker.ts',
  'src/lib/voz/motorNoAparelho.ts',
]
/** `import { x } from '…/supertonicLocal…'` ou `'…/motorNoAparelho'` (valor), não `import type`. */
const ESTATICO = /^\s*import\s+(?!type\b)[^'"]*from\s+['"][^'"]*\/(supertonicLocal(\.worker)?|motorNoAparelho)['"]/m

describe('o motor da voz no aparelho fora do bundle principal', () => {
  const codigo = arquivos(path.join(RAIZ, 'src'))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map(rel)

  it('ninguém fora do próprio motor o importa como valor', () => {
    expect(codigo.filter((f) => !DO_MOTOR.includes(f) && ESTATICO.test(fonte(f)))).toEqual([])
  })

  it('a porta abre o motor por import() e só depois do portão (flag, perfil e raiz)', () => {
    const porta = fonte('src/lib/voz/vozNoAparelho.ts')
    expect(porta).toMatch(/import\('\.\.\/\.\.\/gateway\/adapters\/supertonicLocal'\)/)
    const carregar = porta.slice(porta.indexOf('export function carregarMotor'))
    expect(carregar.indexOf('vozNoAparelhoOferecida()')).toBeGreaterThan(-1)
    expect(carregar.indexOf('vozNoAparelhoOferecida()')).toBeLessThan(carregar.indexOf("import('"))
    expect(porta).toMatch(/flagLigada\(FLAG_VOZ_NO_APARELHO\)/)
  })

  it('o worker é criado por new URL (chunk próprio), nunca importado', () => {
    expect(fonte('src/gateway/adapters/supertonicLocal.ts')).toMatch(
      /new Worker\(new URL\('\.\/supertonicLocal\.worker\.ts', import\.meta\.url\)/,
    )
  })

  it.runIf(existsSync(path.join(RAIZ, 'dist/index.html')))('o JS inicial do build não traz o motor', () => {
    const { js } = arquivosIniciais(fonte('dist/index.html'))
    for (const f of js) {
      const conteudo = readFileSync(path.join(RAIZ, 'dist', f.replace(/^\//, '')), 'utf8')
      expect(conteudo, f).not.toContain('voz-no-aparelho:frase')
      expect(conteudo, f).not.toContain('voz-no-aparelho-supertonic3')
    }
  })
})
