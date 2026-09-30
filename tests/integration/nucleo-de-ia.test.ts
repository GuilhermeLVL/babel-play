/**
 * FASE F — O NÚCLEO DE IA CHAMADO DIRETO, SEM EXPRESS.
 *
 * As rotas do app (`/api/ai/mt`, `/mt/alternativas`, `/mt/polir`, `/tts`, `/stt`) viraram adaptadores
 * finos de funções que recebem um CONTEXTO (quem pede, já resolvido) e devolvem um RESULTADO tipado.
 * Os testes de rota continuam sendo a rede do comportamento de hoje; estes provam o que a Fase F
 * promete à API `/v1` e ao MCP: a mesma função, chamada sem `req` nem `res`, entrega e recusa com os
 * mesmos status, códigos e esperas — e o gancho `aoDecidir` é chamado uma vez, com o objeto devolvido.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { esquecerRegistro } from '../../server/ai/registroDeProvedores'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const PROVEDOR = {
  id: 'deepinfra',
  formato: 'openai',
  base: 'https://deepinfra.exemplo/v1/openai',
  chave: 'DEEPINFRA_API_KEY',
  retencao: 'zdr',
  modelos: [
    { id: 'openai/gpt-oss-20b', funcoes: ['traducao', 'tutor'], preco: { entrada: 0.03, saida: 0.14 } },
    { id: 'openai/gpt-oss-120b', funcoes: ['traducao'], niveis: ['nuance'], preco: { entrada: 0.04, saida: 0.2 } },
    { id: 'modelo-do-polimento', funcoes: ['traducao'], niveis: ['polimento'], preco: { entrada: 0.1, saida: 0.4 } },
  ],
}
/** A legenda ao vivo (sem pedir nível) vai pela rápida — o modelo mais barato do registro. */
const RAPIDA = 'openai/gpt-oss-20b'
const ENVS = [
  'IA_PROVEDORES',
  'DEEPINFRA_API_KEY',
  'GROQ_API_KEY',
  'LLM_API_KEY',
  'LLM_MODEL',
  'LLM_MODEL_GRANDE',
  'LLM_RESERVA_BASE_URL',
  'LLM_RESERVA_API_KEY',
  'LLM_RESERVA_MODEL',
  'OPENROUTER_API_KEY',
] as const

let h: EphemeralDb
let nucleoMt: typeof import('../../server/ai/nucleo/traduzirNoNivel')
let nucleoAlt: typeof import('../../server/ai/nucleo/sugerirAlternativas')
let contexto: typeof import('../../server/ai/nucleo/contexto')
let recusa: typeof import('../../server/ai/nucleo/recusa')
let resposta: typeof import('../../server/ai/respostaDoNucleo')
let admissao: typeof import('../../server/ai/admissao')
let orcamento: typeof import('../../server/lib/orcamentoDeIa')
let cache: typeof import('../../server/ai/cacheDeTraducao')
let getEntitlements: (plano: string) => any

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false, headers: {} as Record<string, string> }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.setHeader = (k: string, v: string) => ((r.headers[k.toLowerCase()] = v), r)
  return r
}

function rastroFalso() {
  return { conteudoPermitido: false, anotar: vi.fn(), tentativa: vi.fn(), encerrar: vi.fn() }
}

/** O contexto do app para um plano; `extra` sobrepõe (canal, perfil, modo…). */
function ctx(plano: string, extra: Record<string, unknown> = {}): any {
  return {
    userId: asUserId(`nucleo-${plano}`),
    requestId: 'r-nucleo',
    rastro: rastroFalso(),
    entitlements: getEntitlements(plano),
    emTeste: false,
    modo: 'plano',
    canal: 'app',
    perfilProtegido: null,
    ...extra,
  }
}

/** O provedor falso de chat: `status` diferente de 200 simula a falha; conta as chamadas. */
function provedorDeChat(responder: () => { status?: number; texto?: string }) {
  const chamadas: string[] = []
  vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
    chamadas.push(JSON.parse(init.body).model)
    const r = responder()
    if (r.status && r.status !== 200)
      return { ok: false, status: r.status, headers: new Headers(), text: async () => 'falha do provedor' }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: r.texto ?? '' } }],
        usage: { prompt_tokens: 40, completion_tokens: 10 },
      }),
    }
  })
  return chamadas
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  /* Sem AUTH_REQUIRED o plano de cota é o self-host (sem teto): estes testes são do núcleo, e a cota
     tem os dela (`quota-reserve-proxies`, `uso-justo-do-dia`). */
  delete process.env.AUTH_REQUIRED
  nucleoMt = await h.load('../../server/ai/nucleo/traduzirNoNivel')
  nucleoAlt = await h.load('../../server/ai/nucleo/sugerirAlternativas')
  contexto = await h.load('../../server/ai/nucleo/contexto')
  recusa = await h.load('../../server/ai/nucleo/recusa')
  resposta = await h.load('../../server/ai/respostaDoNucleo')
  admissao = await h.load('../../server/ai/admissao')
  orcamento = await h.load('../../server/lib/orcamentoDeIa')
  cache = await h.load('../../server/ai/cacheDeTraducao')
  ;({ getEntitlements } = await h.load<any>('../../server/lib/entitlements'))
})
afterAll(async () => {
  for (const e of ENVS) process.env[e] = ''
  await h.cleanup()
})
beforeEach(async () => {
  /* '' e não `delete`: o dotenv repõe a variável apagada a partir do .env de quem roda. */
  for (const e of ENVS) process.env[e] = ''
  process.env.IA_PROVEDORES = JSON.stringify({ provedores: [PROVEDOR] })
  process.env.DEEPINFRA_API_KEY = 'chave-falsa'
  await cache.esvaziarCacheDeTraducao()
})
afterEach(() => {
  vi.unstubAllGlobals()
  esquecerDisjuntores()
  esquecerAdmissao()
  esquecerRegistro()
})

