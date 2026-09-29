/**
 * Bancada, Etapa 5 — as partes PURAS dos adaptadores novos: a destokenização e o laço TDT do
 * Parakeet (cópia do `onnx-asr`; errar aqui mede um modelo pior do que ele é) e o pareamento por id
 * do resumo (errar aqui compara casos diferentes e inventa significância).
 */
import { describe, expect, it } from 'vitest'

import { decodificarTdt, destokenizar } from '../../scripts/eval-fala/bancada/parakeet.mjs'
import { alinhar, markdown, resumir } from '../../scripts/eval-fala/bancada/resumo.mjs'

describe('parakeet: destokenizar', () => {
  it('junta peças do SentencePiece e mantém o espaço antes de letra acentuada (o \\b do JS é ASCII)', () => {
    expect(destokenizar([' Olá', ',', ' eu', ' vou', ' à', ' ', 'ação', '.'])).toBe('Olá, eu vou à ação.')
  })
  it('tira o espaço inicial e o espaço antes de pontuação', () => {
    expect(destokenizar([' Hello', ' ', '!', ' How', ' are', ' you', ' ?'])).toBe('Hello! How are you?')
  })
})

describe('parakeet: laço TDT guloso', () => {
  const BLANK = 3
  const logits = (vencedor: number) => Float32Array.from([0, 1, 2, 3], (i) => (i === vencedor ? 5 : 0))

  it('token avança o estado; duração pula quadros; blank com duração 0 avança 1', async () => {
    // quadro 0: emite 1 com duração 2 → quadro 2: emite 2 com duração 0, depois blank → quadro 3: blank
    const roteiro: Record<number, Array<{ tok: number; dur: number }>> = {
      0: [{ tok: 1, dur: 2 }],
      2: [
        { tok: 2, dur: 0 },
        { tok: BLANK, dur: 0 },
      ],
      3: [{ tok: BLANK, dur: 0 }],
    }
    const vistos: number[] = []
    const estados: string[] = []
    const tokens = await decodificarTdt(
      4,
      BLANK,
      async (ultimo: number, estado: string, t: number) => {
        vistos.push(t)
        estados.push(estado)
        const passo = roteiro[t].shift()!
        return { logits: logits(passo.tok), duracao: passo.dur, estado: `${estado}+${passo.tok}` }
      },
      's',
    )
    expect(tokens).toEqual([1, 2])
    expect(vistos).toEqual([0, 2, 2, 3])
    // O estado só avança quando sai token (não com blank).
    expect(estados).toEqual(['s', 's+1', 's+1+2', 's+1+2'])
  })

  it('para de emitir no mesmo quadro depois de 10 tokens', async () => {
    let chamadas = 0
    const tokens = await decodificarTdt(
      1,
      BLANK,
      async () => {
        chamadas++
        return { logits: logits(0), duracao: 0, estado: null }
      },
      null,
    )
    expect(tokens).toHaveLength(10)
    expect(chamadas).toBe(10)
  })
})

/** As linhas do resumo vêm de um .mjs sem tipos: `any` aqui é a borda, não descuido. */
const linha = (linhas: any[], sistema: string): any => linhas.find((x) => x.sistema === sistema)

describe('resumo: comparação pareada por id', () => {
  it('alinha pelo id e descarta o caso que falta num dos lados', () => {
    const [a, b] = alinhar(
      [{ id: 'x' }, { id: 'y' }, { id: 'z' }],
      [
        { id: 'z', v: 3 },
        { id: 'x', v: 1 },
      ],
    )
    expect(a.map((c: { id: string }) => c.id)).toEqual(['x', 'z'])
    expect(b.map((c: { v: number }) => c.v)).toEqual([1, 3])
  })

  it('WER: candidato melhor em todos os casos dá Δ negativo e significativo; base não se compara', () => {
    const casos = (erros: number) =>
      Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, erros: erros + (i % 3), palavras: 20 }))
    const r = resumir([
      { resultados: [{ sistema: 'local:base', conjunto: 'fleurs_pt', casos: casos(4), rtf: 0.07 }] },
      { resultados: [{ sistema: 'parakeet:v3-int8', conjunto: 'fleurs_pt', casos: casos(1).reverse(), rtf: 0.06 }] },
    ])
    const cand = linha(r.stt, 'parakeet:v3-int8')
    const base = linha(r.stt, 'local:base')
    expect(base.comparacoes).toEqual([])
    expect(cand.comparacoes).toHaveLength(1)
    expect(cand.comparacoes[0].n).toBe(40)
    expect(cand.comparacoes[0].diferenca.valor).toBeCloseTo(-3 / 20)
    expect(cand.comparacoes[0].diferenca.significativo).toBe(true)
    expect(markdown(r)).toContain('**sig.**')
  })

  it('MT: usa o COMET por caso quando o pontuar.py já rodou', () => {
    const mt = (sistema: string, notas: number[]) => ({
      sistema,
      corpus: 'gold:en-pt',
      casos: notas.map((_, i) => ({ id: `g${i}`, chrf: 50 })),
      cometPorCaso: notas,
      comet: { valor: 0, ic95: [0, 0] },
      chrf: { valor: 50, ic95: [50, 50] },
    })
    const r = resumir([
      { resultados: [mt('local:opus-mt', [0.8, 0.8, 0.8, 0.8]), mt('bergamot:en-pt', [0.8, 0.8, 0.8, 0.8])] },
    ])
    const cand = linha(r.mt, 'bergamot:en-pt')
    expect(cand.comparacoes[0].metrica).toBe('comet')
    expect(cand.comparacoes[0].diferenca.valor).toBeCloseTo(0)
    expect(cand.comparacoes[0].diferenca.significativo).toBe(false)
  })
})
