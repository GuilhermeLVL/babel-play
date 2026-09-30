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
import { wavPcm } from '../harness/wav'

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
let nucleoPolir: typeof import('../../server/ai/nucleo/polirLote')
let nucleoVoz: typeof import('../../server/ai/nucleo/sintetizarVoz')
let nucleoStt: typeof import('../../server/ai/nucleo/transcrever')
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
  nucleoPolir = await h.load('../../server/ai/nucleo/polirLote')
  nucleoVoz = await h.load('../../server/ai/nucleo/sintetizarVoz')
  nucleoStt = await h.load('../../server/ai/nucleo/transcrever')
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

describe('polirLote', () => {
  let sessionsRepo: any
  let utterancesRepo: any
  const DONO = asUserId('nucleo-premium')

  /** O modelo bem-comportado: "polida: <tradução>" para cada linha do bloco que foi ao prompt. */
  function provedorDoPolimento() {
    const chamadas: string[] = []
    vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
      const corpo = JSON.parse(init.body) as { model: string; messages: Array<{ role: string; content: string }> }
      chamadas.push(corpo.model)
      const user = corpo.messages.find((m) => m.role === 'user')?.content ?? ''
      const inicio = user.indexOf('Linhas do bloco: <<<') + 'Linhas do bloco: <<<'.length
      const linhas = JSON.parse(user.slice(inicio, user.lastIndexOf('>>>'))) as Array<{ n: number; traducao: string }>
      const texto = JSON.stringify({ linhas: linhas.map((l) => ({ n: l.n, traducao: `polida: ${l.traducao}` })) })
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: texto } }],
          usage: { prompt_tokens: 90, completion_tokens: 70 },
        }),
      }
    })
    return chamadas
  }

  async function sessaoCom(n: number): Promise<string> {
    const s = await sessionsRepo.create(DONO, { title: 'aula', kind: 'live', sourceLang: 'en', targetLang: 'pt' })
    await utterancesRepo.insertMany(
      DONO,
      s.id,
      Array.from({ length: n }, (_, i) => ({
        idx: i,
        sourceLang: 'en',
        targetLang: 'pt',
        sourceText: `line ${i}`,
        translatedText: `linha ${i}`,
      })),
    )
    return s.id
  }

  beforeAll(async () => {
    ;({ sessionsRepo } = await h.load<any>('../../server/db/repositories/sessions'))
    ;({ utterancesRepo } = await h.load<any>('../../server/db/repositories/utterances'))
  })

  it('lê o corpo cru: sem sessão ou bloco é o 400 `payload_invalido`', () => {
    expect(nucleoPolir.lerPedidoDoPolimento({ bloco: 0 })).toMatchObject({ status: 400, code: 'payload_invalido' })
  })

  it('polir o bloco grava ao lado e diz o modelo; pedir de novo é `jaPolido`, sem provedor', async () => {
    const id = await sessaoCom(3)
    const chamadas = provedorDoPolimento()
    const aoDecidir = vi.fn()
    const r = await nucleoPolir.polirLote(ctx('premium'), { sessionId: id, bloco: 0 }, { aoDecidir })
    expect(r).toMatchObject({
      ok: true,
      bloco: 0,
      blocos: 1,
      pendentes: 0,
      jaPolido: false,
      modelo: 'modelo-do-polimento',
    })
    expect(r.ok === true && r.polidas[0].traducaoPolida).toBe('polida: linha 0')
    expect(aoDecidir).toHaveBeenCalledWith(r)
    const outra = await nucleoPolir.polirLote(ctx('premium'), { sessionId: id, bloco: 0 })
    expect(outra).toMatchObject({ ok: true, jaPolido: true, pendentes: 0 })
    expect(chamadas).toHaveLength(1)
  })

  it('sessão de outra pessoa é 404 e bloco que não existe é 404 com o total de blocos', async () => {
    const id = await sessaoCom(2)
    provedorDoPolimento()
    const alheia = await nucleoPolir.polirLote(ctx('premium', { userId: asUserId('nucleo-outra') }), {
      sessionId: id,
      bloco: 0,
    })
    expect(alheia).toMatchObject({ ok: false, status: 404, code: 'sessao_inexistente' })
    const fora = await nucleoPolir.polirLote(ctx('premium'), { sessionId: id, bloco: 5 })
    expect(fora).toMatchObject({ ok: false, status: 404, code: 'bloco_inexistente', corpo: { blocos: 1 } })
  })

  it('sem a Tradução Nuance é 402 `exige_nuance`, antes de ler a sessão', async () => {
    const chamadas = provedorDoPolimento()
    const r = await nucleoPolir.polirLote(ctx('free'), { sessionId: 'qualquer', bloco: 0 })
    expect(r).toMatchObject({ ok: false, status: 402, code: 'exige_nuance' })
    expect(chamadas).toHaveLength(0)
  })
})

