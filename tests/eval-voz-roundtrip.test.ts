import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { lerCorpus, LIMIARES_DA_SPEC } from '../scripts/eval-voz/comum.mjs'
import { medirRoundtrip, MIN_CLIPES_PARA_MEDIANA, prepararPcm } from '../scripts/eval-voz/medir-roundtrip.mjs'
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
      invalidos: 0,
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
      invalidos: 0,
    },
    es: {
      cer: 0.01,
      wer: 0.03,
      itensAcerto: 0.95,
      itensNumerosEAnos: 1,
      estabilidade: 0.005,
      foraDaMediana: 0.01,
      semAudio: 0,
      invalidos: 0,
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
      medidasOk({ wer: 0.09, itensAcerto: 0.8, estabilidade: 0.02, foraDaMediana: 0.04, semAudio: 1, invalidos: 2 }),
      LIMIARES_DA_SPEC,
    )
    expect(r.passou).toBe(false)
    expect(r.falhas).toHaveLength(6)
    expect(r.falhas.join(' ')).toMatch(/inválid/)
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

describe('itens numero/ano: casamento exato no sentido numeral', () => {
  const ano: Item['itens'] = [
    {
      texto: '1889',
      tipo: 'ano',
      aceita: ['1889', 'mil oitocentos e oitenta e nove', 'mil e oitocentos e oitenta e nove'],
    },
  ]
  const aceitaTipo = (hip: string, itens: Item['itens'], idioma: 'pt' | 'en' | 'es' = 'pt') =>
    acertoDosItens(hip, itens, idioma).acertos

  it('falsos aceites: número maior que contém o ano NÃO casa', () => {
    expect(aceitaTipo('mil oitocentos e oitenta e nove mil e um', ano)).toBe(0)
    expect(aceitaTipo('onze mil oitocentos e oitenta e nove', ano)).toBe(0)
  })

  it('"cento e vinte e um" não casa "vinte e um"; "vinte e um" não casa "vinte"', () => {
    const vinteEUm: Item['itens'] = [{ texto: '21', tipo: 'numero', aceita: ['vinte e um'] }]
    const vinte: Item['itens'] = [{ texto: '20', tipo: 'numero', aceita: ['vinte'] }]
    expect(aceitaTipo('cento e vinte e um', vinteEUm)).toBe(0)
    expect(aceitaTipo('vinte e um', vinte)).toBe(0)
    expect(aceitaTipo('vinte e um', vinteEUm)).toBe(1)
    expect(aceitaTipo('vinte', vinte)).toBe(1)
  })

  it('verdadeiros positivos: extenso, "mil e", dígitos e dentro de frase maior', () => {
    expect(aceitaTipo('mil oitocentos e oitenta e nove', ano)).toBe(1)
    expect(aceitaTipo('mil e oitocentos e oitenta e nove', ano)).toBe(1)
    expect(aceitaTipo('1889', ano)).toBe(1)
    expect(aceitaTipo('em mil oitocentos e oitenta e nove ele', ano)).toBe(1)
    expect(aceitaTipo('em mil oitocentos e oitenta e nove, a república', ano)).toBe(1)
  })

  it('hora e moeda continuam casando com a própria lista aceita', () => {
    const hora: Item['itens'] = [
      { texto: '7h30', tipo: 'numero', aceita: ['7h30', 'sete horas e trinta', 'sete e trinta'] },
    ]
    const moeda: Item['itens'] = [
      {
        texto: 'R$ 49,90',
        tipo: 'numero',
        aceita: ['R$ 49,90', 'quarenta e nove reais e noventa centavos'],
      },
    ]
    expect(aceitaTipo('o trem sai às sete horas e trinta', hora)).toBe(1)
    expect(aceitaTipo('o trem sai às 7h30', hora)).toBe(1)
    expect(aceitaTipo('sai às sete e trinta e cinco', hora)).toBe(0)
    expect(aceitaTipo('custa quarenta e nove reais e noventa centavos.', moeda)).toBe(1)
    expect(aceitaTipo('custa R$ 49,90, a viagem', moeda)).toBe(1)
  })

  it('en e es: dígito ou palavra de número adjacente reprova', () => {
    const en: Item['itens'] = [{ texto: '1776', tipo: 'ano', aceita: ['1776', 'seventeen seventy six'] }]
    expect(aceitaTipo('in 1776 the town', en, 'en')).toBe(1)
    expect(aceitaTipo('in 17760', en, 'en')).toBe(0)
    expect(aceitaTipo('in 1776 2450', en, 'en')).toBe(0)
    const es: Item['itens'] = [{ texto: '92', tipo: 'numero', aceita: ['noventa y dos'] }]
    expect(aceitaTipo('cuatrocientos noventa y dos', es, 'es')).toBe(0)
    expect(aceitaTipo('el noventa y dos', es, 'es')).toBe(1)
  })

  it('nome e sigla seguem com contenção simples', () => {
    const nome: Item['itens'] = [{ texto: 'Capitu', tipo: 'nome', aceita: ['capitu'] }]
    expect(aceitaTipo('a Capitu vinte e um', nome)).toBe(1)
  })
})

