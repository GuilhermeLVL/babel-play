// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  passaNoFiltro, filtroAplicavel, fonteDominante, filtroDaFonte, FILTRO_PADRAO,
  type FiltroDaPratica, type CartaoFiltravel,
} from '../src/core/minigames/filtro'
import type { FonteDeItens } from '../src/core/minigames/source'
import { gravarFonteGuardada } from '../src/lib/fonteDaPratica'
import { lerFiltroGuardado, gravarFiltro } from '../src/lib/filtroDaPratica'

function cartao(overrides: Partial<CartaoFiltravel> = {}): CartaoFiltravel {
  return { srcLang: 'en', translation: 'water', sentence: 'I drink water.', ...overrides }
}

function filtro(overrides: Partial<FiltroDaPratica> = {}): FiltroDaPratica {
  return { ...FILTRO_PADRAO, ...overrides, recorte: { ...FILTRO_PADRAO.recorte, ...overrides.recorte }, midia: { ...FILTRO_PADRAO.midia, ...overrides.midia } }
}

describe('passaNoFiltro — fontes: união dentro da faceta', () => {
  it('baralho sem recorte de deck = acervo geral (!daTrilha)', () => {
    expect(passaNoFiltro(cartao({ daTrilha: false }), filtro({ fontes: ['baralho'] }))).toBe(true)
    expect(passaNoFiltro(cartao({ daTrilha: true }), filtro({ fontes: ['baralho'] }))).toBe(false)
  })

  it('baralho com deck escolhido: sem baralhosAnki não passa (degradação honesta)', () => {
    const f = filtro({ fontes: ['baralho'], baralhos: ['d1'] })
    expect(passaNoFiltro(cartao({ daTrilha: false }), f)).toBe(false)
    expect(passaNoFiltro(cartao({ daTrilha: false, baralhosAnki: ['d2'] }), f)).toBe(false)
    expect(passaNoFiltro(cartao({ daTrilha: false, baralhosAnki: ['d1', 'd2'] }), f)).toBe(true)
  })

  it('sessao: exige sourceSessionId; sessoes vazio aceita qualquer uma', () => {
    const f = filtro({ fontes: ['sessao'] })
    expect(passaNoFiltro(cartao({ sourceSessionId: 's1' }), f)).toBe(true)
    expect(passaNoFiltro(cartao({}), f)).toBe(false)
  })

  it('sessao com lista: só as escolhidas', () => {
    const f = filtro({ fontes: ['sessao'], sessoes: ['s1'] })
    expect(passaNoFiltro(cartao({ sourceSessionId: 's1' }), f)).toBe(true)
    expect(passaNoFiltro(cartao({ sourceSessionId: 's2' }), f)).toBe(false)
  })

  it('trilha: exige daTrilha', () => {
    const f = filtro({ fontes: ['trilha'] })
    expect(passaNoFiltro(cartao({ daTrilha: true }), f)).toBe(true)
    expect(passaNoFiltro(cartao({ daTrilha: false }), f)).toBe(false)
  })

  it('UNIÃO entre membros: baralho OU sessao — qualquer um dos dois já basta', () => {
    const f = filtro({ fontes: ['baralho', 'sessao'] })
    expect(passaNoFiltro(cartao({ daTrilha: false }), f)).toBe(true)
    expect(passaNoFiltro(cartao({ daTrilha: true, sourceSessionId: 's1' }), f)).toBe(true)
    expect(passaNoFiltro(cartao({ daTrilha: true }), f)).toBe(false)
  })
})

describe('passaNoFiltro — idiomas', () => {
  it('vazio = sem filtro', () => {
    expect(passaNoFiltro(cartao({ srcLang: 'fr' }), filtro())).toBe(true)
  })
  it('baseLang: pt-BR casa com pt', () => {
    expect(passaNoFiltro(cartao({ srcLang: 'pt-BR' }), filtro({ idiomas: ['pt'] }))).toBe(true)
    expect(passaNoFiltro(cartao({ srcLang: 'en' }), filtro({ idiomas: ['pt'] }))).toBe(false)
  })
})

