/**
 * O "COMO RESPONDO?" EM FLUXO — `POST /api/ai/assistente/como-respondo` com `Accept: application/x-ndjson` (spec
 * `docs/specs/2026-10-25-assistente-ao-vivo.md`, "Em fluxo").
 *
 * O que se prova:
 *   - os eventos: uma linha `sugestao` por sugestão, assim que ela fecha no texto do modelo (ANTES de o provedor
 *     terminar), e o `fim` com a lista final e o `restanteHoje`; o pedido ao provedor é `stream: true` com o mesmo
 *     esquema estrito, `require_parameters` e o roteamento da legenda;
 *   - a cota idêntica: o uso do dia +1 e os tokens acertados pelo uso real do último pedaço, na `tokensMes` e na
 *     subcota; nada gerado (provedor fora, cancelado antes da primeira sugestão) → tudo estornado;
 *   - a cascata vale ANTES do primeiro byte (a perna que cai no meio do fluxo, sem sugestão nenhuma, cede à reserva) e
 *     NÃO depois: a falha no meio vira o evento final `erro`, sem reserva, com o que foi gerado cobrado;
 *   - o fim fora do formato (menos de 2 sugestões) é o evento `erro` `resposta_invalida`;
 *   - a volta ao caminho de sempre: o provedor que recusa o esquema em fluxo ou responde sem `text/event-stream`;
 *   - o contrato antigo: sem o `Accept`, o JSON inteiro de sempre, e o provedor chamado sem `stream`;
 *   - o Cancelar: a conexão fechada aborta a chamada ao provedor;
 *   - o menor: a instrução de segurança e o contexto descartado também em fluxo.
 */
import { EventEmitter } from 'node:events'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { esquecerRegistro } from '../../server/ai/registroDeProvedores'
import { asUserId } from '../../server/lib/authContext'
import { ASSISTENTE_DIA_DOS_PAGOS } from '../../src/core/planos'
import type { RecursoDoAssistente } from '../../src/lib/estudo/promptDoAssistente'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const GEMMA = 'google/gemma-4-26b-a4b-it'
const LLAMA = 'meta-llama/llama-3.3-70b-instruct'
const OPENROUTER = {
  id: 'openrouter',
  formato: 'openai',
  base: 'https://openrouter.ai/api/v1',
  chave: 'OPENROUTER_API_KEY',
  retencao: 'zdr',
  roteamento: { data_collection: 'deny', zdr: true, ignore: ['google-ai-studio', 'google-vertex'] },
  modelos: [
    { id: GEMMA, funcoes: ['traducao', 'tutor'], preco: { entrada: 0.0675, saida: 0.225 } },
    { id: LLAMA, funcoes: ['traducao', 'tutor'], preco: { entrada: 0.1, saida: 0.32 } },
  ],
}
const ENVS = ['IA_PROVEDORES', 'OPENROUTER_API_KEY', 'DEEPINFRA_API_KEY', 'LLM_API_KEY', 'GROQ_API_KEY'] as const

const S1 = { texto: 'Sure, Thursday works.', traducao: 'Claro, quinta funciona.', tom: 'neutro' }
const S2 = { texto: 'Yeah, no problem!', traducao: 'Sim, sem problema!', tom: 'informal' }
const S3 = { texto: 'Certainly, Thursday is fine.', traducao: 'Certamente, quinta está bem.', tom: 'formal' }
const RESPOSTA = JSON.stringify({ sugestoes: [S1, S2, S3] })
const CORPO = {
  frase: 'Can we move our meeting to Thursday?',
  contexto: ['We have a lot to discuss.'],
  lang: 'en',
  langDaPessoa: 'pt-BR',
}
const mes = () => new Date().toISOString().slice(0, 7)

let h: EphemeralDb
let rotaDoAssistente: (r: RecursoDoAssistente) => (req: any, res: any) => Promise<void>
let counters: any
let flags: any
let usageQuota: any
let idades: any
let subscriptions: any

/* ─────────────────────────────── a resposta HTTP falsa, com fluxo ─────────────────────────────── */

