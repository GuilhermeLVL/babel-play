/**
 * CARACTERIZAÇÃO — os proxies de IA (`/api/ai`), por HTTP, no modo self-host.
 *
 * Grava o comportamento ATUAL (rodada de saneamento, Fase 1). Um `expect` aqui que pareça
 * estranho está marcado com `// caracterizacao:` — o teste existe para detectar MUDANÇA, e a
 * correção, quando couber, pertence a outra fase.
 *
 * NADA SAI DA MÁQUINA. O `fetch` global é substituído: chamadas ao próprio servidor de teste
 * (`s.base`) passam para o `fetch` real; qualquer outro host cai no provedor FALSO daqui, que
 * grava a requisição (URL, cabeçalhos, corpo) e responde o que o teste mandar. O provedor
 * primário da tradução é configurado por env ANTES de subir o app; a credencial BYOK usa um IP
 * público literal (TEST-NET-3) porque o guard anti-SSRF resolve DNS de qualquer hostname.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { type AppDeTeste, resposta, subirApp } from './_app'

const ENV_PRIMARIO = {
  LLM_API_KEY: 'chave-falsa-primaria',
  LLM_BASE_URL: 'http://llm-falso.local/v1',
  LLM_MODEL: 'modelo-do-env',
}
const ENV_RESERVA = {
  LLM_RESERVA_API_KEY: 'chave-falsa-reserva',
  LLM_RESERVA_BASE_URL: 'http://reserva-falsa.local/v1',
  LLM_RESERVA_MODEL: 'modelo-da-reserva',
}
/* Variáveis que mudariam o provedor resolvido se estivessem no ambiente de quem roda o teste. */
const ENV_ZERADO = [
  'GROQ_API_KEY',
  'GROQ_BASE_URL',
  'GROQ_LLM_MODEL',
  'GROQ_MODEL',
  'STT_API_KEY',
  'STT_BASE_URL',
  'STT_MODEL',
  ...Object.keys(ENV_RESERVA),
]

const BASE_BYOK = 'http://203.0.113.10/v1'

interface ChamadaUpstream {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown> | null
}

let s: AppDeTeste
let chamadas: ChamadaUpstream[] = []
let responder: (c: ChamadaUpstream) => Response | Promise<Response> = () => completacao('resposta padrão')
const envAnterior: Record<string, string | undefined> = {}

const completacao = (texto: string) =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: texto } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )

function fixar(nome: string, valor: string | undefined) {
  if (!(nome in envAnterior)) envAnterior[nome] = process.env[nome]
  if (valor === undefined) delete process.env[nome]
  else process.env[nome] = valor
}