describe('passaNoFiltro — recorte: cada flag INTERSECTA', () => {
  it('dificeis exige idDoCartao no ranking', () => {
    const f = filtro({ recorte: { dificeis: true } })
    const ranking = new Set(['c1'])
    expect(passaNoFiltro(cartao(), f, { rankingDificeis: ranking, idDoCartao: 'c1' })).toBe(true)
    expect(passaNoFiltro(cartao(), f, { rankingDificeis: ranking, idDoCartao: 'c2' })).toBe(false)
    expect(passaNoFiltro(cartao(), f)).toBe(false) // sem extras, conservador
  })

  it('nuncaVistas x pedindoRevisao: mutuamente exclusivos por construção', () => {
    const nunca = filtro({ recorte: { nuncaVistas: true } })
    const revisao = filtro({ recorte: { pedindoRevisao: true } })
    expect(passaNoFiltro(cartao({ dueAtMs: null }), nunca)).toBe(true)
    expect(passaNoFiltro(cartao({ dueAtMs: 100 }), nunca)).toBe(false)
    expect(passaNoFiltro(cartao({ dueAtMs: 100 }), revisao, { agora: 200 })).toBe(true)
    expect(passaNoFiltro(cartao({ dueAtMs: 300 }), revisao, { agora: 200 })).toBe(false)
    expect(passaNoFiltro(cartao({ dueAtMs: null }), revisao, { agora: 200 })).toBe(false)
  })

  it('interseção: as duas flags juntas nunca casam o mesmo cartão', () => {
    const f = filtro({ recorte: { nuncaVistas: true, pedindoRevisao: true } })
    expect(passaNoFiltro(cartao({ dueAtMs: null }), f, { agora: 200 })).toBe(false)
    expect(passaNoFiltro(cartao({ dueAtMs: 100 }), f, { agora: 200 })).toBe(false)
  })

  it('niveis: UNIÃO interna à faceta', () => {
    const f = filtro({ recorte: { niveis: ['A1', 'A2'] } })
    expect(passaNoFiltro(cartao({ cefrLevel: 'A1' }), f)).toBe(true)
    expect(passaNoFiltro(cartao({ cefrLevel: 'A2' }), f)).toBe(true)
    expect(passaNoFiltro(cartao({ cefrLevel: 'B1' }), f)).toBe(false)
    expect(passaNoFiltro(cartao({}), f)).toBe(false)
  })
})

describe('passaNoFiltro — mídia', () => {
  it('comTraducao/comFrase exigem conteúdo não vazio', () => {
    const f = filtro({ midia: { comTraducao: true, comFrase: true } })
    expect(passaNoFiltro(cartao({ translation: 'x', sentence: 'y' }), f)).toBe(true)
    expect(passaNoFiltro(cartao({ translation: '', sentence: 'y' }), f)).toBe(false)
    expect(passaNoFiltro(cartao({ translation: 'x', sentence: '  ' }), f)).toBe(false)
  })
})

describe('FILTRO_PADRAO ≡ comportamento de hoje ("As minhas palavras/todas")', () => {
  it('acervo geral e sessões passam, trilha não', () => {
    expect(passaNoFiltro(cartao({ daTrilha: false }), FILTRO_PADRAO)).toBe(true)
    expect(passaNoFiltro(cartao({ daTrilha: true, sourceSessionId: 's1' }), FILTRO_PADRAO)).toBe(true) // via 'sessao'
    expect(passaNoFiltro(cartao({ daTrilha: true }), FILTRO_PADRAO)).toBe(false)
  })
})

describe('filtroAplicavel — degradação honesta do recorte por baralho', () => {
  it('sem baralhos escolhidos: sempre aplicável', () => {
    expect(filtroAplicavel([cartao()], filtro()).aplicavel).toBe(true)
  })
  it('baralhos escolhidos mas payload sem baralhosAnki: NÃO aplicável', () => {
    const r = filtroAplicavel([cartao(), cartao()], filtro({ baralhos: ['d1'] }))
    expect(r.aplicavel).toBe(false)
    expect(r.motivo).toBeTruthy()
  })
  it('baralhos escolhidos e ao menos um cartão com baralhosAnki: aplicável', () => {
    const r = filtroAplicavel([cartao(), cartao({ baralhosAnki: ['d1'] })], filtro({ baralhos: ['d1'] }))
    expect(r.aplicavel).toBe(true)
  })
  it('conjunto vazio: aplicável (nada para degradar)', () => {
    expect(filtroAplicavel([], filtro({ baralhos: ['d1'] })).aplicavel).toBe(true)
  })
})