describe('sintetizarVoz', () => {
  const VOZ = {
    id: 'deepinfra',
    formato: 'openai',
    base: 'https://deepinfra.exemplo/v1/openai',
    chave: 'DEEPINFRA_API_KEY',
    retencao: 'zdr',
    modelos: [{ id: 'ResembleAI/chatterbox-multilingual', funcoes: ['tts'], preco: { milhaoDeCaracteres: 1 } }],
  }
  const AUDIO = Buffer.from('ID3-audio-falso')
  /** A flag da voz natural vem do contexto: o núcleo não lê o request para saber. */
  const comVoz = (extra: Record<string, unknown> = {}) => ctx('premium', { flagLigada: async () => true, ...extra })

  function provedorDeVoz(status = 200) {
    const chamadas: string[] = []
    vi.stubGlobal('fetch', async (u: unknown) => {
      chamadas.push(String(u))
      if (status !== 200) return new Response('falhou', { status })
      return new Response(AUDIO, { status: 200, headers: { 'content-type': 'audio/mpeg' } })
    })
    return chamadas
  }

  beforeEach(async () => {
    process.env.IA_PROVEDORES = JSON.stringify({ provedores: [VOZ] })
    const { esvaziarCacheDeVoz } = await h.load<any>('../../server/ai/nucleo/sintetizarVoz')
    esvaziarCacheDeVoz()
  })

  it('lê o corpo cru: pedir clonagem é 400 próprio, antes do esquema; corpo inválido é `payload_invalido`', () => {
    expect(nucleoVoz.lerPedidoDeVoz({ texto: 'oi', idioma: 'pt', reference_audio: 'x' })).toMatchObject({
      status: 400,
      code: 'clonagem_de_voz_recusada',
    })
    expect(nucleoVoz.lerPedidoDeVoz({ texto: 'oi' })).toMatchObject({ status: 400, code: 'payload_invalido' })
  })

  it('entrega o áudio com o tipo e o modelo; a mesma fala volta do cache, sem provedor', async () => {
    const chamadas = provedorDeVoz()
    const aoDecidir = vi.fn()
    const r = await nucleoVoz.sintetizarVoz(comVoz(), { texto: 'Good morning', idioma: 'en' }, { aoDecidir })
    expect(r).toMatchObject({
      ok: true,
      tipo: 'audio/mpeg',
      modelo: 'ResembleAI/chatterbox-multilingual',
      doCache: false,
    })
    expect(r.ok === true && r.bytes.equals(AUDIO)).toBe(true)
    expect(aoDecidir).toHaveBeenCalledTimes(1)
    const deNovo = await nucleoVoz.sintetizarVoz(comVoz(), { texto: 'Good morning', idioma: 'en' })
    expect(deNovo).toMatchObject({ ok: true, doCache: true })
    expect(chamadas).toHaveLength(1)
  })

  it('sem quem responda pela flag, a voz está desligada: 503, sem provedor (fail-closed)', async () => {
    const chamadas = provedorDeVoz()
    const r = await nucleoVoz.sintetizarVoz(ctx('premium'), { texto: 'Good morning', idioma: 'en' })
    expect(r).toMatchObject({ ok: false, status: 503, code: 'voz_natural_desligada' })
    expect(chamadas).toHaveLength(0)
  })

  it('sem o entitlement `vozNatural` é 402 `exige_voz_natural`', async () => {
    const r = await nucleoVoz.sintetizarVoz(ctx('free', { flagLigada: async () => true }), {
      texto: 'Good morning',
      idioma: 'en',
    })
    expect(r).toMatchObject({ ok: false, status: 402, code: 'exige_voz_natural', corpo: { entitlement: 'vozNatural' } })
  })

  it('o provedor em 5xx é 502 `provedor_indisponivel`', async () => {
    provedorDeVoz(500)
    const r = await nucleoVoz.sintetizarVoz(comVoz(), { texto: 'Good night', idioma: 'en' })
    expect(r).toMatchObject({ ok: false, status: 502, code: 'provedor_indisponivel' })
  })
})

