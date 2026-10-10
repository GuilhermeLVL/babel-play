/**
 * CARACTERIZAÇÃO — `GET /api/admin/calibracao/:id` por HTTP, no modo público (change
 * `modelo-do-aluno-e-dados`, tarefa 1.3).
 *
 * Contratos gravados:
 * 1. Só admin e support leem; conta comum é 403 e sem token é 401.
 * 2. A resposta traz o geral e a conta por origem da nota, com as seis faixas de retenção prevista.
 * 3. É a calibração do usuário PEDIDO (o `:id`), não a de quem pede.
 * 4. Só leitura: pedir não grava nada.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, semear, subirApp } from './_app'

describe('calibração do FSRS no admin (modo público)', () => {
  let s: AppDeTeste
  let admin: string
  let suporte: string
  let comum: string
  let cartao: { id: string }

  beforeAll(async () => {
    s = await subirApp({ modo: 'publico' })
    const { usersRepo } = await s.load('../../server/db/repositories/users')
    admin = await s.token('cal-admin')
    suporte = await s.token('cal-suporte')
    comum = await s.token('cal-aluno')
    for (const t of [admin, suporte, comum]) expect((await s.get('/api/me', t)).status).toBe(200)
    await usersRepo.setRole('cal-admin', 'admin')
    await usersRepo.setRole('cal-suporte', 'support')
    cartao = (await semear(s, 'cal-aluno')).cartoes[0]
    // Três revisões do aluno: a primeira não tem previsão (não havia estabilidade); as outras duas têm.
    for (const corpo of [
      { grade: 3, origem: 'revisao', formato: 'lembrar', respostaMs: 3000 },
      { grade: 3, origem: 'revisao', formato: 'lembrar', respostaMs: 2000 },
      { grade: 1, origem: 'jogo:blitz', formato: 'blitz', respostaMs: 900 },
    ]) {
      expect((await s.post(`/api/vocab/${cartao.id}/review`, corpo, comum)).status).toBe(200)
    }
  })
  afterAll(async () => {
    await s.encerrar()
  })

  it('exige papel: sem token 401, conta comum 403, support e admin 200', async () => {
    expect((await s.get('/api/admin/calibracao/cal-aluno')).status).toBe(401)
    expect((await s.get('/api/admin/calibracao/cal-aluno', comum)).status).toBe(403)
    expect((await s.get('/api/admin/calibracao/cal-aluno', suporte)).status).toBe(200)
    expect((await s.get('/api/admin/calibracao/cal-aluno', admin)).status).toBe(200)
  })

  it('devolve o geral e a conta por origem, do usuário pedido', async () => {
    const r = await s.get('/api/admin/calibracao/cal-aluno?repeticoes=1', admin)
    const c = (await r.json()) as {
      userId: string
      fuso: string
      soPrimeiraDoDia: boolean
      historico: number
      geral: { revisoes: number; erro: number | null; faixas: unknown[]; ignoradas: { semPrevisao: number } }
      porOrigem: Record<string, { revisoes: number }>
    }
    expect(c).toMatchObject({ userId: 'cal-aluno', soPrimeiraDoDia: false, historico: 3 })
    expect(c.geral.faixas).toHaveLength(6)
    expect(c.geral.ignoradas.semPrevisao).toBe(1)
    expect(c.geral.revisoes).toBe(2)
    expect(c.geral.erro).toBeGreaterThanOrEqual(0)
    expect(Object.keys(c.porOrigem)).toEqual(['jogo:blitz', 'revisao'])
    expect(c.porOrigem['jogo:blitz'].revisoes).toBe(1)
  })

  it('por padrão só a primeira nota do dia conta: as outras duas, do mesmo dia, ficam de fora', async () => {
    const c = (await (await s.get('/api/admin/calibracao/cal-aluno', admin)).json()) as {
      soPrimeiraDoDia: boolean
      geral: { revisoes: number; ignoradas: { repetidasNoDia: number; semPrevisao: number } }
    }
    expect(c.soPrimeiraDoDia).toBe(true)
    expect(c.geral.ignoradas).toMatchObject({ repetidasNoDia: 2, semPrevisao: 1 })
    expect(c.geral.revisoes).toBe(0)
  })

  it('usuário sem revisão: tudo vazio, sem erro; e a leitura não gravou nada', async () => {
    const { client } = await s.load('../../server/db/db')
    const antes = Number((await client.execute('SELECT count(*) AS n FROM review_logs')).rows[0].n)
    const c = (await (await s.get('/api/admin/calibracao/cal-admin', admin)).json()) as {
      historico: number
      geral: { revisoes: number; erro: number | null }
    }
    expect(c).toMatchObject({ historico: 0, geral: { revisoes: 0, erro: null } })
    expect(Number((await client.execute('SELECT count(*) AS n FROM review_logs')).rows[0].n)).toBe(antes)
  })
})