beforeAll(async () => {
  for (const [k, v] of Object.entries(ENV_PRIMARIO)) fixar(k, v)
  for (const k of ENV_ZERADO) fixar(k, undefined)
  s = await subirApp({ modo: 'self-host' })

  const real = globalThis.fetch
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith(s.base)) return real(input, init)
    let body: Record<string, unknown> | null = null
    try {
      body = JSON.parse(String(init?.body ?? ''))
    } catch {
      /* corpo não-JSON */
    }
    const c: ChamadaUpstream = { url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body }
    chamadas.push(c)
    return responder(c)
  })
})
afterAll(async () => {
  vi.unstubAllGlobals()
  await s.encerrar()
  for (const [k, v] of Object.entries(envAnterior)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})
beforeEach(() => {
  chamadas = []
  responder = () => completacao('resposta padrão')
  for (const k of Object.keys(ENV_RESERVA)) delete process.env[k]
  /* O disjuntor de `server/ai/disjuntor.ts` guarda falhas SEGUIDAS por provedor, e é estado de
     processo de propósito. Sem zerar entre casos, as falhas encenadas por um teste (timeout, 500,
     429) somariam e o teste seguinte encontraria o provedor com o disjuntor aberto — a chamada
     não sairia, e o `chamadas` que cada caso confere mediria outra coisa. */
  esquecerDisjuntores()
})

describe('POST /api/ai/mt — tradução gerenciada', () => {
  it('corpo válido + provedor responde → 200, e o provedor recebe o modelo e a chave do env', async () => {
    responder = () => completacao('olá mundo')
    const r = await s.post('/api/ai/mt', { text: 'hello world', tgt: 'pt', src: 'en' })
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    expect(corpo.text).toBe('olá mundo')
    expect(corpo.engine).toBe('server-llm-mt')
    expect(corpo.provenance.origin).toBe('modelo-do-env')
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.api.ai.mt.json')

    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].url).toBe('http://llm-falso.local/v1/chat/completions')
    expect(chamadas[0].headers.authorization).toBe('Bearer chave-falsa-primaria')
    expect(chamadas[0].body?.model).toBe('modelo-do-env')
    expect(chamadas[0].body?.stream).toBe(false)
    expect(chamadas[0].body?.max_tokens).toBe(1200)
  })

  it('provedor responde 500 e não há reserva → 502 com código, sem o corpo do provedor', async () => {
    responder = () => new Response('fora do ar', { status: 500 })
    const r = await s.post('/api/ai/mt', { text: 'hello', tgt: 'pt' })
    expect(r.status).toBe(502)
    const corpo = await r.clone().json()
    /* FASE 4 (correção 6): o corpo do provedor NÃO chega mais ao cliente. Antes, `error` era
       'tradução indisponível: HTTP 500: fora do ar' — 160 caracteres do texto do terceiro. Agora
       é código estável + `requestId` para citar; o texto do upstream fica no log estruturado. */
    expect(corpo.code).toBe('provedor_indisponivel')
    expect(corpo.error).toMatch(/^tradução indisponível/)
    expect(JSON.stringify(corpo)).not.toContain('fora do ar')
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.api.ai.mt.upstream-500.json',
    )
    expect(chamadas).toHaveLength(1)
  })

  it('provedor responde 500 e há reserva configurada → a reserva serve, e a procedência diz o modelo dela', async () => {
    for (const [k, v] of Object.entries(ENV_RESERVA)) process.env[k] = v
    responder = (c) =>
      c.url.startsWith('http://llm-falso.local')
        ? new Response('fora do ar', { status: 500 })
        : completacao('salvo pela reserva')
    const r = await s.post('/api/ai/mt', { text: 'hello', tgt: 'pt' })
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    expect(corpo.text).toBe('salvo pela reserva')
    expect(corpo.provenance.origin).toBe('modelo-da-reserva')
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.api.ai.mt.reserva.json',
    )
    expect(chamadas.map((c) => c.url)).toEqual([
      'http://llm-falso.local/v1/chat/completions',
      'http://reserva-falsa.local/v1/chat/completions',
    ])
    expect(chamadas[1].headers.authorization).toBe('Bearer chave-falsa-reserva')
    expect(chamadas[1].body?.model).toBe('modelo-da-reserva')
  })

  it('provedor estoura o timeout (abort simulado) → 502 com código, e a causa só no log', async () => {
    /* O teto de 12 s do mtProxy é cravado no código, não configurável. Esperar 12 s de verdade
       tornaria a suíte lenta; o falso devolve o MESMO erro que `AbortSignal.timeout` produz, o que
       exercita o tratamento do timeout em `chamarChat` (a mensagem é reconhecida por /abort|timeout/). */
    responder = () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
    const r = await s.post('/api/ai/mt', { text: 'hello', tgt: 'pt' })
    expect(r.status).toBe(502)
    const corpo = await r.clone().json()
    // FASE 4: a causa ('sem resposta em 12000 ms') virou linha de log; o cliente recebe o código.
    expect(corpo.code).toBe('provedor_indisponivel')
    expect(corpo.error).not.toContain('12000')
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.api.ai.mt.timeout.json',
    )
  })

  it.skip('provedor PENDURADO de verdade por mais de 12 s — pulado: o timeout não é configurável por env e o teste levaria 12 s', () => {})

  it('corpo inválido (sem tgt) → 400', async () => {
    const r = await s.post('/api/ai/mt', { text: 'hello' })
    expect(r.status).toBe(400)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.api.ai.mt.400.json',
    )
    expect(chamadas).toHaveLength(0)
  })
})

describe('GET /api/ai/stt/available', () => {
  it('com chave de LLM no servidor e plano self-host → 200 { available: true }', async () => {
    const r = await s.get('/api/ai/stt/available')
    expect(r.status).toBe(200)
    expect(await r.clone().json()).toEqual({ available: true })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/get.api.ai.stt.available.json',
    )
  })
})

