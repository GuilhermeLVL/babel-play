// @vitest-environment jsdom
/**
 * A NARRAÇÃO DO LEITOR (L3): as frases (Intl.Segmenter) e o caminho frase → Range → CFI → frase, a máquina de
 * estados (tocar, pausar, retomar, frase anterior/seguinte, virar o capítulo), o que cada modo fala e quem pode
 * usar a voz natural da nuvem (critérios 14 e 15 da spec).
 */
import { describe, expect, it } from 'vitest'

import {
  frasesDoTexto,
  mostraConviteDaVozNatural,
  NARRACAO_PARADA,
  narrar,
  passosDaFrase,
  vozDaNarracao,
} from '../src/core/leitura/narracao'
import { TETO_DE_CARACTERES_DA_VOZ } from '../src/core/vozNatural'
import * as CFI from '../src/lib/leitor/foliate/epubcfi.js'
import { comecaDentro, frasesDoDocumento, indiceDaFraseEm, textoDoDocumento } from '../src/lib/leitor/frasesDoCapitulo'

describe('frasesDoTexto', () => {
  it('parte por frase com o Intl.Segmenter, sem o espaço das bordas', () => {
    const texto = '  A raposa viu as uvas. Estavam altas!  Ela foi embora? Sim. '
    const frases = frasesDoTexto(texto, 'pt')
    expect(frases.map((f) => f.texto)).toEqual(['A raposa viu as uvas.', 'Estavam altas!', 'Ela foi embora?', 'Sim.'])
    for (const f of frases) expect(texto.slice(f.inicio, f.fim)).toBe(f.texto)
  })

  it('quebra de linha é fim de frase (parágrafo), e o que não tem letra não é lido', () => {
    const frases = frasesDoTexto('Título\nPrimeira frase sem ponto\n* * *\nOutra.', 'pt')
    expect(frases.map((f) => f.texto)).toEqual(['Título', 'Primeira frase sem ponto', 'Outra.'])
  })

  it('não corta abreviação comum nem número decimal', () => {
    const frases = frasesDoTexto('It cost 3.5 dollars. Then he left.', 'en')
    expect(frases.map((f) => f.texto)).toEqual(['It cost 3.5 dollars.', 'Then he left.'])
  })

  it('frase maior que o teto da voz natural (600) vira pedaços, cada um dentro do teto, sem perder texto', () => {
    const longa = Array.from({ length: 90 }, (_, i) => `palavra${i}, e mais`).join(' ') + '.'
    const frases = frasesDoTexto(longa, 'pt')
    expect(frases.length).toBeGreaterThan(1)
    for (const f of frases) {
      expect(f.texto.length).toBeLessThanOrEqual(TETO_DE_CARACTERES_DA_VOZ)
      expect(longa.slice(f.inicio, f.fim).trim()).toBe(f.texto)
    }
    expect(
      frases
        .map((f) => f.texto)
        .join(' ')
        .replace(/\s+/g, ' '),
    ).toBe(longa)
  })
})

const doc = () =>
  new DOMParser().parseFromString(
    `<html><head><title>Fábulas</title><style>p{}</style></head><body>
      <h2>A raposa e as uvas</h2>
      <p>A hungry fox saw some <em>fine</em> grapes. She jumped<span>!</span> But they were too high.</p>
      <p>"They are sour," she said.</p>
    </body></html>`,
    'text/html',
  )

