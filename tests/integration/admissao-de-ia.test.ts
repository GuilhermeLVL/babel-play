/**
 * ADMISSÃO DE IA AO VIVO (ADR 0007) — o que o ADR promete, cobrado.
 *
 *  - 25 STT simultâneos contra o balde de 20/min: 20 atendidos, 5 recusados com 429 +
 *    `Retry-After`, e o provedor chamado EXATAMENTE 20 vezes (zero retentativas);
 *  - com o balde quase vazio, o Pro passa e o Essencial recebe 429 (reserva do Pro);
 *  - a 2ª STT simultânea do mesmo usuário recebe 429 enquanto a 1ª está em voo;
 *  - o 429 do provedor chega ao cliente como 429 `nuvem_ocupada`, com UMA chamada ao provedor, e
 *    fecha o balde até o `Retry-After` dele;
 *  - plano sem STT gerenciado recebe 402 SEM o corpo ser lido (a porta vem antes do `raw()`);
 *  - o STT tem disjuntor: cinco 5xx seguidos e a próxima fala nem sai.
 */
import { request as requisicaoHttp, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import express from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'
import { wavPcm } from '../harness/wav'

let h: EphemeralDb
let stt: any
let mt: any
let subs: any
let adm: any
let disj: any
let metricas: any

const ENVS = [
  'GROQ_API_KEY',
  'GROQ_BASE_URL',
  'STT_MODEL',
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'IA_ADMISSAO_STT_RPM',
  'IA_ADMISSAO_LLM_RPM',
  'IA_ADMISSAO_RESERVA_PRO',
  'IA_EM_VOO_STT',
]

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false, headers: {} as Record<string, string> }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.setHeader = (n: string, v: string) => {
    r.headers[n.toLowerCase()] = v
  }
  return r
}

function req(userId: string, corpo: unknown, headers: Record<string, string> = {}): any {
  return { userId, body: corpo, header: (n: string) => headers[n.toLowerCase()], requestId: 'r-adm' }
}

function respostaJson(corpo: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } })
}

let chamadasAoProvedor = 0
let resposta: () => Response | Promise<Response>

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ sttTranscribeProxy: stt } = await h.load<any>('../../server/ai/sttProxy'))
  ;({ mtTranslateProxy: mt } = await h.load<any>('../../server/ai/mtProxy'))
  ;({ subscriptionsRepo: subs } = await h.load<any>('../../server/db/repositories/subscriptions'))
  adm = await h.load<any>('../../server/ai/admissao')
  disj = await h.load<any>('../../server/ai/disjuntor')
  metricas = await h.load<any>('../../server/http/metricas')
})
afterAll(async () => {
  await h.cleanup()
})
beforeEach(() => {
  process.env.AUTH_REQUIRED = '1'
  process.env.GROQ_API_KEY = 'chave-stt'
  // IP público literal: `assertPublicUrl` resolve DNS de verdade, e api.groq.com não é assunto aqui.
  process.env.GROQ_BASE_URL = 'http://203.0.113.20/v1'
  process.env.STT_MODEL = ''
  /* Sem RESERVA: com OPENROUTER_API_KEY no .env de quem roda, a cascata ganha uma 2ª perna com balde
     próprio, e o caso de prioridade passaria pela reserva em vez de receber 429. */
  delete process.env.OPENROUTER_API_KEY
  delete process.env.LLM_RESERVA_BASE_URL
  delete process.env.LLM_RESERVA_API_KEY
  delete process.env.LLM_RESERVA_MODEL
  chamadasAoProvedor = 0
  resposta = () => respostaJson({ text: 'olá mundo', language: 'portuguese', duration: 2 })
  vi.stubGlobal('fetch', async (u: unknown) => {
    /* Só o PROVEDOR conta: o exportador do Langfuse (ligado pelo .env de quem roda) também usa `fetch`. */
    if (!/\/(audio\/transcriptions|chat\/completions)$/.test(String(u))) return new Response('{}', { status: 200 })
    chamadasAoProvedor++
    return resposta()
  })
  adm.esquecerAdmissao()
  disj.esquecerDisjuntores()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  // '' e não `delete`: o dotenv devolveria a variável do .env de quem roda.
  for (const e of ENVS) process.env[e] = ''
  delete process.env.AUTH_REQUIRED
})

async function assinante(id: string, plan: 'pro' | 'essencial' = 'pro') {
  const u = asUserId(id)
  await subs.upsert(u, { plan, status: 'active' })
  return u
}

