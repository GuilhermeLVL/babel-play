/**
 * IDIOMA DA SESSÃO → cartões, Biblioteca e Jogar (auditoria 2026-09-26).
 *
 * Relato do dono: a sessão capturada em PORTUGUÊS, ao virar prática, era tratada como INGLÊS —
 * cartões lidos com pronúncia inglesa e palavras/frases separadas errado.
 *
 * Causa raiz reproduzida no primeiro bloco: o cartão recebia o idioma do SELETOR
 * (`isSys ? targetLang : sourceLang`), não o da fala detectada. Os demais blocos travam a correção
 * ponta a ponta: segmentação por idioma, idioma da sessão, reparo idempotente dos dados antigos.
 */
import { describe, expect, it } from 'vitest'

import { extractKeywords } from '../src/core/learning/keywords'
import { detectarIdiomaPorTexto } from '../src/core/texto/detectarIdioma'
import { idiomaDoCartao, idiomaDominanteDosCartoes } from '../src/core/texto/idioma'
import { planejarReparoDeIdioma, planoVazio } from '../src/core/texto/reparoDeIdioma'
import { fraseQueContem, frasesDoTexto, palavrasDoTexto } from '../src/core/texto/segmentacao'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'
import {
  idiomaDaFala,
  idiomaDominante,
  idiomaDoVerso,
  palavrasDasFalas,
  parDaSessao,
} from '../src/lib/captura/vocabularioDaSessao'

/** O par do dono: fala português, estuda inglês, e deixou o "Detectar" ligado. */
const PAR = { sourceLang: 'pt-BR', targetLang: 'en-US' }
const FALA_PT = 'Eu não sei se você vai conseguir terminar o trabalho hoje, porque a reunião atrasou muito.'

function fala(parcial: Partial<SpeechSegment>): SpeechSegment {
  return {
    id: 'sys-1', speakerId: 'system', source: 'system', timestamp: '00:00',
    originalText: FALA_PT, translatedText: '', words: [], ...parcial,
  } as SpeechSegment
}

describe('causa raiz: o cartão herdava o idioma do seletor, não o da fala', () => {
  it('REPRODUÇÃO — a regra antiga etiquetava a fala portuguesa do sistema como inglês', () => {
    const s = fala({ lang: 'pt' })
    const regraAntiga = s.source === 'system' ? PAR.targetLang : PAR.sourceLang
    expect(regraAntiga).toBe('en-US') // o defeito: português virava cartão "en"
  })

  it('a fala detectada em português dá cartões em português, com verso em inglês', () => {
    const cartoes = palavrasDasFalas([fala({ lang: 'pt' })], PAR)
    expect(cartoes.length).toBeGreaterThan(0)
    for (const c of cartoes) {
      expect(c.srcLang).toBe('pt-BR')
      expect(c.tgtLang).toBe('en-US')
    }
  })

  it('as palavras são extraídas com as stopwords do português (sem "porque", "você")', () => {
    const palavras = palavrasDasFalas([fala({ lang: 'pt' })], PAR).map((c) => c.word.toLowerCase())
    expect(palavras).not.toContain('porque')
    expect(palavras).not.toContain('você')
    expect(palavras).toContain('reunião')
  })

  it('sem idioma medido, cai no par configurado (sistema = o que se estuda)', () => {
    expect(idiomaDaFala({ source: 'system' }, PAR)).toBe('en-US')
    expect(idiomaDaFala({ source: 'mic' }, PAR)).toBe('pt-BR')
    expect(idiomaDaFala({ source: 'system', lang: 'es' }, PAR)).toBe('es-ES')
  })

  it('o verso é o OUTRO idioma do par, mesmo quando o sistema fala o idioma da pessoa', () => {
    expect(idiomaDoVerso({ source: 'system', lang: 'en' }, PAR)).toBe('pt-BR')
    expect(idiomaDoVerso({ source: 'system', lang: 'pt' }, PAR)).toBe('en-US')
    expect(idiomaDoVerso({ source: 'mic', lang: 'pt' }, PAR)).toBe('en-US')
  })

  it('a mesma sessão em inglês continua dando cartões em inglês', () => {
    const cartoes = palavrasDasFalas(
      [fala({ lang: 'en', originalText: 'The meeting was delayed because everybody arrived late.' })],
      PAR,
    )
    expect(cartoes.every((c) => c.srcLang === 'en-US' && c.tgtLang === 'pt-BR')).toBe(true)
    expect(cartoes.map((c) => c.word.toLowerCase())).toContain('meeting')
  })

  it('o contexto do cartão é a FRASE que contém a palavra, não a fala inteira', () => {
    const [c] = palavrasDasFalas(
      [fala({ lang: 'pt', originalText: 'Hoje choveu bastante. A reunião atrasou muito.' })],
      PAR,
    ).filter((x) => x.word === 'reunião')
    expect(c.sentence).toBe('A reunião atrasou muito.')
  })
})

