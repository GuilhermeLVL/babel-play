// @vitest-environment jsdom
/**
 * A NUVEM DE ALÍVIO NO CLIENTE (A10) — o estado da oferta, a consulta ao servidor e os adaptadores.
 *
 * O cliente só OFERECE; quem decide é o servidor. O que se prende aqui:
 *  - o cabeçalho `x-nuvem-alivio: 1` só sai depois do "Usar a nuvem grátis" — sem aceite, a conta
 *    Grátis nunca gasta a franquia por acaso;
 *  - a consulta ao servidor nem acontece quando a flag está desligada, o plano não é o Grátis ou
 *    não há conta (o convidado tem o pool dele);
 *  - no aparelho forte a oferta não aparece, e nem se pergunta ao servidor;
 *  - uma recusa do alívio (403/503 do servidor) PAUSA a nuvem do adaptador e marca o estado — sem
 *    empurrar venda.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  flag: true,
  plano: 'free' as string,
  identidade: 'conta' as string,
  perfil: 'balanced',
}))

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../src/lib/flagsCache', () => ({ flagLigada: (k: string) => k === 'nuvem_gratuita_alivio' && estado.flag }))
vi.mock('../src/lib/entitlements', () => ({ getEntitlements: () => ({ plan: estado.plano }) }))
vi.mock('../src/lib/identidade', () => ({ estadoDeIdentidade: () => estado.identidade }))
vi.mock('../src/gateway/activeProfile', () => ({ getActiveProfile: () => ({ id: estado.perfil }) }))

import { apiFetch } from '../src/data/api'
import { GroqWhisperStt } from '../src/gateway/adapters/groqWhisper'
import { ServerLlmMt } from '../src/gateway/adapters/serverLlmMt'
import { consultarAlivio, ofertaDoAlivio } from '../src/lib/nuvemDeAlivio/consulta'
import {
  _reiniciarAlivio,
  aceitarAlivio,
  alivioAceito,
  cabecalhoDoAlivio,
  dispensarAlivio,
  recusaDoAlivio,
  registrarRecusaDoAlivio,
} from '../src/lib/nuvemDeAlivio/estado'

const api = apiFetch as unknown as ReturnType<typeof vi.fn>
const FRACO = { leve: true, travamento: false, gpuReal: false }
const FORTE = { leve: false, travamento: false, gpuReal: true }

const uso = (alivio: unknown, iaDeNuvem = { disponivel: true, motivo: null, mensagem: null }) =>
  new Response(JSON.stringify({ plano: 'free', alivio, iaDeNuvem }), { status: 200 })

beforeEach(() => {
  api.mockReset()
  _reiniciarAlivio()
  try {
    sessionStorage.clear()
  } catch {
    /* sem storage */
  }
  Object.assign(estado, { flag: true, plano: 'free', identidade: 'conta', perfil: 'balanced' })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('o estado da oferta', () => {
  it('sem aceite, nenhum cabeçalho; depois do "Usar a nuvem grátis", o pedido pede o alívio', () => {
    expect(alivioAceito()).toBe(false)
    expect(cabecalhoDoAlivio()).toEqual({})
    aceitarAlivio()
    expect(alivioAceito()).toBe(true)
    expect(cabecalhoDoAlivio()).toEqual({ 'x-nuvem-alivio': '1' })
  })

  it('o aceite vale para a aba (sessionStorage), não para sempre', () => {
    aceitarAlivio()
    expect(sessionStorage.getItem('babel.alivio.aceito')).toBe('1')
    _reiniciarAlivio({ manterSessao: true })
    expect(alivioAceito()).toBe(true)
    expect(localStorage.getItem('babel.alivio.aceito')).toBeNull()
  })

  it('uma recusa do alívio fica registrada; recusa que não é do alívio, ou sem aceite, não', () => {
    expect(registrarRecusaDoAlivio(503, { code: 'alivio_desligado' })).toBe(false)
    aceitarAlivio()
    expect(registrarRecusaDoAlivio(429, { code: 'nuvem_ocupada' })).toBe(false)
    expect(registrarRecusaDoAlivio(503, { code: 'pool_de_alivio_esgotado' })).toBe(true)
    expect(recusaDoAlivio()).toBe('pool_de_alivio_esgotado')
    expect(registrarRecusaDoAlivio(402, { code: 'quota_exceeded', detalhes: { escopo: 'alivio' } })).toBe(true)
    expect(recusaDoAlivio()).toBe('quota_exceeded')
  })
})