describe('balde por provedor e modelo (unidade)', () => {
  it('Pro alcança o balde inteiro; Essencial para na reserva do Pro; convidado na metade', () => {
    process.env.IA_ADMISSAO_STT_RPM = '20'
    const agora = Date.UTC(2026, 8, 25, 12)
    const contar = (plano: string, modelo: string) => {
      let n = 0
      while (adm.admitirNoBalde({ tipo: 'stt', provedor: 'groq', modelo, plano, agora }).ok) n++
      return n
    }
    expect(contar('pro', 'm-pro')).toBe(20)
    expect(contar('essencial', 'm-ess')).toBe(16)
    expect(contar('convidado', 'm-conv')).toBe(10)
  })

  it('reabastece com o tempo, e a recusa diz quanto esperar', () => {
    process.env.IA_ADMISSAO_STT_RPM = '20'
    const t0 = Date.UTC(2026, 8, 25, 12)
    for (let i = 0; i < 20; i++)
      adm.admitirNoBalde({ tipo: 'stt', provedor: 'groq', modelo: 'm', plano: 'pro', agora: t0 })
    const recusa = adm.admitirNoBalde({ tipo: 'stt', provedor: 'groq', modelo: 'm', plano: 'pro', agora: t0 })
    expect(recusa.ok).toBe(false)
    expect(recusa.recusa).toEqual({ motivo: 'minuto', retryAfterS: 3 }) // 1 pedido a cada 3 s
    expect(adm.admitirNoBalde({ tipo: 'stt', provedor: 'groq', modelo: 'm', plano: 'pro', agora: t0 + 3_000 }).ok).toBe(
      true,
    )
  })

  it('ticket devolvido põe o pedido de volta (recusa nossa não gasta o limite do provedor)', () => {
    process.env.IA_ADMISSAO_STT_RPM = '1'
    const t0 = Date.UTC(2026, 8, 25, 12)
    const r = adm.admitirNoBalde({ tipo: 'stt', provedor: 'groq', modelo: 'm', plano: 'pro', agora: t0 })
    expect(adm.admitirNoBalde({ tipo: 'stt', provedor: 'groq', modelo: 'm', plano: 'pro', agora: t0 }).ok).toBe(false)
    r.ticket.devolver()
    r.ticket.devolver() // idempotente
    expect(adm.admitirNoBalde({ tipo: 'stt', provedor: 'groq', modelo: 'm', plano: 'pro', agora: t0 }).ok).toBe(true)
    expect(adm.admitirNoBalde({ tipo: 'stt', provedor: 'groq', modelo: 'm', plano: 'pro', agora: t0 }).ok).toBe(false)
  })

  it('teto diário de tokens do LLM, com reserva do Pro', () => {
    const t0 = Date.UTC(2026, 8, 25, 12)
    const pedir = (plano: string, tokens: number) =>
      adm.admitirNoBalde({ tipo: 'llm', provedor: 'groq', modelo: 'gpt', plano, tokens, agora: t0 })
    expect(pedir('essencial', 150_000).ok).toBe(true)
    const r = pedir('essencial', 20_000) // 170K > 80% de 200K
    expect(r.ok).toBe(false)
    expect(r.recusa.motivo).toBe('tokens_dia')
    expect(r.recusa.retryAfterS).toBe(12 * 3600) // até a meia-noite UTC
    expect(pedir('pro', 20_000).ok).toBe(true)
  })

  it('429 do provedor zera o saldo e fecha o balde até o Retry-After', () => {
    const t0 = Date.UTC(2026, 8, 25, 12)
    adm.registrarLimiteNaAdmissao('stt', 'groq', 'm', 7, t0)
    const r = adm.admitirNoBalde({ tipo: 'stt', provedor: 'groq', modelo: 'm', plano: 'pro', agora: t0 + 1_000 })
    expect(r.recusa).toEqual({ motivo: 'provedor_limitou', retryAfterS: 6 })
    expect(adm.admitirNoBalde({ tipo: 'stt', provedor: 'groq', modelo: 'm', plano: 'pro', agora: t0 + 7_000 }).ok).toBe(
      true,
    )
  })

  it('Retry-After em segundos ou como data HTTP', () => {
    const agora = Date.UTC(2026, 8, 25, 12)
    expect(adm.segundosDoRetryAfter('2')).toBe(2)
    expect(adm.segundosDoRetryAfter(new Date(agora + 10_000).toUTCString(), agora)).toBe(10)
    expect(adm.segundosDoRetryAfter('lixo')).toBeUndefined()
    expect(adm.segundosDoRetryAfter(null)).toBeUndefined()
  })
})

