/**
 * O MODELO DA ANOTAÇÃO DO LEITOR (L2): validação (cliente tolerante, servidor estrito), a citação com
 * o entorno, a mesclagem da sincronização, a ordem de leitura, a reancoragem pela citação (critério
 * 9 da spec) e a ida e volta pelo W3C Web Annotation.
 */
import { describe, expect, it } from 'vitest'

import {
  type AnotacaoDeLeitura,
  anotacoesVivas,
  citacaoDe,
  COR_DO_TIPO,
  ehLivroTrazido,
  MAX_CITACAO,
  mesclarAnotacoes,
  novaAnotacao,
  passosDoCfi,
  validarAnotacao,
} from '../src/core/leitura/anotacao'
import { colecaoW3C, CONTEXTO_W3C, deWebAnnotation, paraWebAnnotation } from '../src/core/leitura/exportar'
import { acharCitacao, ancorar } from '../src/core/leitura/reancorar'

const TEXTO = 'Era uma vez um gato. O gato dormia. Um dia, o gato acordou e foi embora.'

const base = (extra: Partial<AnotacaoDeLeitura> = {}): AnotacaoDeLeitura =>
  novaAnotacao({
    id: 'anotacao-0001',
    livroId: 'arq:abc123',
    tipo: 'grifo',
    cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:10)',
    citacao: citacaoDe(TEXTO, 21, 35),
    agora: 1000,
    ...extra,
  } as never) as AnotacaoDeLeitura

describe('citacaoDe', () => {
  it('guarda o exact e até 32 caracteres de cada lado', () => {
    const c = citacaoDe(TEXTO, 21, 35)
    expect(c.exact).toBe('O gato dormia.')
    expect(c.prefix).toBe('Era uma vez um gato. ')
    expect(c.suffix.length).toBeLessThanOrEqual(32)
    expect(TEXTO.slice(35).startsWith(c.suffix)).toBe(true)
  })

  it(`corta o exact em ${MAX_CITACAO} caracteres (livro trazido: o servidor não vira cópia da obra)`, () => {
    const longo = 'á'.repeat(800)
    expect(Array.from(citacaoDe(longo, 0, 800).exact)).toHaveLength(MAX_CITACAO)
  })
})