describe('frases do capítulo (o documento da seção)', () => {
  it('o texto montado separa os blocos e ignora o <head>', () => {
    const { texto } = textoDoDocumento(doc())
    expect(texto).not.toContain('Fábulas')
    expect(texto).not.toContain('p{}')
    expect(texto).toMatch(/A raposa e as uvas\s*\n/)
  })

  it('cada frase vira um Range com exatamente o texto dela, atravessando <em> e <span>', () => {
    const frases = frasesDoDocumento(doc(), 'en')
    expect(frases.map((f) => f.texto)).toEqual([
      'A raposa e as uvas',
      'A hungry fox saw some fine grapes.',
      'She jumped!',
      'But they were too high.',
      '"They are sour," she said.',
    ])
    for (const f of frases) expect(f.range.toString().replace(/\s+/g, ' ').trim()).toBe(f.texto)
  })

  it('frase → CFI → Range → a mesma frase (retomar de onde parou)', () => {
    const d = doc()
    const frases = frasesDoDocumento(d, 'en')
    for (let i = 0; i < frases.length; i++) {
      const cfi = CFI.fromRange(frases[i].range)
      const volta = CFI.toRange(d, CFI.parse(cfi)) as Range
      expect(volta.toString()).toBe(frases[i].range.toString())
      expect(indiceDaFraseEm(frases, volta.startContainer, volta.startOffset)).toBe(i)
    }
  })

  it('do meio de uma frase, começa na seguinte; depois da última, fica na última', () => {
    const frases = frasesDoDocumento(doc(), 'en')
    const r = frases[1].range
    // no meio da 2ª frase ("A hungry fox…")
    expect(indiceDaFraseEm(frases, r.startContainer, r.startOffset + 3)).toBe(2)
    const ultima = frases[frases.length - 1].range
    expect(indiceDaFraseEm(frases, ultima.endContainer, ultima.endOffset)).toBe(frases.length - 1)
  })

  it('comecaDentro: a frase começa no intervalo visível', () => {
    const d = doc()
    const frases = frasesDoDocumento(d, 'en')
    const visivel = d.createRange()
    visivel.setStart(frases[1].range.startContainer, frases[1].range.startOffset)
    visivel.setEnd(frases[2].range.endContainer, frases[2].range.endOffset)
    expect(comecaDentro(frases[0].range, visivel)).toBe(false)
    expect(comecaDentro(frases[1].range, visivel)).toBe(true)
    expect(comecaDentro(frases[2].range, visivel)).toBe(true)
    expect(comecaDentro(frases[3].range, visivel)).toBe(false)
    expect(comecaDentro(frases[3].range, null)).toBe(false)
  })
})

describe('a máquina de estados da narração', () => {
  const com = (total: number) => narrar(NARRACAO_PARADA, { tipo: 'capitulo', total, indice: 0, continuar: false })

  it('tocar destaca a frase; o fim da frase passa para a seguinte; o fim do capítulo vira o capítulo', () => {
    let e = narrar(com(2), { tipo: 'tocar', indice: 0 })
    expect(e).toMatchObject({ fase: 'tocando', indice: 0 })
    e = narrar(e, { tipo: 'fimDaFrase', vez: e.vez })
    expect(e).toMatchObject({ fase: 'tocando', indice: 1 })
    e = narrar(e, { tipo: 'fimDaFrase', vez: e.vez })
    expect(e.fase).toBe('virando')
    // o capítulo novo chega e a leitura continua da primeira frase dele
    e = narrar(e, { tipo: 'capitulo', total: 5, indice: 0, continuar: true })
    expect(e).toMatchObject({ fase: 'tocando', indice: 0, total: 5 })
  })

  it('pausar e retomar continuam da MESMA frase (com fala nova)', () => {
    let e = narrar(com(4), { tipo: 'tocar', indice: 2 })
    const vezTocando = e.vez
    e = narrar(e, { tipo: 'pausar' })
    expect(e).toMatchObject({ fase: 'pausada', indice: 2 })
    e = narrar(e, { tipo: 'retomar' })
    expect(e).toMatchObject({ fase: 'tocando', indice: 2 })
    expect(e.vez).toBeGreaterThan(vezTocando)
    // alternar = o botão tocar/pausar
    expect(narrar(e, { tipo: 'alternar' }).fase).toBe('pausada')
  })

  it('o fim de uma fala VELHA (cancelada, trocada) não avança nada', () => {
    let e = narrar(com(4), { tipo: 'tocar', indice: 0 })
    const velha = e.vez
    e = narrar(e, { tipo: 'proxima' })
    expect(e.indice).toBe(1)
    expect(narrar(e, { tipo: 'fimDaFrase', vez: velha })).toBe(e)
    expect(narrar(e, { tipo: 'erro', vez: velha })).toBe(e)
  })

  it('frase anterior e seguinte, com os limites do capítulo', () => {
    let e = narrar(com(3), { tipo: 'tocar', indice: 0 })
    e = narrar(e, { tipo: 'anterior' })
    expect(e).toMatchObject({ fase: 'tocando', indice: 0 })
    e = narrar(narrar(e, { tipo: 'proxima' }), { tipo: 'proxima' })
    expect(e.indice).toBe(2)
    expect(narrar(e, { tipo: 'proxima' }).fase).toBe('virando')
    // pausada, a seguinte só move o destaque
    const p = narrar(narrar(e, { tipo: 'anterior' }), { tipo: 'pausar' })
    expect(narrar(p, { tipo: 'proxima' })).toMatchObject({ fase: 'pausada', indice: 2 })
  })

  it('erro de voz para na frase (destacada), sem correr pelas outras', () => {
    const e = narrar(com(3), { tipo: 'tocar', indice: 1 })
    expect(narrar(e, { tipo: 'erro', vez: e.vez })).toMatchObject({ fase: 'pausada', indice: 1 })
  })

  it('capítulo sem frase (capa, imagem) continua virando; parar limpa', () => {
    const e = narrar(narrar(com(1), { tipo: 'tocar', indice: 0 }), { tipo: 'proxima' })
    expect(e.fase).toBe('virando')
    expect(narrar(e, { tipo: 'capitulo', total: 0, indice: 0, continuar: true }).fase).toBe('virando')
    expect(narrar(e, { tipo: 'parar' }).fase).toBe('parada')
    // sem frases, tocar não faz nada
    expect(narrar(NARRACAO_PARADA, { tipo: 'tocar', indice: 0 })).toBe(NARRACAO_PARADA)
  })
})

