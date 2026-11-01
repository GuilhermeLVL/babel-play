import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { criarSintetizadorFalso, criarSintetizadorHttp } from '../scripts/audiolivros/sintetizador.mjs'
import { wavDeSilencio } from '../scripts/audiolivros/wav.mjs'
import {
  foraDaMediana,
  mediana,
  MIN_CLIPES_PARA_MEDIANA,
  nomeSeguro,
  pastaDeSaida,
  pegarOpcao,
  rtf,
} from '../scripts/eval-voz/comum.mjs'
import {
  dividirPcm,
  medirEstabilidadeDoLongo,
  montarRegistro,
  OPCOES_DE_DECODE_LONGO,
} from '../scripts/eval-voz/medir-estabilidade.mjs'
import { criarTranscritorDeItens, OPCOES_DE_DECODE_FRASE } from '../scripts/eval-voz/medir-roundtrip.mjs'
import { estabilidadeDoTrecho } from '../scripts/eval-voz/metricas.mjs'
import { lerTextoLongo, sintetizarCorpus } from '../scripts/eval-voz/sintetizar.mjs'
import { criarGerenciadorDePastas } from './harness/pastasTemporarias'

const pastas = criarGerenciadorDePastas()
afterEach(() => pastas.limparPastas())

/** Estreita `T | undefined` com erro claro (em vez de `!` ou `as`). */
function definido<T>(x: T | undefined, quem = 'valor'): T {
  if (x === undefined) throw new Error(`${quem} indefinido`)
  return x
}

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
  it('documenta: omissão + palavra extra adjacentes fundem em UMA substituição e não contam', () => {
    // "c" some e "x" aparece no lugar: o alinhamento ótimo é uma substituição (assunto do WER)
    expect(estabilidadeDoTrecho('a b c d', 'a b x d', 'pt')).toEqual({ insercoes: 0, delecoes: 0, taxa: 0 })
    // separadas por palavras iguais, as duas contam
    const r = estabilidadeDoTrecho('a b c d e f', 'a b x c d f', 'pt')
    expect(r.insercoes + r.delecoes).toBe(2)
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
    expect(pegarOpcao(['--longo'], 'motor')).toBeUndefined()
  })
  it('pegarOpcao erra em flag sem valor (fim da lista ou outro --flag) e em flag repetida', () => {
    expect(() => pegarOpcao(['--longo', '--motor'], 'motor')).toThrow(/--motor.*valor/)
    expect(() => pegarOpcao(['--motor', '--voz', 'v'], 'motor')).toThrow(/--motor.*valor/)
    expect(() => pegarOpcao(['--motor', 'a', '--motor', 'b'], 'motor')).toThrow(/--motor.*repetid/)
  })
  it('mediana: clássica, média dos dois do meio no caso par', () => {
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([4, 1, 2, 3])).toBe(2.5)
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
        origemDoTempo: 'servidor' as const,
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
    expect(definido(r.foraDaMediana.pt).ids).toEqual(['p4'])
    expect(definido(r.foraDaMediana.pt).fracao).toBeCloseTo(0.25)
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

describe('lerTextoLongo e o texto longo padrão', () => {
  const arquivo = path.resolve('scripts', 'eval-voz', 'fontes-longo', 'dom-casmurro-longo.txt')
  const cru = readFileSync(arquivo, 'utf8')

  it('cabeçalho válido, licença dominio-publico, origem com URL e data', () => {
    const linhas = cru.split('\n')
    expect(linhas[0]).toBe('# dom-casmurro-longo | pt | longo | dominio-publico')
    const origem = linhas.find((l) => l.startsWith('# origem:')) ?? ''
    expect(origem).toMatch(/gutenberg\.org\/cache\/epub\/55752\/pg55752\.txt/)
    expect(origem).toMatch(/2026-10-31/)
  })
  it('lerTextoLongo tira o cabeçalho # e tem ao menos 11 000 caracteres', () => {
    const texto = lerTextoLongo(arquivo)
    expect(texto.startsWith('#')).toBe(false)
    expect(texto).not.toMatch(/(^|\n)#/)
    expect(texto).not.toContain('_')
    expect(texto.length).toBeGreaterThanOrEqual(11_000)
  })
  it('a 15 caracteres/s passa de 9 min (e com o sintetizador falso também)', async () => {
    const texto = lerTextoLongo(arquivo)
    expect(texto.length / 15).toBeGreaterThanOrEqual(540)
    const r = await sintetizarCorpus({
      corpus: [item('longo', 'pt', texto)],
      sintetizador: criarSintetizadorFalso({ limiteDeCaracteres: 400 }),
      voz: 'falsa',
      escrever: () => {},
    })
    expect(r.frases[0].duracaoS).toBeGreaterThanOrEqual(540)
  })
  it('trechos de 5 palavras em 30 pontos aparecem no texto-fonte do Gutenberg (só com GUTENBERG_55752_TXT)', (ctx) => {
    const fonte = process.env.GUTENBERG_55752_TXT
    if (!fonte || !existsSync(fonte)) return ctx.skip()
    const norm = (t: string) => t.replace(/_/g, '').replace(/\s+/g, ' ')
    const base = norm(readFileSync(fonte, 'utf8'))
    const linhas = lerTextoLongo(arquivo)
      .split('\n')
      .filter((l) => l.split(' ').length >= 5)
    for (let k = 0; k < 30; k++) {
      const linha = linhas[Math.floor((k * linhas.length) / 30)]
      const janela = linha.split(' ').slice(0, 5).join(' ')
      expect(base, janela).toContain(janela)
    }
  })
})

describe('dividirPcm e medirEstabilidadeDoLongo', () => {
  const SR = 16000
  const pcm = (segundos: number) => new Float32Array(Math.round(segundos * SR)).fill(0.1)
  const silencio = (a: Float32Array, deS: number, ateS: number) =>
    a.fill(0, Math.round(deS * SR), Math.round(ateS * SR))

  it('corta no MEIO de uma pausa de 200 ms; chunks somam o comprimento original', () => {
    const a = pcm(70)
    silencio(a, 24.4, 24.6)
    const { pedacos, cortesSemPausa } = dividirPcm(a, SR, 25)
    expect(pedacos.length).toBe(3)
    expect(pedacos.every((p) => p.length <= 25 * SR)).toBe(true)
    expect(pedacos.reduce((t, p) => t + p.length, 0)).toBe(a.length)
    expect(Math.abs(pedacos[0].length / SR - 24.5)).toBeLessThan(0.06)
    expect(cortesSemPausa).toBe(1) // o 2º corte (sem silêncio nenhum) cai no plano B
  })
  it('entre pausas de 50 ms e de 300 ms escolhe a de 300 ms, mesmo com as de 50 ms mais perto do alvo', () => {
    const a = pcm(60)
    silencio(a, 21.0, 21.3) // pausa real, no meio da janela de 6 s
    silencio(a, 24.0, 24.05) // pausas de 50 ms (entre palavras), mais perto do fim
    silencio(a, 24.8, 24.85)
    const { pedacos, cortesSemPausa } = dividirPcm(a, SR, 25)
    expect(Math.abs(pedacos[0].length / SR - 21.15)).toBeLessThan(0.06)
    expect(cortesSemPausa).toBe(1) // só o 2º corte
  })
  it('escolhe a MAIOR de várias pausas reais', () => {
    const a = pcm(30)
    silencio(a, 20.0, 20.2)
    silencio(a, 23.0, 23.5)
    const { pedacos } = dividirPcm(a, SR, 25)
    expect(Math.abs(pedacos[0].length / SR - 23.25)).toBeLessThan(0.06)
  })
  it('pausa abaixo de 150 ms não conta: plano B (quadro mais quieto) e cortesSemPausa', () => {
    const a = pcm(30)
    silencio(a, 22.0, 22.1) // 100 ms
    const { pedacos, cortesSemPausa } = dividirPcm(a, SR, 25)
    expect(cortesSemPausa).toBe(1)
    expect(Math.abs(pedacos[0].length / SR - 22.05)).toBeLessThan(0.06)
    expect(pedacos.reduce((t, p) => t + p.length, 0)).toBe(a.length)
  })
  it('áudio curto vira um chunk só (sem corte); vazio vira nenhum', () => {
    const curto = dividirPcm(pcm(10), SR, 25)
    expect(curto.pedacos).toHaveLength(1)
    expect(curto.cortesSemPausa).toBe(0)
    expect(dividirPcm(new Float32Array(0), SR, 25)).toEqual({ pedacos: [], cortesSemPausa: 0 })
  })

  const palavras = Array.from({ length: 100 }, (_, i) => `termo${i}`)

  it('1 repetição em 100 palavras = 1,0%: passa o limite (≤ 1,0%); registra decodificador e chunks', async () => {
    const hip = [...palavras.slice(0, 50), palavras[49], ...palavras.slice(50)]
    const recebidas: unknown[] = []
    let n = 0
    const r = await medirEstabilidadeDoLongo({
      texto: palavras.join(' '),
      idioma: 'pt',
      pcm: pcm(60),
      transcrever: async (_parte: Float32Array, _idioma: string, opcoes: unknown) => {
        recebidas.push(opcoes)
        n++
        if (n === 1) return hip.slice(0, 55).join(' ')
        return n === 2 ? hip.slice(55).join(' ') : ''
      },
    })
    expect(r.chunks).toBe(3)
    expect(r.insercoes).toBe(1)
    expect(r.delecoes).toBe(0)
    expect(r.taxa).toBeCloseTo(0.01)
    expect(r.limite).toBe(0.01)
    expect(r.passou).toBe(true)
    expect(r.palavrasNaReferencia).toBe(100)
    // Decode do texto longo SEM supressão de repetição (ela esconderia a falha medida)
    expect(recebidas.every((o) => o === OPCOES_DE_DECODE_LONGO)).toBe(true)
    expect(OPCOES_DE_DECODE_LONGO).toMatchObject({ no_repeat_ngram_size: 0, repetition_penalty: 1 })
    expect(r.decodificador).toMatchObject({ no_repeat_ngram_size: 0, repetition_penalty: 1 })
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

  it('~1500 palavras cortadas SEM partir palavra dão taxa 0 e nenhum corte sem pausa', async () => {
    const total = 1500
    const texto = Array.from({ length: total }, (_, i) => `termo${i}`)
    // cada palavra = rajada de 350 ms; 60 ms entre palavras; pausa de 300 ms a cada 10 palavras
    const rajada = new Float32Array(Math.round(0.35 * SR)).fill(0.3)
    const gap = (s: number) => new Float32Array(Math.round(s * SR))
    const trechos: Float32Array[] = []
    for (let i = 0; i < total; i++) trechos.push(rajada, gap((i + 1) % 10 === 0 ? 0.3 : 0.06))
    const audio = new Float32Array(trechos.reduce((t, x) => t + x.length, 0))
    let pos = 0
    for (const t of trechos) {
      audio.set(t, pos)
      pos += t.length
    }
    let proxima = 0
    // Transcritor falso: cada rajada inteira no chunk vira a próxima palavra (rajada partida contaria dupla)
    const transcrever = async (parte: Float32Array) => {
      const quadro = SR / 100
      let ativo = false
      const saida: string[] = []
      for (let i = 0; i + quadro <= parte.length; i += quadro) {
        let pico = 0
        for (let j = i; j < i + quadro; j++) pico = Math.max(pico, Math.abs(parte[j]))
        const agora = pico > 0.05
        if (agora && !ativo) saida.push(texto[proxima++] ?? 'extra')
        ativo = agora
      }
      return saida.join(' ')
    }
    const r = await medirEstabilidadeDoLongo({ texto: texto.join(' '), idioma: 'pt', pcm: audio, transcrever })
    expect(r.palavrasNaReferencia).toBe(total)
    expect(r.cortesSemPausa).toBe(0)
    expect(r.chunks).toBeGreaterThan(20)
    expect(r.taxa).toBe(0)
    expect(r.passou).toBe(true)
  })
})

describe('montarRegistro (o JSON que vai para o repositório)', () => {
  const r = {
    insercoes: 1,
    delecoes: 2,
    taxa: 0.03,
    palavrasNaReferencia: 100,
    limite: 0.01,
    passou: false,
    chunks: 4,
    cortesSemPausa: 2,
    decodificador: { modelo: 'm', ...OPCOES_DE_DECODE_LONGO },
    hipotese: 'transcrição completa que não pode ir para o repositório',
  }
  const base = {
    motor: 'm1',
    voz: 'v1',
    idioma: 'pt',
    textoId: 'dom-casmurro-longo.txt',
    texto: 'abc',
    audioDuracaoS: 600,
  }
  const reg = montarRegistro({ ...base, r, geradoEm: '2026-10-31T00:00:00.000Z' })

  it('não carrega a transcrição, só campos compactos', () => {
    expect('hipotese' in reg).toBe(false)
    expect(JSON.stringify(reg)).not.toContain('transcrição completa')
    expect(reg).toMatchObject({
      motor: 'm1',
      voz: 'v1',
      idioma: 'pt',
      insercoes: 1,
      delecoes: 2,
      taxa: 0.03,
      passou: false,
      chunks: 4,
      cortesSemPausa: 2,
      audioDuracaoS: 600,
      textoId: 'dom-casmurro-longo.txt',
      textoSha256: createHash('sha256').update('abc').digest('hex'),
    })
    expect(reg.decodificador).toMatchObject({ no_repeat_ngram_size: 0 })
    expect(reg.medidas).toEqual({ porIdioma: { pt: { estabilidade: 0.03 } } })
  })
  it('com cortes sem pausa, avisa que a taxa é limite SUPERIOR', () => {
    expect(reg.notas.join(' ')).toMatch(/limite superior/i)
    const limpo = montarRegistro({ ...base, r: { ...r, cortesSemPausa: 0 }, geradoEm: 'x' })
    expect(limpo.notas.join(' ')).not.toMatch(/limite superior/i)
  })
})

describe('o round-trip mantém o decode de frases curtas', () => {
  it('criarTranscritorDeItens passa OPCOES_DE_DECODE_FRASE ao decodificador', async () => {
    const pasta = pastas.criarPasta('rt-')
    const n = 8000
    const wav = Buffer.alloc(44 + n * 2)
    wav.write('RIFF', 0)
    wav.writeUInt32LE(36 + n * 2, 4)
    wav.write('WAVEfmt ', 8)
    wav.writeUInt32LE(16, 16)
    wav.writeUInt16LE(1, 20)
    wav.writeUInt16LE(1, 22)
    wav.writeUInt32LE(16000, 24)
    wav.writeUInt32LE(32000, 28)
    wav.writeUInt16LE(2, 32)
    wav.writeUInt16LE(16, 34)
    wav.write('data', 36)
    wav.writeUInt32LE(n * 2, 40)
    for (let i = 0; i < n; i++) wav.writeInt16LE(8000, 44 + i * 2)
    writeFileSync(path.join(pasta, 'a.wav'), wav)
    const chamadas: unknown[][] = []
    const transcrever = criarTranscritorDeItens({
      pasta,
      decodificar: async (...args: unknown[]) => {
        chamadas.push(args)
        return 'ola'
      },
    })
    expect(await transcrever({ id: 'a', idioma: 'pt' })).toBe('ola')
    expect(await transcrever({ id: 'ausente', idioma: 'pt' })).toBeNull()
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0][1]).toBe('pt')
    expect(chamadas[0][2]).toBe(OPCOES_DE_DECODE_FRASE)
    expect(OPCOES_DE_DECODE_FRASE).toEqual({ no_repeat_ngram_size: 3, repetition_penalty: 1.15 })
  })

  it('clipe acima da janela do Whisper é cortado em partes e as transcrições são juntadas', async () => {
    const pasta = pastas.criarPasta('rt-longo-')
    const n = 16000 * 40
    const wav = Buffer.alloc(44 + n * 2)
    wav.write('RIFF', 0)
    wav.writeUInt32LE(36 + n * 2, 4)
    wav.write('WAVEfmt ', 8)
    wav.writeUInt32LE(16, 16)
    wav.writeUInt16LE(1, 20)
    wav.writeUInt16LE(1, 22)
    wav.writeUInt32LE(16000, 24)
    wav.writeUInt32LE(32000, 28)
    wav.writeUInt16LE(2, 32)
    wav.writeUInt16LE(16, 34)
    wav.write('data', 36)
    wav.writeUInt32LE(n * 2, 40)
    for (let i = 0; i < n; i++) wav.writeInt16LE(8000, 44 + i * 2)
    writeFileSync(path.join(pasta, 'longo.wav'), wav)
    const duracoes: number[] = []
    const transcrever = criarTranscritorDeItens({
      pasta,
      decodificar: async (pcm: Float32Array) => {
        duracoes.push(pcm.length / 16000)
        return `parte${duracoes.length}`
      },
    })
    expect(await transcrever({ id: 'longo', idioma: 'pt' })).toBe('parte1 parte2')
    expect(Math.max(...duracoes)).toBeLessThanOrEqual(25.001)
  })
})
