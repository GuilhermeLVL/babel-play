import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { criarSintetizadorFalso, criarSintetizadorHttp } from '../scripts/audiolivros/sintetizador.mjs'
import { wavDeSilencio } from '../scripts/audiolivros/wav.mjs'
import {
  foraDaMediana,
  MIN_CLIPES_PARA_MEDIANA,
  nomeSeguro,
  pastaDeSaida,
  pegarOpcao,
  rtf,
} from '../scripts/eval-voz/comum.mjs'
import { dividirPcm, medirEstabilidadeDoLongo } from '../scripts/eval-voz/medir-estabilidade.mjs'
import { estabilidadeDoTrecho } from '../scripts/eval-voz/metricas.mjs'
import { sintetizarCorpus, textoLongoDeReferencia } from '../scripts/eval-voz/sintetizar.mjs'

const frase = (id: string, duracaoS: number, caracteres = 100) => ({ id, duracaoS, caracteres })

describe('rtf', () => {
  it('é o tempo de síntese dividido pela duração do áudio', () => {
    expect(rtf(30, 60)).toBe(0.5)
    expect(rtf(0, 10)).toBe(0)
    expect(rtf(20, 10)).toBe(2)
  })
  it('duração zero, negativa ou não finita é erro claro (nada de Infinity)', () => {
    expect(() => rtf(1, 0)).toThrow(RangeError)
    expect(() => rtf(1, -3)).toThrow(/duração/)
    expect(() => rtf(1, Number.NaN)).toThrow(RangeError)
  })
  it('tempo de síntese negativo ou não finito também é erro', () => {
    expect(() => rtf(-1, 10)).toThrow(RangeError)
    expect(() => rtf(Number.NaN, 10)).toThrow(RangeError)
  })
})