describe('os modos do narrador', () => {
  const o = { idiomaDoLivro: 'en', idiomaDaPessoa: 'pt', traducao: 'A raposa viu as uvas.' }
  it('original, tradução, bilíngue e leitura inteligente', () => {
    expect(passosDaFrase('original', 'The fox saw.', o)).toEqual([{ texto: 'The fox saw.', idioma: 'en' }])
    expect(passosDaFrase('traducao', 'The fox saw.', o)).toEqual([{ texto: 'A raposa viu as uvas.', idioma: 'pt' }])
    expect(passosDaFrase('bilingue', 'The fox saw.', o)).toEqual([
      { texto: 'The fox saw.', idioma: 'en' },
      { texto: 'A raposa viu as uvas.', idioma: 'pt' },
    ])
    expect(passosDaFrase('auto', 'La volpe.', { ...o, detectado: 'it' })).toEqual([
      { texto: 'La volpe.', idioma: 'it' },
    ])
    expect(passosDaFrase('auto', 'The fox.', { ...o, detectado: null })).toEqual([{ texto: 'The fox.', idioma: 'en' }])
  })
  it('sem tradução (falhou, ou o livro já está no idioma da pessoa), cai no original — nunca fica mudo', () => {
    expect(passosDaFrase('traducao', 'The fox.', { ...o, traducao: null })).toEqual([
      { texto: 'The fox.', idioma: 'en' },
    ])
    expect(passosDaFrase('bilingue', 'A raposa.', { ...o, idiomaDoLivro: 'pt-BR' })).toEqual([
      { texto: 'A raposa.', idioma: 'pt-BR' },
    ])
  })
})

describe('a voz da narração: aparelho para todos, nuvem só no pago', () => {
  it('a nuvem exige a escolha, o direito do plano e a flag; o resto é a voz do aparelho', () => {
    expect(vozDaNarracao({ escolheuNuvem: true, temDireito: true, flagLigada: true })).toBe('nuvem')
    expect(vozDaNarracao({ escolheuNuvem: true, temDireito: false, flagLigada: true })).toBe('aparelho')
    expect(vozDaNarracao({ escolheuNuvem: true, temDireito: true, flagLigada: false })).toBe('aparelho')
    expect(vozDaNarracao({ escolheuNuvem: false, temDireito: true, flagLigada: true })).toBe('aparelho')
  })
  it('o convite aos planos nunca aparece para menor (perfil protegido), nem para quem já tem a voz', () => {
    const base = { temDireito: false, flagLigada: true, protegido: false, podeAbrirPlanos: true }
    expect(mostraConviteDaVozNatural(base)).toBe(true)
    expect(mostraConviteDaVozNatural({ ...base, protegido: true })).toBe(false)
    expect(mostraConviteDaVozNatural({ ...base, temDireito: true })).toBe(false)
    expect(mostraConviteDaVozNatural({ ...base, flagLigada: false })).toBe(false)
    expect(mostraConviteDaVozNatural({ ...base, podeAbrirPlanos: false })).toBe(false)
  })
})
