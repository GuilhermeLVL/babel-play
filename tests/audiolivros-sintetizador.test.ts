/**
 * `scripts/audiolivros/` — a interface `Sintetizador` e seus adaptadores (HTTP, DeepInfra, falso) e o WAV.
 * Nada aqui toca a rede de verdade: o `fetch` é sempre injetado.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  criarSintetizadorDeepInfra,
  criarSintetizadorFalso,
  criarSintetizadorHttp,
  sintetizarComLimite,
} from '../scripts/audiolivros/sintetizador.mjs'
import { duracaoDoWav, emendarWavs } from '../scripts/audiolivros/wav.mjs'
import { CAMPOS_DE_CLONAGEM } from '../server/ai/provedoresDeVoz'

/** WAV de silêncio (PCM 16-bit mono) com a duração pedida. */
function wavDe(duracaoS: number, taxaHz = 16000): Uint8Array {
  const amostras = Math.round(duracaoS * taxaHz)
  const dados = amostras * 2
  const b = new Uint8Array(44 + dados)
  const v = new DataView(b.buffer)
  b.set([0x52, 0x49, 0x46, 0x46], 0)
  v.setUint32(4, 36 + dados, true)
  b.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], 8)
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, taxaHz, true)
  v.setUint32(28, taxaHz * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  b.set([0x64, 0x61, 0x74, 0x61], 36)
  v.setUint32(40, dados, true)
  return b
}

const comoFetch = (f: unknown) => f as typeof fetch
const chamada = (f: ReturnType<typeof vi.fn>, i = 0) => f.mock.calls[i] as unknown as [string, RequestInit]

afterEach(() => vi.unstubAllEnvs())

describe('wav', () => {
  it('lê a duração do cabeçalho e recusa o que não é WAV', () => {
    expect(duracaoDoWav(wavDe(1.5))).toBeCloseTo(1.5, 3)
    const lixo = new TextEncoder().encode('isto não é um áudio, é só texto comprido o bastante para passar de 44 bytes')
    expect(() => duracaoDoWav(lixo)).toThrow(/WAV/)
    expect(() => duracaoDoWav(new Uint8Array(3))).toThrow(/WAV/)
  })

  it('emenda com silêncio entre os clipes e recusa taxas diferentes', () => {
    expect(duracaoDoWav(emendarWavs([wavDe(1), wavDe(2)], 0.3))).toBeCloseTo(3.3, 3)
    expect(duracaoDoWav(emendarWavs([wavDe(1)], 0.3))).toBeCloseTo(1, 3)
    expect(() => emendarWavs([wavDe(1, 16000), wavDe(1, 24000)], 0.3)).toThrow(/taxa/)
    expect(() => emendarWavs([], 0.3)).toThrow()
  })
})

describe('wav: validações extras', () => {
  it('recusa pausa negativa ou não finita e clipe que não é PCM 16-bit mono', () => {
    for (const p of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => emendarWavs([wavDe(1), wavDe(1)], p)).toThrow(RangeError)
    }
    const estereo = wavDe(1)
    new DataView(estereo.buffer).setUint16(22, 2, true)
    expect(() => emendarWavs([wavDe(1), estereo], 0.3)).toThrow(/mono/)
    const naoPcm = wavDe(1)
    new DataView(naoPcm.buffer).setUint16(20, 3, true)
    expect(() => emendarWavs([naoPcm], 0.3)).toThrow(/PCM/)
  })

  it('sintetizarComLimite recusa pausa inválida', async () => {
    const s = criarSintetizadorFalso({})
    await expect(sintetizarComLimite(s, 'oi', { voz: 'x', idioma: 'pt', pausaS: -1 })).rejects.toThrow(RangeError)
  })
})

