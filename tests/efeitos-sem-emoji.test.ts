/**
 * O MOTOR DE PARTÍCULAS NÃO DESENHA EMOJI (revisão de 27/09 das recompensas v2).
 *
 * O que o canvas pinta por `fillText` com emoji ignora a cor do tema e a paleta, e muda de desenho
 * a cada sistema: o rastro e a skin "Estrelas" (⭐✨) e os objetos dos eventos raros (pato, bola,
 * fatia, troféu). Os eventos continuam sorteados e contando para o Colecionador — só o desenho
 * virou ícone vetorial do motor, pintado com a cor do token.
 *
 * Varre os LITERAIS de `effects.ts` e `motorDeParticulas.ts` pela AST (comentário é história, não
 * pixel) e as specs das rajadas.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { BURST_SPECS } from '../src/lib/effects'

const RAIZ = join(__dirname, '..')
const PICTOGRAMA = /\p{Extended_Pictographic}/u

function literais(arquivo: string): string[] {
  const fonte = ts.createSourceFile(arquivo, readFileSync(arquivo, 'utf8'), ts.ScriptTarget.Latest, true)
  const saida: string[] = []
  const visitar = (no: ts.Node) => {
    if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no) || ts.isTemplateHead(no)) saida.push(no.text)
    ts.forEachChild(no, visitar)
  }
  visitar(fonte)
  return saida
}

describe('partículas sem emoji', () => {
  it('nenhuma rajada pede emoji', () => {
    for (const [id, spec] of Object.entries(BURST_SPECS)) {
      expect(spec.forma, id).not.toBe('emoji')
      expect(spec.emojis, id).toBeUndefined()
    }
  })

  it('os eventos raros continuam existindo, agora como ícones vetoriais', () => {
    expect(BURST_SPECS.patos.forma).toBe('pato')
    expect(BURST_SPECS.voleibol.forma).toBe('bola')
    expect(BURST_SPECS.pizza.forma).toBe('fatia')
    expect(BURST_SPECS.trofeu.forma).toBe('trofeu')
    expect(BURST_SPECS.rastroEstrelas.forma).toBe('raio')
  })

  it('nenhum literal do motor ou das specs carrega pictograma', () => {
    for (const arq of ['src/lib/effects.ts', 'src/lib/motorDeParticulas.ts']) {
      const achados = literais(join(RAIZ, arq)).filter((t) => PICTOGRAMA.test(t))
      expect(achados, arq).toEqual([])
    }
  })
})
