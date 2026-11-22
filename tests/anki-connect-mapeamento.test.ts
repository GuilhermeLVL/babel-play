// @vitest-environment jsdom
/** O mapeamento do cartão do Frasy para a nota do Anki (`src/core/anki/paraAnkiConnect.ts`) e as preferências. */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  escaparHtml,
  etiquetasDaNota,
  limparTexto,
  mapeamentoPadrao,
  mapeamentoUsavel,
  montarNotaParaAnki,
  TETO_DO_CAMPO,
} from '../src/core/anki/paraAnkiConnect'
import {
  CHAVE_DA_CHAVE_DO_ANKI,
  CHAVE_DAS_PREFS_DO_ANKI,
  gravarChaveDoAnki,
  gravarPrefsDoAnki,
  lerChaveDoAnki,
  lerPrefsDoAnki,
} from '../src/lib/anki/ankiConnectPrefs'

describe('escape e limpeza', () => {
  it('escapa & < > e nada mais', () => {
    expect(escaparHtml(`a & b < c > "d" 'e'`)).toBe(`a &amp; b &lt; c &gt; "d" 'e'`)
  })
  it('tira controle, apara e corta no teto', () => {
    expect(limparTexto('  oi\u0000\u0007 mundo\n ')).toBe('oi mundo')
    expect(limparTexto('x'.repeat(TETO_DO_CAMPO + 50))).toHaveLength(TETO_DO_CAMPO)
    expect(limparTexto(42)).toBe('')
  })
})

describe('etiquetas', () => {
  it('as do cartão + frasy, sem espaço, sem vazio, sem repetir', () => {
    expect(etiquetasDaNota(['B1', 'minha lista', '', ' ', 'FRASY', 'b1'])).toEqual(['B1', 'minha_lista', 'FRASY'])
    expect(etiquetasDaNota(undefined)).toEqual(['frasy'])
  })
})

describe('mapeamentoPadrao', () => {
  it('Basic: Front = palavra, Back = verso (tradução + contexto)', () => {
    expect(mapeamentoPadrao(['Front', 'Back'])).toEqual({ Front: 'palavra', Back: 'verso' })
  })
  it('português e campos extras reconhecidos pelo nome', () => {
    expect(mapeamentoPadrao(['Frente', 'Verso', 'Exemplo', 'Nota', 'Nível', 'Extra'])).toEqual({
      Frente: 'palavra',
      Verso: 'verso',
      Exemplo: 'frase',
      Nota: 'nota',
      Nível: 'nivel',
      Extra: 'nenhum',
    })
  })
  it('sem nomes conhecidos: 1º campo palavra, 2º verso; um campo só = palavra', () => {
    expect(mapeamentoPadrao(['A', 'B', 'C'])).toEqual({ A: 'palavra', B: 'verso', C: 'nenhum' })
    expect(mapeamentoPadrao(['Único'])).toEqual({ Único: 'palavra' })
    expect(mapeamentoPadrao([])).toEqual({})
  })
  it('usável só com algum campo de conteúdo', () => {
    expect(mapeamentoUsavel({ A: 'nenhum', B: 'nota' })).toBe(false)
    expect(mapeamentoUsavel({ A: 'nenhum', B: 'traducao' })).toBe(true)
  })
})