describe('validarAnotacao', () => {
  it('datas: com agora, nada passa de agora + 1 dia; negativa nunca; o estrito recusa apagadoEm malformado', () => {
    const agora = 10_000_000
    const ok = { ...base(), atualizadoEm: agora + 3_600_000 }
    expect(validarAnotacao(ok, { estrito: true, agora }).ok).toBe(true)
    expect(
      validarAnotacao({ ...base(), atualizadoEm: agora + 2 * 86_400_000 }, { estrito: true, agora }),
    ).toMatchObject({
      ok: false,
      code: 'data_no_futuro',
    })
    expect(validarAnotacao({ ...base(), apagadoEm: agora + 2 * 86_400_000 }, { agora })).toMatchObject({ ok: false })
    expect(validarAnotacao({ ...base(), criadoEm: -1 }, { estrito: true, agora })).toMatchObject({ ok: false })
    expect(validarAnotacao({ ...base(), apagadoEm: 'ontem' }, { estrito: true })).toMatchObject({ ok: false })
    expect(ehLivroTrazido('arq:x') && ehLivroTrazido('meu-x') && !ehLivroTrazido('cat:x')).toBe(true)
  })

  it('a nova anotação sai normalizada, com a cor do tipo', () => {
    expect(base().cor).toBe(COR_DO_TIPO.grifo)
    expect(base({ tipo: 'nota' }).cor).toBe(COR_DO_TIPO.nota)
    const n = novaAnotacao({
      id: 'anotacao-0002',
      livroId: 'arq:abc',
      tipo: 'nota',
      cfi: '',
      citacao: { exact: 'x y', prefix: '', suffix: '' },
      nota: 'minha nota',
      agora: 5,
    })
    expect(n).toMatchObject({ cor: 'azul', nota: 'minha nota', apagadoEm: null })
  })

  it('o servidor recusa citação longa; o cliente corta', () => {
    const a = { ...base(), alvo: { ...base().alvo, citacao: { exact: 'x'.repeat(501), prefix: '', suffix: '' } } }
    expect(validarAnotacao(a, { estrito: true })).toMatchObject({ ok: false, code: 'citacao_longa' })
    const r = validarAnotacao(a)
    expect(r.ok && r.anotacao.alvo.citacao.exact.length).toBe(500)
  })

  it('recusa o que não tem forma: id, livro, tipo, CFI, âncora, datas, palavra vazia', () => {
    const a = base()
    expect(validarAnotacao({ ...a, id: 'x' })).toMatchObject({ code: 'id_invalido' })
    expect(validarAnotacao({ ...a, livroId: 'a b/c' })).toMatchObject({ code: 'livro_invalido' })
    expect(validarAnotacao({ ...a, tipo: 'audio' })).toMatchObject({ code: 'tipo_invalido' })
    expect(validarAnotacao({ ...a, alvo: { ...a.alvo, cfi: '/6/4' } })).toMatchObject({ code: 'cfi_invalido' })
    expect(
      validarAnotacao({ ...a, alvo: { cfi: '', citacao: { exact: '  ', prefix: '', suffix: '' } } }),
    ).toMatchObject({ code: 'sem_ancora' })
    expect(validarAnotacao({ ...a, criadoEm: -1 })).toMatchObject({ code: 'datas_invalidas' })
    expect(validarAnotacao({ ...a, tipo: 'palavra', palavra: '' })).toMatchObject({ code: 'palavra_vazia' })
    expect(validarAnotacao(null)).toMatchObject({ code: 'anotacao_invalida' })
  })

  it('a lápide sem conteúdo (como o servidor a guarda) é válida; viva sem âncora não', () => {
    const a = base()
    const lapide = { ...a, nota: '', alvo: { cfi: '', citacao: { exact: '', prefix: '', suffix: '' } }, apagadoEm: 9 }
    expect(validarAnotacao(lapide, { estrito: true }).ok).toBe(true)
    expect(validarAnotacao({ ...lapide, tipo: 'palavra' }, { estrito: true }).ok).toBe(true)
    expect(validarAnotacao({ ...lapide, apagadoEm: null })).toMatchObject({ code: 'sem_ancora' })
  })

  it('tira caracteres de controle e cor desconhecida volta à do tipo', () => {
    const r = validarAnotacao({ ...base(), nota: 'a\u0000b\nc', cor: 'roxo' })
    expect(r.ok && r.anotacao.nota).toBe('ab\nc')
    expect(r.ok && r.anotacao.cor).toBe('amarelo')
  })
})

describe('mesclarAnotacoes (sincronização)', () => {
  it('última escrita vence; lápide mais nova apaga; edição mais nova ressuscita', () => {
    const a = base()
    const editadaDepois = { ...a, nota: 'nova', atualizadoEm: 2000 }
    expect(mesclarAnotacoes([a], [editadaDepois])[0].nota).toBe('nova')
    const apagada = { ...a, apagadoEm: 3000 }
    expect(mesclarAnotacoes([editadaDepois], [apagada])[0].apagadoEm).toBe(3000)
    const ressuscitada = { ...a, nota: 'voltei', atualizadoEm: 4000 }
    const m = mesclarAnotacoes([apagada], [ressuscitada])[0]
    expect(m.nota).toBe('voltei')
    expect(anotacoesVivas([apagada])).toHaveLength(0)
  })

  it('empate fica com o lado local', () => {
    const a = base()
    expect(mesclarAnotacoes([{ ...a, nota: 'local' }], [{ ...a, nota: 'remota' }])[0].nota).toBe('local')
  })
})

describe('ordem de leitura', () => {
  it('compara os passos do CFI', () => {
    expect(passosDoCfi('epubcfi(/6/4!/4/2,/1:0,/1:10)')).toEqual([6, 4, 4, 2, 1, 0])
    const depois = base({ id: 'anotacao-0003', cfi: 'epubcfi(/6/8!/4/2/1:3)' } as never)
    const antes = base({ id: 'anotacao-0004', cfi: 'epubcfi(/6/4!/4/10/1:0)' } as never)
    expect(anotacoesVivas([depois, antes]).map((a) => a.id)).toEqual(['anotacao-0004', 'anotacao-0003'])
  })
})