describe('itens numero/ano: vizinhança consciente da referência', () => {
  const ano89: Item['itens'] = [
    {
      texto: '1889',
      tipo: 'ano',
      aceita: ['1889', 'mil oitocentos e oitenta e nove', 'mil e oitocentos e oitenta e nove'],
    },
  ]
  const acerta = (hip: string, itens: Item['itens'], ref: string | undefined, idioma: 'pt' | 'en' | 'es' = 'pt') =>
    acertoDosItens(hip, itens, idioma, ref === undefined ? undefined : { ref }).acertos

  it('numeral correto seguido ou precedido de outro numeral que a referência também tem: acerta', () => {
    expect(
      acerta('em mil oitocentos e oitenta e nove, quatro homens chegaram', ano89, 'Em 1889, quatro homens chegaram.'),
    ).toBe(1)
    expect(acerta('mil oitocentos e oitenta e nove e setenta e seis', ano89, '1889 e 76')).toBe(1)
    expect(acerta('em 1889, 3 homens', ano89, 'Em 1889, 3 homens.')).toBe(1)
    expect(acerta('em 1889 e 1890', ano89, 'Em 1889 e 1890.')).toBe(1)
    expect(acerta('chegaram quatro em mil oitocentos e oitenta e nove', ano89, 'Chegaram quatro em 1889.')).toBe(1)
  })

  it('moeda seguida de outro numeral', () => {
    const moeda: Item['itens'] = [
      { texto: 'R$ 49,90', tipo: 'numero', aceita: ['R$ 49,90', 'quarenta e nove reais e noventa centavos'] },
    ]
    expect(
      acerta('custa quarenta e nove reais e noventa centavos e cinco filhos', moeda, 'Custa R$ 49,90 e 5 filhos.'),
    ).toBe(1)
  })

  it('en e es', () => {
    const en: Item['itens'] = [{ texto: '1984', tipo: 'ano', aceita: ['1984', 'nineteen eighty four'] }]
    expect(acerta('in nineteen eighty four and two men', en, 'In 1984 and two men arrived.', 'en')).toBe(1)
    expect(acerta('in nineteen eighty four and 2 men', en, 'In 1984 and two men arrived.', 'en')).toBe(1)
    const es: Item['itens'] = [{ texto: '1889', tipo: 'ano', aceita: ['1889', 'mil ochocientos ochenta y nueve'] }]
    expect(acerta('en mil ochocientos ochenta y nueve y tres hombres', es, 'En 1889 y tres hombres.', 'es')).toBe(1)
  })

  it('os falsos aceites seguem reprovados MESMO com a referência (vizinho que ela não tem)', () => {
    const ref = 'Em 1889 ele nasceu.'
    expect(acerta('em mil oitocentos e oitenta e nove mil e um ele nasceu', ano89, ref)).toBe(0)
    expect(acerta('em onze mil oitocentos e oitenta e nove ele nasceu', ano89, ref)).toBe(0)
    expect(acerta('em 1889 ele nasceu', ano89, ref)).toBe(1)
    const v21: Item['itens'] = [{ texto: '21', tipo: 'numero', aceita: ['vinte e um'] }]
    const v20: Item['itens'] = [{ texto: '20', tipo: 'numero', aceita: ['vinte'] }]
    expect(acerta('cento e vinte e um', v21, 'Tem 21.')).toBe(0)
    expect(acerta('vinte e um', v20, 'Tem 20.')).toBe(0)
  })

  it('borda de frase: sem vizinho na referência, qualquer numeral vizinho na hipótese reprova', () => {
    expect(acerta('mil oitocentos e oitenta e nove quatro', ano89, 'Em 1889')).toBe(0)
    expect(acerta('quatro mil oitocentos e oitenta e nove', ano89, '1889 chegou')).toBe(0)
  })

  it('vizinho existe na referência mas a hipótese erra o OUTRO número: o item avaliado continua certo', () => {
    // Escolha: só a presença de um numeral do lado certo é comparada, não o valor dele. Errar o vizinho
    // (1890 virar 1990) é falha do item do vizinho, que tem o próprio gabarito; punir aqui contaria o
    // mesmo erro duas vezes.
    expect(acerta('mil oitocentos e oitenta e nove, mil novecentos e noventa', ano89, 'Em 1889, 1890 ...')).toBe(1)
    // Mas o numeral vizinho do lado ERRADO da referência reprova.
    expect(acerta('mil novecentos e noventa, mil oitocentos e oitenta e nove', ano89, 'Em 1889, 1890')).toBe(0)
  })

  it('sem ref o comportamento estrito continua (dois numerais colados reprovam)', () => {
    expect(acerta('em 1889 1776', ano89, undefined)).toBe(0)
    expect(acerta('em 1889 1776', ano89, 'Em 1889 1776')).toBe(1)
  })

  it('item que não aparece na referência: cai no modo estrito', () => {
    expect(acerta('em 1889 1776', ano89, 'Outra frase qualquer.')).toBe(0)
  })

  it('o gabarito do corpus acerta 100% lendo o próprio texto com ref', () => {
    const corpus = lerCorpus(path.resolve(__dirname, '..', 'scripts', 'eval-voz', 'corpus-voz.jsonl')) as Item[]
    for (const c of corpus) {
      // Só numero/ano: o texto escrito de uma sigla ("CPF") não é uma das formas faladas do gabarito.
      const itens = c.itens.filter((i) => i.tipo === 'numero' || i.tipo === 'ano')
      const r = acertoDosItens(c.texto, itens, c.idioma, { ref: c.texto })
      expect(`${c.id}: ${r.acertos}/${r.total}`).toBe(`${c.id}: ${r.total}/${r.total}`)
    }
  })

  it('medirRoundtrip passa o texto do corpus como ref', async () => {
    const item: Item = {
      id: 'pt-v',
      idioma: 'pt',
      texto: 'Em 1889, quatro homens chegaram.',
      categoria: 'x',
      itens: ano89,
    }
    const r = await medirRoundtrip({
      corpus: [item],
      transcrever: async () => 'em mil oitocentos e oitenta e nove quatro homens chegaram',
    })
    expect(r.medidas.porIdioma.pt.itensNumerosEAnos).toBe(1)
  })
})