describe('o contrato do núcleo', () => {
  it('a recusa de nuvem ocupada é a mesma resposta de `responderNuvemOcupada` (o tutor ainda a usa)', () => {
    const r = { motivo: 'minuto' as const, retryAfterS: 7 }
    const velha = mockRes()
    admissao.responderNuvemOcupada(velha, r)
    const nova = mockRes()
    resposta.responderRecusa(nova, recusa.recusaNuvemOcupada(r))
    expect(nova.statusCode).toBe(velha.statusCode)
    expect(nova.headers).toEqual(velha.headers)
    expect(JSON.stringify(nova.body)).toBe(JSON.stringify(velha.body))
    expect(recusa.recusaNuvemOcupada(r)).toMatchObject({ status: 429, code: 'nuvem_ocupada', retryAfterS: 7 })
  })

  it('a recusa do portão é a mesma resposta de `responderPortaoFechado`', () => {
    const portao = { ok: false, motivo: 'ia_desligada' as const, mensagem: 'A IA de nuvem está desligada.' }
    const velha = mockRes()
    orcamento.responderPortaoFechado(velha, portao)
    const nova = mockRes()
    resposta.responderRecusa(nova, recusa.recusaPortaoFechado(portao))
    expect(nova.statusCode).toBe(503)
    expect(JSON.stringify(nova.body)).toBe(JSON.stringify(velha.body))
    expect(nova.headers).toEqual({})
  })

  it('fora do app, só o adulto declarado passa; no app, o mount já decidiu', () => {
    expect(contexto.recusaDeQuemPede({ canal: 'app', perfilProtegido: null })).toBeNull()
    expect(contexto.recusaDeQuemPede({ canal: 'api', perfilProtegido: false })).toBeNull()
    for (const perfilProtegido of [true, null]) {
      expect(contexto.recusaDeQuemPede({ canal: 'mcp', perfilProtegido })).toMatchObject({
        status: 403,
        code: 'perfil_protegido',
      })
    }
  })
})