describe('POST /api/ai/providers/test', () => {
  it('baseUrl em IP privado é barrada pelo guard anti-SSRF antes de qualquer chamada', async () => {
    const r = await s.post('/api/ai/providers/test', { baseUrl: 'http://10.0.0.1/v1', apiKey: 'x', model: 'm' })
    /* FASE 4 (correção 5): a recusa de SSRF era HTTP **200** com `{ ok: false, message: 'erro
       interno' }` — status de sucesso e causa apagada por `erroDeRota`, o que a tornava
       indistinguível de um provedor que só falhou no ping. Agora é 400 com código próprio. */
    expect(r.status).toBe(400)
    const corpo = await r.clone().json()
    expect(corpo.code).toBe('destino_bloqueado')
    expect(corpo.error).toBe('destino não permitido')
    // O IP resolvido NÃO sai na resposta: o guard não pode virar scanner de rede interna.
    expect(JSON.stringify(corpo)).not.toContain('10.0.0.1')
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.api.ai.providers.test.ssrf.json',
    )
    expect(chamadas).toHaveLength(0)
  })

  it('campo desconhecido no corpo → 400 (o schema recusa, não descarta)', async () => {
    // FASE 4 (correção 2): `req.body` era desestruturado cru. `strictObject` recusa o excedente.
    const r = await s.post('/api/ai/providers/test', { baseUrl: 'https://exemplo.invalido/v1', xis: 1 })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/payload inválido/)
    expect(chamadas).toHaveLength(0)
  })
})

describe('credenciais BYOK e proxy de chat', () => {
  let credencialId: string

  it('POST /api/ai/llm/chat/completions sem x-credential-id → 400', async () => {
    const r = await s.post('/api/ai/llm/chat/completions', { messages: [{ role: 'user', content: 'oi' }] })
    expect(r.status).toBe(400)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.api.ai.llm.chat.completions.sem-credencial.json',
    )
    expect(chamadas).toHaveLength(0)
  })

  it('x-credential-id inexistente → 502', async () => {
    const r = await s.chamar('POST', '/api/ai/llm/chat/completions', {
      body: { messages: [] },
      headers: { 'x-credential-id': 'nao-existe' },
    })
    // caracterizacao: comportamento atual, nao desejado — credencial que não é do usuário (ou não existe) vira 502 "credencial não encontrada", não 404
    expect(r.status).toBe(502)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.api.ai.llm.chat.completions.credencial-inexistente.json',
    )
    expect(chamadas).toHaveLength(0)
  })

  it('POST /api/ai/credentials cria a credencial sem ecoar o segredo', async () => {
    const r = await s.post('/api/ai/credentials', {
      label: 'byok',
      kind: 'openai',
      baseUrl: BASE_BYOK,
      defaultModel: 'modelo-byok',
      secret: 'segredo-byok',
    })
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    credencialId = corpo.id
    expect(credencialId).toBeTruthy()
    expect(corpo).not.toHaveProperty('secret')
    expect(JSON.stringify(corpo)).not.toContain('segredo-byok')
    // caracterizacao: comportamento atual — a resposta traz `secretRef` (a referência interna à tabela `secrets`), que não é o segredo mas é detalhe de armazenamento
    expect(corpo.secretRef).toBe(`cred_${credencialId}`)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.api.ai.credentials.json',
    )
  })

  it('chat completions com a credencial → 200 pass-through, e o provedor recebe `Authorization: Bearer <segredo>`', async () => {
    responder = () => completacao('do provedor byok')
    const r = await s.chamar('POST', '/api/ai/llm/chat/completions', {
      body: { messages: [{ role: 'user', content: 'oi' }], max_tokens: 999_999 },
      headers: { 'x-credential-id': credencialId },
    })
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    expect(corpo.choices[0].message.content).toBe('do provedor byok')
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.api.ai.llm.chat.completions.json',
    )

    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].url).toBe(`${BASE_BYOK}/chat/completions`)
    expect(chamadas[0].headers.authorization).toBe('Bearer segredo-byok')
    expect(chamadas[0].body?.model).toBe('modelo-byok')
    expect(chamadas[0].body?.max_tokens).toBe(4096)
  })

  it('campo desconhecido no corpo do chat → 400, e nada é encaminhado ao provedor', async () => {
    /* FASE 4 (correção 1): o corpo era ESPALHADO (`{ ...req.body }`) e reenviado ao provedor sem
       schema — quem chamava ditava cada parâmetro do pedido (e do custo). `strictObject` recusa. */
    const r = await s.chamar('POST', '/api/ai/llm/chat/completions', {
      body: { messages: [{ role: 'user', content: 'oi' }], logprobs: true, n: 50 },
      headers: { 'x-credential-id': credencialId },
    })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/payload inválido/)
    expect(chamadas).toHaveLength(0)
  })

  it('role inválido em messages → 400', async () => {
    const r = await s.chamar('POST', '/api/ai/llm/chat/completions', {
      body: { messages: [{ role: 'root', content: 'oi' }] },
      headers: { 'x-credential-id': credencialId },
    })
    expect(r.status).toBe(400)
    expect(chamadas).toHaveLength(0)
  })

  it('GET /api/ai/credentials lista sem campo de segredo', async () => {
    const r = await s.get('/api/ai/credentials')
    expect(r.status).toBe(200)
    const lista = (await r.clone().json()) as Array<Record<string, unknown>>
    expect(lista.length).toBeGreaterThanOrEqual(1)
    for (const c of lista) expect(c).not.toHaveProperty('secret')
    expect(JSON.stringify(lista)).not.toContain('segredo-byok')
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/get.api.ai.credentials.json',
    )
  })
})

