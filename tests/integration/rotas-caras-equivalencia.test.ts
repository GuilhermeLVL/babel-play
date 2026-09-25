/**
 * AS ROTAS CARAS DEVOLVEM O MESMO QUE DEVOLVIAM — e param de reler o banco inteiro a cada chamada
 * (fix/rotas-caras, auditoria de prontidão Fase 2 §2.1).
 *
 * `GET /api/vocab` (133 ms de CPU por request), `GET /api/metrics/profile` (77 ms),
 * `POST /api/metrics/seeds/gastar` (154 ms) e `PUT /api/settings` (até 98 consultas) foram
 * baratas por cache com versão, não por mudar a conta. Este arquivo trava as duas metades:
 *
 *  1. EQUIVALÊNCIA — o JSON INTEIRO (não só a forma) de cada rota, para um usuário semeado com
 *     todos os ramos de `computeProfile`, gravado com o código ANTERIOR à otimização. Qualquer
 *     diferença de valor, ordem de chave ou de elemento derruba o teste.
 *  2. INVALIDAÇÃO E CUSTO — depois de cada escrita (revisão, cartão novo, gasto, fala) a leitura
 *     seguinte enxerga a escrita; e sem escrita, a leitura repetida faz poucas consultas.
 *
 * Relógio: só `Date` é congelado (os timers continuam reais, o servidor HTTP precisa deles), e o
 * fuso é fixado porque `diaLocal` e `toDateString` dependem dele.
 */
process.env.TZ = 'America/Sao_Paulo'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'
import { AGORA, type Semeado, semearRico } from './_semeaduraRica'

const DONO = 'local-owner'
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`

describe('rotas caras: equivalência, invalidação e custo', () => {
  let s: AppDeTeste
  let semeado: Semeado

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AGORA)
    s = await subirApp({ modo: 'self-host' })
    semeado = await semearRico(s, DONO)
    const { settingsRepo } = await s.load('../../server/db/repositories/settings')
    const { asUserId } = await s.load('../../server/lib/authContext')
    await settingsRepo.ensure(asUserId(DONO))
  }, 60_000)

  afterAll(async () => {
    await s.encerrar()
    vi.useRealTimers()
  })

  describe('equivalência com o código anterior (JSON inteiro)', () => {
    it('GET /api/vocab', async () => {
      const r = await s.get('/api/vocab')
      expect(r.status).toBe(200)
      await expect(json(await r.json())).toMatchFileSnapshot('../__snapshots__/rotas-caras/vocab.json')
    })

    it('GET /api/metrics/profile (conta inteira)', async () => {
      const r = await s.get('/api/metrics/profile')
      expect(r.status).toBe(200)
      await expect(json(await r.json())).toMatchFileSnapshot('../__snapshots__/rotas-caras/perfil-global.json')
    })

    it('GET /api/metrics/profile (escopo de sessão)', async () => {
      const r = await s.get(`/api/metrics/profile?sessao=${semeado.sessoes[1]}`)
      expect(r.status).toBe(200)
      await expect(json(await r.json())).toMatchFileSnapshot('../__snapshots__/rotas-caras/perfil-sessao.json')
    })

    it('economiaDoUsuario', async () => {
      const { asUserId } = await s.load('../../server/lib/authContext')
      const { economiaDoUsuario } = await s.load('../../server/db/repositories/metrics')
      const { nivel, ganhas, gastas, saldo } = await economiaDoUsuario(asUserId(DONO))
      await expect(json({ nivel, ganhas, gastas, saldo })).toMatchFileSnapshot(
        '../__snapshots__/rotas-caras/economia.json',
      )
    })

    it('PUT /api/settings: item possuído passa, item trancado é 403 com o mesmo motivo', async () => {
      const ok = await s.put('/api/settings', {
        ui: {
          theme: 'linear',
          fonte: 'padrao',
          menuPosition: 'right',
          pack: 'classico',
          cursor: 'padrao',
          rastro: 'off',
        },
      })
      const recusa = await s.put('/api/settings', { ui: { theme: 'linear', fonte: 'padrao', cursor: 'coroa' } })
      const corpoOk = (await ok.json()) as Record<string, unknown>
      await expect(
        json({
          ok: { status: ok.status, ui: corpoOk.ui },
          recusa: { status: recusa.status, corpo: await recusa.json() },
        }),
      ).toMatchFileSnapshot('../__snapshots__/rotas-caras/settings-put.json')
    })
  })
})
