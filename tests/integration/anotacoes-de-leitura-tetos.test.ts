/**
 * OS TETOS DAS ANOTAÇÕES DO LEITOR (`anotacoesDeLeituraRepo.gravarLote`, revisão de segurança de 26/10/2026):
 *
 *   - por livro: anotação nova viva num livro cheio é recusada (`livro_cheio`);
 *   - RESSURREIÇÃO: uma lápide que volta a viva ocupa vaga como uma nova — não fura o teto do livro;
 *   - por pessoa: inventar `livro_id` novos não foge do teto, que também conta o total (`pessoa_cheia`);
 *   - livros distintos com anotação viva têm teto próprio (`livros_demais`);
 *   - editar uma viva, apagar e a escrita velha (que perde na última-escrita-vence) nunca são recusadas;
 *   - apagar libera a vaga.
 *   - LÁPIDES: a de id desconhecido não cria linha; a guardada não tem conteúdo; o teto de linhas conta as
 *     lápides; a limpeza diária poda as velhas.
 *   - CURSOR DO SERVIDOR: `sincronizado_em` cresce a cada escrita (mesmo com o relógio do aparelho no passado),
 *     a escrita offline com data antiga aparece depois do cursor, e a leitura vem em páginas com `temMais`.
 *   - CITAÇÃO de livro trazido: o teto somado (`citacao_demais`); o livro do catálogo não tem.
 *
 * Os tetos são injetados pequenos (a função aceita `tetos` para isto): o comportamento é o mesmo dos de verdade.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import type { AnotacaoDeLeitura } from '../../src/core/leitura/anotacao'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let repo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ anotacoesDeLeituraRepo: repo } = await h.load<any>('../../server/db/repositories/anotacoesDeLeitura'))
})
afterAll(async () => {
  await h.cleanup()
})

const TETOS = { porLivro: 2, porPessoa: 3, livros: 2, linhasPorPessoa: 1_000 }
let seq = 0
const nova = (livroId: string, extra: Partial<AnotacaoDeLeitura> = {}): AnotacaoDeLeitura => ({
  id: `teto-${String(++seq).padStart(6, '0')}`,
  livroId,
  tipo: 'grifo',
  alvo: { cfi: '', citacao: { exact: `trecho ${seq}`, prefix: '', suffix: '' } },
  cor: 'amarelo',
  nota: '',
  criadoEm: 1_000,
  atualizadoEm: 1_000,
  apagadoEm: null,
  ...extra,
})

describe('teto por livro e ressurreição', () => {
  const U = asUserId('tetos-livro')

  it('o terceiro grifo vivo do livro é recusado; editar um vivo passa', async () => {
    const [a, b, c] = [nova('arq:l1'), nova('arq:l1'), nova('arq:l1')]
    const r = await repo.gravarLote(U, [a, b, c], TETOS)
    expect(r.recusadas).toEqual([{ id: c.id, motivo: 'livro_cheio' }])
    const editada = await repo.gravarLote(U, [{ ...a, nota: 'editada', atualizadoEm: 2_000 }], TETOS)
    expect(editada.recusadas).toEqual([])
    expect(editada.gravadas[0].nota).toBe('editada')
  })

  it('apagar libera a vaga; ressuscitar a lápide com o livro cheio de novo é recusado', async () => {
    const vivas = (await repo.listar(U, { livroId: 'arq:l1' })).anotacoes.filter((x: AnotacaoDeLeitura) => !x.apagadoEm)
    const alvo = vivas[0]
    expect(await repo.apagar(U, alvo.id, 3_000)).toBe(true)
    // A vaga voltou: uma nova entra.
    const outra = nova('arq:l1')
    expect((await repo.gravarLote(U, [outra], TETOS)).recusadas).toEqual([])
    // Agora o livro está cheio de novo; a lápide "mais nova e viva" é uma anotação viva a mais: recusada.
    const ressurreicao = { ...alvo, apagadoEm: null, nota: 'voltei', atualizadoEm: 9_000 }
    const r = await repo.gravarLote(U, [ressurreicao], TETOS)
    expect(r.recusadas).toEqual([{ id: alvo.id, motivo: 'livro_cheio' }])
    const guardada = (await repo.listar(U, { livroId: 'arq:l1' })).anotacoes.find(
      (x: AnotacaoDeLeitura) => x.id === alvo.id,
    )
    expect(guardada.apagadoEm).toBe(3_000)
    expect(
      (await repo.listar(U, { livroId: 'arq:l1' })).anotacoes.filter((x: AnotacaoDeLeitura) => !x.apagadoEm),
    ).toHaveLength(2)
  })

  it('com vaga, a ressurreição passa e conta (a próxima nova é recusada)', async () => {
    const U2 = asUserId('tetos-ressurreicao')
    const a = nova('arq:l9')
    await repo.gravarLote(U2, [a], TETOS)
    await repo.apagar(U2, a.id, 2_000)
    const b = nova('arq:l9')
    await repo.gravarLote(U2, [b], TETOS)
    const volta = await repo.gravarLote(U2, [{ ...a, apagadoEm: null, atualizadoEm: 5_000 }], TETOS)
    expect(volta.recusadas).toEqual([])
    expect(volta.gravadas[0].apagadoEm).toBeNull()
    expect((await repo.gravarLote(U2, [nova('arq:l9')], TETOS)).recusadas[0].motivo).toBe('livro_cheio')
  })

  it('a escrita velha (que perde para a guardada) não é recusada nem conta', async () => {
    const U3 = asUserId('tetos-velha')
    const a = nova('arq:l8')
    const b = nova('arq:l8')
    await repo.gravarLote(U3, [a, b], TETOS)
    await repo.apagar(U3, a.id, 5_000)
    // Uma versão VIVA mas mais velha que a lápide: perde, não ressuscita, não é recusada.
    const r = await repo.gravarLote(U3, [{ ...a, apagadoEm: null, atualizadoEm: 4_000 }], TETOS)
    expect(r.recusadas).toEqual([])
    expect(r.gravadas[0].apagadoEm).toBe(5_000)
  })
})

describe('tetos por pessoa', () => {
  it('inventar livro_id novo não foge: o total da pessoa também tem teto', async () => {
    const U = asUserId('tetos-pessoa')
    const TETOS_LARGOS = { porLivro: 10, porPessoa: 3, livros: 10, linhasPorPessoa: 1_000 }
    const lote = [nova('arq:p1'), nova('arq:p2'), nova('arq:p3'), nova('arq:p4')]
    const r = await repo.gravarLote(U, lote, TETOS_LARGOS)
    expect(r.recusadas).toEqual([{ id: lote[3].id, motivo: 'pessoa_cheia' }])
    expect(r.gravadas).toHaveLength(3)
  })

  it('livros distintos com anotação viva têm teto próprio; num livro que já tem, ainda cabe', async () => {
    const U = asUserId('tetos-livros')
    const TETOS_LIVROS = { porLivro: 10, porPessoa: 10, livros: 2, linhasPorPessoa: 1_000 }
    const [a, b, c, d] = [nova('arq:q1'), nova('arq:q2'), nova('arq:q3'), nova('arq:q1')]
    const r = await repo.gravarLote(U, [a, b, c, d], TETOS_LIVROS)
    expect(r.recusadas).toEqual([{ id: c.id, motivo: 'livros_demais' }])
    // Apagar a única do livro q2 libera um livro.
    await repo.apagar(U, b.id, 2_000)
    expect((await repo.gravarLote(U, [nova('arq:q3')], TETOS_LIVROS)).recusadas).toEqual([])
  })

  it('os tetos de verdade são os da casa', async () => {
    const { TETOS_DAS_ANOTACOES } = await h.load<any>('../../server/db/repositories/anotacoesDeLeitura')
    expect(TETOS_DAS_ANOTACOES).toEqual({ porLivro: 5_000, porPessoa: 50_000, livros: 1_000, linhasPorPessoa: 100_000 })
  })
})

describe('lápides', () => {
  const linhasDe = async (u: string) => {
    const { clienteSql } = await import('../harness/clienteSql')
    const c = clienteSql(await h.load('../../server/db/db'))
    return (await c.execute(`SELECT * FROM anotacoes_de_leitura WHERE user_id = '${u}'`)).rows
  }

  it('lápide de id desconhecido não cria linha (fica em `ignoradas`)', async () => {
    const U = asUserId('lapide-desconhecida')
    const fantasma = nova('arq:f1', { apagadoEm: 5_000 })
    const r = await repo.gravarLote(U, [fantasma], TETOS)
    expect(r).toEqual({ gravadas: [], recusadas: [], ignoradas: [fantasma.id] })
    expect(await linhasDe('lapide-desconhecida')).toHaveLength(0)
  })

  it('a lápide guardada não tem conteúdo — pelo lote e pelo DELETE', async () => {
    const U = asUserId('lapide-sem-conteudo')
    const a = nova('arq:s1', { nota: 'segredo', palavra: undefined })
    const b = nova('arq:s1', { tipo: 'palavra', palavra: 'whale', nota: 'baleia' })
    await repo.gravarLote(U, [a, b], { ...TETOS, porLivro: 10 })
    await repo.gravarLote(U, [{ ...a, apagadoEm: 9_000 }], TETOS)
    await repo.apagar(U, b.id, 9_500)
    for (const l of await linhasDe('lapide-sem-conteudo')) {
      expect(l).toMatchObject({ exact: '', prefixo: '', sufixo: '', nota: '', cfi: '', palavra: null, capitulo: null })
      expect(Number(l.apagado_em)).toBeGreaterThan(0)
    }
    // E a lápide sem conteúdo continua lendo como anotação (o cliente a valida para mesclar).
    const { validarAnotacao } = await import('../../src/core/leitura/anotacao')
    for (const x of (await repo.listar(U)).anotacoes) expect(validarAnotacao(x, { estrito: true }).ok).toBe(true)
  })

  it('o teto de linhas conta TODAS as linhas, lápides incluídas', async () => {
    const U = asUserId('lapide-teto')
    const TETO_DE_LINHAS = { porLivro: 100, porPessoa: 100, livros: 100, linhasPorPessoa: 3 }
    const [a, b, c] = [nova('arq:t1'), nova('arq:t1'), nova('arq:t1')]
    await repo.gravarLote(U, [a, b, c], TETO_DE_LINHAS)
    await repo.apagar(U, a.id, 2_000)
    await repo.apagar(U, b.id, 2_000)
    // Só uma viva, mas três linhas: a nova é recusada.
    const d = nova('arq:t1')
    expect((await repo.gravarLote(U, [d], TETO_DE_LINHAS)).recusadas).toEqual([{ id: d.id, motivo: 'linhas_demais' }])
    // Ressuscitar uma lápide não cria linha: passa.
    expect(
      (await repo.gravarLote(U, [{ ...a, apagadoEm: null, atualizadoEm: 3_000 }], TETO_DE_LINHAS)).recusadas,
    ).toEqual([])
  })

  it('a limpeza diária poda as lápides com mais de 90 dias, e só elas', async () => {
    const U = asUserId('lapide-poda')
    const agora = Date.UTC(2026, 9, 26)
    const [velha, nova1, viva] = [nova('arq:p9'), nova('arq:p9'), nova('arq:p9')]
    await repo.gravarLote(U, [velha, nova1, viva], { ...TETOS, porLivro: 10, porPessoa: 10 })
    await repo.apagar(U, velha.id, agora - 91 * 86_400_000)
    await repo.apagar(U, nova1.id, agora - 10 * 86_400_000)
    // Os testes acima deixaram lápides em 1970 (de todo mundo): a poda é global, por isso "pelo menos 1".
    expect(await repo.podarLapides(agora)).toBeGreaterThanOrEqual(1)
    const ids = (await linhasDe('lapide-poda')).map((l) => l.id).sort()
    expect(ids).toEqual([nova1.id, viva.id].sort())
  })
})

describe('o cursor da sincronização é o relógio do servidor', () => {
  const U = asUserId('cursor-servidor')

  it('a escrita feita sem rede, com data antiga, aparece depois do cursor de quem já leu', async () => {
    await repo.gravarLote(U, [nova('arq:c1', { atualizadoEm: 500_000, criadoEm: 500_000 })])
    const b = await repo.listar(U, { livroId: 'arq:c1' })
    expect(b.anotacoes).toHaveLength(1)
    expect(b.temMais).toBe(false)
    // Aparelho A, sem rede desde antes: data do aparelho MUITO menor que a do que B já leu.
    const offline = nova('arq:c1', { atualizadoEm: 1, criadoEm: 1, nota: 'feita sem rede' })
    await repo.gravarLote(U, [offline])
    const depois = await repo.listar(U, { livroId: 'arq:c1', cursor: b.cursor })
    expect(depois.anotacoes.map((x: AnotacaoDeLeitura) => x.id)).toEqual([offline.id])
    // E a lápide (pelo DELETE) também ganha relógio novo.
    await repo.apagar(U, offline.id, 2)
    const lapide = await repo.listar(U, { livroId: 'arq:c1', cursor: depois.cursor })
    expect(lapide.anotacoes.map((x: AnotacaoDeLeitura) => [x.id, x.apagadoEm])).toEqual([[offline.id, 2]])
    expect(lapide.cursor.s).toBeGreaterThan(depois.cursor.s)
  })

  it('o relógio nunca volta: com a máquina "no passado", a escrita seguinte ainda fica depois', async () => {
    await repo.gravarLote(U, [nova('arq:c2')], undefined, 9_000_000_000_000)
    const a = await repo.listar(U, { livroId: 'arq:c2' })
    await repo.gravarLote(U, [nova('arq:c2')], undefined, 1_000)
    const b = await repo.listar(U, { livroId: 'arq:c2', cursor: a.cursor })
    expect(b.anotacoes).toHaveLength(1)
    expect(b.cursor.s).toBe(a.cursor.s + 1)
  })

  it('mais de 2000: páginas de 2000 com temMais, e a segunda página continua do cursor', async () => {
    const lote: AnotacaoDeLeitura[] = []
    for (let i = 0; i < 2_150; i++) lote.push(nova('cat:paginas'))
    for (let i = 0; i < lote.length; i += 200) await repo.gravarLote(U, lote.slice(i, i + 200))
    const p1 = await repo.listar(U, { livroId: 'cat:paginas' })
    expect(p1.anotacoes).toHaveLength(2_000)
    expect(p1.temMais).toBe(true)
    const p2 = await repo.listar(U, { livroId: 'cat:paginas', cursor: p1.cursor })
    expect(p2.anotacoes).toHaveLength(150)
    expect(p2.temMais).toBe(false)
    const ids = new Set([...p1.anotacoes, ...p2.anotacoes].map((x: AnotacaoDeLeitura) => x.id))
    expect(ids.size).toBe(2_150)
  })
})

describe('teto somado da citação de livro trazido', () => {
  const U = asUserId('citacao-trazido')
  const cit = (n: number) => ({ cfi: '', citacao: { exact: 'z'.repeat(n), prefix: '', suffix: '' } })

  it('arq: recusa a escrita que passaria de 20 mil caracteres vivos; apagar libera; catálogo não tem teto', async () => {
    const quarenta = Array.from({ length: 40 }, () => nova('arq:t1', { alvo: cit(500) }))
    expect((await repo.gravarLote(U, quarenta)).recusadas).toEqual([])
    const extra = nova('arq:t1', { alvo: cit(10) })
    expect((await repo.gravarLote(U, [extra])).recusadas).toEqual([{ id: extra.id, motivo: 'citacao_demais' }])
    // Editar uma viva sem aumentar a citação passa.
    const ed = await repo.gravarLote(U, [{ ...quarenta[0], nota: 'ok', atualizadoEm: 5_000 }])
    expect(ed.recusadas).toEqual([])
    await repo.apagar(U, quarenta[1].id)
    expect((await repo.gravarLote(U, [extra])).recusadas).toEqual([])
    const cat = Array.from({ length: 41 }, () => nova('cat:t1', { alvo: cit(500) }))
    expect((await repo.gravarLote(U, cat)).recusadas).toEqual([])
  })
})