describe('idioma da sessão (Biblioteca) = o dominante das falas', () => {
  it('pesa por palavras e devolve o par do conteúdo', () => {
    const falas = [
      { sourceLang: 'pt-BR', sourceText: FALA_PT },
      { sourceLang: 'en-US', sourceText: 'ok' },
    ]
    expect(idiomaDominante(falas)).toBe('pt-BR')
    expect(parDaSessao(falas, PAR)).toEqual({ sourceLang: 'pt-BR', targetLang: 'en-US' })
    expect(parDaSessao([{ sourceLang: 'en', sourceText: 'hello there my friend' }], PAR)).toEqual({
      sourceLang: 'en',
      targetLang: 'pt-BR',
    })
  })

  it('sem idioma em fala nenhuma, mantém o par configurado', () => {
    expect(parDaSessao([{ sourceLang: null, sourceText: 'x' }], PAR)).toEqual(PAR)
  })

  it('Jogar lê o idioma do cartão e o dominante da gravação, sem default para inglês', () => {
    expect(idiomaDoCartao({ srcLang: 'pt-BR' })).toBe('pt')
    expect(idiomaDoCartao({ srcLang: null })).toBe('')
    expect(idiomaDominanteDosCartoes([{ srcLang: 'pt' }, { srcLang: 'pt-BR' }, { srcLang: 'en' }])).toBe('pt')
    expect(idiomaDominanteDosCartoes([])).toBe('')
  })
})

describe('segmentação por idioma (Intl.Segmenter)', () => {
  it('palavras sem pontuação nem número solto', () => {
    expect(palavrasDoTexto('Olá, mundo! São 3 horas.', 'pt')).toEqual(['Olá', 'mundo', 'São', 'horas'])
  })

  it('português: composto fica inteiro, clítico sai, elisão sai', () => {
    expect(palavrasDoTexto('o guarda-chuva', 'pt')).toContain('guarda-chuva')
    expect(palavrasDoTexto('dá-me isso', 'pt')).toContain('dá')
    expect(palavrasDoTexto('vou fazê-lo', 'pt')).toContain('fazer')
    expect(palavrasDoTexto('dar-lhe-ei', 'pt')).toEqual(['darei'])
    expect(palavrasDoTexto("copo d'água", 'pt')).toContain('água')
  })

  it('inglês: contração fica inteira, possessivo sai', () => {
    expect(palavrasDoTexto("I don't know John's car", 'en')).toEqual(['I', "don't", 'know', 'John', 'car'])
  })

  it('japonês é separado em palavras (a regex antiga devolvia a frase inteira)', () => {
    const p = palavrasDoTexto('私は日本語を勉強しています。', 'ja')
    expect(p.length).toBeGreaterThan(3)
    expect(p).toContain('日本語')
    expect(extractKeywords('私は日本語を勉強しています。', { lang: 'ja' })).toContain('日本語')
  })

  it('frases: abreviação não corta, pontuação final sim', () => {
    expect(frasesDoTexto('O Dr. Silva chegou. Você viu? Sim!', 'pt')).toEqual(['O Dr. Silva chegou.', 'Você viu?', 'Sim!'])
    expect(frasesDoTexto('今日は晴れです。明日は雨です。', 'ja')).toEqual(['今日は晴れです。', '明日は雨です。'])
  })

  it('fraseQueContem acha a frase da palavra e devolve o texto inteiro quando não acha', () => {
    expect(fraseQueContem('Primeira frase aqui. Segunda com palavra.', 'palavra', 'pt')).toBe('Segunda com palavra.')
    expect(fraseQueContem('Uma só frase', 'outra', 'pt')).toBe('Uma só frase')
  })
})