describe('admitirTranscricao e transcrever', () => {
  /* O legado do STT: uma perna, a da `GROQ_API_KEY` (sem registro declarado). */
  beforeEach(() => {
    process.env.IA_PROVEDORES = ''
    process.env.GROQ_API_KEY = 'chave-groq-falsa'
  })

  function provedorDeStt(status = 200) {
    const chamadas: string[] = []
    vi.stubGlobal('fetch', async (u: unknown) => {
      chamadas.push(String(u))
      if (status !== 200) return { ok: false, status, headers: new Headers(), text: async () => 'limite' }
      return { ok: true, status: 200, json: async () => ({ text: 'bom dia' }), text: async () => '' }
    })
    return chamadas
  }

  /** A porta aberta pelo núcleo, como o middleware do app a abriria. */
  async function porta(plano = 'premium', extra: Record<string, unknown> = {}) {
    const { rastro: _sem, ...semRastro } = ctx(plano, extra)
    const r = await nucleoStt.admitirTranscricao(semRastro)
    if (r.ok === false) throw new Error(`porta recusada: ${r.status}`)
    return r.porta
  }

  it('a porta recusa o plano sem STT gerenciado (402), a falta de configuração (501) e, pela API, o menor (403)', async () => {
    const semPlano = await nucleoStt.admitirTranscricao(ctx('free'))
    expect(semPlano).toMatchObject({ ok: false, status: 402, corpo: { entitlement: 'managedCloudStt' } })
    const menor = await nucleoStt.admitirTranscricao(ctx('premium', { canal: 'mcp', perfilProtegido: true }))
    expect(menor).toMatchObject({ ok: false, status: 403, code: 'perfil_protegido' })
    process.env.GROQ_API_KEY = ''
    const semChave = await nucleoStt.admitirTranscricao(ctx('premium'))
    expect(semChave).toMatchObject({ ok: false, status: 501 })
  })

  it('transcreve o áudio, soma o custo na franquia de quem abriu a porta e decide uma vez', async () => {
    const chamadas = provedorDeStt()
    const registrarCusto = vi.fn(async (_usd: number) => {})
    const p = await porta('premium', { registrarCusto })
    const aoDecidir = vi.fn()
    const r = await nucleoStt.transcrever(ctx('premium'), p, { audio: wavPcm(2), idioma: 'pt' }, { aoDecidir })
    expect(r).toEqual({ ok: true, texto: 'bom dia', idioma: '' })
    expect(chamadas).toHaveLength(1)
    expect(registrarCusto).toHaveBeenCalledTimes(1)
    expect(aoDecidir).toHaveBeenCalledWith(r)
  })

  it('corpo vazio é 400, áudio ilegível é 415, e nenhum chega ao provedor', async () => {
    const chamadas = provedorDeStt()
    const vazio = await nucleoStt.transcrever(ctx('premium'), await porta(), { audio: Buffer.alloc(0) })
    expect(vazio).toMatchObject({ ok: false, status: 400, corpo: { error: 'corpo de áudio vazio' } })
    const ilegivel = await nucleoStt.transcrever(ctx('premium'), await porta(), {
      audio: Buffer.from('isto não é áudio nenhum, só texto'),
    })
    expect(ilegivel).toMatchObject({ ok: false, status: 415 })
    expect(chamadas).toHaveLength(0)
  })

  it('o cabeçalho fora do formato é o 400 de sempre, depois da medição do áudio', async () => {
    provedorDeStt()
    const r = await nucleoStt.transcrever(ctx('premium'), await porta(), { audio: wavPcm(1), idioma: 'pt; drop' })
    expect(r).toMatchObject({ ok: false, status: 400 })
    expect(r.ok === false && r.corpo.error).toMatch(/^payload inválido: x-language/)
  })

  it('o provedor limitando é 429 `nuvem_ocupada` com a espera', async () => {
    provedorDeStt(429)
    const r = await nucleoStt.transcrever(ctx('premium'), await porta(), { audio: wavPcm(1) })
    expect(r).toMatchObject({ ok: false, status: 429, code: 'nuvem_ocupada' })
    expect(r.ok === false && r.retryAfterS).toBeGreaterThanOrEqual(1)
  })
})