describe('avaliarContraLimiares: opção ignorar', () => {
  it('por padrão a métrica ausente reprova; com ignorar não é checada', () => {
    const m = medidasOk()
    delete (m.porIdioma.pt as Record<string, number>).estabilidade
    expect(avaliarContraLimiares(m, LIMIARES_DA_SPEC).passou).toBe(false)
    expect(avaliarContraLimiares(m, LIMIARES_DA_SPEC, { ignorar: ['estabilidade'] })).toEqual({
      passou: true,
      falhas: [],
    })
  })
})

describe('WAV inválido não derruba a rodada', () => {
  const wav = (o: {
    bits?: number
    amostras?: number[]
    declarado?: number
    semFmt?: boolean
    semData?: boolean
    formato?: number
  }) => {
    const amostras = o.amostras ?? [0]
    const dados = Buffer.alloc(amostras.length * 2)
    amostras.forEach((a, i) => dados.writeInt16LE(a, i * 2))
    const fmt = Buffer.alloc(24)
    fmt.write('fmt ', 0, 'ascii')
    fmt.writeUInt32LE(16, 4)
    fmt.writeUInt16LE(o.formato ?? 1, 8)
    fmt.writeUInt16LE(1, 10)
    fmt.writeUInt32LE(16000, 12)
    fmt.writeUInt32LE(32000, 16)
    fmt.writeUInt16LE(2, 20)
    fmt.writeUInt16LE(o.bits ?? 16, 22)
    const cab = Buffer.alloc(8)
    cab.write('data', 0, 'ascii')
    cab.writeUInt32LE(o.declarado ?? dados.length, 4)
    const riff = Buffer.alloc(12)
    riff.write('RIFF', 0, 'ascii')
    riff.write('WAVE', 8, 'ascii')
    return Buffer.concat([riff, ...(o.semFmt ? [] : [fmt]), ...(o.semData ? [] : [cab, dados])])
  }
  const fala = Array.from({ length: 1600 }, (_, i) => Math.round(Math.sin(i / 5) * 12000))

  it('prepararPcm aceita WAV bom e devolve PCM 16 kHz', () => {
    const pcm = prepararPcm(wav({ amostras: fala }))
    expect(pcm.length).toBeGreaterThan(1000)
  })

  it.each([
    ['8 bits', wav({ bits: 8, amostras: fala }), /16-bit/],
    ['truncado', wav({ amostras: fala, declarado: 99999 }), /truncad/],
    ['sem fmt', wav({ semFmt: true, amostras: fala }), /fmt/],
    ['sem data', wav({ semData: true }), /data/],
    ['data vazio', wav({ amostras: [] }), /vazi/],
    ['tudo zero', wav({ amostras: new Array(1600).fill(0) }), /vazi|silêncio/],
    ['não é WAV', Buffer.from('nada a ver'), /RIFF/],
    ['formato não PCM', wav({ formato: 3, amostras: fala }), /PCM/],
  ])('prepararPcm rejeita %s com mensagem clara', (_n, buf, re) => {
    expect(() => prepararPcm(buf as Buffer)).toThrow(re as RegExp)
  })

  const corpus: Item[] = ['a', 'b', 'c'].map((n) => ({
    id: `pt-${n}`,
    idioma: 'pt' as const,
    texto: 'um dois tres',
    categoria: 'x',
    itens: [],
  }))

  it('transcritor que lança conta em invalidos, guarda o erro e segue', async () => {
    const r = await medirRoundtrip({
      corpus,
      transcrever: async (it: Item) => {
        if (it.id === 'pt-b') throw new Error('esperado PCM 16-bit, veio 8')
        return it.texto
      },
    })
    expect(r.medidas.porIdioma.pt.invalidos).toBe(1)
    expect(r.medidas.porIdioma.pt.semAudio).toBe(0)
    expect(r.medidas.porIdioma.pt.wer).toBe(0)
    const f = r.frases.find((x: { id: string }) => x.id === 'pt-b')
    expect(f.invalido).toBe(true)
    expect(f.erro).toMatch(/16-bit/)
    expect(
      avaliarContraLimiares(r.medidas, LIMIARES_DA_SPEC, { ignorar: ['estabilidade', 'foraDaMediana'] }).falhas.join(
        ' ',
      ),
    ).toMatch(/inválid/)
  })

  it('invalidos é 0 quando tudo vai bem', async () => {
    const r = await medirRoundtrip({ corpus, transcrever: async (it: Item) => it.texto })
    expect(r.medidas.porIdioma.pt.invalidos).toBe(0)
  })
})