describe('reparo dos dados antigos (idempotente, nunca apaga)', () => {
  const dados = () => ({
    sessoes: [{ id: 's1', sourceLang: 'pt-BR', targetLang: 'en-US' }],
    falas: [
      // Gravada antes de fix/idioma-detectado: português etiquetado como inglês.
      { id: 'f1', sessionId: 's1', sourceLang: 'en', sourceText: FALA_PT },
      { id: 'f2', sessionId: 's1', sourceLang: 'pt-BR', sourceText: 'Não tem problema nenhum, a gente faz isso amanhã com calma.' },
    ],
    cartoes: [
      { id: 'c1', word: 'reunião', sentence: FALA_PT, srcLang: 'en-US', tgtLang: 'pt-BR', sessionId: 's1' },
      { id: 'c2', word: 'amanhã', sentence: 'amanhã', srcLang: 'en-US', tgtLang: 'pt-BR', sessionId: 's1' },
      // Cartão manual: não é material capturado, o reparo não mexe.
      { id: 'c3', word: 'casa', sentence: FALA_PT, srcLang: 'en', tgtLang: 'pt', sessionId: null },
    ],
  })

  it('o detector do núcleo reconhece a fala portuguesa com confiança', () => {
    const d = detectarIdiomaPorTexto(FALA_PT)
    expect(d?.lang).toBe('pt')
    expect(d!.confidence).toBeGreaterThanOrEqual(0.5)
  })

  it('reetiqueta fala e cartões para português e troca o verso para inglês', () => {
    const plano = planejarReparoDeIdioma(dados())
    expect(plano.falas).toEqual([{ id: 'f1', de: 'en', para: 'pt' }])
    expect(plano.cartoes.map((c) => [c.id, c.srcPara, c.tgtPara])).toEqual([
      ['c1', 'pt', 'en-US'],
      // Frase curta demais para detectar: vale a FALA que contém a frase (em português).
      ['c2', 'pt', 'en-US'],
    ])
    expect(plano.sessoes).toEqual([])
  })

  it('aplicado uma vez, o plano seguinte sai vazio', () => {
    const d = dados()
    const plano = planejarReparoDeIdioma(d)
    for (const t of plano.falas) d.falas.find((f) => f.id === t.id)!.sourceLang = t.para
    for (const t of plano.cartoes) Object.assign(d.cartoes.find((c) => c.id === t.id)!, { srcLang: t.srcPara, tgtLang: t.tgtPara })
    expect(planoVazio(planejarReparoDeIdioma(d))).toBe(true)
  })

  it('a sessão gravada com o idioma do seletor passa a ter o idioma do conteúdo', () => {
    const plano = planejarReparoDeIdioma({
      sessoes: [{ id: 's2', sourceLang: 'pt-BR', targetLang: 'en-US' }],
      falas: [{ id: 'f9', sessionId: 's2', sourceLang: 'en', sourceText: 'The meeting was delayed because they did not arrive on time' }],
      cartoes: [],
    })
    expect(plano.sessoes).toEqual([{ id: 's2', sourceDe: 'pt-BR', sourcePara: 'en', targetDe: 'en-US', targetPara: 'pt-BR' }])
  })

  it('sem evidência (texto curto, sessão mista) não toca em nada', () => {
    const plano = planejarReparoDeIdioma({
      sessoes: [{ id: 's3', sourceLang: 'en', targetLang: 'pt' }],
      falas: [
        { id: 'a', sessionId: 's3', sourceLang: 'en', sourceText: 'ok' },
        { id: 'b', sessionId: 's3', sourceLang: 'pt', sourceText: 'tá' },
      ],
      cartoes: [{ id: 'x', word: 'thing', sentence: 'thing', srcLang: 'en', tgtLang: 'pt', sessionId: 's3' }],
    })
    expect(plano.falas).toEqual([])
    expect(plano.cartoes).toEqual([])
  })
})
