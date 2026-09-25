/**
 * STT DE NUVEM: A COTA QUE O PLANO PROMETE E O TEXTO QUE O WHISPER DEVOLVE.
 *
 * Duas correções no mesmo proxy (`server/ai/sttProxy.ts`), cada uma com o seu porquê:
 *
 *  1. COTA HONESTA. A cota do assinante (`stt_seconds`) era debitada pelo que o PROVEDOR fatura —
 *     no mínimo 10 s por requisição. O VAD entrega falas de até ~6 s, então cada fala custava 10 s
 *     ao usuário e as "15 h" do Essencial viravam ~9 h de fala. Agora a cota conta a duração REAL
 *     (arredondada para cima, piso de 1 s), e o mínimo de 10 s fica só onde ele é verdade: no
 *     orçamento GLOBAL de IA, que é o dinheiro que sai do dono.
 *
 *  2. QUALIDADE. O áudio ia sem `temperature` e sem `prompt`, os `segments` do `verbose_json` eram
 *     jogados fora e o filtro de alucinação (`src/gateway/alucinacao.ts`) só valia para o Whisper
 *     LOCAL — o da nuvem entregava "Obrigado por assistir" em silêncio como se fosse fala.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let stt: any
let subs: any
let counters: any
let gasto: any
let orc: any

const janela = () => new Date().toISOString().slice(0, 7)

/** WAV PCM 16 kHz mono 16 bits com `segundos` de silêncio. */
function wav(segundos: number): Buffer {
  const taxa = 16_000
  const dados = Math.round(taxa * segundos) * 2
  const b = Buffer.alloc(44 + dados)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + dados, 4)
  b.write('WAVE', 8)
  b.write('fmt ', 12)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(taxa, 24)
  b.writeUInt32LE(taxa * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(dados, 40)
  return b
}

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  return r
}

function req(userId: string, corpo: Buffer, headers: Record<string, string> = {}): any {
  return { userId, body: corpo, header: (n: string) => headers[n.toLowerCase()], requestId: 'r-stt' }
}

let formularios: FormData[] = []
let resposta: () => Response

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ sttTranscribeProxy: stt } = await h.load<any>('../../server/ai/sttProxy'))
  ;({ subscriptionsRepo: subs } = await h.load<any>('../../server/db/repositories/subscriptions'))
  ;({ usageCountersRepo: counters } = await h.load<any>('../../server/db/repositories/usageCounters'))
  ;({ gastoDeIaRepo: gasto } = await h.load<any>('../../server/db/repositories/gastoDeIa'))
  orc = await h.load<any>('../../server/lib/orcamentoDeIa')
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
  formularios = []
  resposta = () => respostaJson({ text: 'olá mundo', language: 'portuguese', duration: 6 })
  vi.stubGlobal('fetch', async (_url: unknown, init: { body: FormData }) => {
    formularios.push(init.body)
    return resposta()
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  // '' e não `delete`: o dotenv devolveria a variável do .env de quem roda.
  process.env.GROQ_API_KEY = ''
  process.env.GROQ_BASE_URL = ''
  delete process.env.AUTH_REQUIRED
})

async function pro(id: string) {
  const u = asUserId(id)
  await subs.upsert(u, { plan: 'pro', status: 'active' })
  return u
}

describe('cota honesta: o assinante paga a duração REAL; o orçamento global, a faturada', () => {
  it('uma fala de 6 s tira 6 s da cota do usuário — e soma 10 s ao gasto do dono', async () => {
    const u = await pro('stt-honesta-6s')
    const res = mockRes()
    await stt(req(u, wav(6)), res)
    expect(res.statusCode).toBe(200)
    expect(await counters.get(u, 'stt_seconds', janela())).toBe(6)
    const doMes = await gasto.ler(janela())
    expect(doMes?.microUsd).toBe(Math.round(orc.custoDeStt('whisper-large-v3-turbo', 10) * 1_000_000))
  })

  it('fala de 2,2 s custa 3 s; nunca 10', async () => {
    const u = await pro('stt-honesta-curta')
    await stt(req(u, wav(2.2)), mockRes())
    expect(await counters.get(u, 'stt_seconds', janela())).toBe(3)
  })

  it('provedor recusou: os segundos da cota são ESTORNADOS (simétrico à reserva)', async () => {
    const u = await pro('stt-honesta-estorno')
    resposta = () => new Response('não', { status: 400 })
    const res = mockRes()
    await stt(req(u, wav(6)), res)
    expect(res.statusCode).toBe(502)
    expect(await counters.get(u, 'stt_seconds', janela())).toBe(0)
    expect(await counters.get(u, 'managed_calls', janela())).toBe(0)
  })
})