describe('traduzirNoNivel', () => {
  it('lê o corpo cru: pedido válido anota o par de idiomas; inválido é o 400 de sempre', () => {
    const rastro = rastroFalso()
    const ok = nucleoMt.lerPedidoDeTraducao({ text: 'hello', src: 'en', tgt: 'pt', extra: 1 }, rastro)
    expect(ok).toEqual({ ok: true, pedido: { text: 'hello', src: 'en', tgt: 'pt' } })
    expect(rastro.anotar).toHaveBeenCalledWith({ parDeIdiomas: 'en-pt' })
    expect(nucleoMt.lerPedidoDeTraducao({ tgt: 'pt' })).toMatchObject({
      ok: false,
      status: 400,
      corpo: { error: 'payload inválido: text/tgt obrigatórios' },
    })
  })

  it('entrega a tradução com o modelo que serviu, soma o custo na franquia e decide uma vez', async () => {
    provedorDeChat(() => ({ texto: 'boa noite' }))
    const registrarCusto = vi.fn(async (_usd: number) => {})
    const aoDecidir = vi.fn()
    const r = await nucleoMt.traduzirNoNivel(
      ctx('premium', { registrarCusto }),
      { text: 'good night', src: 'en', tgt: 'pt' },
      { aoDecidir },
    )
    expect(r).toEqual({ ok: true, texto: 'boa noite', modelo: RAPIDA, doCache: false })
    expect(aoDecidir).toHaveBeenCalledTimes(1)
    expect(aoDecidir.mock.calls[0][0]).toBe(r)
    expect(registrarCusto).toHaveBeenCalledTimes(1)
    expect(registrarCusto.mock.calls[0][0]).toBeGreaterThan(0)
  })

  it('a mesma frase volta do cache, sem provedor e sem custo', async () => {
    const chamadas = provedorDeChat(() => ({ texto: 'obrigado' }))
    const pedido = { text: 'thank you', src: 'en', tgt: 'pt' }
    await nucleoMt.traduzirNoNivel(ctx('premium'), pedido)
    const registrarCusto = vi.fn(async (_usd: number) => {})
    const r = await nucleoMt.traduzirNoNivel(ctx('premium', { registrarCusto }), pedido)
    expect(r).toMatchObject({ ok: true, texto: 'obrigado', doCache: true })
    expect(chamadas).toHaveLength(1)
    expect(registrarCusto).not.toHaveBeenCalled()
  })

  it('sem a nuvem gerenciada no plano é 402, antes de qualquer provedor; com o alívio, passa', async () => {
    const chamadas = provedorDeChat(() => ({ texto: 'oi' }))
    const r = await nucleoMt.traduzirNoNivel(ctx('free'), { text: 'hi', tgt: 'pt' })
    expect(r).toMatchObject({ ok: false, status: 402, corpo: { entitlement: 'managedCloudLlm' } })
    expect(chamadas).toHaveLength(0)
    const alivio = await nucleoMt.traduzirNoNivel(ctx('free', { modo: 'alivio' }), { text: 'hi', tgt: 'pt' })
    expect(alivio).toMatchObject({ ok: true, texto: 'oi' })
    expect(chamadas).toHaveLength(1)
  })

  it('sem provedor configurado é 501', async () => {
    process.env.IA_PROVEDORES = ''
    process.env.DEEPINFRA_API_KEY = ''
    esquecerRegistro()
    const r = await nucleoMt.traduzirNoNivel(ctx('premium'), { text: 'hi', tgt: 'pt' })
    expect(r).toMatchObject({ ok: false, status: 501 })
  })

  it('o provedor limitando vira 429 `nuvem_ocupada` com a espera, e a cota volta', async () => {
    provedorDeChat(() => ({ status: 429 }))
    const aoDecidir = vi.fn()
    const r = await nucleoMt.traduzirNoNivel(ctx('premium'), { text: 'see you', tgt: 'pt' }, { aoDecidir })
    expect(r).toMatchObject({ ok: false, status: 429, code: 'nuvem_ocupada' })
    expect(r.ok === false && r.retryAfterS).toBeGreaterThanOrEqual(1)
    expect(aoDecidir).toHaveBeenCalledWith(r)
  })

  it('pela API, o perfil protegido é recusado antes de tudo', async () => {
    const chamadas = provedorDeChat(() => ({ texto: 'oi' }))
    const r = await nucleoMt.traduzirNoNivel(ctx('premium', { canal: 'api', perfilProtegido: true }), {
      text: 'hi',
      tgt: 'pt',
    })
    expect(r).toMatchObject({ ok: false, status: 403, code: 'perfil_protegido' })
    expect(chamadas).toHaveLength(0)
  })
})

describe('sugerirAlternativas', () => {
  const FORMAS = JSON.stringify({ opcoes: ['Até logo', 'A gente se vê', 'Tchau'], nota: 'A primeira é neutra.' })

  it('lê o corpo cru: inválido é o 400 `payload_invalido`', () => {
    expect(nucleoAlt.lerPedidoDeAlternativas({ text: '' })).toMatchObject({
      ok: false,
      status: 400,
      code: 'payload_invalido',
    })
  })

  it('entrega até 3 formas e a nota, pelo modelo da nuance, e decide uma vez', async () => {
    const chamadas = provedorDeChat(() => ({ texto: FORMAS }))
    const aoDecidir = vi.fn()
    const r = await nucleoAlt.sugerirAlternativas(
      ctx('premium'),
      { text: 'See you', tgt: 'pt', traducaoAtual: 'Até mais' },
      {
        aoDecidir,
      },
    )
    expect(r).toEqual({
      ok: true,
      opcoes: ['Até logo', 'A gente se vê', 'Tchau'],
      nota: 'A primeira é neutra.',
      modelo: 'openai/gpt-oss-120b',
    })
    expect(chamadas).toEqual(['openai/gpt-oss-120b'])
    expect(aoDecidir).toHaveBeenCalledTimes(1)
  })

  it('sem a Tradução Nuance é 402 `exige_nuance`, sem provedor', async () => {
    const chamadas = provedorDeChat(() => ({ texto: FORMAS }))
    const r = await nucleoAlt.sugerirAlternativas(ctx('free'), { text: 'See you', tgt: 'pt' })
    expect(r).toMatchObject({ ok: false, status: 402, code: 'exige_nuance', corpo: { entitlement: 'traducaoNuance' } })
    expect(chamadas).toHaveLength(0)
  })

  it('resposta que não é JSON utilizável é 502 `resposta_invalida`, e o custo cobrado conta', async () => {
    provedorDeChat(() => ({ texto: 'não sei' }))
    const registrarCusto = vi.fn(async (_usd: number) => {})
    const r = await nucleoAlt.sugerirAlternativas(ctx('premium', { registrarCusto }), { text: 'See you', tgt: 'pt' })
    expect(r).toMatchObject({ ok: false, status: 502, code: 'resposta_invalida' })
    expect(registrarCusto).toHaveBeenCalledTimes(1)
  })

  it('todas as pernas em 429 é 429 `nuvem_ocupada`', async () => {
    provedorDeChat(() => ({ status: 429 }))
    const r = await nucleoAlt.sugerirAlternativas(ctx('premium'), { text: 'See you', tgt: 'pt' })
    expect(r).toMatchObject({ ok: false, status: 429, code: 'nuvem_ocupada' })
  })
})