describe('reancoragem pela citação (critério 9)', () => {
  it('acha o exact e desempata pelo entorno', () => {
    const c = citacaoDe(TEXTO, TEXTO.lastIndexOf('o gato'), TEXTO.lastIndexOf('o gato') + 6)
    const t = acharCitacao(TEXTO, c)!
    expect(TEXTO.slice(t.inicio, t.fim)).toBe('o gato')
    expect(t.inicio).toBe(TEXTO.lastIndexOf('o gato'))
  })

  it('casa mesmo com espaços diferentes no texto novo', () => {
    const novo = 'Era uma vez um gato.\n\n  O   gato dormia. Um dia…'
    const t = acharCitacao(novo, { exact: 'O gato dormia.', prefix: 'um gato. ', suffix: '' })!
    expect(novo.slice(t.inicio, t.fim).replace(/\s+/g, ' ')).toBe('O gato dormia.')
  })

  it('CFI que resolve no mesmo texto: fica no CFI', () => {
    expect(ancorar(base(), () => 'O gato dormia.', [TEXTO])).toEqual({ como: 'cfi' })
  })

  it('o CFI de um parágrafo inteiro traz espaço e quebra de linha a mais: é o mesmo texto (não reancora)', () => {
    expect(ancorar(base(), () => '\n  O gato\n dormia. ', [TEXTO])).toEqual({ como: 'cfi' })
    // E o exact cortado no teto (500) dentro de um trecho maior também é o mesmo.
    expect(ancorar(base(), () => 'O gato dormia. Um dia, o gato acordou', [TEXTO])).toEqual({ como: 'cfi' })
  })

  it('CFI quebrado: reancora pela citação na seção certa', () => {
    const r = ancorar(base(), () => null, ['Prefácio sem nada.', TEXTO])
    expect(r).toMatchObject({ como: 'citacao', secao: 1 })
  })

  it('CFI que resolve em OUTRO texto (edição mudou) também reancora', () => {
    expect(ancorar(base(), () => 'outra coisa', [TEXTO])).toMatchObject({ como: 'citacao', secao: 0 })
  })

  it('sem casamento: "não localizada" — a anotação não some', () => {
    expect(ancorar(base(), () => null, ['texto totalmente outro'])).toEqual({ como: 'nao-localizada' })
  })
})

describe('W3C Web Annotation', () => {
  it('a anotação tem contexto, motivação, seletores CFI + TextQuote e o corpo da nota', () => {
    const a = base({ tipo: 'nota', nota: 'importante' })
    const w = paraWebAnnotation(a) as any
    expect(w['@context']).toBe(CONTEXTO_W3C)
    expect(w).toMatchObject({ type: 'Annotation', motivation: 'commenting', id: 'urn:uuid:anotacao-0001' })
    expect(w.body).toMatchObject({ type: 'TextualBody', value: 'importante', purpose: 'commenting' })
    expect(w.target.selector[0]).toMatchObject({ type: 'FragmentSelector', value: a.alvo.cfi })
    expect(w.target.selector[1]).toMatchObject({ type: 'TextQuoteSelector', exact: 'O gato dormia.' })
    expect(w.created).toBe(new Date(1000).toISOString())
  })

  it('ida e volta preserva o que importa', () => {
    const a = base({ tipo: 'palavra', palavra: 'gato', nota: 'cat', cor: 'rosa' })
    const volta = validarAnotacao(deWebAnnotation(paraWebAnnotation(a), a.livroId))
    expect(volta.ok && volta.anotacao).toMatchObject({
      id: a.id,
      tipo: 'palavra',
      palavra: 'gato',
      nota: 'cat',
      cor: 'rosa',
      alvo: { cfi: a.alvo.cfi, citacao: a.alvo.citacao },
    })
  })

  it('a coleção traz só as vivas do livro, com o contexto uma vez', () => {
    const viva = base()
    const morta = { ...base({ id: 'anotacao-0009' }), apagadoEm: 9 }
    const outra = base({ id: 'anotacao-0010', livroId: 'arq:outro' })
    const c = colecaoW3C({ id: 'arq:abc123', titulo: 'Gatos' }, [viva, morta, outra])
    expect(c).toMatchObject({ type: 'AnnotationCollection', total: 1, label: 'Gatos' })
    expect(c.first.items).toHaveLength(1)
    expect('@context' in c.first.items[0]).toBe(false)
    // JSON válido de ponta a ponta.
    expect(JSON.parse(JSON.stringify(c)).first.items[0].type).toBe('Annotation')
  })
})
