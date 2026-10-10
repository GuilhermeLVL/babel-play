/**
 * PARAKEET TDT — o laço de decodificação e o que o cerca, sem runtime. O laço é o da bancada
 * (`scripts/eval-fala/bancada/navegador/pagina.html`); estes testes prendem as regras dele: o maior
 * token e a maior duração, o branco que não entra no texto nem troca o estado, a duração que pula
 * quadros e a trava de 10 tokens no mesmo quadro.
 */
import { describe, expect, it } from 'vitest'

import {
  decodificarTdt,
  destokenizar,
  dividirEmJanelas,
  ehSilencioDigital,
  lerVocabulario,
  MAX_TOKENS_POR_QUADRO,
  type PassoDoJoint,
  type SaidaDoEncoder,
} from '../src/gateway/adapters/parakeetTdt'

const VOCAB = ['<unk> 0', '▁Olá 1', ', 2', '▁mundo 3', '. 4', '<blk> 5'].join('\n')

describe('lerVocabulario', () => {
  it('lê `<peça> <id>`, troca ▁ por espaço e acha o branco', () => {
    const v = lerVocabulario(VOCAB)
    expect(v.pecas).toEqual(['<unk>', ' Olá', ',', ' mundo', '.', '<blk>'])
    expect(v.branco).toBe(5)
  })

  it('peça que é um espaço (o `▁` sozinho) continua valendo', () => {
    expect(lerVocabulario('▁ 0\n<blk> 1\n').pecas[0]).toBe(' ')
  })

  it('arquivo sem <blk> não é o vocabulário esperado', () => {
    expect(() => lerVocabulario('a 0\nb 1')).toThrow(/<blk>/)
  })
})

describe('destokenizar', () => {
  it('junta as peças e tira o espaço antes da pontuação e o do começo', () => {
    expect(destokenizar([' Olá', ',', ' mundo', ' .'])).toBe('Olá, mundo.')
    expect(destokenizar([])).toBe('')
  })
})

/** Encoder falso: `quadros` colunas, e a coluna `t` vale `t` na dimensão 0 (o passo lê o quadro por ela). */
function encoder(quadros: number, validos = quadros, dim = 3): SaidaDoEncoder {
  const dados = new Float32Array(dim * quadros)
  for (let t = 0; t < quadros; t++) dados[t] = t
  return { dados, dim, quadros, validos }
}

const N_VOCAB = 6
const BRANCO = 5
/** Logits com `token` e `duracao` vencendo (4 durações possíveis: 0..3). */
function logits(token: number, duracao: number): Float32Array {
  const o = new Float32Array(N_VOCAB + 4).fill(-10)
  o[token] = 5
  o[N_VOCAB + duracao] = 5
  return o
}

