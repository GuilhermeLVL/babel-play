/**
 * A BLINDAGEM DA NUVEM DO SITE ESTÁTICO (`functions/quest/stt.js`).
 *
 * O site não tem conta: o limite é contado no servidor, por endereço de rede. Aqui a função roda com
 * um KV e um Workers AI falsos: a cota por IP, o teto global, o formato e a duração por pedido, a
 * origem, e que só o que foi transcrito é contado.
 */
import { describe, expect, it, vi } from 'vitest'

import { onRequestPost as traduzirTexto } from '../functions/quest/mt.js'
import { chaveDoVisitante, onRequestGet, onRequestPost, segundosDoWav } from '../functions/quest/stt.js'

/** Um WAV PCM 16 kHz mono de 16 bits com `segundos` de silêncio. */
function wav(segundos: number): Uint8Array {
  const dados = Math.round(segundos * 32000)
  const b = new Uint8Array(44 + dados)
  const v = new DataView(b.buffer)
  b.set([82, 73, 70, 70], 0) // RIFF
  b.set([87, 65, 86, 69], 8) // WAVE
  v.setUint32(28, 32000, true) // bytes por segundo
  return b
}

function kvFalso(inicial: Record<string, string> = {}) {
  const dados = new Map(Object.entries(inicial))
  return {
    dados,
    get: async (k: string) => dados.get(k) ?? null,
    put: vi.fn(async (k: string, v: string) => void dados.set(k, v)),
  }
}

const ORIGEM = 'https://babel-play.pages.dev'
const pedido = (corpo: Uint8Array, cabecalhos: Record<string, string> = {}) =>
  new Request(`${ORIGEM}/quest/stt`, {
    method: 'POST',
    headers: { origin: ORIGEM, 'cf-connecting-ip': '203.0.113.7', ...cabecalhos },
    body: corpo,
  })
const ia = () => ({ run: vi.fn(async () => ({ text: ' olá mundo ', transcription_info: { language: 'pt' } })) })
const dia = new Date().toISOString().slice(0, 10)

describe('segundosDoWav', () => {
  it('lê a duração pelo cabeçalho; o que não é WAV dá null', () => {
    expect(segundosDoWav(wav(5))).toBeCloseTo(5, 1)
    expect(segundosDoWav(new Uint8Array(100))).toBeNull()
    expect(segundosDoWav(new Uint8Array(10))).toBeNull()
  })
})

