/**
 * A BLINDAGEM DA NUVEM DO SITE ESTÁTICO (`functions/quest/stt.js`).
 *
 * O site não tem conta: o limite é contado no servidor, por endereço de rede. Aqui a função roda com
 * um KV e um Workers AI falsos: a cota por IP, o teto global, o formato e a duração por pedido, a
 * origem, e que só o que foi transcrito é contado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { onRequestPost as traduzirTexto } from '../functions/quest/mt.js'
import {
  _reiniciarMemoriaDaCota,
  chaveDoVisitante,
  onRequestGet,
  onRequestPost,
  segundosDoWav,
} from '../functions/quest/stt.js'

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
/** Uma IA que demora: os pedidos simultâneos ficam em curso ao mesmo tempo. */
const iaLenta = (ms = 15) => ({
  run: vi.fn(async () => {
    await new Promise((r) => setTimeout(r, ms))
    return { text: 'olá', transcription_info: { language: 'pt' } }
  }),
})
const dia = new Date().toISOString().slice(0, 10)
const consulta = (cabecalhos: Record<string, string> = {}) =>
  new Request(`${ORIGEM}/quest/stt`, { headers: { 'cf-connecting-ip': '203.0.113.7', ...cabecalhos } })
const codigo = async (r: Response) => ((await r.json()) as { code?: string }).code
const restanteDe = async (env: unknown) =>
  ((await (await onRequestGet({ request: consulta(), env })).json()) as { restante: number }).restante

