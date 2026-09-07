/**
 * UMA VARREDURA POR JANELA, NÃO UMA POR REQUISIÇÃO (auditoria de 2026-09-07, achado A33).
 *
 * A reconciliação do contador de armazenamento é O(n sessões), com um `stat` (ou um `HEAD` no S3)
 * por arquivo, e rodava dentro de `GET /api/me/entitlements` — a rota por onde TODO usuário ativo
 * passa. O padrão era ler-decidir-varrer: duas requisições simultâneas do mesmo usuário liam o
 * mesmo carimbo vencido, as duas concluíam "está velho" e as duas varriam.
 *
 * A correção é reivindicar a janela antes: um `UPDATE ... WHERE updated_at <= limite` só afeta
 * linha para quem chegar primeiro. Este arquivo prova as duas metades — que a corrida sumiu, e
 * que a varredura continua acontecendo quando é para acontecer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let quota: any

const U = asUserId('reconc-u1')

beforeAll(async () => {
  h = await setupEphemeralDb()
  quota = await h.load('../../server/lib/storageQuota')
})
afterAll(async () => { await h?.cleanup?.() })

describe('reconciliação de armazenamento sob concorrência', () => {
  it('dez reivindicações simultâneas: exatamente UMA vence', async () => {
    /* Afirmar sobre o MECANISMO, e não sobre um espião: `reconciliarSeVencido` chama a varredura
       por referência interna ao módulo, e um spy no export não interceptaria — o teste passaria
       verde sem provar nada. A reivindicação é a peça que decide quem varre. */
    const vencedores = await Promise.all(
      Array.from({ length: 10 }, () => quota.reivindicarJanela(U, 24)),
    )
    expect(vencedores.filter(Boolean).length, 'antes, todas as dez varriam').toBe(1)
  })

  it('dentro da janela ninguém mais reivindica — a próxima varredura espera o prazo', async () => {
    // A linha acabou de ser carimbada pelo caso anterior.
    expect(await quota.reivindicarJanela(U, 24)).toBe(false)
  })

  it('vencida a janela, alguém reivindica de novo — a janela não vira um desligamento', async () => {
    // Janela de 0 h: qualquer carimbo já está vencido.
    expect(await quota.reivindicarJanela(U, 0)).toBe(true)
  })

  it('a varredura acontece e grava o contador quando a janela está vencida', async () => {
    const u = asUserId('reconc-u3')
    const bytes = await quota.reconciliarSeVencido(u, 'diretorio-que-nao-existe')
    expect(bytes).toBe(0)
    expect(await quota.usoDeArmazenamento(u)).toBe(0)
  })

  /**
   * O modo `job` tira a varredura do caminho de quem está usando o app. Prova observável: um
   * usuário sem linha nenhuma NÃO ganha linha, porque a função retorna antes de reivindicar.
   */
  it('modo job não varre nem reivindica no caminho do usuário', async () => {
    const anterior = process.env.STORAGE_RECONCILE_MODE
    process.env.STORAGE_RECONCILE_MODE = 'job'
    try {
      const u = asUserId('reconc-u4')
      expect(quota.modoDeReconciliacao()).toBe('job')
      expect(await quota.reconciliarSeVencido(u, 'diretorio-que-nao-existe')).toBe(0)
      // Sem linha criada: nada foi reivindicado. Se tivesse sido, a reivindicação de 24 h falharia.
      expect(await quota.reivindicarJanela(u, 24)).toBe(true)
    } finally {
      if (anterior === undefined) delete process.env.STORAGE_RECONCILE_MODE
      else process.env.STORAGE_RECONCILE_MODE = anterior
    }
  })
})