describe('POST /api/ai/stt — admissão', () => {
  it('25 simultâneos contra 20/min → 20 atendidos, 5 com 429 + Retry-After, provedor chamado 20 vezes', async () => {
    process.env.IA_ADMISSAO_STT_RPM = '20'
    const usuarios = await Promise.all(Array.from({ length: 25 }, (_, i) => assinante(`adm-25-${i}`)))
    const respostas = await Promise.all(
      usuarios.map(async (u) => {
        const res = mockRes()
        await stt(req(u, wavPcm(2)), res)
        return res
      }),
    )
    const ok = respostas.filter((r) => r.statusCode === 200)
    const recusadas = respostas.filter((r) => r.statusCode === 429)
    expect(ok).toHaveLength(20)
    expect(recusadas).toHaveLength(5)
    for (const r of recusadas) {
      expect(r.body.code).toBe('nuvem_ocupada')
      expect(Number(r.headers['retry-after'])).toBeGreaterThanOrEqual(1)
    }
    expect(chamadasAoProvedor).toBe(20) // zero retentativas
  })

  it('balde quase vazio: o Pro passa e o Essencial recebe 429', async () => {
    process.env.IA_ADMISSAO_STT_RPM = '5' // reserva do Pro = 20% = 1 pedido
    const pro = await assinante('adm-baixo-pro')
    const ess = await assinante('adm-baixo-ess', 'essencial')
    for (let i = 0; i < 4; i++) {
      const res = mockRes()
      await stt(req(pro, wavPcm(1)), res)
      expect(res.statusCode).toBe(200)
    }
    const doEssencial = mockRes()
    await stt(req(ess, wavPcm(1)), doEssencial)
    expect(doEssencial.statusCode).toBe(429)
    expect(doEssencial.body.code).toBe('nuvem_ocupada')

    const doPro = mockRes()
    await stt(req(pro, wavPcm(1)), doPro)
    expect(doPro.statusCode).toBe(200)
    expect(chamadasAoProvedor).toBe(5)
  })

  it('2ª STT simultânea do mesmo usuário → 429 enquanto a 1ª está em voo', async () => {
    const u = await assinante('adm-em-voo')
    let soltar!: () => void
    const provedorLento = new Promise<void>((r) => (soltar = r))
    let chegou!: () => void
    const noProvedor = new Promise<void>((r) => (chegou = r))
    resposta = async () => {
      chegou()
      await provedorLento
      return respostaJson({ text: 'primeira' })
    }
    const primeira = mockRes()
    const emVoo = stt(req(u, wavPcm(1)), primeira)
    await noProvedor

    const segunda = mockRes()
    await stt(req(u, wavPcm(1)), segunda)
    expect(segunda.statusCode).toBe(429)
    expect(segunda.body.code).toBe('nuvem_ocupada')
    expect(segunda.body.detalhes.motivo).toBe('em_voo')
    expect(segunda.headers['retry-after']).toBe('1')

    soltar()
    await emVoo
    expect(primeira.statusCode).toBe(200)
    // A vaga foi solta: a próxima passa.
    const terceira = mockRes()
    await stt(req(u, wavPcm(1)), terceira)
    expect(terceira.statusCode).toBe(200)
    expect(chamadasAoProvedor).toBe(2)
  })

  it('429 do provedor → cliente recebe 429 nuvem_ocupada com o Retry-After dele, UMA chamada, e o balde fecha', async () => {
    const u = await assinante('adm-429')
    resposta = () => new Response('rate limited', { status: 429, headers: { 'retry-after': '7' } })
    const res = mockRes()
    await stt(req(u, wavPcm(1)), res)
    expect(res.statusCode).toBe(429)
    expect(res.body.code).toBe('nuvem_ocupada')
    expect(res.headers['retry-after']).toBe('7')
    expect(chamadasAoProvedor).toBe(1)

    // O balde ficou fechado: a próxima fala nem chega ao provedor.
    const outro = await assinante('adm-429-b')
    const seguinte = mockRes()
    await stt(req(outro, wavPcm(1)), seguinte)
    expect(seguinte.statusCode).toBe(429)
    expect(seguinte.body.detalhes.motivo).toBe('provedor_limitou')
    expect(chamadasAoProvedor).toBe(1)
  })

  it('5xx repete UMA vez; cinco 5xx seguidos abrem o disjuntor e a próxima fala sai em 503 sem chamar', async () => {
    const u = await assinante('adm-5xx')
    resposta = () => new Response('caiu', { status: 503 })
    const primeira = mockRes()
    await stt(req(u, wavPcm(1)), primeira)
    expect(primeira.statusCode).toBe(502)
    expect(chamadasAoProvedor).toBe(2)

    await stt(req(u, wavPcm(1)), mockRes()) // 4 falhas
    await stt(req(u, wavPcm(1)), mockRes()) // 5ª falha abre; a retentativa não sai
    expect(chamadasAoProvedor).toBe(5)
    const aberto = mockRes()
    await stt(req(u, wavPcm(1)), aberto)
    expect(aberto.statusCode).toBe(503)
    expect(aberto.body.code).toBe('provedor_em_disjuntor')
    expect(Number(aberto.headers['retry-after'])).toBeGreaterThanOrEqual(1)
    expect(chamadasAoProvedor).toBe(5)
  })

  it('a recusa entra em ia_admissao_recusada_total{motivo,plano}', async () => {
    process.env.METRICS_ENABLED = '1'
    metricas.handlerDeMetricas() // registra as métricas
    try {
      process.env.IA_ADMISSAO_STT_RPM = '1'
      const a = await assinante('adm-met-a')
      const b = await assinante('adm-met-b', 'essencial')
      await stt(req(a, wavPcm(1)), mockRes())
      await stt(req(b, wavPcm(1)), mockRes())
      const { register } = await import('prom-client')
      const texto = await register.metrics()
      expect(texto).toMatch(/ia_admissao_recusada_total\{motivo="minuto",plano="essencial"\} 1/)
      expect(texto).toMatch(/ia_admissao_saldo\{provedor="outro",modelo="whisper-large-v3-turbo"\} 0/)
    } finally {
      metricas.esquecerMetricas()
      delete process.env.METRICS_ENABLED
    }
  })
})

