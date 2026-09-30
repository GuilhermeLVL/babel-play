/**
 * D5 (Fase D, 30/09/2026) — `POST /api/ai/mt/polir`, o "Polir a tradução da sessão".
 *
 * Uma função de IA nova (`polimento` em `FUNCOES_DE_IA`), no nível `polimento` (a escada desce para a
 * nuance e a rápida), com o MESMO caminho das outras: plano (a Tradução Nuance, pelo entitlement),
 * portão, política de custo, admissão, reserva de cota antes do provedor, cascata, custo registrado.
 * O que se prova:
 *
 *   - o servidor monta o bloco com as falas DO BANCO (o cliente manda só a sessão e o número), no
 *     modelo do polimento, com as linhas como dado; grava a polida AO LADO — o original não muda;
 *   - IDEMPOTENTE POR BLOCO: pedir de novo um bloco polido não chama provedor nem gasta cota;
 *     resposta parcial grava o que veio, e o próximo pedido manda só o que faltou;
 *   - o bloco seguinte leva as 3 linhas anteriores de contexto, já com a polida;
 *   - sem a Nuance: 402 `exige_nuance`, sem provedor nem cota; sessão de outra pessoa: 404;
 *   - resposta sem JSON utilizável: 502 `resposta_invalida`, nada gravado, custo registrado;
 *   - todas as pernas em 429: 429 `nuvem_ocupada`; o mesmo bloco em voo duas vezes: 409;
 *   - o glossário vai como dado; corrigir a fala apaga a polida (ela era de outro texto);
 *   - a polida sai na exportação dos dados (LGPD), pelo que já cobre `utterances`.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { esquecerGlossarioEmMemoria, normalizarTermo } from '../../server/ai/glossario'
import { esquecerRegistro } from '../../server/ai/registroDeProvedores'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'
import { PLANO_PAGO } from '../harness/planoPago'

const forja = vi.hoisted(() => ({ semNuance: false }))
vi.mock('../../server/lib/entitlements', async (original) => {
  const real = await original<typeof import('../../server/lib/entitlements')>()
  return {
    ...real,
    getEntitlements: (plano: Parameters<typeof real.getEntitlements>[0]) => {
      const e = real.getEntitlements(plano)
      return forja.semNuance ? { ...e, traducaoNuance: false } : e
    },
  }
})

const DEEPINFRA = {
  id: 'deepinfra',
  formato: 'openai',
  base: 'https://deepinfra.exemplo/v1/openai',
  chave: 'DEEPINFRA_API_KEY',
  retencao: 'zdr',
  modelos: [
    { id: 'openai/gpt-oss-20b', funcoes: ['traducao', 'tutor'], preco: { entrada: 0.03, saida: 0.14 } },
    { id: 'modelo-do-polimento', funcoes: ['traducao'], niveis: ['polimento'], preco: { entrada: 0.1, saida: 0.4 } },
  ],
}
const ENVS = ['IA_PROVEDORES', 'DEEPINFRA_API_KEY', 'LLM_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY'] as const
const PAGANTE = asUserId('polimento-pagante')
const OUTRA = asUserId('polimento-outra')
const mes = () => new Date().toISOString().slice(0, 7)

let h: EphemeralDb
let polirProxy: (req: any, res: any) => Promise<void>
let counters: any
let gasto: any
let glossario: any
let sessionsRepo: any
let utterancesRepo: any
let contaRepo: any

interface Chamada {
  modelo: string
  system: string
  user: string
  /** As linhas do bloco que foram ao prompt, lidas do JSON da mensagem. */
  linhas: Array<{ n: number; original: string; traducao: string; para: string }>
}

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false, headers: {} as Record<string, string> }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.setHeader = (k: string, v: string) => ((r.headers[k.toLowerCase()] = v), r)
  return r
}

/** O JSON entre `Linhas do bloco: <<<` e `>>>`. */
function linhasDoPrompt(user: string): Chamada['linhas'] {
  const i = user.indexOf('Linhas do bloco: <<<')
  return JSON.parse(user.slice(i + 'Linhas do bloco: <<<'.length, user.lastIndexOf('>>>')))
}

type Resposta = { status?: number; texto?: string; esperar?: Promise<void> }
function provedor(resposta: (c: Chamada) => Resposta): Chamada[] {
  const chamadas: Chamada[] = []
  vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
    const corpo = JSON.parse(init.body) as { model: string; messages: Array<{ role: string; content: string }> }
    const user = corpo.messages.find((m) => m.role === 'user')?.content ?? ''
    const c = {
      modelo: corpo.model,
      system: corpo.messages.find((m) => m.role === 'system')?.content ?? '',
      user,
      linhas: linhasDoPrompt(user),
    }
    chamadas.push(c)
    const r = resposta(c)
    if (r.esperar) await r.esperar
    if (r.status && r.status !== 200)
      return { ok: false, status: r.status, headers: new Headers(), text: async () => 'limite' }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: r.texto ?? '' } }],
        usage: { prompt_tokens: 900, completion_tokens: 700 },
      }),
    }
  })
  return chamadas
}

