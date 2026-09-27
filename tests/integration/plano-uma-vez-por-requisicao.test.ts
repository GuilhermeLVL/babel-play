/**
 * O PLANO É LIDO UMA VEZ POR REQUISIÇÃO — auditoria de performance do backend (26/09/2026).
 *
 * `getPlanForUser` é chamado fundo na pilha por quem precisa do plano: a porta do STT, a cota de
 * segundos, a cota de tokens, as flags, a telemetria de IA. O inventário de consultas da suíte de
 * carga (`scripts/perf/consultas/`) achou a MESMA leitura de `subscriptions` repetida três vezes em
 * cada `POST /api/ai/stt` e `POST /api/ai/mt` — as duas rotas mais frequentes da captura ao vivo.
 *
 * Dentro do contexto do request (`comIdentidade`, aberto pelo `authMiddleware`), o plano do PRÓPRIO
 * usuário é memorizado; fora dele (jobs, testes de unidade) nada muda. Um plano de OUTRO id (rota de
 * admin) não é memorizado, e uma leitura que FALHA não fica no memo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const EU = asUserId('plano-memo-eu')
const OUTRO = asUserId('plano-memo-outro')

let h: EphemeralDb
let getPlanForUser: (u: string) => Promise<string>
let comIdentidade: <T>(u: string, convidado: boolean, fn: () => T) => T
let registrarObservadorDeConsultas: (fn: ((o: { instrucoes: string[] }) => void) | undefined) => void
const anteriorAuth = process.env.AUTH_REQUIRED

beforeAll(async () => {
  process.env.AUTH_REQUIRED = '1' // modo público: é onde o plano vem de `subscriptions`
  h = await setupEphemeralDb()
  ;({ getPlanForUser } = await h.load<{ getPlanForUser: any }>('../../server/lib/entitlements'))
  ;({ comIdentidade } = await h.load<{ comIdentidade: any }>('../../server/lib/contextoDeConvidado'))
  ;({ registrarObservadorDeConsultas } = await h.load<{ registrarObservadorDeConsultas: any }>(
    '../../server/db/observadorDeConsultas',
  ))
})
afterAll(async () => {
  registrarObservadorDeConsultas(undefined)
  if (anteriorAuth === undefined) delete process.env.AUTH_REQUIRED
  else process.env.AUTH_REQUIRED = anteriorAuth
  await h.cleanup()
})

async function leiturasDeAssinatura(fn: () => Promise<unknown>): Promise<number> {
  let n = 0
  registrarObservadorDeConsultas((o) => {
    n += o.instrucoes.filter((s) => /from "subscriptions"/.test(s)).length
  })
  try {
    await fn()
  } finally {
    registrarObservadorDeConsultas(undefined)
  }
  return n
}

describe('getPlanForUser por requisição', () => {
  it('três perguntas no mesmo request = uma leitura de subscriptions', async () => {
    const n = await leiturasDeAssinatura(() =>
      comIdentidade(EU, false, async () => {
        expect(await getPlanForUser(EU)).toBe('free')
        expect(await getPlanForUser(EU)).toBe('free')
        expect(await getPlanForUser(EU)).toBe('free')
      }),
    )
    expect(n).toBe(1)
  })

  it('requests diferentes não compartilham o memo', async () => {
    const n = await leiturasDeAssinatura(async () => {
      await comIdentidade(EU, false, () => getPlanForUser(EU))
      await comIdentidade(EU, false, () => getPlanForUser(EU))
    })
    expect(n).toBe(2)
  })

  it('o plano de OUTRO usuário dentro do request não é memorizado', async () => {
    const n = await leiturasDeAssinatura(() =>
      comIdentidade(EU, false, async () => {
        await getPlanForUser(OUTRO)
        await getPlanForUser(OUTRO)
      }),
    )
    expect(n).toBe(2)
  })

  it('fora de request (job, teste de unidade) continua lendo a cada chamada', async () => {
    const n = await leiturasDeAssinatura(async () => {
      await getPlanForUser(EU)
      await getPlanForUser(EU)
    })
    expect(n).toBe(2)
  })
})
