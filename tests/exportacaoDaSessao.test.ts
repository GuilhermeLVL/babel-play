import { computeTextStats } from '@core'
import { describe, expect, it } from 'vitest'

import {
  type EntradaDoRelatorio,
  montarModeloDoRelatorio,
  nomeDoArquivo,
  titulolimpo,
} from '../src/lib/exportacao/modeloDoRelatorio'
import { esc, paraHtmlImprimivel } from '../src/lib/exportacao/paraHtmlImprimivel'
import { celulaMd, conversaParaTxt, palavrasParaCsv, paraMarkdown } from '../src/lib/exportacao/paraMarkdown'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function entrada(p: Partial<EntradaDoRelatorio> = {}): EntradaDoRelatorio {
  const falas = [
    {
      original: 'We need to reconcile the budget | now',
      translation: 'Precisamos conciliar o orçamento',
      lang: 'en',
      speaker: 'Ana',
      time: '0:05',
      startTime: 5,
      index: 0,
    },
    {
      original: 'The budget is ready, mañana',
      translation: 'O orçamento está pronto',
      lang: 'en',
      speaker: 'Beto',
      time: '0:20',
      startTime: 20,
      index: 1,
      polida: 'Está pronto, amanhã',
    },
  ]
  const texto = falas.map((f) => f.original).join(' ')
  return {
    sessao: {
      id: 's1',
      titulo: 'Reunião de alinhamento: 3º trimestre!',
      tipo: 'audio',
      data: 'Hoje',
      duracao: '1:30',
      idiomaOrigem: 'en',
      idiomaDestino: 'pt',
    },
    falas,
    falasCruas: [
      { tStartMs: 5000, tEndMs: 9000, speakerName: 'Ana' },
      { tStartMs: 20000, tEndMs: 26000, speakerName: 'Beto' },
    ],
    textoCompleto: texto,
    idioma: 'en',
    estatisticas: computeTextStats(texto, 'en'),
    metricas: {
      ppm: 90,
      pausasLongas: 1,
      vicios: null,
      silencio: { ms: 11000, pct: 52 },
      monologoMs: 6000,
      sobreposicao: null,
      palavrasChave: ['reconcile'],
      ritmoPorFalante: [{ nome: 'Ana', ppm: 120 }],
    },
    cartoes: [
      {
        word: 'budget',
        translation: 'orçamento',
        cefrLevel: 'B1',
        sourceSessionId: 's1',
        inDeck: true,
        reps: 3,
        fsrsStability: 5,
        lastReview: Date.now() - 86_400_000,
      },
      { word: 'ready', translation: 'pronto', sourceSessionId: 'outra', inDeck: true },
    ],
    anotacoes: [{ id: 'a', type: 'frase', textIndex: 1, tipo: 'duvida', createdAt: 1 }],
    desenhos: [],
    geradoEm: new Date(2026, 9, 2, 12, 0, 0),
    ...p,
  }
}

describe('nome do arquivo', () => {
  it('tira acento e símbolo, mantém a data', () => {
    expect(titulolimpo('Reunião de alinhamento: 3º trimestre!')).toBe('reuniao-de-alinhamento-3º-trimestre')
    expect(nomeDoArquivo('Aula', new Date(2026, 0, 5))).toBe('babel-play-aula-2026-01-05')
  })
  it('mantém árabe e CJK; título vazio vira "sessao"', () => {
    expect(titulolimpo('محادثة 日本語')).toBe('محادثة-日本語')
    expect(titulolimpo('!!!')).toBe('sessao')
  })
})