describe('respostas ruins dos adaptadores', () => {
  const casos = (quem: string, criar: (f: typeof fetch) => ReturnType<typeof criarSintetizadorHttp>) => {
    it(`${quem}: não 2xx cita só o status, sem corpo nem chave`, async () => {
      vi.stubEnv('DEEPINFRA_API_KEY', 'chave-secreta-t5')
      const f = vi.fn(async () => new Response('corpo-sensivel chave-secreta-t5', { status: 503 }))
      const erro = await criar(comoFetch(f))
        .sintetizar('oi', { voz: 'v', idioma: 'pt' })
        .catch((e: Error) => e)
      expect((erro as Error).message).toMatch(/503/)
      expect((erro as Error).message).not.toMatch(/corpo-sensivel|chave-secreta-t5/)
    })
    it(`${quem}: 2xx que não é áudio diz o content-type, sem corpo`, async () => {
      vi.stubEnv('DEEPINFRA_API_KEY', 'chave-secreta-t5')
      const f = vi.fn(
        async () => new Response('corpo-sensivel', { status: 200, headers: { 'content-type': 'application/json' } }),
      )
      const erro = await criar(comoFetch(f))
        .sintetizar('oi', { voz: 'v', idioma: 'pt' })
        .catch((e: Error) => e)
      expect((erro as Error).message).toMatch(/resposta não é áudio WAV: content-type application\/json/)
      expect((erro as Error).message).not.toMatch(/corpo-sensivel/)
    })
  }
  casos('http', (fetch) => criarSintetizadorHttp({ id: 'm', versao: '1', url: 'http://x' }, { fetch }))
  casos('deepinfra', (fetch) => criarSintetizadorDeepInfra({ modelo: 'm', voz: 'v' }, { fetch }))
})

describe('sintetizarComLimite: pontuação inicial', () => {
  it('não perde a pontuação do começo do texto', async () => {
    const s = criarSintetizadorFalso({ limiteDeCaracteres: 100 })
    const espia = vi.spyOn(s, 'sintetizar')
    await sintetizarComLimite(s, '...oi tudo bem. e você?', { voz: 'x', idioma: 'pt' })
    expect(espia.mock.calls.map(([t]) => t).join(' ')).toBe('...oi tudo bem. e você?')
  })
})

describe('sintetizador falso', () => {
  it('devolve duração determinística que o WAV confirma', async () => {
    const s = criarSintetizadorFalso({})
    const texto = 'Olá, mundo. Isto é um teste.'
    const c = await s.sintetizar(texto, { voz: 'x', idioma: 'pt' })
    expect(Math.abs(c.duracaoS - texto.length * 0.06)).toBeLessThan(0.001)
    expect(Math.abs(duracaoDoWav(c.wav) - c.duracaoS)).toBeLessThan(0.001)
    expect(c.taxaHz).toBeGreaterThan(0)
  })
})

describe('sintetizarComLimite', () => {
  const frase = (n: number) => `${'a'.repeat(n - 1)}.`

  it('corta em pontuação respeitando o limite e soma as pausas', async () => {
    const s = criarSintetizadorFalso({ limiteDeCaracteres: 100 })
    const espia = vi.spyOn(s, 'sintetizar')
    const texto = `${frase(82)} ${frase(82)} ${frase(82)}` // 248 caracteres
    const c = await sintetizarComLimite(s, texto, { voz: 'x', idioma: 'pt', pausaS: 0.3 })
    expect(espia).toHaveBeenCalledTimes(3)
    for (const [t] of espia.mock.calls) expect(t.length).toBeLessThanOrEqual(100)
    expect(c.duracaoS).toBeCloseTo(3 * 82 * 0.06 + 2 * 0.3, 2)
    expect(Math.abs(duracaoDoWav(c.wav) - c.duracaoS)).toBeLessThan(0.002)
    expect(c.tempoDeSinteseS).toBeGreaterThanOrEqual(0)
  })

  it('cai para o espaço sem pontuação e só parte palavra maior que o limite', async () => {
    const s = criarSintetizadorFalso({ limiteDeCaracteres: 20 })
    const espia = vi.spyOn(s, 'sintetizar')
    await sintetizarComLimite(s, 'um dois tres quatro cinco seis sete oito', { voz: 'x', idioma: 'pt' })
    for (const [t] of espia.mock.calls) expect(t.length).toBeLessThanOrEqual(20)
    expect(espia.mock.calls.map(([t]) => t).join(' ')).toBe('um dois tres quatro cinco seis sete oito')

    espia.mockClear()
    await sintetizarComLimite(s, 'x'.repeat(45), { voz: 'x', idioma: 'pt' })
    expect(espia.mock.calls.map(([t]) => t.length)).toEqual([20, 20, 5])
  })
})

