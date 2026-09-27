/**
 * NENHUM EMOJI NA INTERFACE (recompensas v2 — restrição global do plano: ícones lucide e tokens).
 *
 * Varre os textos que chegam à tela — literais de string, templates e texto JSX — de
 * `src/components`, `src/lib/galeria`, `src/core/loja.ts` e `src/core/catalogo*.ts`, e falha em
 * qualquer código `Extended_Pictographic`. Comentário não conta (não é desenhado); o que conta é o
 * que pode virar pixel.
 *
 * Por que pela AST e não por regex no arquivo: um comentário explicando "a forma antiga era ⭐" é
 * história útil, e uma regex de linha não separa comentário de string sem errar nos dois sentidos.
 *
 * PERMITIDOS, com o motivo:
 *   · `↔` (U+2194) — seta tipográfica de texto ("palavra ↔ tradução"), sem apresentação de emoji
 *     no Windows nem no Android; é pontuação, não pictograma.
 * Nenhum arquivo é excluído. Se um dia um arquivo precisar guardar emoji como DADO (e não como
 * interface), ele entra numa lista explícita aqui, com o motivo — nunca por padrão de nome.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const RAIZ = join(__dirname, '..')
const PERMITIDOS = new Set(['↔'])

function arquivos(dir: string): string[] {
  const saida: string[] = []
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) saida.push(...arquivos(p))
    else if (/\.(ts|tsx)$/.test(nome) && !nome.endsWith('.d.ts')) saida.push(p)
  }
  return saida
}

const core = join(RAIZ, 'src', 'core')
const ALVOS = [
  ...arquivos(join(RAIZ, 'src', 'components')),
  ...arquivos(join(RAIZ, 'src', 'lib', 'galeria')),
  join(core, 'loja.ts'),
  ...readdirSync(core)
    .filter((n) => /^catalogo.*\.ts$/.test(n))
    .map((n) => join(core, n)),
]

/** Os textos de um arquivo que podem chegar à tela, com a linha de cada um. */
function textos(arquivo: string): Array<{ linha: number; texto: string }> {
  const fonte = ts.createSourceFile(
    arquivo,
    readFileSync(arquivo, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    arquivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const saida: Array<{ linha: number; texto: string }> = []
  const visitar = (no: ts.Node) => {
    if (
      ts.isStringLiteral(no) ||
      ts.isNoSubstitutionTemplateLiteral(no) ||
      ts.isTemplateHead(no) ||
      ts.isTemplateMiddle(no) ||
      ts.isTemplateTail(no) ||
      ts.isJsxText(no)
    ) {
      saida.push({ linha: fonte.getLineAndCharacterOfPosition(no.getStart()).line + 1, texto: no.text })
    }
    ts.forEachChild(no, visitar)
  }
  visitar(fonte)
  return saida
}

const EMOJI = /\p{Extended_Pictographic}/gu

describe('interface sem emoji', () => {
  it('a varredura encontra os arquivos (guarda contra um glob que não casa nada)', () => {
    expect(ALVOS.length).toBeGreaterThan(100)
    expect(ALVOS.some((a) => a.endsWith('catalogoV2.ts'))).toBe(true)
  })

  it('nenhum texto de tela tem código Extended_Pictographic', () => {
    const achados: string[] = []
    for (const arquivo of ALVOS) {
      for (const { linha, texto } of textos(arquivo)) {
        const emojis = (texto.match(EMOJI) ?? []).filter((e) => !PERMITIDOS.has(e))
        if (emojis.length) achados.push(`${relative(RAIZ, arquivo)}:${linha} ${emojis.join(' ')}`)
      }
    }
    expect(achados).toEqual([])
  })
})
