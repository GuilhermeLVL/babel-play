import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { LIMIARES_DA_SPEC } from '../scripts/eval-voz/comum.mjs'
import { medirRoundtrip } from '../scripts/eval-voz/medir-roundtrip.mjs'
import {
  acertoDosItens,
  avaliarContraLimiares,
  medirTrecho,
  normalizarParaComparar,
} from '../scripts/eval-voz/metricas.mjs'

type Item = {
  id: string
  idioma: 'pt' | 'en' | 'es'
  texto: string
  categoria: string
  itens: { texto: string; aceita: string[]; tipo: 'nome' | 'numero' | 'sigla' | 'ano' }[]
}

const medidasOk = (pt: Record<string, number> = {}) => ({
  porIdioma: {
    pt: {
      cer: 0.01,
      wer: 0.03,
      itensAcerto: 0.95,
      itensNumerosEAnos: 1,
      estabilidade: 0.005,
      foraDaMediana: 0.01,
      semAudio: 0,
      ...pt,
    },
    en: {
      cer: 0.01,
      wer: 0.03,
      itensAcerto: 0.95,
      itensNumerosEAnos: 1,
      estabilidade: 0.005,
      foraDaMediana: 0.01,
      semAudio: 0,
    },
    es: {
      cer: 0.01,
      wer: 0.03,
      itensAcerto: 0.95,
      itensNumerosEAnos: 1,
      estabilidade: 0.005,
      foraDaMediana: 0.01,
      semAudio: 0,
    },
  },
})

describe('normalizarParaComparar / medirTrecho', () => {
  it('(a) números e moeda por extenso dos dois lados dão WER 0', () => {
    expect(medirTrecho('em 1889', 'em mil oitocentos e oitenta e nove', 'pt').wer).toBe(0)
    expect(medirTrecho('R$ 5', 'cinco reais', 'pt').wer).toBe(0)
  })

  it('mantém o acento (WER é sensível a ele)', () => {
    expect(normalizarParaComparar('Está aqui.', 'pt')).toBe('está aqui')
    expect(medirTrecho('está aqui', 'esta aqui', 'pt').wer).toBe(0.5)
  })

  it('(b) 10 palavras com uma trocada dá WER 0,10 exato', () => {
    const ref = 'um dois tres quatro cinco seis sete oito nove dez'
    const hip = 'um dois tres quatro cinco seis sete oito nove onze'
    expect(medirTrecho(ref, hip, 'pt').wer).toBe(0.1)
  })

  it('referência vazia não dá NaN nem divisão por zero', () => {
    expect(medirTrecho('', '', 'pt')).toEqual({ wer: 0, cer: 0 })
    const r = medirTrecho('', 'algo inventado', 'pt')
    expect(Number.isFinite(r.wer)).toBe(true)
    expect(Number.isFinite(r.cer)).toBe(true)
    expect(r.wer).toBe(1)
  })

  it('em en e es só valem as regras neutras: "1889" continua "1889"', () => {
    expect(normalizarParaComparar('in 1889', 'en')).toBe('in 1889')
    expect(normalizarParaComparar('en 1889', 'es')).toBe('en 1889')
    expect(medirTrecho('in 1889', 'in eighteen eighty nine', 'en').wer).toBe(3 / 2)
  })
})