describe('a consulta ao servidor', () => {
  it('flag desligada, plano pago ou sem conta: não pergunta nada', async () => {
    estado.flag = false
    expect(await consultarAlivio()).toBeNull()
    estado.flag = true
    estado.plano = 'essencial'
    expect(await consultarAlivio()).toBeNull()
    estado.plano = 'free'
    estado.identidade = 'anonimo'
    expect(await consultarAlivio()).toBeNull()
    expect(api).not.toHaveBeenCalled()
  })

  it('lê o "restam" do /api/me/uso; com a nuvem global fechada, não está disponível', async () => {
    api.mockResolvedValueOnce(uso({ disponivel: true, motivo: null, restanteSegundos: 9_000 }))
    expect(await consultarAlivio()).toEqual({ disponivel: true, restanteSegundos: 9_000 })
    api.mockResolvedValueOnce(
      uso(
        { disponivel: true, motivo: null, restanteSegundos: 9_000 },
        { disponivel: false, motivo: 'ia_desligada', mensagem: null },
      ),
    )
    expect((await consultarAlivio())?.disponivel).toBe(false)
  })
})

describe('quando a oferta aparece', () => {
  it('aparelho fraco e franquia sobrando: oferece com o que resta', async () => {
    api.mockResolvedValueOnce(uso({ disponivel: true, motivo: null, restanteSegundos: 7_200 }))
    expect(await ofertaDoAlivio(FRACO)).toEqual({ restanteSegundos: 7_200 })
  })

  it('aparelho forte: não oferece e nem pergunta ao servidor', async () => {
    expect(await ofertaDoAlivio(FORTE)).toBeNull()
    expect(api).not.toHaveBeenCalled()
  })

  it('"Agora não", já aceito ou perfil Privado: não oferece de novo', async () => {
    dispensarAlivio()
    expect(await ofertaDoAlivio(FRACO)).toBeNull()
    _reiniciarAlivio()
    aceitarAlivio()
    expect(await ofertaDoAlivio(FRACO)).toBeNull()
    _reiniciarAlivio()
    estado.perfil = 'local-private'
    expect(await ofertaDoAlivio(FRACO)).toBeNull()
    expect(api).not.toHaveBeenCalled()
  })

  it('servidor diz indisponível (protegido, pool, flag): não oferece', async () => {
    api.mockResolvedValueOnce(uso({ disponivel: false, motivo: 'alivio_exige_responsavel', restanteSegundos: 0 }))
    expect(await ofertaDoAlivio(FRACO)).toBeNull()
  })
})

describe('os adaptadores de nuvem', () => {
  const pcm = new Float32Array(16_000)
  const texto = () => new Response(JSON.stringify({ text: 'olá', language: 'pt' }), { status: 200 })

  it('transcrição e tradução só levam o cabeçalho do alívio depois do aceite', async () => {
    const stt = new GroqWhisperStt({ model: 'whisper-large-v3-turbo' })
    const mt = new ServerLlmMt()
    api.mockImplementation(async () => texto())
    await stt.transcribePcm(pcm, 16_000)
    await mt.translate('hello', 'en', 'pt')
    for (const c of api.mock.calls)
      expect((c[1] as { headers: Record<string, string> }).headers['x-nuvem-alivio']).toBeUndefined()

    api.mockClear()
    aceitarAlivio()
    await stt.transcribePcm(pcm, 16_000)
    await mt.translate('good night', 'en', 'pt')
    expect(api).toHaveBeenCalledTimes(2)
    for (const c of api.mock.calls)
      expect((c[1] as { headers: Record<string, string> }).headers['x-nuvem-alivio']).toBe('1')
  })

  it('403 alivio_exige_responsavel: a nuvem pausa pelo teto (sem ida ao servidor por fala) e o estado registra', async () => {
    vi.useFakeTimers()
    aceitarAlivio()
    const recusa = () =>
      new Response(JSON.stringify({ error: 'x', code: 'alivio_exige_responsavel' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    const stt = new GroqWhisperStt({ model: 'whisper-large-v3-turbo' })
    api.mockResolvedValueOnce(recusa())
    await stt.transcribePcm(pcm, 16_000).catch(() => undefined)
    expect(stt.isAvailable()).toBe(false)
    expect(recusaDoAlivio()).toBe('alivio_exige_responsavel')

    const mt = new ServerLlmMt()
    api.mockResolvedValueOnce(recusa())
    await mt.translate('hello', 'en', 'pt').catch(() => undefined)
    expect(mt.supports('en', 'pt')).toBe(false)
    vi.advanceTimersByTime(60_000)
    expect(mt.supports('en', 'pt')).toBe(false)
  })
})
