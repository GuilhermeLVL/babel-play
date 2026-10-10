/**
 * QUANDO O CLIENTE DESISTE, A CHAMADA AO PROVEDOR É ABORTADA E A COTA VOLTA (auditoria de desempenho
 * do servidor de 10/10/2026, achado A7).
 *
 * As rotas de IA só tinham o relógio de cada tentativa (`AbortSignal.timeout`): quem fechava a aba,
 * trocava de tela ou cancelava o pedido deixava a transcrição, a tradução ou a voz rodando até o
 * fim no provedor. O resultado era pago, jogado fora e DEBITADO da cota de quem pediu; e no STT a
 * vaga em voo era solta no fechamento com a chamada ainda viva, então fechar e reabrir empilhava
 * chamadas.
 *
 * O que se prova, para tradução, transcrição e voz, com um provedor falso que NUNCA responde:
 *   - o `fetch` ao provedor recebe um sinal, e o sinal aborta quando a resposta fecha sem terminar;
 *   - o handler termina logo (nada fica pendurado esperando o relógio de 12 a 30 s);
 *   - tudo o que foi reservado em `usage_counters` volta, como já voltava em falha do provedor;
 *   - a vaga em voo é solta: o pedido seguinte do mesmo usuário é atendido;
 *   - a perna de reserva NÃO é chamada (ninguém mais espera a resposta);
 *   - o cancelamento não conta como falha do provedor no disjuntor.
 * E o caminho normal não muda: a resposta que termina não aborta nada.
 */
import { EventEmitter } from 'node:events'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { esvaziarCacheDeTraducao } from '../../server/ai/cacheDeTraducao'
import { esquecerDisjuntores, FALHAS_PARA_ABRIR } from '../../server/ai/disjuntor'
import { esquecerRegistro } from '../../server/ai/registroDeProvedores'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'
import { PLANO_PAGO } from '../harness/planoPago'
import { wavPcm } from '../harness/wav'

const ENVS = ['IA_PROVEDORES', 'DEEPINFRA_API_KEY', 'GROQ_API_KEY', 'LLM_API_KEY', 'OPENROUTER_API_KEY'] as const
const USUARIO = asUserId('cancela-ia')

const pernaDeVoz = (id: string, base: string) => ({
  id,
  formato: 'openai',
  base,
  chave: 'DEEPINFRA_API_KEY',
  retencao: 'zdr',
  modelos: [{ id: 'ResembleAI/chatterbox-multilingual', funcoes: ['tts'], preco: { milhaoDeCaracteres: 1 } }],
})

let h: EphemeralDb
let mt: (req: any, res: any) => Promise<void>
let stt: (req: any, res: any) => Promise<void>
let tts: (req: any, res: any) => Promise<void>
let esvaziarCacheDeVoz: () => void
let flags: any
let db: any
let usageCounters: any

/** Uma resposta com o mínimo que o Express tem e o handler usa: eventos, estado e escrita. */
function respostaFalsa(): any {
  const r: any = new EventEmitter()
  r.statusCode = 200
  r.headersSent = false
  r.writableFinished = false
  r.headers = {} as Record<string, string>
  const terminar = (corpo: unknown) => {
    r.body = corpo
    r.headersSent = true
    r.writableFinished = true
    r.emit('close')
    return r
  }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = terminar
  r.send = terminar
  r.setHeader = (k: string, v: string) => ((r.headers[k.toLowerCase()] = v), r)
  /** O cliente foi embora antes de a resposta terminar. */
  r.clienteFecha = () => r.emit('close')
  return r
}

interface Chamada {
  url: string
  sinal: AbortSignal | undefined
}

/**
 * O provedor que demora para sempre: a promessa só termina quando o sinal do pedido aborta, como o
 * `fetch` de verdade. `responder` troca o comportamento para as chamadas seguintes.
 */
function provedorLento() {
  const chamadas: Chamada[] = []
  let resposta: (() => Response) | null = null
  vi.stubGlobal('fetch', (u: unknown, init: any) => {
    const sinal = init?.signal as AbortSignal | undefined
    chamadas.push({ url: String(u), sinal })
    if (resposta) return Promise.resolve(resposta())
    return new Promise<Response>((_ok, erro) => {
      const abortar = () => erro(sinal?.reason ?? new DOMException('aborted', 'AbortError'))
      if (sinal?.aborted) abortar()
      else sinal?.addEventListener('abort', abortar, { once: true })
    })
  })
  return {
    chamadas,
    responder: (f: () => Response) => {
      resposta = f
    },
  }
}

async function ate(condicao: () => boolean, ms = 3000): Promise<void> {
  const fim = Date.now() + ms
  while (!condicao()) {
    if (Date.now() > fim) throw new Error('a condição não aconteceu a tempo')
    await new Promise((r) => setTimeout(r, 5))
  }
}

