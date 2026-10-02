/**
 * A VOZ DO SITE NO APARELHO SEM VOZ (`src/lib/voz/vozDoQuest.ts`): o pedido vai a `/quest/tts`, o áudio
 * toca com os callbacks que a fila de fala espera, e o idioma sem voz termina na hora, sem ir à rede.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReprodutorDaVoz } from '../src/lib/voz/vozDaNuvem'
import {
  _reiniciarVozDoQuest,
  atualizarIdiomasDaVozDoQuest,
  criarVozDoQuest,
  ENDPOINT_DA_VOZ_DO_QUEST,
  idiomasDaVozDoQuest,
  vozDoQuestFala,
} from '../src/lib/voz/vozDoQuest'

/** Um tocador que "toca" na hora e termina quando o teste manda. */
function tocadorFalso() {
  let terminar: () => void = () => {}
  const tocados: Blob[] = []
  const tocador = (audio: Blob): ReprodutorDaVoz => {
    tocados.push(audio)
    return {
      tocar: async () => {},
      parar: () => {},
      aoTerminar: (cb) => {
        terminar = cb
      },
      aoFalhar: () => {},
    }
  }
  return { tocador, tocados, terminar: () => terminar() }
}

const audio = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } })
const espera = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => _reiniciarVozDoQuest())
afterEach(() => vi.restoreAllMocks())

describe('criarVozDoQuest', () => {
  it('pede o áudio ao site, toca e avisa o começo e o fim', async () => {
    const buscar = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => audio())
    const t = tocadorFalso()
    const voz = criarVozDoQuest({ buscar: buscar as typeof fetch, tocador: t.tocador })
    const onStart = vi.fn()
    const onEnd = vi.fn()
    voz.speak('Good morning', { lang: 'en-US', onStart, onEnd })
    await espera()
    await espera()
    expect(buscar).toHaveBeenCalledTimes(1)
    const [url, init] = buscar.mock.calls[0]
    expect(url).toBe(ENDPOINT_DA_VOZ_DO_QUEST)
    expect(JSON.parse(String(init?.body))).toMatchObject({ texto: 'Good morning', idioma: 'en' })
    expect(t.tocados).toHaveLength(1)
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(voz.motorDaUltimaFala()).toBe('voz-da-nuvem')
    t.terminar()
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('idioma sem voz (o português): termina na hora, sem ir à rede e sem tocar nada', async () => {
    const buscar = vi.fn(async () => audio())
    const t = tocadorFalso()
    const voz = criarVozDoQuest({ buscar: buscar as typeof fetch, tocador: t.tocador })
    const onEnd = vi.fn()
    voz.speak('Bom dia', { lang: 'pt-BR', onEnd })
    await espera()
    expect(buscar).not.toHaveBeenCalled()
    expect(t.tocados).toHaveLength(0)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('a nuvem recusou (cota): a fala termina sem travar a fila', async () => {
    const buscar = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 'cota_do_dia' }), { status: 429, headers: { 'retry-after': '60' } }),
    )
    const voz = criarVozDoQuest({ buscar: buscar as typeof fetch, tocador: tocadorFalso().tocador })
    const onEnd = vi.fn()
    voz.speak('Hello', { lang: 'en', onEnd })
    await espera()
    await espera()
    expect(onEnd).toHaveBeenCalledTimes(1)
    // Pausada: a fala seguinte nem pede.
    voz.speak('Hello again', { lang: 'en', onEnd })
    await espera()
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledTimes(2)
  })

  it('Repetir a mesma fala não pede de novo', async () => {
    const buscar = vi.fn(async () => audio())
    const t = tocadorFalso()
    const voz = criarVozDoQuest({ buscar: buscar as typeof fetch, tocador: t.tocador })
    voz.speak('Hello', { lang: 'en' })
    await espera()
    await espera()
    voz.speak('Hello', { lang: 'en' })
    await espera()
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(t.tocados).toHaveLength(2)
  })
})

describe('os idiomas com voz', () => {
  it('de fábrica: os seis da Cloudflare; o português não', () => {
    expect(idiomasDaVozDoQuest()).toEqual(['en', 'es', 'fr', 'ja', 'ko', 'zh'])
    expect(vozDoQuestFala('en-GB')).toBe(true)
    expect(vozDoQuestFala('pt-BR')).toBe(false)
  })

  it('a função diz que lê mais (o segredo do provedor existe): a lista cresce, uma pergunta só', async () => {
    const buscar = vi.fn(async () => new Response(JSON.stringify({ ok: true, idiomas: ['en', 'pt', 'de'] })))
    await atualizarIdiomasDaVozDoQuest(buscar as typeof fetch)
    await atualizarIdiomasDaVozDoQuest(buscar as typeof fetch)
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(vozDoQuestFala('pt-BR')).toBe(true)
    expect(vozDoQuestFala('fr')).toBe(false)
  })

  it('a função não respondeu: fica a lista de fábrica', async () => {
    await atualizarIdiomasDaVozDoQuest((async () => new Response('{}', { status: 501 })) as typeof fetch)
    expect(vozDoQuestFala('en')).toBe(true)
  })
})
