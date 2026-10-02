/**
 * A VOZ DE NUVEM DO SITE ESTÁTICO (`functions/quest/tts.js`).
 *
 * O Quest não tem voz de leitura: a tradução do intérprete é lida por esta função. Aqui ela roda com um
 * KV e um Workers AI falsos: que idioma tem voz, a origem, o teto de texto, as cotas, o que é contado, e
 * que o português só entra com o segredo do provedor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _reiniciarMemoriaDaCota, chaveDoVisitante } from '../functions/quest/stt.js'
import { bytesDoAudio, idiomasComVoz, onRequestGet, onRequestPost } from '../functions/quest/tts.js'

function kvFalso(inicial: Record<string, string> = {}) {
  const dados = new Map(Object.entries(inicial))
  return {
    dados,
    get: async (k: string) => dados.get(k) ?? null,
    put: vi.fn(async (k: string, v: string) => void dados.set(k, v)),
  }
}

const ORIGEM = 'https://babel-play.pages.dev'
const pedido = (corpo: unknown, cabecalhos: Record<string, string> = {}) =>
  new Request(`${ORIGEM}/quest/tts`, {
    method: 'POST',
    headers: { origin: ORIGEM, 'cf-connecting-ip': '203.0.113.7', 'content-type': 'application/json', ...cabecalhos },
    body: JSON.stringify(corpo),
  })
/** O MeloTTS devolve `{ audio: <base64> }`. */
const ia = () => ({ run: vi.fn(async () => ({ audio: btoa('mp3-de-teste') })) })
const dia = new Date().toISOString().slice(0, 10)
const CHAVE = 'chave-de-teste-com-mais-de-16'

/* A contagem vive também na memória do isolate (reservas, ritmo por minuto): cada teste começa limpo. */
beforeEach(() => _reiniciarMemoriaDaCota())
afterEach(() => vi.unstubAllGlobals())

describe('bytesDoAudio', () => {
  it('aceita base64 em JSON, bytes crus e stream', async () => {
    expect(new TextDecoder().decode((await bytesDoAudio({ audio: btoa('abc') }))!)).toBe('abc')
    expect((await bytesDoAudio(new Uint8Array([1, 2, 3])))!.length).toBe(3)
    expect((await bytesDoAudio(new Response(new Uint8Array([1, 2])).body))!.length).toBe(2)
    expect(await bytesDoAudio(null)).toBeNull()
    expect(await bytesDoAudio({})).toBeNull()
  })
})