/** Tudo o que a conta tem reservado ou consumido, por métrica e janela (zeros de fora). */
async function contadores(): Promise<Record<string, number>> {
  const { eq } = await import('drizzle-orm')
  const linhas = await db.select().from(usageCounters).where(eq(usageCounters.userId, USUARIO))
  const fora: Record<string, number> = {}
  /* Os baldes do limitador de taxa (`rl:`) não são cota; aqui nem existem (o handler é chamado direto). */
  for (const l of linhas) if (l.count > 0) fora[`${l.metric}|${l.window}`] = l.count
  return fora
}

const dentroDe = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<never>((_r, erro) => setTimeout(() => erro(new Error(`pendurado por ${ms} ms`)), ms))])

const pedidoDeTraducao = (texto = 'where is the station?') => ({
  userId: USUARIO,
  requestId: 'r-cancela',
  body: { text: texto, tgt: 'pt', src: 'en' },
  header: () => undefined,
  headers: {},
})
const pedidoDeStt = () => ({
  userId: USUARIO,
  requestId: 'r-cancela',
  body: wavPcm(4),
  header: () => undefined,
  headers: {},
})
const pedidoDeVoz = (texto = 'Where is the train station?') => ({
  userId: USUARIO,
  requestId: 'r-cancela',
  body: { texto, idioma: 'en' },
  header: () => undefined,
  headers: {},
})

const okDoLlm = () =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: 'onde fica a estação?' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
const okDoStt = () =>
  new Response(JSON.stringify({ text: 'hello there', language: 'english' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
const okDaVoz = () => new Response(Buffer.from('ID3-audio'), { status: 200, headers: { 'content-type': 'audio/mpeg' } })

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ mtTranslateProxy: mt } = await h.load<any>('../../server/ai/mtProxy'))
  ;({ sttTranscribeProxy: stt } = await h.load<any>('../../server/ai/sttProxy'))
  ;({ ttsProxy: tts, esvaziarCacheDeVoz } = await h.load<any>('../../server/ai/ttsProxy'))
  ;({ db } = await h.load<any>('../../server/db/db'))
  ;({ usageCounters } = await h.load<any>('../../server/db/schema'))
  flags = await h.load<any>('../../server/lib/flags')
  const { subscriptionsRepo } = await h.load<any>('../../server/db/repositories/subscriptions')
  await subscriptionsRepo.upsert(USUARIO, { plan: PLANO_PAGO, status: 'active' })
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  for (const e of ENVS) process.env[e] = ''
  await h.cleanup()
})
beforeEach(async () => {
  for (const e of ENVS) process.env[e] = ''
  esvaziarCacheDeTraducao()
  esvaziarCacheDeVoz()
})
afterEach(() => {
  vi.unstubAllGlobals()
  esquecerDisjuntores()
  esquecerAdmissao()
  esquecerRegistro()
})

interface Caso {
  nome: string
  preparar: () => Promise<void>
  handler: () => (req: any, res: any) => Promise<void>
  pedido: (variacao?: string) => any
  ok: () => Response
}

const CASOS: Caso[] = [
  {
    nome: 'tradução (POST /api/ai/mt)',
    preparar: async () => {
      process.env.GROQ_API_KEY = 'k'
    },
    handler: () => mt,
    pedido: (v) => pedidoDeTraducao(v),
    ok: okDoLlm,
  },
  {
    nome: 'transcrição (POST /api/ai/stt)',
    preparar: async () => {
      process.env.GROQ_API_KEY = 'k'
    },
    handler: () => stt,
    pedido: () => pedidoDeStt(),
    ok: okDoStt,
  },
  {
    nome: 'voz (POST /api/ai/tts)',
    preparar: async () => {
      process.env.IA_PROVEDORES = JSON.stringify({
        provedores: [
          pernaDeVoz('deepinfra', 'https://deepinfra.exemplo/v1/openai'),
          pernaDeVoz('reserva-voz', 'https://reserva-voz.exemplo/v1/openai'),
        ],
      })
      process.env.DEEPINFRA_API_KEY = 'chave-falsa'
      await flags.definirFlag('voz_natural', { habilitada: true }, 'teste')
    },
    handler: () => tts,
    pedido: (v) => pedidoDeVoz(v),
    ok: okDaVoz,
  },
]