describe('acertoDosItens', () => {
  const itens: Item['itens'] = [
    { texto: 'Capitu', aceita: ['Capitu'], tipo: 'nome' },
    { texto: '1889', aceita: ['1889', 'mil oitocentos e oitenta e nove'], tipo: 'ano' },
  ]

  it('(c) nome errado conta 0/1; ano em dígitos ou por extenso conta 1/1', () => {
    const errado = acertoDosItens('Capitão disse que foi em 1889', itens.slice(0, 1))
    expect(errado).toEqual({ acertos: 0, total: 1, porTipo: { nome: [0, 1] } })
    expect(acertoDosItens('em 1889', itens.slice(1)).acertos).toBe(1)
    const r = acertoDosItens('em mil oitocentos e oitenta e nove', itens.slice(1))
    expect(r).toEqual({ acertos: 1, total: 1, porTipo: { ano: [1, 1] } })
  })

  it('agrupa por tipo e soma o total', () => {
    const r = acertoDosItens('Capitu viu 1889', itens)
    expect(r.acertos).toBe(2)
    expect(r.total).toBe(2)
    expect(r.porTipo).toEqual({ nome: [1, 1], ano: [1, 1] })
  })

  it('casa ignorando acento: dostoiévski / dostoievski', () => {
    const it1: Item['itens'] = [{ texto: 'Dostoiévski', aceita: ['Dostoiévski'], tipo: 'nome' }]
    expect(acertoDosItens('li dostoievski ontem', it1).acertos).toBe(1)
    expect(acertoDosItens('li Dostoiévski ontem', it1).acertos).toBe(1)
  })

  it('casa por fronteira de palavra: "un" não acerta dentro de "algum"', () => {
    const it1: Item['itens'] = [{ texto: 'un', aceita: ['un'], tipo: 'sigla' }]
    expect(acertoDosItens('algum junto', it1).acertos).toBe(0)
    expect(acertoDosItens('o un chegou', it1).acertos).toBe(1)
  })

  it('sequência de várias palavras casa só contígua e em ordem', () => {
    const it1: Item['itens'] = [{ texto: 'Dom Casmurro', aceita: ['dom casmurro'], tipo: 'nome' }]
    expect(acertoDosItens('casmurro dom', it1).acertos).toBe(0)
    expect(acertoDosItens('dom e casmurro', it1).acertos).toBe(0)
    expect(acertoDosItens('livro Dom Casmurro, de Machado', it1).acertos).toBe(1)
  })

  it('sem itens: 0/0', () => {
    expect(acertoDosItens('qualquer', [])).toEqual({ acertos: 0, total: 0, porTipo: {} })
  })
})

describe('avaliarContraLimiares', () => {
  it('aprova medidas dentro dos limiares', () => {
    expect(avaliarContraLimiares(medidasOk(), LIMIARES_DA_SPEC)).toEqual({ passou: true, falhas: [] })
  })

  it('(d) CER 3,0% em pt passa (sem erro de ponto flutuante) e 3,1% reprova', () => {
    expect(avaliarContraLimiares(medidasOk({ cer: 0.03 }), LIMIARES_DA_SPEC).passou).toBe(true)
    expect(avaliarContraLimiares(medidasOk({ cer: 0.1 * 0.3 }), LIMIARES_DA_SPEC).passou).toBe(true)
    const r = avaliarContraLimiares(medidasOk({ cer: 0.031 }), LIMIARES_DA_SPEC)
    expect(r.passou).toBe(false)
    expect(r.falhas).toHaveLength(1)
    expect(r.falhas[0]).toMatch(/pt/)
    expect(r.falhas[0]).toMatch(/CER/)
    expect(r.falhas[0]).toMatch(/3,1/)
    expect(r.falhas[0]).toMatch(/3,0/)
  })

  it('reprova números e anos abaixo de 100%', () => {
    const r = avaliarContraLimiares(medidasOk({ itensNumerosEAnos: 0.99 }), LIMIARES_DA_SPEC)
    expect(r.passou).toBe(false)
    expect(r.falhas[0]).toMatch(/números e anos/)
  })

  it('reprova WER, itens, estabilidade, fora da mediana e frases sem áudio', () => {
    const r = avaliarContraLimiares(
      medidasOk({ wer: 0.09, itensAcerto: 0.8, estabilidade: 0.02, foraDaMediana: 0.04, semAudio: 1 }),
      LIMIARES_DA_SPEC,
    )
    expect(r.passou).toBe(false)
    expect(r.falhas).toHaveLength(5)
  })

  it('métrica ainda não medida (estabilidade) reprova em vez de passar calada', () => {
    const m = medidasOk()
    delete (m.porIdioma.pt as Record<string, number>).estabilidade
    const r = avaliarContraLimiares(m, LIMIARES_DA_SPEC)
    expect(r.passou).toBe(false)
    expect(r.falhas[0]).toMatch(/não medid/)
  })

  it('limiares da spec: en e es por idioma', () => {
    expect(LIMIARES_DA_SPEC.pt.cerMax).toBe(0.03)
    expect(LIMIARES_DA_SPEC.en.cerMax).toBe(0.02)
    expect(LIMIARES_DA_SPEC.es.werMax).toBe(0.07)
    expect(LIMIARES_DA_SPEC.en.itensAcertoMin).toBe(0.9)
  })
})