describe('montarNotaParaAnki', () => {
  const alvo = (mapeamento: Record<string, never> | Parameters<typeof montarNotaParaAnki>[1]['mapeamento']) => ({
    deckName: 'D',
    modelName: 'M',
    mapeamento,
  })

  it('Basic com contexto: palavra em negrito dentro de itálico; palavra inteira, sem caixa', () => {
    const r = montarNotaParaAnki(
      { palavra: 'run', traducao: 'correr', frase: 'Runs and RUN, but not running.' },
      alvo({ Front: 'palavra', Back: 'verso' }),
    )
    expect(r.ok && r.nota.fields.Back).toBe('correr<br><br><i>Runs and <b>RUN</b>, but not running.</i>')
  })

  it('sem frase, o verso é só a tradução', () => {
    const r = montarNotaParaAnki({ palavra: 'a', traducao: 'b' }, alvo({ Front: 'palavra', Back: 'verso' }))
    expect(r.ok && r.nota.fields).toEqual({ Front: 'a', Back: 'b' })
  })

  it('campos por papel: tradução, frase, nota e nível; "nenhum" fica vazio', () => {
    const r = montarNotaParaAnki(
      { palavra: 'cat', traducao: 'gato', frase: 'a cat', nota: 'n<1>', nivel: 'A1' },
      alvo({ P: 'palavra', T: 'traducao', F: 'frase', N: 'nota', L: 'nivel', X: 'nenhum' }),
    )
    expect(r.ok && r.nota.fields).toEqual({
      P: 'cat',
      T: 'gato',
      F: '<i>a <b>cat</b></i>',
      N: 'n&lt;1&gt;',
      L: 'A1',
      X: '',
    })
  })

  it('cloze: a palavra vira {{c1::…}} na frase escapada; sem a palavra na frase a nota é recusada', () => {
    const ok = montarNotaParaAnki(
      { palavra: 'fast', traducao: 'rápido', frase: 'It is <so> fast.' },
      alvo({ Text: 'cloze', Extra: 'traducao' }),
    )
    expect(ok.ok && ok.nota.fields).toEqual({ Text: 'It is &lt;so&gt; {{c1::fast}}.', Extra: 'rápido' })
    const sem = montarNotaParaAnki(
      { palavra: 'slow', traducao: 'lento', frase: 'It is fast.' },
      alvo({ Text: 'cloze' }),
    )
    expect(sem).toEqual({ ok: false, motivo: 'sem-lacuna' })
    expect(montarNotaParaAnki({ palavra: 'slow', traducao: 'x' }, alvo({ Text: 'cloze' }))).toEqual({
      ok: false,
      motivo: 'sem-lacuna',
    })
  })

  it('palavra com caracteres de regex não quebra a busca', () => {
    const r = montarNotaParaAnki({ palavra: 'c++ (x)', traducao: 't', frase: 'use c++ (x) now' }, alvo({ B: 'verso' }))
    expect(r.ok && r.nota.fields.B).toBe('t<br><br><i>use <b>c++ (x)</b> now</i>')
  })

  it('sem palavra não há nota; as opções impedem duplicata no baralho', () => {
    expect(montarNotaParaAnki({ palavra: ' ', traducao: 'x' }, alvo({ F: 'palavra' }))).toEqual({
      ok: false,
      motivo: 'sem-palavra',
    })
    const r = montarNotaParaAnki({ palavra: 'a', traducao: 'b', etiquetas: ['B2'] }, alvo({ F: 'palavra' }))
    expect(r.ok && r.nota.options).toEqual({ allowDuplicate: false, duplicateScope: 'deck' })
    expect(r.ok && r.nota.tags).toEqual(['B2', 'frasy'])
  })
})

describe('preferências no aparelho', () => {
  beforeEach(() => localStorage.clear())

  it('gravam e leem; lixo e papéis desconhecidos são descartados', () => {
    gravarPrefsDoAnki({ baralho: 'Frasy', modelo: 'Basic', mapeamentos: { Basic: { Front: 'palavra' } } })
    expect(lerPrefsDoAnki()).toEqual({
      baralho: 'Frasy',
      modelo: 'Basic',
      mapeamentos: { Basic: { Front: 'palavra' } },
    })
    localStorage.setItem(
      CHAVE_DAS_PREFS_DO_ANKI,
      JSON.stringify({ baralho: 7, modelo: 'M', mapeamentos: { M: { A: 'palavra', B: 'hackeado' }, N: 5 } }),
    )
    expect(lerPrefsDoAnki()).toEqual({ baralho: '', modelo: 'M', mapeamentos: { M: { A: 'palavra' } } })
    localStorage.setItem(CHAVE_DAS_PREFS_DO_ANKI, '{quebrado')
    expect(lerPrefsDoAnki().modelo).toBe('')
  })
})

describe('chave do AnkiConnect no aparelho', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('por padrão só em sessionStorage; "lembrar" move para o localStorage; nunca nas preferências', () => {
    gravarChaveDoAnki(' abc ', false)
    expect(sessionStorage.getItem(CHAVE_DA_CHAVE_DO_ANKI)).toBe('abc')
    expect(localStorage.getItem(CHAVE_DA_CHAVE_DO_ANKI)).toBeNull()
    expect(lerChaveDoAnki()).toEqual({ chave: 'abc', lembrar: false })
    gravarChaveDoAnki('abc', true)
    expect(localStorage.getItem(CHAVE_DA_CHAVE_DO_ANKI)).toBe('abc')
    expect(sessionStorage.getItem(CHAVE_DA_CHAVE_DO_ANKI)).toBeNull()
    expect(lerChaveDoAnki()).toEqual({ chave: 'abc', lembrar: true })
    gravarPrefsDoAnki({ baralho: 'F', modelo: 'M', mapeamentos: {} })
    expect(localStorage.getItem(CHAVE_DAS_PREFS_DO_ANKI)).not.toContain('abc')
    gravarChaveDoAnki('', true)
    expect(lerChaveDoAnki()).toEqual({ chave: '', lembrar: false })
  })
})