describe.each(CASOS)('cliente desiste: $nome', (caso) => {
  it('o fetch ao provedor é abortado, o handler termina e a cota reservada volta', async () => {
    await caso.preparar()
    const provedor = provedorLento()
    const antes = await contadores()
    const res = respostaFalsa()
    const emCurso = caso.handler()(caso.pedido(), res)
    await ate(() => provedor.chamadas.length === 1)
    /* Com a chamada em voo a cota ESTÁ reservada: é isso que o cancelamento precisa devolver. */
    expect(await contadores()).not.toEqual(antes)
    expect(provedor.chamadas[0].sinal?.aborted).toBe(false)

    res.clienteFecha()
    await dentroDe(emCurso, 2000)

    expect(provedor.chamadas[0].sinal?.aborted).toBe(true)
    /* Ninguém mais espera a resposta: a perna de reserva não é chamada, e nada é respondido. */
    expect(provedor.chamadas).toHaveLength(1)
    expect(res.body).toBeUndefined()
    expect(res.statusCode).toBe(499)
    expect(await contadores()).toEqual(antes)
  })

  it('a vaga em voo é solta: o pedido seguinte do mesmo usuário é atendido', async () => {
    await caso.preparar()
    const provedor = provedorLento()
    const res = respostaFalsa()
    const emCurso = caso.handler()(caso.pedido(), res)
    await ate(() => provedor.chamadas.length === 1)
    res.clienteFecha()
    await dentroDe(emCurso, 2000)

    provedor.responder(caso.ok)
    const segunda = respostaFalsa()
    await dentroDe(caso.handler()(caso.pedido('good morning to you'), segunda), 2000)
    expect(segunda.statusCode).toBe(200)
  })

  it('cancelar não conta como falha do provedor: o disjuntor continua fechado', async () => {
    await caso.preparar()
    const provedor = provedorLento()
    for (let i = 0; i < FALHAS_PARA_ABRIR + 1; i++) {
      const res = respostaFalsa()
      const emCurso = caso.handler()(caso.pedido(`frase número ${i}`), res)
      await ate(() => provedor.chamadas.length === i + 1)
      res.clienteFecha()
      await dentroDe(emCurso, 2000)
    }
    const antes = provedor.chamadas.length
    provedor.responder(caso.ok)
    const res = respostaFalsa()
    await dentroDe(caso.handler()(caso.pedido('one more sentence'), res), 2000)
    expect(res.statusCode).toBe(200)
    /* A chamada seguinte foi ao MESMO provedor: ele não entrou em disjuntor. */
    expect(provedor.chamadas.length).toBe(antes + 1)
    expect(provedor.chamadas[antes].url).toBe(provedor.chamadas[0].url)
  })

  it('a resposta que termina normalmente não aborta nada, e consome a cota', async () => {
    await caso.preparar()
    const provedor = provedorLento()
    provedor.responder(caso.ok)
    const antes = await contadores()
    const res = respostaFalsa()
    await dentroDe(caso.handler()(caso.pedido('a completely different phrase'), res), 2000)
    expect(res.statusCode).toBe(200)
    expect(provedor.chamadas).toHaveLength(1)
    expect(provedor.chamadas[0].sinal).toBeDefined()
    expect(provedor.chamadas[0].sinal?.aborted).toBe(false)
    expect(await contadores()).not.toEqual(antes)
  })
})

describe('o handler chamado sem resposta de verdade (os testes de rota) continua funcionando', () => {
  it('sem `on` na resposta não há sinal do cliente, só o relógio da tentativa', async () => {
    process.env.GROQ_API_KEY = 'k'
    const provedor = provedorLento()
    provedor.responder(okDoLlm)
    const res: any = { statusCode: 200, headersSent: false }
    res.status = (c: number) => ((res.statusCode = c), res)
    res.json = (b: unknown) => ((res.body = b), res)
    await mt(pedidoDeTraducao('plain response object'), res)
    expect(res.statusCode).toBe(200)
    expect(provedor.chamadas[0].sinal).toBeDefined()
  })
})

describe('sinalDoCliente numa resposta HTTP de verdade', () => {
  it('aborta quando o cliente derruba a conexão, e não aborta quando a resposta termina', async () => {
    const http = await import('node:http')
    const { sinalDoCliente } = await import('../../server/ai/cancelamento')
    const sinais: AbortSignal[] = []
    const servidor = http.createServer((req, res) => {
      const sinal = sinalDoCliente(res as any) as AbortSignal
      sinais.push(sinal)
      if (req.url === '/rapida') res.end('ok')
      /* `/lenta` nunca responde: só o cliente indo embora encerra. */
    })
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
    const { port } = servidor.address() as import('node:net').AddressInfo
    try {
      await new Promise<void>((ok, erro) => {
        http
          .get({ host: '127.0.0.1', port, path: '/rapida', agent: false }, (r) => r.resume().on('end', ok))
          .on('error', erro)
      })
      await ate(() => sinais.length === 1)
      const lenta = http.get({ host: '127.0.0.1', port, path: '/lenta', agent: false })
      lenta.on('error', () => {})
      await ate(() => sinais.length === 2)
      expect(sinais[1].aborted).toBe(false)
      lenta.destroy()
      await ate(() => sinais[1].aborted)
      expect(sinais[0].aborted).toBe(false)
    } finally {
      servidor.closeAllConnections()
      await new Promise((r) => servidor.close(r))
    }
  })
})
