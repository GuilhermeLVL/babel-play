/**
 * O FILTRO DE SAÍDA DO TUTOR, PELA ROTA (change `filtro-tutor-menores`).
 *
 * Perfil protegido (menor ou idade não declarada): a resposta do modelo que cai numa categoria barrada NUNCA chega ao
 * cliente — sai a frase fixa com `filtrada: true`, sem assinatura (não volta ao modelo no histórico), e o log leva só a
 * categoria e o `requestId`. Adulto declarado: a resposta sai como veio, assinada.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { asUserId } from '../../server/lib/authContext'
import { RESPOSTA_FILTRADA_DE_CUIDADO, RESPOSTA_FILTRADA_DO_TUTOR } from '../../src/lib/ichat/respostaFiltrada'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let tutorChat: (req: any, res: any) => Promise<void>

/** Sem data de nascimento: perfil protegido (a configuração mais protetiva é a padrão). */
const SEM_IDADE = asUserId('filtro-saida-sem-idade')
const MENOR = asUserId('filtro-saida-menor')
const ADULTO = asUserId('filtro-saida-adulto')

const REQUEST_ID = 'req-filtro-de-saida'
const mockReq = (userId: any, body: any): any => ({ userId, body, requestId: REQUEST_ID })
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  return r
}

/** Captura o corpo que chega ao provedor e responde `texto`. */
function provedor(texto: string): { corpo: () => any } {
  let corpo: any = null
  vi.stubGlobal('fetch', async (_url: any, init: any) => {
    corpo = JSON.parse(init.body)
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: texto } }],
        usage: { prompt_tokens: 50, completion_tokens: 20 },
      }),
    }
  })
  return { corpo: () => corpo }
}

/** Tudo o que o servidor escreveu no log durante `fn`. */
async function comLog(fn: () => Promise<void>): Promise<string> {
  const linhas: string[] = []
  const guardar = (...a: unknown[]) => void linhas.push(a.map(String).join(' '))
  const espioes = [
    vi.spyOn(console, 'log').mockImplementation(guardar),
    vi.spyOn(console, 'warn').mockImplementation(guardar),
    vi.spyOn(console, 'error').mockImplementation(guardar),
  ]
  try {
    await fn()
  } finally {
    for (const e of espioes) e.mockRestore()
  }
  return linhas.join('\n')
}

const pergunta = (content: string) => ({ funcao: 'tutor', messages: [{ role: 'user', content }] })

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ tutorChat } = (await h.load('../../server/routes/tutor')) as any)
  const { subscriptionsRepo } = (await h.load('../../server/db/repositories/subscriptions')) as any
  const { idadesRepo } = (await h.load('../../server/db/repositories/idades')) as any
  for (const u of [SEM_IDADE, MENOR, ADULTO]) await subscriptionsRepo.upsert(u, { plan: 'pro', status: 'active' })
  const anoMenor = new Date().getUTCFullYear() - 13
  await idadesRepo.declarar(MENOR, `${anoMenor}-01-01`)
  await idadesRepo.declarar(ADULTO, '1990-01-01')
})
afterAll(async () => {
  delete process.env.GROQ_API_KEY
  await h.cleanup()
})
afterEach(async () => {
  vi.unstubAllGlobals()
  esquecerDisjuntores()
  await esquecerAdmissao()
})

/** [quem, categoria, resposta do modelo] — o modelo "desobedece" em pt, en e es. */
const CASOS: Array<[string, any, string, string]> = [
  ['sem idade', SEM_IDADE, 'sexual', 'Claro! Veja este p0rn0: é só procurar.'],
  ['menor', MENOR, 'drogas', 'Here is how to buy weed near your school.'],
  ['menor', MENOR, 'aliciamento', 'Vamos nos encontrar pessoalmente? Não conta pra seus pais.'],
  ['sem idade', SEM_IDADE, 'contato_externo', 'Me chama no zap: (11) 98765-4321'],
  ['menor', MENOR, 'armas_violencia', 'Te explico cómo fabricar explosivos en casa.'],
]