describe('fonteDominante / filtroDaFonte — round-trip das 4 fontes atuais', () => {
  const casos: FonteDeItens[] = [
    { id: 'baralho', lang: 'en' },
    { id: 'sessao', lang: 'en', sessionId: 's1' },
    { id: 'trilha', lang: 'en', nivel: 'B1' },
    { id: 'dificeis', lang: 'en' },
  ]
  for (const x of casos) {
    it(`round-trip: ${x.id}`, () => {
      expect(fonteDominante(filtroDaFonte(x))).toEqual(x)
    })
  }

  it('multi-fonte cai em baralho — sem casa exclusiva que preserve as duas', () => {
    const f = filtro({ fontes: ['baralho', 'sessao'], idiomas: ['en'] })
    expect(fonteDominante(f)).toEqual({ id: 'baralho', lang: 'en' })
  })
})

describe('lerFiltroGuardado / gravarFiltro — persistência e migração', () => {
  beforeEach(() => localStorage.clear())

  it('sem nenhuma chave: FILTRO_PADRAO (via migração da legada vazia)', () => {
    const f = lerFiltroGuardado([], [])
    expect(f.fontes).toEqual(['baralho'])
  })

  it('migração: gravacoes/todas → baralho', () => {
    gravarFonteGuardada({ origem: 'gravacoes', escopo: 'todas' })
    expect(lerFiltroGuardado([], []).fontes).toEqual(['baralho'])
  })

  it('migração: gravacoes/uma → sessao + sessoes', () => {
    gravarFonteGuardada({ origem: 'gravacoes', escopo: 'uma', sessionId: 's1' })
    const f = lerFiltroGuardado(['s1'], [])
    expect(f.fontes).toEqual(['sessao'])
    expect(f.sessoes).toEqual(['s1'])
  })

  it('migração: trilha → trilha + nivelTrilha', () => {
    gravarFonteGuardada({ origem: 'trilha', escopo: 'todas', nivel: 'B1' })
    const f = lerFiltroGuardado([], [])
    expect(f.fontes).toEqual(['trilha'])
    expect(f.nivelTrilha).toBe('B1')
  })

  it('migração: dificeis → baralho + recorte.dificeis', () => {
    gravarFonteGuardada({ origem: 'dificeis', escopo: 'todas' })
    const f = lerFiltroGuardado([], [])
    expect(f.fontes).toEqual(['baralho'])
    expect(f.recorte.dificeis).toBe(true)
  })

  it('gravarFiltro grava a chave nova e sanitiza na leitura seguinte', () => {
    gravarFiltro(filtro({ fontes: ['sessao'], sessoes: ['s1', 's2'] }))
    const f = lerFiltroGuardado(['s1'], [])
    expect(f.sessoes).toEqual(['s1']) // s2 foi apagada, sai da lista
  })

  it('sessão/deck apagados saem da lista salva', () => {
    gravarFiltro(filtro({ fontes: ['baralho'], baralhos: ['d1', 'd2'] }))
    const f = lerFiltroGuardado([], ['d1'])
    expect(f.baralhos).toEqual(['d1'])
  })

  it('lista de fontes vazia após saneamento cai para FILTRO_PADRAO', () => {
    localStorage.setItem('babel.filtro_da_pratica', JSON.stringify({ versao: 1, fontes: ['lixo'], baralhos: [], sessoes: [], idiomas: [], recorte: {}, midia: {} }))
    expect(lerFiltroGuardado([], [])).toEqual(FILTRO_PADRAO)
  })

  it('gravarFiltro espelha a legada (rollback por um release)', () => {
    gravarFiltro(filtro({ fontes: ['trilha'], nivelTrilha: 'A2' }))
    expect(localStorage.getItem('babel.fonte_da_pratica')).toBeTruthy()
    const legada = JSON.parse(localStorage.getItem('babel.fonte_da_pratica')!)
    expect(legada.origem).toBe('trilha')
    expect(legada.nivel).toBe('A2')
  })

  it('storage corrompido cai para o padrão', () => {
    localStorage.setItem('babel.filtro_da_pratica', '{not json')
    expect(lerFiltroGuardado([], [])).toEqual(FILTRO_PADRAO)
  })
})