class RespostaFalsa extends EventEmitter {
  statusCode = 200
  headersSent = false
  writableFinished = false
  destroyed = false
  headers: Record<string, string> = {}
  body: any = undefined
  escrito = ''
  /** Quantas linhas de evento já tinham saído quando o provedor mandou cada pedaço (preenchido pelo teste). */
  status(c: number) {
    this.statusCode = c
    return this
  }
  setHeader(k: string, v: string) {
    this.headers[k.toLowerCase()] = v
    return this
  }
  flushHeaders() {
    this.headersSent = true
  }
  json(b: any) {
    this.body = b
    this.headersSent = true
    this.writableFinished = true
    return this
  }
  write(pedaco: string) {
    this.headersSent = true
    this.escrito += pedaco
    return true
  }
  end() {
    this.writableFinished = true
    this.emit('finish')
    this.emit('close')
    return this
  }
  /** O cliente fechou a conexão (o Cancelar da folha). */
  fecharPeloCliente() {
    this.destroyed = true
    this.emit('close')
  }
  get eventos(): any[] {
    return this.escrito
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  }
}

/* ─────────────────────────────── o provedor falso, com fluxo SSE ─────────────────────────────── */

interface Chamada {
  modelo: string
  stream: boolean
  usage?: unknown
  esquema?: string
  estrito?: boolean
  exigeParametros?: boolean
  ordenacao?: string
  system: string
  user: string
  sinal?: AbortSignal
}