/** WAV PCM 16 kHz mono 16 bits com `segundos` de silêncio — o mínimo que `segundosFaturaveis` lê. */
function wavDeSilencio(segundos: number): Buffer {
  const taxa = 16_000
  const amostras = Math.round(taxa * segundos)
  const dados = amostras * 2
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

describe('POST /api/ai/stt — transcrição gerenciada com upstream falso', () => {
  it('sem chave de STT no servidor → 501', async () => {
    const r = await s.chamar('POST', '/api/ai/stt', { raw: wavDeSilencio(1), headers: { 'content-type': 'audio/wav' } })
    expect(r.status).toBe(501)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.api.ai.stt.501.json',
    )
    expect(chamadas).toHaveLength(0)
  })

  it('com STT_API_KEY e upstream que responde verbose_json → 200 com texto e idioma', async () => {
    fixar('STT_API_KEY', 'chave-stt-falsa')
    fixar('STT_BASE_URL', 'http://203.0.113.20/v1') // IP público literal: `assertPublicUrl` resolve DNS de verdade
    responder = () =>
      new Response(JSON.stringify({ text: 'olá mundo', language: 'portuguese', duration: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    const r = await s.chamar('POST', '/api/ai/stt', {
      raw: wavDeSilencio(1),
      headers: { 'content-type': 'audio/wav', 'x-language': 'pt' },
    })
    expect(r.status).toBe(200)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.api.ai.stt.json')
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].url).toBe('http://203.0.113.20/v1/audio/transcriptions')
    expect(chamadas[0].headers.authorization).toBe('Bearer chave-stt-falsa')
  })

  it('upstream 4xx em verbose_json → repete em json; 5xx → retenta com espera e termina em 502', async () => {
    fixar('STT_API_KEY', 'chave-stt-falsa')
    fixar('STT_BASE_URL', 'http://203.0.113.20/v1') // IP público literal: `assertPublicUrl` resolve DNS de verdade
    let n = 0
    responder = () => {
      n++
      return n === 1
        ? new Response('formato nao suportado', { status: 400 })
        : new Response(JSON.stringify({ text: 'segunda tentativa' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
    }
    const ok = await s.chamar('POST', '/api/ai/stt', {
      raw: wavDeSilencio(1),
      headers: { 'content-type': 'audio/wav' },
    })
    expect(ok.status).toBe(200)
    expect(chamadas).toHaveLength(2)

    chamadas = []
    responder = () => new Response('caiu', { status: 503 })
    const r = await s.chamar('POST', '/api/ai/stt', { raw: wavDeSilencio(1), headers: { 'content-type': 'audio/wav' } })
    expect(r.status).toBe(502)
    // FASE 4 (correção 6): o corpo do provedor ("caiu") não é mais ecoado — só código + requestId.
    const corpo502 = await r.clone().json()
    expect(corpo502.code).toBe('provedor_indisponivel')
    expect(JSON.stringify(corpo502)).not.toContain('caiu')
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.api.ai.stt.502.json',
    )
    /*
     * MUDOU NA FASE 5, e a mudança é deliberada: eram 1 chamada, agora são 3.
     *
     * A caracterização gravava "5xx não repete", e isso descrevia a regra do FORMATO — 5xx não é
     * o provedor recusando `verbose_json`, então não adiantava reenviar em `json`. Continua
     * valendo, e é por isso que as três tentativas são todas em `verbose_json`.
     *
     * O que passou a existir por cima é a RETENTATIVA com espera crescente do
     * `server/ai/sttProxy.ts`: o STT não tem cascata para onde cair, e um 503 momentâneo do
     * provedor fazia o usuário perder a fala — áudio de enunciado não volta. Duas tentativas
     * extras (500 ms e 1.500 ms). O corpo da resposta ao cliente NÃO mudou: mesmo 502, mesmo
     * `code`, mesmo snapshot — só o número de tentativas antes de desistir.
     */
    expect(chamadas).toHaveLength(3)
    expect(chamadas.every((c) => String(c.url).endsWith('/audio/transcriptions'))).toBe(true)
  })

  it('429 do provedor: NÃO reenvia em json (não é sobre formato) — espera e tenta de novo', async () => {
    // Antes da Fase 5 o 429 caía na regra dos 4xx e disparava um reenvio IMEDIATO do mesmo áudio
    // em outro formato: dois pedidos recusados em vez de um, no momento em que o provedor pede
    // para diminuir o ritmo.
    fixar('STT_API_KEY', 'chave-stt-falsa')
    fixar('STT_BASE_URL', 'http://203.0.113.20/v1')
    let n = 0
    responder = () => {
      n++
      return n === 1
        ? new Response('rate limited', { status: 429 })
        : new Response(JSON.stringify({ text: 'passou na segunda' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
    }
    const r = await s.chamar('POST', '/api/ai/stt', { raw: wavDeSilencio(1), headers: { 'content-type': 'audio/wav' } })
    expect(r.status).toBe(200)
    expect((await r.json()).text).toBe('passou na segunda')
    // Duas chamadas: a recusada e a retentativa. Não três — o reenvio em `json` não aconteceu.
    expect(chamadas).toHaveLength(2)
  })

  it('cabeçalho x-model fora do formato → 400 antes de qualquer chamada ao provedor', async () => {
    // FASE 4 (correção 3): `x-model`/`x-language` iam do cabeçalho para o FormData sem validação.
    fixar('STT_API_KEY', 'chave-stt-falsa')
    fixar('STT_BASE_URL', 'http://203.0.113.20/v1')
    const r = await s.chamar('POST', '/api/ai/stt', {
      raw: wavDeSilencio(1),
      headers: { 'content-type': 'audio/wav', 'x-model': 'modelo com espaço e ; ponto-e-vírgula' },
    })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/payload inválido/)
    expect(chamadas).toHaveLength(0)
  })
})

describe('DELETE /api/ai/credentials/:id', () => {
  it('apaga a credencial do usuário e ela some da lista; id desconhecido → 404', async () => {
    const criada = await s.post('/api/ai/credentials', {
      label: 'apagar',
      kind: 'openai',
      baseUrl: BASE_BYOK,
      defaultModel: 'm',
      secret: 'seg',
    })
    const { id } = await criada.json()
    const r = await s.del(`/api/ai/credentials/${id}`)
    expect(r.status).toBe(200)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/delete.api.ai.credentials.id.json',
    )
    const lista = (await (await s.get('/api/ai/credentials')).json()) as Array<{ id: string }>
    expect(lista.some((c) => c.id === id)).toBe(false)
    const r404 = await s.del('/api/ai/credentials/00000000-0000-0000-0000-000000000000')
    expect(r404.status).toBe(404)
    await expect(JSON.stringify(await resposta(r404), null, 2)).toMatchFileSnapshot(
      '__snapshots__/delete.api.ai.credentials.id.404.json',
    )
  })
})