/** A resposta de um modelo bem-comportado: "polida: <tradução>" para cada linha do bloco. */
const polidaDeTudo = (c: Chamada): Resposta => ({
  texto: JSON.stringify({ linhas: c.linhas.map((l) => ({ n: l.n, traducao: `polida: ${l.traducao}` })) }),
})

async function sessaoCom(dono: typeof PAGANTE, n: number): Promise<string> {
  const s = await sessionsRepo.create(dono, { title: 'aula', kind: 'live', sourceLang: 'en', targetLang: 'pt' })
  await utterancesRepo.insertMany(
    dono,
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

async function pedir(body: Record<string, unknown>, userId = PAGANTE) {
  const res = mockRes()
  await polirProxy({ userId, body, requestId: 'r-polir' }, res)
  return res
}

const falas = async (sessionId: string) =>
  ((await sessionsRepo.getWithUtterances(PAGANTE, sessionId)).utterances as any[]).sort((a, b) => a.idx - b.idx)

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ polirProxy } = await h.load<any>('../../server/ai/polimento'))
  ;({ usageCountersRepo: counters } = await h.load<any>('../../server/db/repositories/usageCounters'))
  ;({ gastoDeIaRepo: gasto } = await h.load<any>('../../server/db/repositories/gastoDeIa'))
  ;({ glossarioRepo: glossario } = await h.load<any>('../../server/db/repositories/glossario'))
  ;({ sessionsRepo } = await h.load<any>('../../server/db/repositories/sessions'))
  ;({ utterancesRepo } = await h.load<any>('../../server/db/repositories/utterances'))
  ;({ contaRepo } = await h.load<any>('../../server/db/repositories/conta'))
  const { subscriptionsRepo } = await h.load<any>('../../server/db/repositories/subscriptions')
  await subscriptionsRepo.upsert(PAGANTE, { plan: PLANO_PAGO, status: 'active' })
  await subscriptionsRepo.upsert(OUTRA, { plan: PLANO_PAGO, status: 'active' })
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  for (const e of ENVS) process.env[e] = ''
  await h.cleanup()
})
beforeEach(() => {
  for (const e of ENVS) process.env[e] = ''
  process.env.IA_PROVEDORES = JSON.stringify({ provedores: [DEEPINFRA] })
  process.env.DEEPINFRA_API_KEY = 'chave-deepinfra-falsa'
  esquecerGlossarioEmMemoria()
})
afterEach(() => {
  forja.semNuance = false
  vi.unstubAllGlobals()
  esquecerDisjuntores()
  esquecerAdmissao()
  esquecerRegistro()
})

