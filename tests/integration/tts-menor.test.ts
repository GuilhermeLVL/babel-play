/**
 * E4 (Fase E) — a voz natural e o MENOR: as regras de sempre, pelo servidor de verdade (`criarApp`) em
 * modo público, com JWT.
 *
 * `POST /api/ai/tts` mora em `/api/ai`, atrás do `exigirContaLiberada` como toda rota de nuvem: a conta
 * de menor de 16 sem o vínculo do responsável recebe 403 `responsavel_pendente` antes de qualquer
 * checagem de plano (o cliente já lê com a voz do aparelho). A conta liberada sem o Premium recebe o 402
 * de sempre, pelo entitlement.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste

function nascidoHa(anos: number): string {
  const d = new Date(Date.now() - 40 * 86_400_000)
  d.setUTCFullYear(d.getUTCFullYear() - anos)
  return d.toISOString().slice(0, 10)
}

async function comIdade(sub: string, anos: number): Promise<string> {
  const token = await s.token(sub)
  const r = await s.put('/api/me/idade', { nascimento: nascidoHa(anos) }, token)
  expect(r.status, `declarar idade de ${sub}`).toBe(200)
  return token
}

beforeAll(async () => {
  s = await subirApp({ modo: 'publico' })
})
afterAll(async () => {
  await s.encerrar()
})

describe('a voz natural e o menor', () => {
  it('menor de 16 sem vínculo: 403 responsavel_pendente, como toda rota de nuvem', async () => {
    const token = await comIdade('tts-teen', 14)
    const r = await s.post('/api/ai/tts', { texto: 'Olá', idioma: 'pt' }, token)
    expect(r.status).toBe(403)
    expect((await r.json()).code).toBe('responsavel_pendente')
  })

  it('conta liberada sem o Premium (16–17, Grátis): o 402 de sempre, pelo entitlement', async () => {
    const token = await comIdade('tts-17', 17)
    const r = await s.post('/api/ai/tts', { texto: 'Olá', idioma: 'pt' }, token)
    expect(r.status).toBe(402)
    expect((await r.json()).code).toBe('exige_voz_natural')
  })
})