describe('POST /quest/tts', () => {
  it('lê em inglês pelo Workers AI e devolve o áudio, sem gravar nada além dos números', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    const r = await onRequestPost({ request: pedido({ texto: 'Good morning', idioma: 'en-US' }), env })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('audio/mpeg')
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(new TextDecoder().decode(await r.arrayBuffer())).toBe('mp3-de-teste')
    expect(env.AI.run).toHaveBeenCalledWith('@cf/myshell-ai/melotts', { prompt: 'Good morning', lang: 'en' })
    for (const [k] of env.LIMITES.dados) expect(k).toMatch(/^(ip|total|hora):/)
  })

  it('a voz gasta a cota na proporção do texto, reservada ANTES do modelo e devolvida se ele falhar', async () => {
    const run = vi.fn(async () => ({ audio: btoa('mp3') }))
    const env = { AI: { run }, LIMITES: kvFalso() }
    const consulta = () => new Request(`${ORIGEM}/quest/tts`, { headers: { 'cf-connecting-ip': '203.0.113.7' } })
    const restante = async () =>
      ((await (await onRequestGet({ request: consulta(), env })).json()) as { restante: number }).restante
    // 600 caracteres a 15 por segundo são 40 s de voz; a voz pesa 0,4: 16 s de cota.
    await onRequestPost({ request: pedido({ texto: 'a'.repeat(600), idioma: 'en' }), env })
    expect(await restante()).toBe(900 - 16)
    run.mockRejectedValueOnce(new Error('boom'))
    await onRequestPost({ request: pedido({ texto: 'a'.repeat(600), idioma: 'en' }), env })
    expect(await restante()).toBe(900 - 16)
  })

  it('leituras ao mesmo tempo não passam do que resta ao visitante', async () => {
    const chaveIp = await chaveDoVisitante(pedido({}), dia)
    const run = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 15))
      return { audio: btoa('mp3') }
    })
    const env = { AI: { run }, LIMITES: kvFalso({ [chaveIp]: String(15 * 60 - 10) }) }
    const respostas = await Promise.all(
      Array.from({ length: 4 }, () =>
        onRequestPost({ request: pedido({ texto: 'a'.repeat(600), idioma: 'en' }), env }),
      ),
    )
    // Restavam 10 s e cada leitura custa 16: só a primeira chega ao modelo.
    expect(respostas.map((r) => r.status).sort()).toEqual([200, 429, 429, 429])
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('pedidos demais num minuto: 429 `devagar` com a espera, sem tocar na IA', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    let ultimo: Response | null = null
    for (let i = 0; i < 61; i++) ultimo = await onRequestPost({ request: pedido({ texto: 'hi', idioma: 'en' }), env })
    expect(ultimo!.status).toBe(429)
    expect(Number(ultimo!.headers.get('retry-after'))).toBeGreaterThanOrEqual(1)
    expect(await ultimo!.json()).toMatchObject({ code: 'devagar' })
    expect(env.AI.run).toHaveBeenCalledTimes(60)
  })

  it('japonês: tenta o código do modelo e, se falhar, o ISO', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('unknown language'))
      .mockResolvedValueOnce({ audio: btoa('ok') })
    const env = { AI: { run }, LIMITES: kvFalso() }
    const r = await onRequestPost({ request: pedido({ texto: 'おはよう', idioma: 'ja' }), env })
    expect(r.status).toBe(200)
    expect(run.mock.calls.map((c) => c[1].lang)).toEqual(['jp', 'ja'])
  })

  it('português sem o segredo do provedor: 422 `idioma_sem_voz`, sem tocar na IA nem na cota', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    const r = await onRequestPost({ request: pedido({ texto: 'Bom dia', idioma: 'pt-BR' }), env })
    expect(r.status).toBe(422)
    expect(await r.json()).toMatchObject({ code: 'idioma_sem_voz', idioma: 'pt' })
    expect(env.AI.run).not.toHaveBeenCalled()
    expect(env.LIMITES.put).not.toHaveBeenCalled()
  })

  it('português COM o segredo: vai ao provedor só com texto, modelo, formato e idioma', async () => {
    const buscar = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(new Uint8Array([9, 9, 9]), { headers: { 'content-type': 'audio/mpeg' } }),
    )
    vi.stubGlobal('fetch', buscar)
    const env = { AI: ia(), LIMITES: kvFalso(), DEEPINFRA_API_KEY: CHAVE }
    const r = await onRequestPost({ request: pedido({ texto: 'Bom dia', idioma: 'pt' }), env })
    expect(r.status).toBe(200)
    expect((await r.arrayBuffer()).byteLength).toBe(3)
    const [url, init] = buscar.mock.calls[0]
    expect(url).toContain('api.deepinfra.com')
    expect(Object.keys(JSON.parse(String(init.body))).sort()).toEqual([
      'extra_body',
      'input',
      'model',
      'response_format',
    ])
    expect(env.AI.run).not.toHaveBeenCalled()
  })

  it('fora da origem, sem texto ou texto longo demais: recusa sem tocar na IA', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    expect(
      (await onRequestPost({ request: pedido({ texto: 'hi', idioma: 'en' }, { origin: 'https://outro.site' }), env }))
        .status,
    ).toBe(403)
    expect((await onRequestPost({ request: pedido({ texto: '  ', idioma: 'en' }), env })).status).toBe(400)
    expect((await onRequestPost({ request: pedido({ texto: 'a'.repeat(601), idioma: 'en' }), env })).status).toBe(413)
    expect(env.AI.run).not.toHaveBeenCalled()
  })

  it('a cota do dia acabou: 429 com a espera', async () => {
    const chaveIp = await chaveDoVisitante(pedido({}), dia)
    const env = { AI: ia(), LIMITES: kvFalso({ [chaveIp]: String(15 * 60) }) }
    const r = await onRequestPost({ request: pedido({ texto: 'hi', idioma: 'en' }), env })
    expect(r.status).toBe(429)
    expect(await r.json()).toMatchObject({ code: 'cota_do_dia' })
    expect(env.AI.run).not.toHaveBeenCalled()
  })

  it('a IA falhou: 502 e nada é contado', async () => {
    const env = { AI: { run: vi.fn(async () => Promise.reject(new Error('boom'))) }, LIMITES: kvFalso() }
    const r = await onRequestPost({ request: pedido({ texto: 'hi', idioma: 'en' }), env })
    expect(r.status).toBe(502)
    expect(env.LIMITES.put).not.toHaveBeenCalled()
  })

  it('sem o KV das cotas, a voz fica FECHADA (501)', async () => {
    expect((await onRequestPost({ request: pedido({ texto: 'hi', idioma: 'en' }), env: { AI: ia() } })).status).toBe(
      501,
    )
  })
})

describe('GET /quest/tts', () => {
  it('diz os idiomas com voz: seis de fábrica; com o segredo, o português entra', async () => {
    expect(idiomasComVoz({})).toEqual(['en', 'es', 'fr', 'ja', 'ko', 'zh'])
    expect(idiomasComVoz({ DEEPINFRA_API_KEY: CHAVE })).toContain('pt')
    const env = { AI: ia(), LIMITES: kvFalso() }
    const r = await onRequestGet({ request: new Request(`${ORIGEM}/quest/tts`), env })
    expect(await r.json()).toMatchObject({ ok: true, idiomas: ['en', 'es', 'fr', 'ja', 'ko', 'zh'] })
  })

  it('pedido por outro site no navegador: 403', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    const deFora = new Request(`${ORIGEM}/quest/tts`, { headers: { 'sec-fetch-site': 'cross-site' } })
    expect((await onRequestGet({ request: deFora, env })).status).toBe(403)
  })
})