describe('POST /quest/stt', () => {
  it('transcreve, devolve o texto e o que resta, e não grava nada além dos números', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    const r = await onRequestPost({ request: pedido(wav(6)), env })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ text: 'olá mundo', language: 'pt', segundos: 6 })
    for (const [k, v] of env.LIMITES.dados) {
      expect(k).toMatch(/^(ip|total):/)
      expect(k).not.toContain('203.0.113.7') // o IP nunca vira chave
      expect(Number(v)).toBeGreaterThan(0)
    }
  })

  it('sem a origem do próprio site: 403, sem tocar na IA', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    const r = await onRequestPost({ request: pedido(wav(3), { origin: 'https://outro.site' }), env })
    expect(r.status).toBe(403)
    expect(env.AI.run).not.toHaveBeenCalled()
  })

  it('o que não é WAV: 400; fala longa demais (arquivo, não frase): 413', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    expect((await onRequestPost({ request: pedido(new Uint8Array(500)), env })).status).toBe(400)
    expect((await onRequestPost({ request: pedido(wav(20)), env })).status).toBe(413)
    expect(env.AI.run).not.toHaveBeenCalled()
  })

  it('a cota do dia deste endereço acabou: 429 `cota_do_dia`, com a espera, sem tocar na IA', async () => {
    const chaveIp = await chaveDoVisitante(pedido(wav(1)), dia)
    const env = { AI: ia(), LIMITES: kvFalso({ [chaveIp]: String(15 * 60) }) }
    const r = await onRequestPost({ request: pedido(wav(6)), env })
    expect(r.status).toBe(429)
    expect(await r.json()).toMatchObject({ code: 'cota_do_dia' })
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(env.AI.run).not.toHaveBeenCalled()
    // Outro endereço, mesma hora: tem a própria cota.
    const outro = await onRequestPost({ request: pedido(wav(6), { 'cf-connecting-ip': '198.51.100.9' }), env })
    expect(outro.status).toBe(200)
  })

  it('o teto GLOBAL fecha para todos, seja qual for o endereço', async () => {
    const env = { AI: ia(), LIMITES: kvFalso({ [`total:${dia}`]: String(200 * 60) }) }
    const r = await onRequestPost({ request: pedido(wav(6), { 'cf-connecting-ip': '198.51.100.9' }), env })
    expect(r.status).toBe(429)
    expect(await r.json()).toMatchObject({ code: 'cota_do_site' })
  })

  it('a IA falhou: nada é contado', async () => {
    const env = {
      AI: { run: vi.fn(async () => Promise.reject(new Error('boom'))) },
      LIMITES: kvFalso(),
    }
    const r = await onRequestPost({ request: pedido(wav(12)), env })
    expect(r.status).toBe(502)
    expect(env.LIMITES.put).not.toHaveBeenCalled()
  })

  it('sem o KV das cotas configurado, a nuvem fica FECHADA (501), nunca aberta sem limite', async () => {
    const r = await onRequestPost({ request: pedido(wav(3)), env: { AI: ia() } })
    expect(r.status).toBe(501)
  })

  it('a contagem em blocos tem o valor esperado certo: ~600 s para 100 falas de 6 s', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    for (let i = 0; i < 100; i++) {
      // Um IP por fala: aqui interessa só o total global.
      await onRequestPost({ request: pedido(wav(6), { 'cf-connecting-ip': `10.0.0.${i}` }), env })
    }
    const total = Number(env.LIMITES.dados.get(`total:${dia}`) ?? 0)
    expect(total).toBeGreaterThan(200)
    expect(total).toBeLessThan(1100)
  })
})