describe('adaptador HTTP', () => {
  const resposta = (wav: Uint8Array, cab: Record<string, string> = {}) =>
    new Response(wav as BodyInit, { status: 200, headers: { 'content-type': 'audio/wav', ...cab } })

  it('devolve ClipeDeAudio com o tempo do cabeçalho e manda o contrato', async () => {
    const f = vi.fn(async () => resposta(wavDe(2), { 'X-Tempo-Sintese': '0.75' }))
    const s = criarSintetizadorHttp({ id: 'm', versao: '1', url: 'http://x:9/' }, { fetch: comoFetch(f) })
    const c = await s.sintetizar('oi', { voz: 'v', idioma: 'pt' })
    expect(c.tempoDeSinteseS).toBe(0.75)
    expect(c.duracaoS).toBeCloseTo(2, 3)
    expect(c.taxaHz).toBe(16000)
    const [url, init] = chamada(f)
    expect(url).toBe('http://x:9/sintetizar')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toMatchObject({ texto: 'oi', voz: 'v', idioma: 'pt' })
  })

  it('lista vozes por GET /vozes', async () => {
    const f = vi.fn(async () => Response.json([{ id: 'a', idioma: 'pt' }]))
    const s = criarSintetizadorHttp({ id: 'm', versao: '1', url: 'http://x:9' }, { fetch: comoFetch(f) })
    expect(await s.vozes()).toEqual([{ id: 'a', idioma: 'pt' }])
    expect(chamada(f)[0]).toBe('http://x:9/vozes')
  })

  it('só manda Authorization quando tokenEnv está definido e presente', async () => {
    const cabecalho = async (opts: { tokenEnv?: string }) => {
      const f = vi.fn(async () => resposta(wavDe(1)))
      const s = criarSintetizadorHttp({ id: 'm', versao: '1', url: 'http://x', ...opts }, { fetch: comoFetch(f) })
      await s.sintetizar('oi', { voz: 'v', idioma: 'pt' })
      return new Headers(chamada(f)[1].headers).get('authorization')
    }
    vi.stubEnv('TOKEN_FALSO_T5', 'segredo-de-teste')
    vi.stubEnv('TOKEN_AUSENTE_T5', '')
    expect(await cabecalho({})).toBeNull()
    expect(await cabecalho({ tokenEnv: 'TOKEN_AUSENTE_T5' })).toBeNull()
    expect(await cabecalho({ tokenEnv: 'TOKEN_FALSO_T5' })).toBe('Bearer segredo-de-teste')
  })
})

describe('adaptador DeepInfra', () => {
  it('recusa campo de clonagem ANTES de qualquer rede ou leitura de chave', async () => {
    vi.stubEnv('DEEPINFRA_API_KEY', '')
    const f = vi.fn()
    const s = criarSintetizadorDeepInfra({ modelo: 'm', voz: 'v' }, { fetch: comoFetch(f) })
    for (const campo of ['reference_audio', ...CAMPOS_DE_CLONAGEM]) {
      await expect(s.sintetizar('oi', { voz: 'v', idioma: 'pt', [campo]: 'x' } as never)).rejects.toThrow(
        /campo de clonagem de voz no pedido/,
      )
    }
    expect(f).not.toHaveBeenCalled()
  })

  it('sem a chave no ambiente lança erro claro, sem valor de chave', async () => {
    vi.stubEnv('DEEPINFRA_API_KEY', '')
    const f = vi.fn()
    const s = criarSintetizadorDeepInfra({ modelo: 'm', voz: 'v' }, { fetch: comoFetch(f) })
    const erro = await s.sintetizar('oi', { voz: 'v', idioma: 'pt' }).catch((e: Error) => e)
    expect((erro as Error).message).toMatch(/DEEPINFRA_API_KEY.*ausente/)
    expect(f).not.toHaveBeenCalled()
  })

  it('com a chave, chama a DeepInfra com Bearer e devolve o clipe', async () => {
    vi.stubEnv('DEEPINFRA_API_KEY', 'chave-so-no-teste')
    const f = vi.fn(async () => new Response(wavDe(1) as BodyInit, { headers: { 'content-type': 'audio/wav' } }))
    const s = criarSintetizadorDeepInfra({ modelo: 'm', voz: 'v' }, { fetch: comoFetch(f) })
    const c = await s.sintetizar('oi', { voz: 'v', idioma: 'pt' })
    expect(c.duracaoS).toBeCloseTo(1, 3)
    const [url, init] = chamada(f)
    expect(url).toMatch(/^https:\/\/api\.deepinfra\.com\//)
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer chave-so-no-teste')
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'm', input: 'oi', voice: 'v' })
  })
})