describe('com a Tradução Nuance', () => {
  it('polir o bloco 0: o servidor monta o bloco do banco, no modelo do polimento, e grava ao lado', async () => {
    const id = await sessaoCom(PAGANTE, 45)
    const chamadas = provedor(polidaDeTudo)
    const res = await pedir({ sessionId: id, bloco: 0 })
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ bloco: 0, blocos: 2, pendentes: 0, jaPolido: false })
    expect(res.body.polidas).toHaveLength(40)
    expect(res.body.polidas[0]).toMatchObject({ traducaoPolida: 'polida: linha 0' })
    expect(res.body.provenance.origin).toBe('modelo-do-polimento')

    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].modelo).toBe('modelo-do-polimento')
    expect(chamadas[0].linhas).toHaveLength(40)
    expect(chamadas[0].linhas[0]).toMatchObject({ n: 1, original: 'line 0', traducao: 'linha 0', para: 'português' })
    expect(chamadas[0].user).not.toContain('Contexto')

    const depois = await falas(id)
    expect(depois[0]).toMatchObject({ translatedText: 'linha 0', traducaoPolida: 'polida: linha 0' })
    expect(depois[0].polimentoModelo).toBe('modelo-do-polimento')
    expect(depois[0].polimentoVersao).toMatch(/^[0-9a-f]{16}$/)
    expect(depois[0].polidoEm).toBeGreaterThan(0)
    expect(depois[40].traducaoPolida).toBeNull()
  })

  it('pedir de novo um bloco polido não chama provedor nem gasta cota (retomar não cobra de novo)', async () => {
    const id = await sessaoCom(PAGANTE, 10)
    provedor(polidaDeTudo)
    await pedir({ sessionId: id, bloco: 0 })
    const chamadasAntes = (await counters.get(PAGANTE, 'managed_calls', mes())) ?? 0
    const gastoAntes = (await gasto.ler(mes()))?.microUsd ?? 0
    const chamadas = provedor(polidaDeTudo)
    const res = await pedir({ sessionId: id, bloco: 0 })
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ bloco: 0, blocos: 1, pendentes: 0, jaPolido: true })
    expect(res.body.polidas).toHaveLength(10)
    expect(chamadas).toHaveLength(0)
    expect((await counters.get(PAGANTE, 'managed_calls', mes())) ?? 0).toBe(chamadasAntes)
    expect((await gasto.ler(mes()))?.microUsd ?? 0).toBe(gastoAntes)
  })

  it('a chamada gasta cota (chamada + tokens) e entra no gasto de IA do mês', async () => {
    const id = await sessaoCom(PAGANTE, 5)
    provedor(polidaDeTudo)
    const chamadasAntes = (await counters.get(PAGANTE, 'managed_calls', mes())) ?? 0
    const gastoAntes = (await gasto.ler(mes()))?.microUsd ?? 0
    await pedir({ sessionId: id, bloco: 0 })
    expect(await counters.get(PAGANTE, 'managed_calls', mes())).toBe(chamadasAntes + 1)
    expect((await gasto.ler(mes()))?.microUsd ?? 0).toBeGreaterThan(gastoAntes)
  })

  it('resposta parcial grava o que veio; o próximo pedido manda só as linhas que faltaram', async () => {
    const id = await sessaoCom(PAGANTE, 4)
    provedor((c) => ({
      texto: JSON.stringify({ linhas: c.linhas.filter((l) => l.n !== 2).map((l) => ({ n: l.n, traducao: 'ok' })) }),
    }))
    const parcial = await pedir({ sessionId: id, bloco: 0 })
    expect(parcial.body).toMatchObject({ pendentes: 1, jaPolido: false })
    expect(parcial.body.polidas).toHaveLength(3)

    const chamadas = provedor(polidaDeTudo)
    const resto = await pedir({ sessionId: id, bloco: 0 })
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].linhas.map((l) => l.original)).toEqual(['line 1'])
    expect(resto.body).toMatchObject({ pendentes: 0 })
    expect(resto.body.polidas).toHaveLength(4)
    expect((await falas(id))[1].traducaoPolida).toBe('polida: linha 1')
  })

  it('o bloco seguinte leva as 3 linhas anteriores de contexto, já polidas', async () => {
    const id = await sessaoCom(PAGANTE, 45)
    provedor(polidaDeTudo)
    await pedir({ sessionId: id, bloco: 0 })
    const chamadas = provedor(polidaDeTudo)
    const res = await pedir({ sessionId: id, bloco: 1 })
    expect(res.body).toMatchObject({ bloco: 1, blocos: 2 })
    expect(chamadas[0].linhas.map((l) => l.original)).toEqual(['line 40', 'line 41', 'line 42', 'line 43', 'line 44'])
    const contexto = chamadas[0].user.slice(0, chamadas[0].user.indexOf('Linhas do bloco'))
    expect(contexto).toContain('Contexto')
    expect(contexto).toContain('"original":"line 37"')
    expect(contexto).toContain('"traducao":"polida: linha 39"')
    expect(contexto).not.toContain('line 36')
  })

  it('o registro pedido vai no fim do system; o glossário da pessoa, como dado', async () => {
    await glossario.gravar(
      PAGANTE,
      { origem: 'en', destino: 'pt', termo: 'line', termoNorm: normalizarTermo('line'), traducao: 'fala' },
      500,
    )
    const id = await sessaoCom(PAGANTE, 2)
    const chamadas = provedor(polidaDeTudo)
    await pedir({ sessionId: id, bloco: 0, registro: 'formal', variantes: ['pt-PT'] })
    expect(chamadas[0].system).toMatch(/FORMAL/)
    expect(chamadas[0].user).toContain('{"termo":"line","traducao":"fala"}')
    expect(chamadas[0].linhas[0].para).toBe('português de Portugal')
  })

  it('resposta sem JSON utilizável: 502 resposta_invalida, nada gravado, e o custo fica registrado', async () => {
    const id = await sessaoCom(PAGANTE, 3)
    provedor(() => ({ texto: 'Desculpe, não consigo.' }))
    const gastoAntes = (await gasto.ler(mes()))?.microUsd ?? 0
    const res = await pedir({ sessionId: id, bloco: 0 })
    expect(res.statusCode).toBe(502)
    expect(res.body?.code).toBe('resposta_invalida')
    expect((await gasto.ler(mes()))?.microUsd ?? 0).toBeGreaterThan(gastoAntes)
    expect((await falas(id)).every((u) => u.traducaoPolida === null)).toBe(true)
  })

  it('todas as pernas em 429: 429 nuvem_ocupada', async () => {
    const id = await sessaoCom(PAGANTE, 3)
    provedor(() => ({ status: 429 }))
    const res = await pedir({ sessionId: id, bloco: 0 })
    expect(res.statusCode).toBe(429)
    expect(res.body?.code).toBe('nuvem_ocupada')
  })

  it('o mesmo bloco em voo duas vezes: o segundo pedido é 409, sem outra chamada paga', async () => {
    const id = await sessaoCom(PAGANTE, 3)
    let soltar!: () => void
    const esperar = new Promise<void>((r) => (soltar = r))
    const chamadas = provedor((c) => ({ ...polidaDeTudo(c), esperar }))
    const primeiro = pedir({ sessionId: id, bloco: 0 })
    await vi.waitFor(() => expect(chamadas).toHaveLength(1))
    const segundo = await pedir({ sessionId: id, bloco: 0 })
    expect(segundo.statusCode).toBe(409)
    expect(segundo.body?.code).toBe('polimento_em_andamento')
    soltar()
    expect((await primeiro).statusCode).toBe(200)
    expect(chamadas).toHaveLength(1)
  })

  it('bloco que não existe: 404 bloco_inexistente com o total de blocos; corpo inválido: 400', async () => {
    const id = await sessaoCom(PAGANTE, 3)
    const chamadas = provedor(polidaDeTudo)
    const res = await pedir({ sessionId: id, bloco: 1 })
    expect(res.statusCode).toBe(404)
    expect(res.body).toMatchObject({ code: 'bloco_inexistente', blocos: 1 })
    expect((await pedir({ sessionId: id })).statusCode).toBe(400)
    expect((await pedir({ sessionId: id, bloco: -1 })).statusCode).toBe(400)
    expect((await pedir({ sessionId: id, bloco: 0, registro: 'solene' })).statusCode).toBe(400)
    expect(chamadas).toHaveLength(0)
  })

  it('sessão de outra pessoa: 404, sem provedor', async () => {
    const daOutra = await sessaoCom(OUTRA, 3)
    const chamadas = provedor(polidaDeTudo)
    const res = await pedir({ sessionId: daOutra, bloco: 0 })
    expect(res.statusCode).toBe(404)
    expect(res.body?.code).toBe('sessao_inexistente')
    expect(chamadas).toHaveLength(0)
  })

  it('corrigir o texto ou a tradução da fala apaga a polida (ela era de outro texto)', async () => {
    const id = await sessaoCom(PAGANTE, 2)
    provedor(polidaDeTudo)
    await pedir({ sessionId: id, bloco: 0 })
    const [a, b] = await falas(id)
    await utterancesRepo.update(PAGANTE, a.id, { speakerName: 'Ana' })
    await utterancesRepo.update(PAGANTE, b.id, { translatedText: 'linha um corrigida' })
    const [a2, b2] = await falas(id)
    expect(a2.traducaoPolida).toBe('polida: linha 0')
    expect(b2).toMatchObject({ translatedText: 'linha um corrigida', traducaoPolida: null, polidoEm: null })
  })

  it('a polida sai na exportação dos dados (LGPD), junto com a fala', async () => {
    const id = await sessaoCom(PAGANTE, 1)
    provedor(polidaDeTudo)
    await pedir({ sessionId: id, bloco: 0 })
    const exportada = await contaRepo.exportar(PAGANTE)
    const fala = (exportada.dados.utterances as any[]).find((u) => u.sessionId === id)
    expect(fala).toMatchObject({ translatedText: 'linha 0', traducaoPolida: 'polida: linha 0' })
  })
})

describe('sem a Tradução Nuance', () => {
  it('402 exige_nuance pelo entitlement, sem provedor e sem gastar cota', async () => {
    const id = await sessaoCom(PAGANTE, 3)
    forja.semNuance = true
    const chamadas = provedor(polidaDeTudo)
    const antes = (await counters.get(PAGANTE, 'managed_calls', mes())) ?? 0
    const res = await pedir({ sessionId: id, bloco: 0 })
    expect(res.statusCode).toBe(402)
    expect(res.body).toMatchObject({ code: 'exige_nuance', entitlement: 'traducaoNuance' })
    expect(chamadas).toHaveLength(0)
    expect((await counters.get(PAGANTE, 'managed_calls', mes())) ?? 0).toBe(antes)
  })
})