/* A contagem vive também na memória do isolate (reservas, ritmo por minuto): cada teste começa limpo. */
beforeEach(() => _reiniciarMemoriaDaCota())
afterEach(() => vi.useRealTimers())

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
    // Mais onze falas: o visitante, o dia e a hora passam de um bloco e vão ao KV.
    for (let i = 0; i < 11; i++) await onRequestPost({ request: pedido(wav(6)), env })
    expect(env.LIMITES.dados.size).toBe(3)
    for (const [k, v] of env.LIMITES.dados) {
      expect(k).toMatch(/^(ip|total|hora):/)
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

  it('a contagem é EXATA e grava em blocos: 100 falas de 6 s são 600 s, em ~1 escrita por minuto de fala', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    for (let i = 0; i < 100; i++) {
      // Um IP por fala: aqui interessa só o total global.
      await onRequestPost({ request: pedido(wav(6), { 'cf-connecting-ip': `10.0.0.${i}` }), env })
    }
    expect(Number(env.LIMITES.dados.get(`total:${dia}`))).toBe(600)
    // 10 blocos no total do dia e 10 no da hora; nenhum visitante chegou a um bloco.
    expect(env.LIMITES.put.mock.calls.length).toBeLessThanOrEqual(20)
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

describe('a tradução da mesma viagem do STT custa cota', () => {
  const iaLonga = (traducao = 'b'.repeat(300)) => ({
    run: vi.fn(async (modelo: string) =>
      modelo.includes('whisper')
        ? { text: 'a'.repeat(300), transcription_info: { language: 'en' } }
        : { translated_text: traducao },
    ),
  })

  it('soma fala + (entrada + saída da tradução) na mesma conversão da rota /quest/mt', async () => {
    const env = { AI: iaLonga(), LIMITES: kvFalso() }
    const r = await onRequestPost({ request: pedido(wav(3), { 'x-traduzir-para': 'pt' }), env })
    expect(r.status).toBe(200)
    // 3 s de fala + 600 caracteres entre ida e volta (10 s) = 13 s; sem somar a tradução seriam 3 s.
    expect(await restanteDe(env)).toBe(887)
    expect(((await r.json()) as { restante: number }).restante).toBe(887)
  })

  it('sem tradução (sem cabeçalho ou tradutor falhou), só a fala é cobrada', async () => {
    const sem = { AI: iaLonga(), LIMITES: kvFalso() }
    await onRequestPost({ request: pedido(wav(3)), env: sem })
    expect(await restanteDe(sem)).toBe(897)

    const falha = {
      AI: {
        run: vi.fn(async (modelo: string) => {
          if (modelo.includes('whisper')) return { text: 'a'.repeat(300), transcription_info: { language: 'en' } }
          throw new Error('boom')
        }),
      },
      LIMITES: kvFalso(),
    }
    _reiniciarMemoriaDaCota()
    await onRequestPost({ request: pedido(wav(3), { 'x-traduzir-para': 'pt' }), env: falha })
    expect(await restanteDe(falha)).toBe(897)
  })
})

describe('a tradução avulsa custa cota (furo 1)', () => {
  const tradutor = () => ({ run: vi.fn(async () => ({ translated_text: 'b'.repeat(300) })) })
  const texto = (corpo: unknown) =>
    new Request(`${ORIGEM}/quest/mt`, {
      method: 'POST',
      headers: { origin: ORIGEM, 'cf-connecting-ip': '203.0.113.7', 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    })

  it('soma no visitante e no total, na proporção dos caracteres (entrada + saída)', async () => {
    const env = { AI: tradutor(), LIMITES: kvFalso() }
    const r = await traduzirTexto({ request: texto({ text: 'a'.repeat(300), src: 'en', tgt: 'pt' }), env })
    expect(r.status).toBe(200)
    // 600 caracteres entre ida e volta = 10 s de cota.
    expect(await restanteDe(env)).toBe(890)
  })

  it('um texto de duas letras custa o mínimo de um pedido, nunca zero', async () => {
    const env = { AI: { run: vi.fn(async () => ({ translated_text: 'oi' })) }, LIMITES: kvFalso() }
    for (let i = 0; i < 4; i++) await traduzirTexto({ request: texto({ text: 'hi', src: 'en', tgt: 'pt' }), env })
    expect(await restanteDe(env)).toBe(898)
  })

  it('a cota do dia fecha a tradução: quem só traduz também esgota', async () => {
    const chaveIp = await chaveDoVisitante(pedido(wav(1)), dia)
    const env = { AI: tradutor(), LIMITES: kvFalso({ [chaveIp]: String(15 * 60 - 5) }) }
    const corpo = { text: 'a'.repeat(300), src: 'en', tgt: 'pt' }
    expect((await traduzirTexto({ request: texto(corpo), env })).status).toBe(200)
    const depois = await traduzirTexto({ request: texto(corpo), env })
    expect(depois.status).toBe(429)
    expect(await codigo(depois)).toBe('cota_do_dia')
    expect(env.AI.run).toHaveBeenCalledTimes(1)
  })

  it('o tradutor falhou: nada é cobrado', async () => {
    const env = { AI: { run: vi.fn(async () => Promise.reject(new Error('boom'))) }, LIMITES: kvFalso() }
    const r = await traduzirTexto({ request: texto({ text: 'a'.repeat(300), src: 'en', tgt: 'pt' }), env })
    expect(r.status).toBe(502)
    expect(await restanteDe(env)).toBe(900)
  })
})

describe('rajada simultânea (furo 2): a reserva vem ANTES do modelo', () => {
  it('pedidos ao mesmo tempo não passam do que resta ao visitante', async () => {
    const chaveIp = await chaveDoVisitante(pedido(wav(1)), dia)
    const env = { AI: iaLenta(), LIMITES: kvFalso({ [chaveIp]: String(15 * 60 - 10) }) }
    const respostas = await Promise.all(
      Array.from({ length: 4 }, () => onRequestPost({ request: pedido(wav(6)), env })),
    )
    // Restavam 10 s: a primeira leva 6, a segunda leva o resto, as outras não chegam ao modelo.
    expect(respostas.map((r) => r.status).sort()).toEqual([200, 200, 429, 429])
    expect(env.AI.run).toHaveBeenCalledTimes(2)
  })

  it('endereços diferentes ao mesmo tempo não passam do teto global', async () => {
    const env = { AI: iaLenta(), LIMITES: kvFalso({ [`total:${dia}`]: String(200 * 60 - 10) }) }
    const respostas = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        onRequestPost({ request: pedido(wav(6), { 'cf-connecting-ip': `10.1.0.${i}` }), env }),
      ),
    )
    expect(respostas.filter((r) => r.status === 200)).toHaveLength(2)
    expect(env.AI.run).toHaveBeenCalledTimes(2)
  })

  it('mais de quatro pedidos em curso do mesmo visitante: 429 `devagar`, sem tocar na IA', async () => {
    const env = { AI: iaLenta(), LIMITES: kvFalso() }
    const respostas = await Promise.all(
      Array.from({ length: 7 }, () => onRequestPost({ request: pedido(wav(2)), env })),
    )
    const recusadas = respostas.filter((r) => r.status === 429)
    expect(recusadas).toHaveLength(3)
    for (const r of recusadas) {
      expect(Number(r.headers.get('retry-after'))).toBeGreaterThanOrEqual(1)
      expect(await codigo(r)).toBe('devagar')
    }
    expect(env.AI.run).toHaveBeenCalledTimes(4)
    // Terminaram: a vaga volta.
    expect((await onRequestPost({ request: pedido(wav(2)), env })).status).toBe(200)
  })

  it('o bloco é gravado no KV antes de o modelo rodar', async () => {
    const kv = kvFalso()
    const vistos: (string | undefined)[] = []
    const env = {
      AI: {
        run: vi.fn(async () => {
          vistos.push(kv.dados.get(`total:${dia}`))
          return { text: 'olá' }
        }),
      },
      LIMITES: kv,
    }
    for (let i = 0; i < 4; i++) await onRequestPost({ request: pedido(wav(16)), env })
    expect(vistos).toEqual([undefined, undefined, undefined, '64'])
  })

  it('o modelo falhou depois da reserva: o visitante recebe de volta', async () => {
    const run = vi.fn(async () => ({ text: 'olá' }))
    const env = { AI: { run }, LIMITES: kvFalso() }
    for (let i = 0; i < 3; i++) await onRequestPost({ request: pedido(wav(16)), env })
    run.mockRejectedValueOnce(new Error('boom'))
    expect((await onRequestPost({ request: pedido(wav(16)), env })).status).toBe(502)
    expect(await restanteDe(env)).toBe(900 - 48)
  })

  it('o KV parou de aceitar escrita: a nuvem FECHA em vez de seguir sem contar', async () => {
    const kv = kvFalso()
    kv.put.mockImplementation(async () => Promise.reject(new Error('KV PUT failed: 429 Too Many Requests')))
    const env = { AI: ia(), LIMITES: kv }
    const status: number[] = []
    let ultima: Response | null = null
    for (let i = 0; i < 9; i++) {
      ultima = await onRequestPost({ request: pedido(wav(16), { 'cf-connecting-ip': `10.2.0.${i}` }), env })
      status.push(ultima.status)
    }
    // 7 × 16 s = 112 s sem gravar ainda passam; a oitava fala levaria a 128 s sem registro.
    expect(status).toEqual([200, 200, 200, 200, 200, 200, 200, 429, 429])
    expect(await codigo(ultima!)).toBe('nuvem_ocupada')
    expect(env.AI.run).toHaveBeenCalledTimes(7)
  })

  it('leitura velha do KV não faz a conta andar para trás', async () => {
    const kv = kvFalso()
    const env = { AI: ia(), LIMITES: kv }
    for (let i = 0; i < 4; i++) await onRequestPost({ request: pedido(wav(16)), env })
    kv.dados.clear() // outra borda ainda devolve o valor de antes
    expect(await restanteDe(env)).toBe(900 - 64)
  })
})

describe('limite por minuto (furo 3)', () => {
  const agora = new Date('2026-10-02T15:20:00Z').getTime()
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(agora)
  })

  it('a fala de um minuto tem teto: 429 `devagar` com a espera, e NÃO é a cota do dia', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    for (let i = 0; i < 7; i++) {
      vi.setSystemTime(agora + i * 1000)
      expect((await onRequestPost({ request: pedido(wav(16)), env })).status).toBe(200)
    }
    vi.setSystemTime(agora + 10_000)
    const r = await onRequestPost({ request: pedido(wav(16)), env })
    expect(r.status).toBe(429)
    const espera = Number(r.headers.get('retry-after'))
    expect(espera).toBeGreaterThanOrEqual(1)
    expect(espera).toBeLessThanOrEqual(60)
    expect(await codigo(r)).toBe('devagar')
    expect(env.AI.run).toHaveBeenCalledTimes(7)
    // A cota do dia continua lá, e outro endereço não é afetado.
    expect((await onRequestGet({ request: consulta(), env })).status).toBe(200)
    expect(
      (await onRequestPost({ request: pedido(wav(16), { 'cf-connecting-ip': '198.51.100.9' }), env })).status,
    ).toBe(200)
    // Passada a espera dita, o mesmo pedido entra.
    vi.setSystemTime(agora + 10_000 + espera * 1000)
    expect((await onRequestPost({ request: pedido(wav(16)), env })).status).toBe(200)
  })

  it('pedidos por minuto têm teto, por menores que sejam', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    let ultimo: Response | null = null
    for (let i = 0; i < 61; i++) {
      vi.setSystemTime(agora + i * 100)
      ultimo = await onRequestPost({ request: pedido(wav(0.5)), env })
    }
    expect(ultimo!.status).toBe(429)
    expect(await codigo(ultimo!)).toBe('devagar')
    expect(env.AI.run).toHaveBeenCalledTimes(60)
    vi.setSystemTime(agora + 61_000)
    expect((await onRequestPost({ request: pedido(wav(0.5)), env })).status).toBe(200)
  })

  it('pedido inválido também conta no ritmo: lixo em rajada é barrado antes de ler o KV', async () => {
    const kv = kvFalso()
    const ler = vi.spyOn(kv, 'get')
    const env = { AI: ia(), LIMITES: kv }
    for (let i = 0; i < 60; i++) await onRequestPost({ request: pedido(new Uint8Array(100)), env })
    const r = await onRequestPost({ request: pedido(wav(2)), env })
    expect(await codigo(r)).toBe('devagar')
    expect(ler).not.toHaveBeenCalled()
  })

  it('a chave de dono não cai no limite por minuto do visitante', async () => {
    const SEGREDO = 'segredo-de-teste-com-32-caracteres'
    const env = { AI: ia(), LIMITES: kvFalso(), CHAVE_DO_DONO: SEGREDO }
    for (let i = 0; i < 10; i++) {
      const r = await onRequestPost({ request: pedido(wav(16), { 'x-chave-do-dono': SEGREDO }), env })
      expect(r.status).toBe(200)
    }
  })

  it('freio global da hora: 429 `nuvem_ocupada` (volta sozinha), e o GET não diz que o dia acabou', async () => {
    const env = { AI: ia(), LIMITES: kvFalso({ 'hora:2026-10-02T15': String(60 * 60) }) }
    const r = await onRequestPost({ request: pedido(wav(6)), env })
    expect(r.status).toBe(429)
    expect(Number(r.headers.get('retry-after'))).toBe(40 * 60)
    expect(await r.json()).toMatchObject({ code: 'nuvem_ocupada', motivo: 'teto_da_hora' })
    expect(env.AI.run).not.toHaveBeenCalled()
    expect((await onRequestGet({ request: consulta(), env })).status).toBe(200)
    // Virou a hora: a nuvem volta.
    vi.setSystemTime(new Date('2026-10-02T16:00:01Z'))
    expect((await onRequestPost({ request: pedido(wav(6)), env })).status).toBe(200)
  })

  it('o GET também tem ritmo: consulta em rajada leva `devagar`', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    let ultimo: Response | null = null
    for (let i = 0; i < 31; i++) ultimo = await onRequestGet({ request: consulta(), env })
    expect(ultimo!.status).toBe(429)
    expect(await codigo(ultimo!)).toBe('devagar')
  })
})