const codificar = (s: string) => new TextEncoder().encode(s)
const pedaco = (conteudo: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: conteudo } }] })}\n\n`
const FIM_COM_USO = `data: ${JSON.stringify({
  choices: [{ delta: {}, finish_reason: 'stop' }],
  usage: { prompt_tokens: 300, completion_tokens: 100 },
})}\n\ndata: [DONE]\n\n`

/** Um fluxo SSE que o teste empurra aos pedaços; aborta quando o pedido é abortado. */
function fluxoControlado(sinal?: AbortSignal) {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({ start: (c) => void (ctrl = c) })
  sinal?.addEventListener('abort', () => {
    try {
      ctrl.error(new DOMException('abortado', 'AbortError'))
    } catch {
      /* já fechado */
    }
  })
  return {
    resposta: new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    mandar: (s: string) => ctrl.enqueue(codificar(s)),
    fechar: () => ctrl.close(),
  }
}

/** O texto inteiro em pedaços de ~12 caracteres, com o uso no fim. */
function sseInteiro(texto: string, comUso = true): string {
  let s = ': OPENROUTER PROCESSING\n\n'
  for (let i = 0; i < texto.length; i += 12) s += pedaco(texto.slice(i, i + 12))
  return s + (comUso ? FIM_COM_USO : 'data: [DONE]\n\n')
}

function provedor(responder: (c: Chamada, i: number) => Response | Promise<Response>): Chamada[] {
  const chamadas: Chamada[] = []
  vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
    const corpo = JSON.parse(init.body)
    const c: Chamada = {
      modelo: corpo.model,
      stream: corpo.stream === true,
      usage: corpo.usage,
      esquema: corpo.response_format?.json_schema?.name,
      estrito: corpo.response_format?.json_schema?.strict,
      exigeParametros: corpo.provider?.require_parameters,
      ordenacao: corpo.provider?.sort,
      system: corpo.messages.find((m: any) => m.role === 'system')?.content ?? '',
      user: corpo.messages.find((m: any) => m.role === 'user')?.content ?? '',
      sinal: init.signal,
    }
    chamadas.push(c)
    return responder(c, chamadas.length - 1)
  })
  return chamadas
}

const respostaSse = (s: string) =>
  new Response(codificar(s), { status: 200, headers: { 'content-type': 'text/event-stream' } })
const respostaJson = (texto: string) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: texto } }],
      usage: { prompt_tokens: 300, completion_tokens: 100 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
const respostaErro = (status: number, texto = 'falhou') => new Response(texto, { status })

function requisicao(userId: ReturnType<typeof asUserId>, emFluxo: boolean, body: unknown = CORPO) {
  return {
    userId,
    body,
    requestId: 'r-assistente-fluxo',
    header: (n: string) =>
      emFluxo && n.toLowerCase() === 'accept' ? 'application/x-ndjson, application/json' : undefined,
    headers: emFluxo ? { accept: 'application/x-ndjson, application/json' } : {},
  }
}

async function pedir(userId: ReturnType<typeof asUserId>, emFluxo = true, res = new RespostaFalsa()) {
  await rotaDoAssistente('comoRespondo')(requisicao(userId, emFluxo), res)
  return res
}

const contador = async (userId: ReturnType<typeof asUserId>, metrica: string, janela: string) =>
  (await counters.get(userId, metrica, janela)) ?? 0
const doDia = async (userId: ReturnType<typeof asUserId>) =>
  contador(userId, usageQuota.METRIC_ASSISTENTE_DIA, await usageQuota.janelaDoDia(userId))
const tokensDoMes = (u: ReturnType<typeof asUserId>) => contador(u, 'llm_tokens', mes())
const subcota = (u: ReturnType<typeof asUserId>) => contador(u, usageQuota.METRIC_ASSISTENTE_TOKENS_MES, mes())

async function assinante(id: string) {
  const quem = asUserId(id)
  await subscriptions.upsert(quem, { plan: 'plus', status: 'active' })
  return quem
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ rotaDoAssistente } = await h.load<any>('../../server/ai/assistente'))
  ;({ usageCountersRepo: counters } = await h.load<any>('../../server/db/repositories/usageCounters'))
  ;({ idadesRepo: idades } = await h.load<any>('../../server/db/repositories/idades'))
  ;({ subscriptionsRepo: subscriptions } = await h.load<any>('../../server/db/repositories/subscriptions'))
  flags = await h.load<any>('../../server/lib/flags')
  usageQuota = await h.load<any>('../../server/lib/usageQuota')
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  for (const e of ENVS) process.env[e] = ''
  await h.cleanup()
})
beforeEach(async () => {
  for (const e of ENVS) process.env[e] = ''
  process.env.IA_PROVEDORES = JSON.stringify({ provedores: [OPENROUTER] })
  process.env.OPENROUTER_API_KEY = 'chave-openrouter-falsa'
  await flags.definirFlag('assistente_ao_vivo', { habilitada: true }, 'teste')
})
afterEach(async () => {
  vi.unstubAllGlobals()
  esquecerDisjuntores()
  await esquecerAdmissao()
  esquecerRegistro()
})

describe('em fluxo: os eventos', () => {
  it('uma linha por sugestão e o fim com a lista e o restanteHoje; o pedido é stream com o esquema estrito', async () => {
    const quem = await assinante('fluxo-ok')
    const chamadas = provedor(() => respostaSse(sseInteiro(RESPOSTA)))
    const res = await pedir(quem)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/x-ndjson; charset=utf-8')
    expect(res.headers['cache-control']).toContain('no-transform')
    expect(res.headers['x-ia-modelo']).toBe(GEMMA)
    expect(res.writableFinished).toBe(true)
    expect(res.eventos).toEqual([
      { tipo: 'sugestao', sugestao: S1 },
      { tipo: 'sugestao', sugestao: S2 },
      { tipo: 'sugestao', sugestao: S3 },
      { tipo: 'fim', sugestoes: [S1, S2, S3], restanteHoje: ASSISTENTE_DIA_DOS_PAGOS - 1 },
    ])
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0]).toMatchObject({
      modelo: GEMMA,
      stream: true,
      usage: { include: true },
      esquema: 'assistente_como_respondo',
      estrito: true,
      exigeParametros: true,
      ordenacao: 'price',
    })
    /* A cota idêntica: o uso do dia +1, os tokens pelo uso REAL do último pedaço, nas duas contas. */
    expect(await doDia(quem)).toBe(1)
    expect(await tokensDoMes(quem)).toBe(400)
    expect(await subcota(quem)).toBe(400)
  })

  it('a primeira sugestão sai ANTES de o provedor terminar; as outras, cada uma quando fecha', async () => {
    const quem = await assinante('fluxo-primeira-antes')
    let f!: ReturnType<typeof fluxoControlado>
    provedor((c) => (f = fluxoControlado(c.sinal)).resposta)
    const res = new RespostaFalsa()
    const pendente = pedir(quem, true, res)
    await vi.waitFor(() => expect(f).toBeDefined())
    const fimDoPrimeiro = RESPOSTA.indexOf('}') + 1
    f.mandar(pedaco(RESPOSTA.slice(0, fimDoPrimeiro - 1)))
    await new Promise((r) => setTimeout(r, 20))
    expect(res.eventos).toEqual([]) // o objeto ainda não fechou: nada sai, nem o cabeçalho
    expect(res.headersSent).toBe(false)
    f.mandar(pedaco(RESPOSTA.slice(fimDoPrimeiro - 1, fimDoPrimeiro + 3)))
    await vi.waitFor(() => expect(res.eventos).toEqual([{ tipo: 'sugestao', sugestao: S1 }]))
    expect(res.headersSent).toBe(true)
    expect(res.writableFinished).toBe(false)
    f.mandar(pedaco(RESPOSTA.slice(fimDoPrimeiro + 3)))
    await vi.waitFor(() => expect(res.eventos).toHaveLength(3))
    expect(res.writableFinished).toBe(false) // o fim só depois do uso e do [DONE]
    f.mandar(FIM_COM_USO)
    f.fechar()
    await pendente
    expect(res.eventos.at(-1)).toMatchObject({ tipo: 'fim', sugestoes: [S1, S2, S3] })
    expect(await tokensDoMes(quem)).toBe(400)
  })

  it('o fim fora do formato (só uma sugestão utilizável): evento erro resposta_invalida, e o uso consumido', async () => {
    const quem = await assinante('fluxo-fim-invalido')
    provedor(() => respostaSse(sseInteiro(JSON.stringify({ sugestoes: [S1] }))))
    const res = await pedir(quem)
    expect(res.statusCode).toBe(200)
    expect(res.eventos).toEqual([
      { tipo: 'sugestao', sugestao: S1 },
      { tipo: 'erro', code: 'resposta_invalida', error: expect.any(String) },
    ])
    expect(await doDia(quem)).toBe(1)
    expect(await tokensDoMes(quem)).toBe(400)
  })

  it('resposta inválida ANTES da primeira sugestão: o 502 de sempre, com o status HTTP', async () => {
    const quem = await assinante('fluxo-invalida-antes')
    provedor(() => respostaSse(sseInteiro(JSON.stringify({ sugestoes: [{ ...S1, falante: 'Ana' }, S2] }))))
    const res = await pedir(quem)
    expect(res.statusCode).toBe(502)
    expect(res.body?.code).toBe('resposta_invalida')
    expect(res.escrito).toBe('')
    expect(await doDia(quem)).toBe(1) // o provedor respondeu e cobrou
  })
})

describe('em fluxo: a cascata só antes do primeiro byte', () => {
  it('a perna que cai no meio do fluxo SEM sugestão nenhuma cede à reserva', async () => {
    const quem = await assinante('fluxo-reserva-antes')
    const chamadas = provedor((_c, i) =>
      i === 0
        ? respostaSse(
            pedaco('{"sugestoes":[{"texto":"Su') + `data: ${JSON.stringify({ error: { message: 'boom' } })}\n\n`,
          )
        : respostaSse(sseInteiro(RESPOSTA)),
    )
    const res = await pedir(quem)
    expect(chamadas.map((c) => c.modelo)).toEqual([GEMMA, LLAMA])
    expect(res.headers['x-ia-modelo']).toBe(LLAMA)
    expect(res.eventos.map((e) => e.tipo)).toEqual(['sugestao', 'sugestao', 'sugestao', 'fim'])
    expect(await doDia(quem)).toBe(1)
    expect(await tokensDoMes(quem)).toBe(400) // só a perna que entregou
  })

  it('o primário fora do ar (500) antes de qualquer byte: a reserva atende em fluxo', async () => {
    const quem = await assinante('fluxo-reserva-500')
    const chamadas = provedor((_c, i) => (i === 0 ? respostaErro(500) : respostaSse(sseInteiro(RESPOSTA))))
    const res = await pedir(quem)
    expect(chamadas.map((c) => c.modelo)).toEqual([GEMMA, LLAMA])
    expect(res.eventos.at(-1)).toMatchObject({ tipo: 'fim' })
  })

  it('falha DEPOIS da primeira sugestão: evento erro, sem reserva, e o que foi gerado cobrado', async () => {
    const quem = await assinante('fluxo-erro-no-meio')
    const fimDoPrimeiro = RESPOSTA.indexOf('}') + 1
    const chamadas = provedor(() =>
      respostaSse(
        pedaco(RESPOSTA.slice(0, fimDoPrimeiro + 2)) +
          `data: ${JSON.stringify({ error: { message: 'provider overloaded' }, choices: [{ finish_reason: 'error' }] })}\n\n`,
      ),
    )
    const res = await pedir(quem)
    expect(chamadas).toHaveLength(1) // nenhuma reserva depois do primeiro byte
    expect(res.statusCode).toBe(200)
    expect(res.eventos).toEqual([
      { tipo: 'sugestao', sugestao: S1 },
      { tipo: 'erro', code: 'provedor_indisponivel', error: expect.any(String) },
    ])
    expect(res.writableFinished).toBe(true)
    /* Algo foi gerado: o uso do dia conta, e os tokens (estimados pelo texto: o uso não chegou) nas duas contas. */
    expect(await doDia(quem)).toBe(1)
    const tokens = await tokensDoMes(quem)
    expect(tokens).toBeGreaterThan(0)
    expect(tokens).toBeLessThan(1000)
    expect(await subcota(quem)).toBe(tokens)
  })

  it('nada gerado (todas as pernas fora): o 502 de sempre, e o uso e os tokens estornados', async () => {
    const quem = await assinante('fluxo-fora-do-ar')
    provedor(() => respostaErro(500))
    const res = await pedir(quem)
    expect(res.statusCode).toBe(502)
    expect(res.body?.code).toBe('provedor_indisponivel')
    expect(res.escrito).toBe('')
    expect(await doDia(quem)).toBe(0)
    expect(await tokensDoMes(quem)).toBe(0)
    expect(await subcota(quem)).toBe(0)
  })

  it('a cota recusada antes de tudo: a recusa HTTP de sempre, sem provedor', async () => {
    const gratis = asUserId('fluxo-gratis')
    const chamadas = provedor(() => respostaSse(sseInteiro(RESPOSTA)))
    const res = await pedir(gratis)
    expect(res.statusCode).toBe(402)
    expect(res.body?.code).toBe('sem_plano')
    expect(chamadas).toHaveLength(0)
  })
})

describe('em fluxo: a volta ao caminho de sempre', () => {
  it('o provedor recusa o esquema em fluxo: a mesma perna é repetida inteira, e o fluxo sai de uma vez', async () => {
    const quem = await assinante('fluxo-sem-fluxo')
    const chamadas = provedor((c) =>
      c.stream
        ? respostaErro(404, '{"error":{"message":"No endpoints found that support streaming"}}')
        : respostaJson(RESPOSTA),
    )
    const res = await pedir(quem)
    expect(chamadas.map((c) => [c.modelo, c.stream])).toEqual([
      [GEMMA, true],
      [GEMMA, false],
    ])
    expect(chamadas[1].esquema).toBe('assistente_como_respondo') // o caminho de sempre, com o esquema
    expect(res.headers['x-ia-modelo']).toBe(GEMMA)
    expect(res.eventos).toEqual([
      { tipo: 'sugestao', sugestao: S1 },
      { tipo: 'sugestao', sugestao: S2 },
      { tipo: 'sugestao', sugestao: S3 },
      { tipo: 'fim', sugestoes: [S1, S2, S3], restanteHoje: ASSISTENTE_DIA_DOS_PAGOS - 1 },
    ])
    expect(await tokensDoMes(quem)).toBe(400)
  })

  it('o provedor ignora o stream e responde o JSON inteiro: lido como sempre', async () => {
    const quem = await assinante('fluxo-json-inteiro')
    provedor(() => respostaJson(RESPOSTA))
    const res = await pedir(quem)
    expect(res.eventos.map((e) => e.tipo)).toEqual(['sugestao', 'sugestao', 'sugestao', 'fim'])
  })
})

describe('o contrato antigo', () => {
  it('sem o Accept: o JSON inteiro de sempre, e o provedor chamado sem stream', async () => {
    const quem = await assinante('fluxo-contrato-antigo')
    const chamadas = provedor(() => respostaJson(RESPOSTA))
    const res = await pedir(quem, false)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ sugestoes: [S1, S2, S3], restanteHoje: ASSISTENTE_DIA_DOS_PAGOS - 1 })
    expect(res.escrito).toBe('')
    expect(chamadas[0].stream).toBe(false)
    expect(await tokensDoMes(quem)).toBe(400)
  })

  it('as outras rotas ignoram o Accept do fluxo', async () => {
    const quem = await assinante('fluxo-outras-rotas')
    const chamadas = provedor(() =>
      respostaJson(
        JSON.stringify({ expressoes: [{ trecho: 'break a leg', sentido: 'boa sorte', tipo: 'idiomatica' }] }),
      ),
    )
    const res = new RespostaFalsa()
    await rotaDoAssistente('expressoes')(
      requisicao(quem, true, { frase: 'Good luck tonight, break a leg!', lang: 'en', langDaPessoa: 'pt-BR' }),
      res,
    )
    expect(res.body?.expressoes).toHaveLength(1)
    expect(chamadas[0].stream).toBe(false)
  })
})

describe('o Cancelar', () => {
  it('fechar a conexão depois da primeira sugestão aborta o provedor; o gerado conta, sem evento final', async () => {
    const quem = await assinante('fluxo-cancelado-no-meio')
    let f!: ReturnType<typeof fluxoControlado>
    const chamadas = provedor((c) => (f = fluxoControlado(c.sinal)).resposta)
    const res = new RespostaFalsa()
    const pendente = pedir(quem, true, res)
    await vi.waitFor(() => expect(f).toBeDefined())
    f.mandar(pedaco(RESPOSTA.slice(0, RESPOSTA.indexOf('}') + 1)))
    await vi.waitFor(() => expect(res.eventos).toHaveLength(1))
    res.fecharPeloCliente()
    await pendente
    expect(chamadas[0].sinal?.aborted).toBe(true)
    expect(chamadas).toHaveLength(1)
    expect(res.eventos.map((e) => e.tipo)).toEqual(['sugestao'])
    expect(await doDia(quem)).toBe(1)
    expect(await tokensDoMes(quem)).toBeGreaterThan(0)
  })

  it('fechar antes da primeira sugestão: nada gerado, tudo estornado, e nenhuma reserva chamada', async () => {
    const quem = await assinante('fluxo-cancelado-antes')
    let f!: ReturnType<typeof fluxoControlado>
    const chamadas = provedor((c) => (f = fluxoControlado(c.sinal)).resposta)
    const res = new RespostaFalsa()
    const pendente = pedir(quem, true, res)
    await vi.waitFor(() => expect(f).toBeDefined())
    f.mandar(pedaco('{"sugestoes":[{"texto":"Su'))
    await new Promise((r) => setTimeout(r, 20))
    res.fecharPeloCliente()
    await pendente
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].sinal?.aborted).toBe(true)
    expect(res.escrito).toBe('')
    expect(res.statusCode).toBe(499)
    expect(await doDia(quem)).toBe(0)
    expect(await tokensDoMes(quem)).toBe(0)
    expect(await subcota(quem)).toBe(0)
  })
})

describe('o menor, também em fluxo', () => {
  it('MENOR (idade não declarada): a instrução de segurança, e o contexto não sai do servidor', async () => {
    const menor = await assinante('fluxo-menor')
    const chamadas = provedor(() => respostaSse(sseInteiro(RESPOSTA)))
    const res = await pedir(menor)
    expect(res.eventos.at(-1)).toMatchObject({ tipo: 'fim' })
    expect(chamadas[0].system).toContain('PÚBLICO MENOR')
    expect(chamadas[0].user).toContain('Can we move our meeting to Thursday?')
    expect(chamadas[0].user).not.toContain('We have a lot to discuss.')
  })

  it('ADULTO declarado: sem a instrução, com o contexto', async () => {
    const adulto = await assinante('fluxo-adulto')
    await idades.declarar(adulto, '1990-01-01')
    const chamadas = provedor(() => respostaSse(sseInteiro(RESPOSTA)))
    await pedir(adulto)
    expect(chamadas[0].system).not.toContain('PÚBLICO MENOR')
    expect(chamadas[0].user).toContain('We have a lot to discuss.')
  })
})