describe('foraDaMediana: mínimo de clipes e comprimento normalizado', () => {
  const faz = (n: number): Item[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `pt-${i}`,
      idioma: 'pt' as const,
      texto: 'aaaaaaaaaa',
      categoria: 'x',
      itens: [],
    }))
  it.each([0, 1, 2, 3])('com %i clipes: só mede a partir de 3', async (n) => {
    const r = await medirRoundtrip({
      corpus: faz(n),
      transcrever: async (it: Item) => it.texto,
      duracaoDe: () => 1,
    })
    if (n === 0) return expect(r.medidas.porIdioma.pt).toBeUndefined()
    if (n < MIN_CLIPES_PARA_MEDIANA) expect(r.medidas.porIdioma.pt.foraDaMediana).toBeUndefined()
    else expect(r.medidas.porIdioma.pt.foraDaMediana).toBe(0)
  })

  it('usa o comprimento do texto normalizado ("R$ 5" vira "cinco reais")', async () => {
    // Texto cru "R$ 5" tem 4 caracteres; normalizado, "cinco reais" tem 11. Duração proporcional
    // ao normalizado (1,1 s) não pode ser outlier contra frases de 10 caracteres em 1 s.
    const corpus: Item[] = [...faz(4), { id: 'pt-x', idioma: 'pt', texto: 'R$ 5', categoria: 'x', itens: [] }]
    const r = await medirRoundtrip({
      corpus,
      transcrever: async (it: Item) => it.texto,
      duracaoDe: (it: Item) => (it.id === 'pt-x' ? 1.1 : 1),
    })
    expect(r.medidas.porIdioma.pt.foraDaMediana).toBe(0)
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