describe('foraDaMediana', () => {
  // 3 frases de referência a 0,1 s/caractere (mediana 0,1) + as de teste.
  const base = [frase('a', 10), frase('b', 10), frase('c', 10)]

  it('marca 31% acima da mediana e não marca 29%', () => {
    const r = foraDaMediana([...base, frase('x31', 13.1), frase('x29', 12.9)])
    expect(r.ids).toEqual(['x31'])
    expect(r.fracao).toBeCloseTo(1 / 5)
  })
  it('marca também 31% ABAIXO da mediana (±30%) e não marca 29% abaixo', () => {
    const r = foraDaMediana([...base, frase('l31', 6.9), frase('l29', 7.1)])
    expect(r.ids).toEqual(['l31'])
  })
  it('exatamente 30% (para cima e para baixo) não é marcado', () => {
    const r = foraDaMediana([...base, frase('cima', 13), frase('baixo', 7)])
    expect(r.ids).toEqual([])
    expect(r.fracao).toBe(0)
  })
  it('a razão é duração POR CARACTERE: frase longa com a mesma taxa não é outlier', () => {
    const r = foraDaMediana([...base, frase('longa', 50, 500), frase('curta', 1, 10)])
    expect(r.ids).toEqual([])
  })
  it('mediana clássica com número par: média dos dois do meio', () => {
    // razões 0,1 / 0,1 / 0,2 / 0,2 -> mediana 0,15; 0,1 está 33% abaixo, 0,2 está 33% acima: todos fora
    const r = foraDaMediana([frase('a', 10), frase('b', 10), frase('c', 20), frase('d', 20)])
    expect(r.ids.sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(r.fracao).toBe(1)
  })
  it('tolerância configurável', () => {
    const r = foraDaMediana([...base, frase('x', 11.5)], 0.1)
    expect(r.ids).toEqual(['x'])
  })
  it('caracteres 0 ou duração não positiva/NaN são ignorados, sem NaN e sem contar no total', () => {
    const r = foraDaMediana([
      ...base,
      frase('zero', 5, 0),
      frase('mudo', 0),
      frase('neg', -2),
      frase('nan', Number.NaN),
      frase('inf', Number.POSITIVE_INFINITY),
      frase('x31', 13.1),
    ])
    expect(r.ids).toEqual(['x31'])
    expect(r.fracao).toBeCloseTo(1 / 4)
    expect(Number.isFinite(r.fracao)).toBe(true)
  })
  it('lista vazia, ou só com itens ignorados, dá { ids: [], fracao: 0 }', () => {
    expect(foraDaMediana([])).toEqual({ ids: [], fracao: 0 })
    expect(foraDaMediana([frase('a', 0), frase('b', 5, 0)])).toEqual({ ids: [], fracao: 0 })
  })
  it('exporta o mínimo de clipes usado pelos chamadores', () => {
    expect(MIN_CLIPES_PARA_MEDIANA).toBe(3)
  })
})

describe('estabilidadeDoTrecho', () => {
  const palavras = (n: number) =>
    Array.from({ length: n }, (_, i) => `palavra${String.fromCharCode(97 + (i % 26))}${i}`)
  const ref100 = palavras(100).join(' ')

  it('uma palavra repetida em 100 -> 1 inserção, taxa 0,01', () => {
    const p = palavras(100)
    const hip = [...p.slice(0, 40), p[39], ...p.slice(40)].join(' ')
    const r = estabilidadeDoTrecho(ref100, hip, 'pt')
    expect(r.insercoes).toBe(1)
    expect(r.delecoes).toBe(0)
    expect(r.taxa).toBeCloseTo(0.01)
  })
  it('uma palavra omitida -> 1 deleção', () => {
    const p = palavras(100)
    const hip = [...p.slice(0, 70), ...p.slice(71)].join(' ')
    const r = estabilidadeDoTrecho(ref100, hip, 'pt')
    expect(r).toMatchObject({ insercoes: 0, delecoes: 1 })
    expect(r.taxa).toBeCloseTo(0.01)
  })
  it('idêntico (mesmo com caixa e pontuação diferentes) -> 0', () => {
    expect(estabilidadeDoTrecho('Olá, mundo! Tudo bem?', 'olá mundo tudo bem', 'pt')).toEqual({
      insercoes: 0,
      delecoes: 0,
      taxa: 0,
    })
  })
  it('substituição não conta (é assunto do WER)', () => {
    expect(estabilidadeDoTrecho('um dois tres quatro', 'um dois cinco quatro', 'pt')).toEqual({
      insercoes: 0,
      delecoes: 0,
      taxa: 0,
    })
  })
  it('hipótese vazia -> todas as palavras da referência são deleções, taxa 1', () => {
    expect(estabilidadeDoTrecho('um dois tres', '', 'pt')).toEqual({ insercoes: 0, delecoes: 3, taxa: 1 })
  })
  it('referência vazia: sem NaN; tudo que a hipótese diz é inserção, taxa 1 (ou 0 se também vazia)', () => {
    expect(estabilidadeDoTrecho('', 'ola mundo', 'pt')).toEqual({ insercoes: 2, delecoes: 0, taxa: 1 })
    expect(estabilidadeDoTrecho('', '', 'pt')).toEqual({ insercoes: 0, delecoes: 0, taxa: 0 })
  })
  it('simetria: números por extenso na referência casam com dígitos na hipótese', () => {
    const r = estabilidadeDoTrecho('Em 1880 chegou', 'em mil oitocentos e oitenta chegou', 'pt')
    expect(r.insercoes + r.delecoes).toBe(0)
  })
})

describe('nomeSeguro, pegarOpcao e pastaDeSaida', () => {
  it('aceita ids simples e recusa path traversal', () => {
    expect(nomeSeguro('piper-1.0_x', '--motor')).toBe('piper-1.0_x')
    for (const ruim of ['../x', 'a/b', '.oculto', '..', '', undefined, 'a b', 'a\\b']) {
      expect(() => nomeSeguro(ruim as string, '--motor')).toThrow(/--motor/)
    }
  })
  it('pegarOpcao lê o valor ou devolve undefined', () => {
    expect(pegarOpcao(['--motor', 'x', '--longo'], 'motor')).toBe('x')
    expect(pegarOpcao(['--longo', '--motor'], 'motor')).toBeUndefined()
    expect(pegarOpcao(['--motor', '--voz', 'v'], 'motor')).toBeUndefined()
  })
  it('CLAUDE_JOB_DIR definido -> $CLAUDE_JOB_DIR/tmp/eval-voz/<motor>', () => {
    const d = path.join(tmpdir(), 'job-x')
    expect(pastaDeSaida({ motor: 'm1', env: { CLAUDE_JOB_DIR: d } })).toBe(path.join(d, 'tmp', 'eval-voz', 'm1'))
  })
  it('sem CLAUDE_JOB_DIR -> os.tmpdir()/eval-voz/<motor>', () => {
    expect(pastaDeSaida({ motor: 'm1', env: {} })).toBe(path.join(tmpdir(), 'eval-voz', 'm1'))
  })
  it('--saida tem precedência sobre o ambiente', () => {
    const s = path.join(tmpdir(), 'minha-saida')
    expect(pastaDeSaida({ motor: 'm1', saida: s, env: { CLAUDE_JOB_DIR: '/nao/usado' } })).toBe(s)
  })
  it('recusa uma pasta dentro do repositório', () => {
    expect(() => pastaDeSaida({ motor: 'm1', saida: path.resolve('docs', 'x'), env: {} })).toThrow(/repositório/)
    expect(() => pastaDeSaida({ motor: 'm1', env: { CLAUDE_JOB_DIR: path.resolve('.') } })).toThrow(/repositório/)
  })
})

/** Sintetizador cujo áudio dura `seg(texto)` segundos e cuja síntese "levou" `fator` × duração. */
function sintetizadorControlado(seg: (t: string) => number, fator: number, memoriaMB?: number[]) {
  let n = 0
  return {
    id: 'ctl',
    versao: '0',
    idiomas: ['pt', 'en', 'es'],
    limiteDeCaracteres: 10_000,
    async vozes() {
      return []
    },
    async sintetizar(texto: string) {
      const duracaoS = seg(texto)
      const m = memoriaMB?.[n++]
      return {
        wav: wavDeSilencio(duracaoS, 16000),
        duracaoS,
        taxaHz: 16000,
        tempoDeSinteseS: duracaoS * fator,
        ...(m === undefined ? {} : { memoriaMB: m }),
      }
    },
  }
}

const item = (id: string, idioma: 'pt' | 'en' | 'es', texto: string) => ({
  id,
  idioma,
  texto,
  categoria: 'x',
  itens: [],
})

describe('sintetizarCorpus', () => {
  it('um WAV por frase, RTF por frase e mediana, a partir do tempo de síntese controlado', async () => {
    const escritos = new Map<string, Uint8Array>()
    const corpus = [item('a', 'pt', 'x'.repeat(100)), item('b', 'pt', 'y'.repeat(50)), item('c', 'en', 'z'.repeat(200))]
    const r = await sintetizarCorpus({
      corpus,
      sintetizador: sintetizadorControlado((t) => t.length * 0.06, 0.25),
      voz: 'v1',
      escrever: (nome, dados) => void escritos.set(nome, dados),
    })
    expect([...escritos.keys()].sort()).toEqual(['a.wav', 'b.wav', 'c.wav'])
    expect(r.frases.map((f) => f.id)).toEqual(['a', 'b', 'c'])
    expect(r.frases[0].duracaoS).toBeCloseTo(6)
    expect(r.frases[0].rtf).toBeCloseTo(0.25)
    expect(r.rtfMediano).toBeCloseTo(0.25)
    expect(r.rtfMax).toBeCloseTo(0.25)
    expect(r.memoriaPicoMB).toBeNull()
    expect(r.erros).toEqual([])
  })

  it('funciona com o sintetizador falso (16 kHz, 0,06 s por caractere)', async () => {
    const r = await sintetizarCorpus({
      corpus: [item('a', 'pt', 'x'.repeat(100))],
      sintetizador: criarSintetizadorFalso(),
      voz: 'falsa',
      escrever: () => {},
    })
    expect(r.frases[0].duracaoS).toBeCloseTo(6, 1)
    expect(r.frases[0].rtf).toBe(0)
  })

  it('outliers de duração/caractere por idioma via foraDaMediana (com o mínimo de clipes)', async () => {
    const corpus = [
      item('p1', 'pt', 'a'.repeat(100)),
      item('p2', 'pt', 'b'.repeat(100)),
      item('p3', 'pt', 'c'.repeat(100)),
      item('p4', 'pt', 'd'.repeat(101)), // marcador de "lento" abaixo
      item('e1', 'en', 'e'.repeat(100)),
      item('e2', 'en', 'f'.repeat(100)),
    ]
    const r = await sintetizarCorpus({
      corpus,
      sintetizador: sintetizadorControlado((t) => (t.length === 101 ? 13.5 : 10), 0.1),
      voz: 'v',
      escrever: () => {},
    })
    expect(r.foraDaMediana.pt.ids).toEqual(['p4'])
    expect(r.foraDaMediana.pt.fracao).toBeCloseTo(0.25)
    // en tem 2 clipes (< mínimo): não medido
    expect(r.foraDaMediana.en).toBeUndefined()
  })

  it('pico de memória = maior X-Memoria-MB visto; frase que falha vai para erros sem derrubar a rodada', async () => {
    const corpus = [item('a', 'pt', 'x'.repeat(10)), item('b', 'pt', 'y'.repeat(10)), item('c', 'pt', 'z'.repeat(10))]
    const base = sintetizadorControlado(() => 1, 0.5, [512, 900, 700])
    const original = base.sintetizar.bind(base)
    let chamadas = 0
    base.sintetizar = async (t: string) => {
      if (++chamadas === 2) throw new Error('motor caiu')
      return original(t)
    }
    const r = await sintetizarCorpus({ corpus, sintetizador: base, voz: 'v', escrever: () => {} })
    expect(r.frases.map((f) => f.id)).toEqual(['a', 'c'])
    expect(r.erros).toEqual([{ id: 'b', erro: 'motor caiu' }])
    expect(r.memoriaPicoMB).toBe(900)
  })

  it('lê X-Memoria-MB do cabeçalho do contrato HTTP', async () => {
    const respostas = [512, 2048]
    const fakeFetch = (async () =>
      new Response(wavDeSilencio(1, 16000), {
        headers: { 'content-type': 'audio/wav', 'x-tempo-sintese': '0.2', 'x-memoria-mb': String(respostas.shift()) },
      })) as unknown as typeof fetch
    const s = criarSintetizadorHttp({ id: 'h', versao: '1', url: 'http://x' }, { fetch: fakeFetch })
    const r = await sintetizarCorpus({
      corpus: [item('a', 'pt', 'um'), item('b', 'pt', 'dois')],
      sintetizador: s,
      voz: 'v',
      escrever: () => {},
    })
    expect(r.memoriaPicoMB).toBe(2048)
    expect(r.frases[0].rtf).toBeCloseTo(0.2)
  })
})

describe('textoLongoDeReferencia', () => {
  it('junta só trechos literários do corpus no idioma pedido', () => {
    const corpus = [
      item('pt-dom-casmurro-cap1', 'pt', 'Trecho um.'),
      item('pt-numeros', 'pt', 'Números 1 2 3.'),
      item('pt-eca', 'pt', 'Trecho dois.'),
      item('en-literario', 'en', 'English.'),
    ].map((i, k) => ({ ...i, categoria: ['dom-casmurro-cap1', 'numeros', 'eca', 'literario'][k] }))
    const t = textoLongoDeReferencia(corpus, 'pt')
    expect(t).toBe('Trecho um.\n\nTrecho dois.')
  })
  it('sem trecho literário no idioma, lança erro claro', () => {
    expect(() => textoLongoDeReferencia([], 'es')).toThrow(/--texto/)
  })
})

describe('medirEstabilidadeDoLongo', () => {
  const SR = 16000
  const pcm = (segundos: number) => new Float32Array(Math.round(segundos * SR)).fill(0.1)

  it('dividirPcm: pedaços de no máximo o teto, sem perder amostras, cortando no ponto mais quieto', () => {
    const a = pcm(70)
    // silêncio curto em 24,5 s (perto do fim da primeira janela de 25 s)
    a.fill(0, Math.round(24.4 * SR), Math.round(24.6 * SR))
    const partes = dividirPcm(a, SR, 25)
    expect(partes.length).toBe(3)
    expect(partes.every((p) => p.length <= 25 * SR)).toBe(true)
    expect(partes.reduce((t, p) => t + p.length, 0)).toBe(a.length)
    expect(partes[0].length).toBeGreaterThan(24.3 * SR)
    expect(partes[0].length).toBeLessThan(24.7 * SR)
  })
  it('dividirPcm: áudio curto vira um pedaço só; vazio vira nenhum', () => {
    expect(dividirPcm(pcm(10), SR, 25)).toHaveLength(1)
    expect(dividirPcm(new Float32Array(0), SR, 25)).toHaveLength(0)
  })

  const palavras = Array.from({ length: 100 }, (_, i) => `termo${i}`)

  it('1 repetição em 100 palavras = 1,0%: passa o limite (≤ 1,0%)', async () => {
    const hip = [...palavras.slice(0, 50), palavras[49], ...palavras.slice(50)]
    const dadas: string[] = []
    const r = await medirEstabilidadeDoLongo({
      texto: palavras.join(' '),
      idioma: 'pt',
      pcm: pcm(60),
      transcrever: async (parte: Float32Array) => {
        dadas.push(String(parte.length))
        if (dadas.length === 1) return hip.slice(0, 55).join(' ')
        return dadas.length === 2 ? hip.slice(55).join(' ') : ''
      },
    })
    expect(dadas.length).toBeGreaterThan(1) // transcreveu em pedaços
    expect(r.insercoes).toBe(1)
    expect(r.delecoes).toBe(0)
    expect(r.taxa).toBeCloseTo(0.01)
    expect(r.limite).toBe(0.01)
    expect(r.passou).toBe(true)
    expect(r.palavrasNaReferencia).toBe(100)
  })

  it('2 omissões em 100 palavras reprovam', async () => {
    const hip = palavras.filter((_, i) => i !== 10 && i !== 80)
    const r = await medirEstabilidadeDoLongo({
      texto: palavras.join(' '),
      idioma: 'pt',
      pcm: pcm(20),
      transcrever: async () => hip.join(' '),
    })
    expect(r.delecoes).toBe(2)
    expect(r.passou).toBe(false)
  })
})