describe('medirRoundtrip (orquestração com transcritor falso)', () => {
  const corpus: Item[] = [
    {
      id: 'pt-1',
      idioma: 'pt',
      texto: 'Capitu nasceu em 1889.',
      categoria: 'a',
      itens: [
        { texto: 'Capitu', aceita: ['Capitu'], tipo: 'nome' },
        { texto: '1889', aceita: ['1889', 'mil oitocentos e oitenta e nove'], tipo: 'ano' },
      ],
    },
    { id: 'pt-2', idioma: 'pt', texto: 'um dois tres quatro cinco seis sete oito nove dez', categoria: 'b', itens: [] },
    { id: 'en-1', idioma: 'en', texto: 'The old house stood alone.', categoria: 'a', itens: [] },
  ]

  it('transcrição perfeita dá WER/CER 0 e itens 100%', async () => {
    const r = await medirRoundtrip({ corpus, transcrever: async (it: Item) => it.texto })
    expect(r.medidas.porIdioma.pt.wer).toBe(0)
    expect(r.medidas.porIdioma.pt.cer).toBe(0)
    expect(r.medidas.porIdioma.pt.itensAcerto).toBe(1)
    expect(r.medidas.porIdioma.pt.itensNumerosEAnos).toBe(1)
    expect(r.medidas.porIdioma.pt.semAudio).toBe(0)
    expect(r.medidas.porIdioma.en.wer).toBe(0)
    expect(r.frases).toHaveLength(3)
  })

  it('transcrição corrompida dá o WER esperado (agregado ponderado por palavras)', async () => {
    const r = await medirRoundtrip({
      corpus: corpus.slice(1, 2),
      transcrever: async () => 'um dois tres quatro cinco seis sete oito nove onze',
    })
    expect(r.medidas.porIdioma.pt.wer).toBe(0.1)
  })

  it('WAV ausente conta em semAudio e não derruba nem entra no WER', async () => {
    const r = await medirRoundtrip({
      corpus,
      transcrever: async (it: Item) => (it.id === 'pt-2' ? null : it.texto),
    })
    expect(r.medidas.porIdioma.pt.semAudio).toBe(1)
    expect(r.medidas.porIdioma.pt.wer).toBe(0)
    expect(r.frases.find((f: { id: string }) => f.id === 'pt-2').semAudio).toBe(true)
    expect(avaliarContraLimiares(r.medidas, LIMIARES_DA_SPEC).falhas.join(' ')).toMatch(/sem áudio/)
  })

  it('itens: ano errado derruba números e anos', async () => {
    const r = await medirRoundtrip({
      corpus: corpus.slice(0, 1),
      transcrever: async () => 'Capitu nasceu em mil novecentos',
    })
    expect(r.medidas.porIdioma.pt.itensNumerosEAnos).toBe(0)
    expect(r.medidas.porIdioma.pt.itensAcerto).toBe(0.5)
  })

  it('duração fora de ±30% da mediana (por caractere) entra em foraDaMediana', async () => {
    const c: Item[] = [1, 2, 3, 4, 5].map((n) => ({
      id: `pt-${n}`,
      idioma: 'pt' as const,
      texto: 'aaaaaaaaaa',
      categoria: 'x',
      itens: [],
    }))
    const dur: Record<string, number> = { 'pt-1': 1, 'pt-2': 1, 'pt-3': 1, 'pt-4': 1, 'pt-5': 2 }
    const r = await medirRoundtrip({
      corpus: c,
      transcrever: async (it: Item) => it.texto,
      duracaoDe: (it: Item) => dur[it.id],
    })
    expect(r.medidas.porIdioma.pt.foraDaMediana).toBe(0.2)
  })
})

describe('CLI medir-roundtrip', () => {
  const cli = path.resolve(__dirname, '..', 'scripts', 'eval-voz', 'medir-roundtrip.mjs')
  const rodar = (...args: string[]) =>
    spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], { encoding: 'utf8' })

  it('exige --motor, --voz e --entrada com erro claro', () => {
    const r = rodar()
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/--motor/)
  })

  it('recusa pasta de entrada inexistente', () => {
    const r = rodar('--motor', 'm', '--voz', 'v', '--entrada', path.join(tmpdir(), 'nao-existe-xyz'))
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/entrada/)
  })

  it('recusa motor com caractere de caminho', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rt-'))
    writeFileSync(path.join(dir, 'x.txt'), '')
    const r = rodar('--motor', '../x', '--voz', 'v', '--entrada', dir)
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/--motor/)
  })
})