describe('POST /api/ai/mt — admissão e prioridade', () => {
  beforeEach(() => {
    process.env.LLM_API_KEY = 'chave-llm'
    process.env.LLM_BASE_URL = 'http://203.0.113.30/v1'
    process.env.LLM_MODEL = 'modelo-mt'
    resposta = () =>
      respostaJson({ choices: [{ message: { content: 'olá' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })
  })

  it('balde quase vazio: o Pro traduz e o Essencial recebe 429 nuvem_ocupada, antes de gastar cota', async () => {
    process.env.IA_ADMISSAO_LLM_RPM = '5'
    const pro = await assinante('adm-mt-pro')
    const ess = await assinante('adm-mt-ess', 'essencial')
    for (let i = 0; i < 4; i++) {
      const res = mockRes()
      await mt(req(pro, { text: `frase ${i}`, tgt: 'pt' }), res)
      expect(res.statusCode).toBe(200)
    }
    const doEssencial = mockRes()
    await mt(req(ess, { text: 'frase do essencial', tgt: 'pt' }), doEssencial)
    expect(doEssencial.statusCode).toBe(429)
    expect(doEssencial.body.code).toBe('nuvem_ocupada')
    expect(Number(doEssencial.headers['retry-after'])).toBeGreaterThanOrEqual(1)

    const doPro = mockRes()
    await mt(req(pro, { text: 'frase do pro', tgt: 'pt' }), doPro)
    expect(doPro.statusCode).toBe(200)
    expect(chamadasAoProvedor).toBe(5)
  })
})

describe('a porta do STT vem ANTES do raw(): 402 sem ler o corpo', () => {
  let servidor: Server
  let porta: number
  let ultimoReq: any

  beforeAll(async () => {
    const { aiRouter } = await h.load<any>('../../server/routes/ai')
    const app = express()
    app.use((r: any, _res, next) => {
      r.userId = asUserId('adm-sem-plano') // sem assinatura: free, sem STT gerenciado
      ultimoReq = r
      next()
    })
    app.use('/api/ai', aiRouter)
    servidor = app.listen(0)
    await new Promise<void>((r) => servidor.once('listening', () => r()))
    porta = (servidor.address() as AddressInfo).port
  })
  afterAll(async () => {
    await new Promise<void>((r) => servidor.close(() => r()))
  })

  it('plano sem STT gerenciado → 402 enquanto o cliente AINDA está mandando o corpo de 20 MB', async () => {
    const declarado = 20 * 1024 * 1024
    const { status, corpo } = await new Promise<{ status: number; corpo: string }>((resolver, rejeitar) => {
      const r = requisicaoHttp(
        {
          host: '127.0.0.1',
          port: porta,
          method: 'POST',
          path: '/api/ai/stt',
          headers: { 'content-type': 'audio/wav', 'content-length': String(declarado) },
        },
        (res) => {
          let t = ''
          res.on('data', (c) => (t += c))
          res.on('end', () => {
            resolver({ status: res.statusCode ?? 0, corpo: t })
            r.destroy()
          })
        },
      )
      r.on('error', (e) => (String(e).includes('ECONNRESET') ? undefined : rejeitar(e)))
      // Só 1 KB dos 20 MB declarados: se o `raw()` lesse o corpo antes da porta, a resposta NUNCA viria.
      r.write(Buffer.alloc(1024))
    })
    expect(status).toBe(402)
    expect(JSON.parse(corpo).entitlement).toBe('managedCloudStt')
    // O corpo não foi consumido: o stream da requisição nunca chegou ao fim nem foi parar num Buffer.
    expect(ultimoReq.readableEnded).toBe(false)
    expect(Buffer.isBuffer(ultimoReq.body)).toBe(false)
    expect(chamadasAoProvedor).toBe(0)
  })
})