describe('tradução na mesma viagem e a rota /quest/mt', () => {
  /** Whisper devolve inglês; o m2m100 devolve a tradução. */
  const iaComTradutor = () => ({
    run: vi.fn(async (modelo: string, entrada: { text?: string; source_lang?: string; target_lang?: string }) =>
      modelo.includes('whisper')
        ? { text: 'good morning', transcription_info: { language: 'en' } }
        : { translated_text: `[${entrada.source_lang}>${entrada.target_lang}] bom dia` },
    ),
  })

  it('com `x-traduzir-para`, a resposta traz a tradução do idioma DETECTADO para o pedido', async () => {
    const env = { AI: iaComTradutor(), LIMITES: kvFalso() }
    const r = await onRequestPost({ request: pedido(wav(3), { 'x-traduzir-para': 'pt-BR' }), env })
    expect(await r.json()).toMatchObject({
      text: 'good morning',
      language: 'en',
      translation: '[english>portuguese] bom dia',
    })
  })

  it('fala já no idioma pedido, ou sem o cabeçalho: sem tradução e sem chamar o tradutor', async () => {
    const env = { AI: iaComTradutor(), LIMITES: kvFalso() }
    const mesmo = await (await onRequestPost({ request: pedido(wav(3), { 'x-traduzir-para': 'en' }), env })).json()
    const sem = await (await onRequestPost({ request: pedido(wav(3)), env })).json()
    expect(mesmo.translation).toBeUndefined()
    expect(sem.translation).toBeUndefined()
    expect(env.AI.run).toHaveBeenCalledTimes(2) // só as duas transcrições
  })

  it('o tradutor falhou: a transcrição volta mesmo assim', async () => {
    const env = {
      AI: {
        run: vi.fn(async (modelo: string) => {
          if (modelo.includes('whisper')) return { text: 'good morning', transcription_info: { language: 'en' } }
          throw new Error('boom')
        }),
      },
      LIMITES: kvFalso(),
    }
    const r = await onRequestPost({ request: pedido(wav(3), { 'x-traduzir-para': 'pt' }), env })
    expect(r.status).toBe(200)
    expect((await r.json()).translation).toBeUndefined()
  })

  const pedidoDeTexto = (corpo: unknown, cabecalhos: Record<string, string> = {}) =>
    new Request(`${ORIGEM}/quest/mt`, {
      method: 'POST',
      headers: { origin: ORIGEM, 'cf-connecting-ip': '203.0.113.7', 'content-type': 'application/json', ...cabecalhos },
      body: JSON.stringify(corpo),
    })

  it('/quest/mt traduz um texto; fora da origem, texto longo ou cota no teto são recusados', async () => {
    const env = { AI: iaComTradutor(), LIMITES: kvFalso() }
    const ok = await traduzirTexto({ request: pedidoDeTexto({ text: 'good morning', src: 'en', tgt: 'pt' }), env })
    expect(await ok.json()).toMatchObject({ text: '[english>portuguese] bom dia' })
    expect(
      (await traduzirTexto({ request: pedidoDeTexto({ text: 'x', tgt: 'pt' }, { origin: 'https://outro.site' }), env }))
        .status,
    ).toBe(403)
    expect(
      (await traduzirTexto({ request: pedidoDeTexto({ text: 'a'.repeat(700), src: 'en', tgt: 'pt' }), env })).status,
    ).toBe(413)
    const noTeto = { AI: iaComTradutor(), LIMITES: kvFalso({ [`total:${dia}`]: String(200 * 60) }) }
    expect(
      (await traduzirTexto({ request: pedidoDeTexto({ text: 'hi', src: 'en', tgt: 'pt' }), env: noTeto })).status,
    ).toBe(429)
  })
})

describe('chave de dono', () => {
  const SEGREDO = 'segredo-de-teste-com-32-caracteres'

  it('com a chave certa, a cota por visitante não vale; o teto global continua valendo', async () => {
    const chaveIp = await chaveDoVisitante(pedido(wav(1)), dia)
    const env = { AI: ia(), LIMITES: kvFalso({ [chaveIp]: String(15 * 60) }), CHAVE_DO_DONO: SEGREDO }
    const dono = await onRequestPost({ request: pedido(wav(6), { 'x-chave-do-dono': SEGREDO }), env })
    expect(dono.status).toBe(200)
    expect((await onRequestPost({ request: pedido(wav(6), { 'x-chave-do-dono': 'errada' }), env })).status).toBe(429)
    const noTeto = { ...env, LIMITES: kvFalso({ [`total:${dia}`]: String(200 * 60) }) }
    expect((await onRequestPost({ request: pedido(wav(6), { 'x-chave-do-dono': SEGREDO }), env: noTeto })).status).toBe(
      429,
    )
  })

  it('sem o segredo configurado no servidor, ninguém é dono', async () => {
    const chaveIp = await chaveDoVisitante(pedido(wav(1)), dia)
    const env = { AI: ia(), LIMITES: kvFalso({ [chaveIp]: String(15 * 60) }) }
    expect((await onRequestPost({ request: pedido(wav(6), { 'x-chave-do-dono': '' }), env })).status).toBe(429)
  })
})

describe('GET /quest/stt', () => {
  it('com cota: 200 e os segundos que restam; no teto: 429', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    const livre = await onRequestGet({ request: new Request(`${ORIGEM}/quest/stt`), env })
    expect(await livre.json()).toMatchObject({ ok: true, restante: 900, cota: 900 })
    const cheio = { AI: ia(), LIMITES: kvFalso({ [`total:${dia}`]: String(200 * 60) }) }
    expect((await onRequestGet({ request: new Request(`${ORIGEM}/quest/stt`), env: cheio })).status).toBe(429)
  })
})
