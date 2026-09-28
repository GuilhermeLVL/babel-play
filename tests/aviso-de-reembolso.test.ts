// @vitest-environment jsdom
/**
 * O AVISO DO REEMBOLSO (recompensas v2): quem decide se ainda falta avisar é o SERVIDOR
 * (`avisoPendente`), e o valor anunciado é o que entrou AGORA (`creditado`), não o total da vida.
 *
 * Antes era por aparelho (`localStorage`) e com o total acumulado: trocar de navegador repetia o
 * aviso, e o número dito não era o que acabava de entrar. Servidor antigo (sem o campo) continua
 * com o comportamento anterior, para não sumir com o aviso de quem ainda não atualizou.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const resposta = vi.hoisted(() => ({ atual: null as unknown }))
vi.mock('../src/data/api', () => ({ reembolsarSeeds: vi.fn(async () => resposta.atual) }))
vi.mock('../src/lib/flagsCache', () => ({ flagLigada: () => true }))

const { _reiniciarReembolsoDaSessao, CHAVE_DO_AVISO_DE_REEMBOLSO, reembolsarUmaVez } = await import('../src/lib/recompensasV2')

beforeEach(() => {
  localStorage.clear()
  _reiniciarReembolsoDaSessao()
})

describe('aviso de reembolso', () => {
  it('servidor diz que o aviso está pendente: anuncia só o que entrou agora', async () => {
    resposta.atual = { creditado: 30, reembolsado: 120, avisoPendente: true }
    expect(await reembolsarUmaVez()).toBe(30)
  })

  it('servidor diz que já avisou: nada, mesmo num aparelho que nunca viu o aviso', async () => {
    resposta.atual = { creditado: 30, reembolsado: 120, avisoPendente: false }
    expect(await reembolsarUmaVez()).toBeNull()
  })

  it('com o campo do servidor, o localStorage não manda (outro aparelho já ter visto não cala)', async () => {
    localStorage.setItem(CHAVE_DO_AVISO_DE_REEMBOLSO, '120')
    resposta.atual = { creditado: 30, reembolsado: 150, avisoPendente: true }
    expect(await reembolsarUmaVez()).toBe(30)
  })

  it('pendente sem nada creditado agora: não anuncia "+0"', async () => {
    resposta.atual = { creditado: 0, reembolsado: 120, avisoPendente: true }
    expect(await reembolsarUmaVez()).toBeNull()
  })

  it('servidor antigo (sem avisoPendente): o comportamento anterior, uma vez por aparelho', async () => {
    resposta.atual = { creditado: 30, reembolsado: 120 }
    expect(await reembolsarUmaVez()).toBe(120)
    _reiniciarReembolsoDaSessao()
    expect(await reembolsarUmaVez()).toBeNull()
  })
})
