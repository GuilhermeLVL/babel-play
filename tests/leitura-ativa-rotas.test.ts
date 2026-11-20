/**
 * AS ROTAS DA LEITURA ATIVA (spec `leitura-ativa-acesso`): `/leitura` (o catálogo) e `/leitura/<textoId>` (um
 * texto), com ida e volta; um id sem forma de id cai no catálogo; e nada colide com `/sessao/<id>/leitura`, a aba
 * Leitura da Sessão (view `reading`).
 */
import { describe, expect, it } from 'vitest'

import { estadoParaUrl, urlParaEstado } from '../src/lib/rotas'

describe('rotas da Leitura ativa', () => {
  it('o catálogo e um texto', () => {
    expect(estadoParaUrl({ view: 'leituraAtiva' })).toBe('/leitura')
    expect(estadoParaUrl({ view: 'leituraAtiva', textoId: 'a2-o-onibus-errado' })).toBe('/leitura/a2-o-onibus-errado')
  })

  it('ida e volta', () => {
    for (const caminho of ['/leitura', '/leitura/a2-o-onibus-errado', '/leitura/b1-a-viagem-de-trem']) {
      expect(estadoParaUrl(urlParaEstado(caminho))).toBe(caminho)
    }
    expect(urlParaEstado('/leitura/a2-o-onibus-errado')).toEqual({
      view: 'leituraAtiva',
      textoId: 'a2-o-onibus-errado',
    })
  })

  it('id sem forma de id cai no catálogo, nunca no 404', () => {
    expect(urlParaEstado('/leitura/%3Cscript%3E')).toEqual({ view: 'leituraAtiva' })
    expect(estadoParaUrl({ view: 'leituraAtiva', textoId: '../../etc' })).toBe('/leitura')
  })

  it('não colide com a aba Leitura da Sessão', () => {
    expect(urlParaEstado('/sessao/abc/leitura')).toEqual({ view: 'analysis', sessionId: 'abc', subTab: 'reading' })
    expect(estadoParaUrl({ view: 'analysis', sessionId: 'abc', subTab: 'reading' })).toBe('/sessao/abc/leitura')
  })

  it('debaixo de /app é a mesma rota', () => {
    expect(urlParaEstado('/app/leitura/a1-no-mercado')).toEqual({ view: 'leituraAtiva', textoId: 'a1-no-mercado' })
  })
})