describe('modelo do relatório', () => {
  it('monta cabeçalho, conversa, palavras e novas', () => {
    const m = montarModeloDoRelatorio(entrada())
    expect(m.cabecalho.duracao).toBe('1:30')
    expect(m.cabecalho.falantes).toEqual(['Ana', 'Beto'])
    expect(m.conversa).toHaveLength(2)
    expect(m.conversa[1].polida).toBe('Está pronto, amanhã')
    expect(m.palavras.map((p) => p.palavra).sort()).toEqual(['budget', 'ready'])
    const budget = m.palavras.find((p) => p.palavra === 'budget')!
    expect(budget.vezes).toBe(2)
    expect(budget.onde).toBe('0:05, 0:20')
    expect(budget.revisao).toContain('3')
    const novas = m.palavrasNovas
    expect(novas.find((p) => p.palavra === 'budget')?.estado).toBe('adicionada')
    expect(novas.find((p) => p.palavra === 'ready')).toBeUndefined()
    expect(novas.some((p) => p.estado === 'nova' && p.palavra === 'reconcile')).toBe(true)
    expect(m.notas[0].trecho).toBe('The budget is ready, mañana')
  })

  it('métrica sem dado diz que não há, em vez de inventar', () => {
    const m = montarModeloDoRelatorio(entrada({ metricas: { ...entrada().metricas, ppm: null, silencio: null } }))
    const ppm = m.metricas.itens.find((i) => i.rotulo === 'Palavras por minuto')!
    expect(ppm.valor).toBe('—')
    expect(ppm.nota).toBe('requer timing das falas')
  })

  it('sem palavras e sem transcrição não quebra', () => {
    const m = montarModeloDoRelatorio(
      entrada({
        falas: [],
        falasCruas: [],
        textoCompleto: '',
        cartoes: [],
        anotacoes: [],
        estatisticas: computeTextStats('', 'en'),
      }),
    )
    expect(m.palavras).toEqual([])
    expect(m.palavrasNovas).toEqual([])
    const md = paraMarkdown(m)
    expect(md).toContain('Nenhuma palavra nova nesta sessão.')
    expect(md).toContain('Esta sessão não tem transcrição.')
  })

  it('seções desligadas somem', () => {
    const m = montarModeloDoRelatorio(entrada(), { secoes: { conversa: false, metricas: false } })
    const md = paraMarkdown(m)
    expect(md).not.toContain('## Conversa')
    expect(md).not.toContain('## Resumo e métricas')
    expect(md).toContain('## Palavras')
  })
})

describe('markdown', () => {
  it('escapa pipe, mantém acentos e a conversa em blocos', () => {
    const md = paraMarkdown(montarModeloDoRelatorio(entrada()))
    expect(md).toContain('# Reunião de alinhamento: 3º trimestre!')
    expect(md).toContain('> We need to reconcile the budget | now')
    expect(md).toContain('> Precisamos conciliar o orçamento')
    expect(md).toContain('| budget | orçamento | B1 |')
    expect(md).not.toContain('## Desenhos')
    expect(celulaMd('a|b\nc')).toBe('a\\|b<br>c')
  })

  it('desenho entra como imagem base64 embutida', () => {
    const m = montarModeloDoRelatorio(
      entrada({ desenhos: [{ rotulo: 'Desenho da leitura', png: PNG, largura: 1, altura: 1 }] }),
    )
    const md = paraMarkdown(m)
    expect(md).toContain('## Desenhos')
    expect(md).toContain(`![Desenho da leitura](${PNG})`)
  })

  it('árabe e CJK passam intactos', () => {
    const falas = [
      {
        original: 'مرحبا بالعالم',
        translation: '你好，世界',
        lang: 'ar',
        speaker: '-',
        time: '',
        startTime: 0,
        index: 0,
      },
    ]
    const m = montarModeloDoRelatorio(entrada({ falas, falasCruas: [{}], textoCompleto: 'مرحبا بالعالم', cartoes: [] }))
    expect(paraMarkdown(m)).toContain('> 你好，世界')
    expect(conversaParaTxt(m)).toContain('مرحبا بالعالم')
    const html = paraHtmlImprimivel(m)
    expect(html).toContain('مرحبا بالعالم')
    expect(html).toContain('dir="auto"')
  })

  it('CSV de palavras tem BOM e aspas', () => {
    const csv = palavrasParaCsv(montarModeloDoRelatorio(entrada()).palavras, false)
    expect(csv.startsWith('﻿Palavra,')).toBe(true)
    expect(csv).toContain('budget,orçamento,B1,')
  })
})

describe('página imprimível', () => {
  it('tem acento, @page com número de página e desenho na proporção', () => {
    const m = montarModeloDoRelatorio(entrada({ desenhos: [{ rotulo: 'D1', png: PNG, largura: 800, altura: 400 }] }))
    const html = paraHtmlImprimivel(m)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('counter(page)')
    expect(html).toContain('width="800" height="400"')
    expect(html).toContain('orçamento')
    expect(html).toContain('We need to reconcile the budget | now')
  })
  it('escapa HTML', () => {
    expect(esc('<b>&"')).toBe('&lt;b&gt;&amp;&quot;')
    const html = paraHtmlImprimivel(
      montarModeloDoRelatorio(entrada({ sessao: { ...entrada().sessao, titulo: '<script>x</script>' } })),
    )
    expect(html).not.toContain('<script>x')
  })
})
