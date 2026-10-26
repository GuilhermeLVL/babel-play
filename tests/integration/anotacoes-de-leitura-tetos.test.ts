/**
 * OS TETOS DAS ANOTAÇÕES DO LEITOR (`anotacoesDeLeituraRepo.gravarLote`, revisão de segurança de 26/10/2026):
 *
 *   - por livro: anotação nova viva num livro cheio é recusada (`livro_cheio`);
 *   - RESSURREIÇÃO: uma lápide que volta a viva ocupa vaga como uma nova — não fura o teto do livro;
 *   - por pessoa: inventar `livro_id` novos não foge do teto, que também conta o total (`pessoa_cheia`);
 *   - livros distintos com anotação viva têm teto próprio (`livros_demais`);
 *   - editar uma viva, apagar e a escrita velha (que perde na última-escrita-vence) nunca são recusadas;
 *   - apagar libera a vaga.
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

const TETOS = { porLivro: 2, porPessoa: 3, livros: 2 }
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
    const vivas = (await repo.listar(U, { livroId: 'arq:l1' })).filter((x: AnotacaoDeLeitura) => !x.apagadoEm)
    const alvo = vivas[0]
    expect(await repo.apagar(U, alvo.id, 3_000)).toBe(true)
    // A vaga voltou: uma nova entra.
    const outra = nova('arq:l1')
    expect((await repo.gravarLote(U, [outra], TETOS)).recusadas).toEqual([])
    // Agora o livro está cheio de novo; a lápide "mais nova e viva" é uma anotação viva a mais: recusada.
    const ressurreicao = { ...alvo, apagadoEm: null, nota: 'voltei', atualizadoEm: 9_000 }
    const r = await repo.gravarLote(U, [ressurreicao], TETOS)
    expect(r.recusadas).toEqual([{ id: alvo.id, motivo: 'livro_cheio' }])
    const guardada = (await repo.listar(U, { livroId: 'arq:l1' })).find((x: AnotacaoDeLeitura) => x.id === alvo.id)
    expect(guardada.apagadoEm).toBe(3_000)
    expect((await repo.listar(U, { livroId: 'arq:l1' })).filter((x: AnotacaoDeLeitura) => !x.apagadoEm)).toHaveLength(2)
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
    const TETOS_LARGOS = { porLivro: 10, porPessoa: 3, livros: 10 }
    const lote = [nova('arq:p1'), nova('arq:p2'), nova('arq:p3'), nova('arq:p4')]
    const r = await repo.gravarLote(U, lote, TETOS_LARGOS)
    expect(r.recusadas).toEqual([{ id: lote[3].id, motivo: 'pessoa_cheia' }])
    expect(r.gravadas).toHaveLength(3)
  })

  it('livros distintos com anotação viva têm teto próprio; num livro que já tem, ainda cabe', async () => {
    const U = asUserId('tetos-livros')
    const TETOS_LIVROS = { porLivro: 10, porPessoa: 10, livros: 2 }
    const [a, b, c, d] = [nova('arq:q1'), nova('arq:q2'), nova('arq:q3'), nova('arq:q1')]
    const r = await repo.gravarLote(U, [a, b, c, d], TETOS_LIVROS)
    expect(r.recusadas).toEqual([{ id: c.id, motivo: 'livros_demais' }])
    // Apagar a única do livro q2 libera um livro.
    await repo.apagar(U, b.id, 2_000)
    expect((await repo.gravarLote(U, [nova('arq:q3')], TETOS_LIVROS)).recusadas).toEqual([])
  })

  it('os tetos de verdade são os da casa', async () => {
    const { TETOS_DAS_ANOTACOES } = await h.load<any>('../../server/db/repositories/anotacoesDeLeitura')
    expect(TETOS_DAS_ANOTACOES).toEqual({ porLivro: 5_000, porPessoa: 50_000, livros: 1_000 })
  })
})