describe('decodificarTdt', () => {
  it('token entra no texto e atualiza o estado; branco não; a duração pula quadros', async () => {
    const vistos: Array<{ quadro: number; anterior: number; estado: number }> = []
    // quadro 0: token 1, pula 2 → quadro 2: branco, duração 0 → quadro 3: token 3, pula 1 → fim
    const roteiro: Record<number, [number, number]> = { 0: [1, 2], 2: [BRANCO, 0], 3: [3, 1] }
    const passo: PassoDoJoint<number> = async (coluna, anterior, estado) => {
      const quadro = coluna[0]
      vistos.push({ quadro, anterior, estado })
      const [token, duracao] = roteiro[quadro]
      return { logits: logits(token, duracao), estado: estado + 1 }
    }
    const tokens = await decodificarTdt(encoder(4), passo, 0, { tamanho: N_VOCAB, branco: BRANCO })
    expect(tokens).toEqual([1, 3])
    expect(vistos).toEqual([
      { quadro: 0, anterior: BRANCO, estado: 0 }, // o primeiro "token anterior" é o branco
      { quadro: 2, anterior: 1, estado: 1 }, // o token 1 trocou o estado
      { quadro: 3, anterior: 1, estado: 1 }, // o branco NÃO trocou o estado nem o token anterior
    ])
  })

  it('duração 0 com token repete o quadro, até a trava de tokens por quadro', async () => {
    let chamadas = 0
    const passo: PassoDoJoint<null> = async () => {
      chamadas++
      return { logits: logits(1, 0), estado: null }
    }
    const tokens = await decodificarTdt(encoder(2), passo, null, { tamanho: N_VOCAB, branco: BRANCO })
    // Sem a trava o laço nunca sairia do quadro 0.
    expect(tokens).toHaveLength(2 * MAX_TOKENS_POR_QUADRO)
    expect(chamadas).toBe(2 * MAX_TOKENS_POR_QUADRO)
  })

  it('só decodifica os quadros com áudio (`encoded_lengths`), não o enchimento', async () => {
    const quadros: number[] = []
    const passo: PassoDoJoint<null> = async (coluna) => {
      quadros.push(coluna[0])
      return { logits: logits(BRANCO, 0), estado: null }
    }
    await decodificarTdt(encoder(10, 4), passo, null, { tamanho: N_VOCAB, branco: BRANCO })
    expect(quadros).toEqual([0, 1, 2, 3])
  })

  it('a coluna do quadro t sai de `d * quadros + t` (saída [1, dim, quadros])', async () => {
    const enc: SaidaDoEncoder = { dados: Float32Array.from([10, 11, 20, 21, 30, 31]), dim: 3, quadros: 2, validos: 2 }
    const colunas: number[][] = []
    const passo: PassoDoJoint<null> = async (coluna) => {
      colunas.push([...coluna])
      return { logits: logits(BRANCO, 0), estado: null }
    }
    await decodificarTdt(enc, passo, null, { tamanho: N_VOCAB, branco: BRANCO })
    expect(colunas).toEqual([
      [10, 20, 30],
      [11, 21, 31],
    ])
  })

  it('cancelado no meio: para no próximo quadro e devolve null', async () => {
    let chamadas = 0
    const passo: PassoDoJoint<null> = async () => {
      chamadas++
      return { logits: logits(BRANCO, 0), estado: null }
    }
    const r = await decodificarTdt(encoder(50), passo, null, { tamanho: N_VOCAB, branco: BRANCO }, () => chamadas >= 3)
    expect(r).toBeNull()
    expect(chamadas).toBe(3)
  })

  it('sem quadros, sem texto', async () => {
    const passo: PassoDoJoint<null> = async () => ({ logits: logits(1, 1), estado: null })
    expect(await decodificarTdt(encoder(0), passo, null, { tamanho: N_VOCAB, branco: BRANCO })).toEqual([])
  })
})

describe('dividirEmJanelas', () => {
  const S = 16000

  it('trecho que cabe volta inteiro, o MESMO array', () => {
    const pcm = new Float32Array(10 * S).fill(0.1)
    expect(dividirEmJanelas(pcm, 30 * S, 5 * S)).toEqual([pcm])
    expect(dividirEmJanelas(pcm, 30 * S, 5 * S)[0]).toBe(pcm)
  })

  it('corta na pausa mais silenciosa dos últimos 5 s da janela, sem perder nem repetir amostra', () => {
    const pcm = new Float32Array(50 * S).fill(0.2)
    pcm.fill(0, 27 * S, 27 * S + 4800) // 300 ms de silêncio aos 27 s
    const pedacos = dividirEmJanelas(pcm, 30 * S, 5 * S)
    expect(pedacos).toHaveLength(2)
    // O corte cai dentro do silêncio, não nos 30 s cravados (meio de palavra).
    expect(pedacos[0].length).toBeGreaterThanOrEqual(27 * S)
    expect(pedacos[0].length).toBeLessThanOrEqual(27 * S + 4800)
    expect(pedacos.reduce((n, p) => n + p.length, 0)).toBe(pcm.length)
    for (const p of pedacos) expect(p.length).toBeLessThanOrEqual(30 * S)
  })

  it('fala sem pausa nenhuma: ainda assim nenhum pedaço passa da janela', () => {
    const pcm = new Float32Array(95 * S).fill(0.3)
    const pedacos = dividirEmJanelas(pcm, 30 * S, 5 * S)
    expect(pedacos.length).toBeGreaterThanOrEqual(4)
    for (const p of pedacos) {
      expect(p.length).toBeLessThanOrEqual(30 * S)
      expect(p.length).toBeGreaterThan(0)
    }
    expect(pedacos.reduce((n, p) => n + p.length, 0)).toBe(pcm.length)
  })
})

describe('ehSilencioDigital', () => {
  it('só zeros (ou quase) é silêncio; qualquer som não é', () => {
    expect(ehSilencioDigital(new Float32Array(16000))).toBe(true)
    expect(ehSilencioDigital(new Float32Array(16000).fill(0.00001))).toBe(true)
    const comSom = new Float32Array(16000)
    comSom[8000] = 0.01
    expect(ehSilencioDigital(comSom)).toBe(false)
  })
})