describe('qualidade do STT de nuvem', () => {
  it('manda temperature=0 e pede verbose_json', async () => {
    const u = await pro('stt-temp')
    await stt(req(u, wav(2)), mockRes())
    expect(formularios[0].get('temperature')).toBe('0')
    expect(formularios[0].get('response_format')).toBe('verbose_json')
  })

  it('x-stt-prompt vira o campo `prompt` (decodificado)', async () => {
    const u = await pro('stt-prompt')
    await stt(req(u, wav(2), { 'x-stt-prompt': encodeURIComponent('Olá, tudo bem? Ação!') }), mockRes())
    expect(formularios[0].get('prompt')).toBe('Olá, tudo bem? Ação!')
  })

  it('sem o cabeçalho não há campo `prompt`', async () => {
    const u = await pro('stt-sem-prompt')
    await stt(req(u, wav(2)), mockRes())
    expect(formularios[0].has('prompt')).toBe(false)
  })

  it('prompt: caracteres de controle saem, e o teto de 224 guarda o FIM do texto', async () => {
    const u = await pro('stt-prompt-teto')
    const longo = 'a'.repeat(100) + '\u0007\n' + 'b'.repeat(200) + 'FIM'
    await stt(req(u, wav(2), { 'x-stt-prompt': encodeURIComponent(longo) }), mockRes())
    const p = String(formularios[0].get('prompt'))
    expect(Array.from(p)).toHaveLength(224)
    expect(p.endsWith('FIM')).toBe(true)
    // eslint-disable-next-line no-control-regex -- é exatamente o que não pode ter sobrado
    expect(p).not.toMatch(/[\u0000-\u001F\u007F]/)
  })

  it('prompt com codificação inválida é ignorado em silêncio (a transcrição segue)', async () => {
    const u = await pro('stt-prompt-invalido')
    const res = mockRes()
    await stt(req(u, wav(2), { 'x-stt-prompt': '%E0%A4%A' }), res)
    expect(res.statusCode).toBe(200)
    expect(formularios[0].has('prompt')).toBe(false)
  })

  it('segmentos: cai o silêncio com baixa confiança e o laço de repetição; o texto é remontado', async () => {
    const u = await pro('stt-segmentos')
    const avisos = vi.spyOn(console, 'log').mockImplementation(() => {})
    resposta = () =>
      respostaJson({
        text: ' A gente se vê amanhã. Obrigado por assistir la la la la la la',
        language: 'portuguese',
        duration: 6,
        segments: [
          { text: ' A gente se vê amanhã.', no_speech_prob: 0.05, avg_logprob: -0.2, compression_ratio: 1.1 },
          { text: ' Obrigado por assistir', no_speech_prob: 0.9, avg_logprob: -1.4, compression_ratio: 1.0 },
          { text: ' la la la la la la', no_speech_prob: 0.1, avg_logprob: -0.3, compression_ratio: 3.1 },
        ],
      })
    const res = mockRes()
    await stt(req(u, wav(6), { 'x-language': 'pt' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.text).toBe('A gente se vê amanhã.')
    expect(res.body.language).toBe('pt')

    /* O log diz QUANTOS e POR QUÊ — e nunca o texto. */
    const linhas = avisos.mock.calls.map((c) => String(c[0]))
    const evento = linhas.map((l) => JSON.parse(l)).find((l) => l.event === 'stt_segmentos_descartados')
    expect(evento).toMatchObject({ total: 3, semFala: 1, repeticao: 1 })
    expect(linhas.join('\n')).not.toMatch(/amanhã|assistir|la la/)
  })

  it('segmento com no_speech alto mas logprob CONFIANTE fica (os dois sinais juntos, não um só)', async () => {
    const u = await pro('stt-seg-confiante')
    resposta = () =>
      respostaJson({
        text: ' Sim.',
        language: 'portuguese',
        segments: [{ text: ' Sim.', no_speech_prob: 0.8, avg_logprob: -0.4, compression_ratio: 0.9 }],
      })
    const res = mockRes()
    await stt(req(u, wav(2), { 'x-language': 'pt' }), res)
    expect(res.body.text).toBe('Sim.')
  })

  it('o filtro de alucinação vale para a nuvem também: o que ele esvazia volta vazio (200)', async () => {
    const u = await pro('stt-alucinacao')
    resposta = () => respostaJson({ text: ' Obrigado por assistir!', language: 'portuguese' })
    const res = mockRes()
    await stt(req(u, wav(3), { 'x-language': 'pt' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.text).toBe('')
  })

  it('resposta em `json` (o provedor recusou verbose_json): sem segmentos, o texto passa só pelo filtro', async () => {
    const u = await pro('stt-json')
    let n = 0
    resposta = () => (++n === 1 ? new Response('formato', { status: 400 }) : respostaJson({ text: 'bom dia a todos' }))
    const res = mockRes()
    await stt(req(u, wav(3)), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.text).toBe('bom dia a todos')
    expect(formularios[1].get('response_format')).toBe('json')
    expect(formularios[1].get('temperature')).toBe('0')
  })
})