describe('origem (furo 4): barra outro SITE no navegador, não é controle de abuso', () => {
  it('POST com `Sec-Fetch-Site` de outro site é recusado mesmo com `Origin` igual', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    const r = await onRequestPost({ request: pedido(wav(3), { 'sec-fetch-site': 'cross-site' }), env })
    expect(r.status).toBe(403)
    expect((await onRequestPost({ request: pedido(wav(3), { 'sec-fetch-site': 'same-origin' }), env })).status).toBe(
      200,
    )
  })

  it('GET de outro site (por `Sec-Fetch-Site` ou por `Origin`) não vê o estado da cota', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    for (const cabecalhos of [
      { 'sec-fetch-site': 'cross-site' },
      { 'sec-fetch-site': 'same-site' },
      { origin: 'https://outro.site' },
    ]) {
      const r = await onRequestGet({ request: consulta(cabecalhos), env })
      expect(r.status).toBe(403)
      expect(await r.json()).toEqual({ code: 'origem' })
    }
  })

  it('GET do próprio site passa: `Sec-Fetch-Site: same-origin`, `Origin` igual, ou nenhum dos dois', async () => {
    const env = { AI: ia(), LIMITES: kvFalso() }
    for (const cabecalhos of [{ 'sec-fetch-site': 'same-origin' }, { origin: ORIGEM }, {}]) {
      expect((await onRequestGet({ request: consulta(cabecalhos), env })).status).toBe(200)
    }
  })
})

describe('chave do visitante', () => {
  const com = (ip: string) => new Request(`${ORIGEM}/quest/stt`, { headers: { 'cf-connecting-ip': ip } })

  it('IPv6: a chave é a do prefixo /64 (trocar o sufixo não dá cota nova)', async () => {
    const a = await chaveDoVisitante(com('2001:db8:aa:bb:1111:2222:3333:4444'), dia)
    const b = await chaveDoVisitante(com('2001:db8:aa:bb::9'), dia)
    const outra = await chaveDoVisitante(com('2001:db8:aa:cc::9'), dia)
    expect(a).toBe(b)
    expect(a).not.toBe(outra)
    expect(a).not.toContain('2001')
  })

  it('IPv4: cada endereço tem a sua', async () => {
    expect(await chaveDoVisitante(com('203.0.113.7'), dia)).not.toBe(await chaveDoVisitante(com('203.0.113.8'), dia))
  })
})
