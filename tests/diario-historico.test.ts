// @vitest-environment jsdom
/**
 * O HISTÓRICO LOCAL DO DIÁRIO (openspec `diario-com-correcao-que-vira-cartao`, tarefa 3.3): grava, lista da mais nova à mais
 * antiga, respeita o teto, apaga tudo, e a TROCA DE CONTA neste aparelho apaga entradas e rascunho. Sem IndexedDB, grava
 * `false` e segue.
 */
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  apagarODiario,
  criarHistoricoDoDiario,
  type EntradaDoDiario,
  gravarRascunhoDoDiario,
  historicoDoDiario,
  lerRascunhoDoDiario,
} from '../src/lib/diario/historico'
import { _reiniciarIdentidade, definirIdentidade } from '../src/lib/identidade'

const entrada = (id: string, em: number): EntradaDoDiario => ({
  id,
  em,
  idioma: 'en',
  texto: `texto ${id}`,
  retorno: null,
  cartoes: [],
  descartados: [],
})

describe('o histórico local', () => {
  it('grava, troca a de mesmo id e lista da mais nova à mais antiga', async () => {
    const h = criarHistoricoDoDiario({ fabrica: new IDBFactory() })
    expect(await h.gravar(entrada('a', 1))).toBe(true)
    expect(await h.gravar(entrada('b', 3))).toBe(true)
    expect(await h.gravar(entrada('c', 2))).toBe(true)
    expect(await h.gravar({ ...entrada('a', 1), texto: 'a de novo' })).toBe(true)
    const lista = await h.listar()
    expect(lista.map((e) => e.id)).toEqual(['b', 'c', 'a'])
    expect(lista[2].texto).toBe('a de novo')
  })

  it('acima do teto, sai a mais antiga', async () => {
    const h = criarHistoricoDoDiario({ fabrica: new IDBFactory(), teto: 3 })
    for (let i = 1; i <= 5; i++) await h.gravar(entrada(`e${i}`, i))
    expect((await h.listar()).map((e) => e.id)).toEqual(['e5', 'e4', 'e3'])
  })

  it('recusa entrada sem id ou sem texto; "apagar tudo" esvazia', async () => {
    const h = criarHistoricoDoDiario({ fabrica: new IDBFactory() })
    expect(await h.gravar({ ...entrada('', 1) })).toBe(false)
    expect(await h.gravar({ ...entrada('x', 1), texto: '' })).toBe(false)
    await h.gravar(entrada('a', 1))
    await h.apagarTudo()
    expect(await h.listar()).toEqual([])
  })

  it('sem IndexedDB: grava false, lista vazia, e nada quebra', async () => {
    const h = criarHistoricoDoDiario({ fabrica: null })
    expect(await h.gravar(entrada('a', 1))).toBe(false)
    expect(await h.listar()).toEqual([])
    await h.apagarTudo()
  })
})

describe('trocar de conta apaga o diário deste aparelho', () => {
  beforeEach(async () => {
    _reiniciarIdentidade()
    await apagarODiario()
    localStorage.clear()
  })

  it('o histórico e o rascunho somem quando a identidade muda (e o rascunho vive só no aparelho)', async () => {
    definirIdentidade('anonimo')
    const h = historicoDoDiario()
    await h.gravar(entrada('a', 1))
    gravarRascunhoDoDiario('um rascunho')
    expect(lerRascunhoDoDiario()).toBe('um rascunho')
    definirIdentidade('conta')
    await new Promise((r) => setTimeout(r, 20))
    expect(await h.listar()).toEqual([])
    expect(lerRascunhoDoDiario()).toBe('')
  })

  it('"Apagar o diário" limpa o histórico e o rascunho', async () => {
    const h = historicoDoDiario()
    await h.gravar(entrada('a', 1))
    gravarRascunhoDoDiario('outro')
    await apagarODiario()
    expect(await h.listar()).toEqual([])
    expect(lerRascunhoDoDiario()).toBe('')
  })
})