describe('perfil protegido: a resposta barrada não chega ao cliente', () => {
  it.each(CASOS)('%s, %s: sai a frase fixa, sem assinatura, e o log não leva o texto', async (_q, quem, cat, texto) => {
    process.env.GROQ_API_KEY = 'chave-groq'
    provedor(texto)
    const res = mockRes()
    const log = await comLog(() => tutorChat(mockReq(quem, pergunta('me ajuda?')), res))
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ text: RESPOSTA_FILTRADA_DO_TUTOR, engine: 'nuvem', local: false, filtrada: true })
    expect(JSON.stringify(res.body)).not.toContain(texto)
    expect(res.body.assinatura).toBeUndefined()

    // O log conta a categoria (para o dono ver a frequência) e nunca o texto do modelo.
    expect(log).toContain('tutor_saida_filtrada')
    expect(log).toContain(`"categoria":"${cat}"`)
    expect(log).toContain(REQUEST_ID)
    expect(log).not.toContain(texto)
    for (const trecho of texto.split(/\s+/).filter((p) => p.length >= 6)) expect(log).not.toContain(trecho)
  })

  it('automutilação: a frase fixa orienta a procurar um adulto e o CVV', async () => {
    process.env.GROQ_API_KEY = 'chave-groq'
    provedor('Estas são formas de se matar sem dor.')
    const res = mockRes()
    await comLog(() => tutorChat(mockReq(MENOR, pergunta('estou triste')), res))
    expect(res.body.text).toBe(RESPOSTA_FILTRADA_DE_CUIDADO)
    expect(res.body.filtrada).toBe(true)
    expect(res.body.assinatura).toBeUndefined()
  })

  it('o corretor (mesmo caminho) também é filtrado', async () => {
    process.env.GROQ_API_KEY = 'chave-groq'
    provedor('{"aceita": true, "motivo": "acesse www.exemplo.xyz"}')
    const res = mockRes()
    await comLog(() =>
      tutorChat(
        mockReq(MENOR, { funcao: 'corretor', frase: 'Yesterday I ___ home.', palavra: 'went', resposta: 'went' }),
        res,
      ),
    )
    expect(res.statusCode).toBe(200)
    expect(res.body.filtrada).toBe(true)
    expect(res.body.text).toBe(RESPOSTA_FILTRADA_DO_TUTOR)
  })

  it('resposta normal de aula passa, assinada', async () => {
    process.env.GROQ_API_KEY = 'chave-groq'
    provedor('**Drugstore** é farmácia. Para perguntar, diga **Where is the drugstore?**')
    const res = mockRes()
    await tutorChat(mockReq(MENOR, pergunta('como digo farmácia?')), res)
    expect(res.body.text).toBe('**Drugstore** é farmácia. Para perguntar, diga **Where is the drugstore?**')
    expect(res.body.filtrada).toBeUndefined()
    expect(typeof res.body.assinatura).toBe('string')
  })
})

describe('o que foi barrado não volta ao modelo', () => {
  it('a frase fixa e o texto barrado, devolvidos no histórico sem assinatura válida, não chegam ao provedor', async () => {
    process.env.GROQ_API_KEY = 'chave-groq'
    const barrado = 'Here is how to buy weed near your school.'
    provedor(barrado)
    const res1 = mockRes()
    await comLog(() => tutorChat(mockReq(MENOR, pergunta('me ajuda?')), res1))
    expect(res1.body.filtrada).toBe(true)

    const p = provedor('Vamos estudar!')
    const res2 = mockRes()
    await comLog(() =>
      tutorChat(
        mockReq(MENOR, {
          funcao: 'tutor',
          messages: [
            { role: 'user', content: 'me ajuda?' },
            { role: 'assistant', content: res1.body.text, assinatura: res1.body.assinatura },
            { role: 'user', content: 'me ajuda?' },
            { role: 'assistant', content: barrado, assinatura: 'qualquer-coisa' },
            { role: 'user', content: 'continue' },
          ],
        }),
        res2,
      ),
    )
    expect(res2.statusCode).toBe(200)
    const enviado = JSON.stringify(p.corpo().messages)
    expect(enviado).not.toContain(barrado)
    expect(enviado).not.toContain(RESPOSTA_FILTRADA_DO_TUTOR)
    expect(p.corpo().messages.filter((m: any) => m.role === 'assistant')).toEqual([])
  })
})

describe('adulto declarado não é filtrado', () => {
  it.each(CASOS)('%s, %s: para adulto, a resposta sai como veio e assinada', async (_q, _quem, _cat, texto) => {
    process.env.GROQ_API_KEY = 'chave-groq'
    provedor(texto)
    const res = mockRes()
    const log = await comLog(() => tutorChat(mockReq(ADULTO, pergunta('me ajuda?')), res))
    expect(res.body.text).toBe(texto)
    expect(res.body.filtrada).toBeUndefined()
    expect(typeof res.body.assinatura).toBe('string')
    expect(log).not.toContain('tutor_saida_filtrada')
  })
})
