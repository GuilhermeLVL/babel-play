/**
 * O MOTOR DO ÁUDIO DO SISTEMA/ABA — degrau T2 do harness (§1.1): no Chrome/Edge do computador, com o
 * reconhecimento NO aparelho disponível para o idioma do conteúdo, a Web Speech ouve a trilha da aba
 * (`start(trilha)` + `processLocally`) e o Whisper nem baixa. Tudo o mais continua no caminho de
 * sempre (VAD → Whisper/Moonshine local ou Groq). A Web Speech na NUVEM nunca ouve o sistema.
 *
 * Três peças: a decisão (pura), a decisão com as perguntas ao navegador (guarda do `webdriver`
 * incluída) e o controlador da sessão (resultados → segmentos, religar, erro/silêncio → Whisper).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SttCallbacks, SttSession } from '../src/gateway/capabilities'
import {
  type EntradaDoMotorDoSistema,
  escolherMotorDoSistema,
  iniciarWebSpeechDoSistema,
  PRAZO_SEM_RESULTADO_MS,
  resolverMotorDoSistema,
} from '../src/lib/captura/webSpeechDoSistema'

afterEach(() => {
  vi.useRealTimers()
})

const BASE: EntradaDoMotorDoSistema = {
  desktop: true,
  reconhecimentoLocalSuportado: true,
  nuvemPrimeiro: false,
  qualidade: 'auto',
  multiIdioma: false,
  noAparelho: 'available',
  lembrado: null,
}

describe('escolherMotorDoSistema (pura)', () => {
  it('Chrome do computador, idioma no aparelho, sem nuvem paga: Web Speech local', () => {
    expect(escolherMotorDoSistema(BASE)).toEqual({ motor: 'web-speech-local', motivo: 'no-aparelho' })
  })

  it.each<[string, Partial<EntradaDoMotorDoSistema>, string]>([
    [
      'navegador sem processLocally (Firefox/Safari/Chrome antigo)',
      { reconhecimentoLocalSuportado: false },
      'sem-reconhecimento-local',
    ],
    ['celular/Quest', { desktop: false }, 'movel'],
    ['o teste já falhou neste aparelho', { lembrado: 'falhou' }, 'falhou-antes'],
    ['plano pago com nuvem primeiro (Groq large-v3-turbo é melhor)', { nuvemPrimeiro: true }, 'nuvem-primeiro'],
    ['escolheu o modelo rápido', { qualidade: 'fast' }, 'escolha-de-modelo'],
    ['escolheu o modelo preciso', { qualidade: 'accurate' }, 'escolha-de-modelo'],
    ['multi-idioma (a Web Speech precisa de um idioma fixo)', { multiIdioma: true }, 'multi-idioma'],
    ['pacote a baixar', { noAparelho: 'downloadable' }, 'idioma-indisponivel'],
    ['baixando', { noAparelho: 'downloading' }, 'idioma-indisponivel'],
    ['indisponível', { noAparelho: 'unavailable' }, 'idioma-indisponivel'],
    ['sem resposta (webdriver, API ausente)', { noAparelho: null }, 'idioma-indisponivel'],
  ])('%s → caminho de sempre', (_n, troca, motivo) => {
    expect(escolherMotorDoSistema({ ...BASE, ...troca })).toEqual({ motor: 'pipeline', motivo })
  })

  it("'cloud' pedida sem nuvem disponível (rota não é nuvem primeiro) ainda usa o nativo", () => {
    expect(escolherMotorDoSistema({ ...BASE, qualidade: 'cloud' }).motor).toBe('web-speech-local')
  })

  it("teste lembrado 'ok' não muda nada além de permitir", () => {
    expect(escolherMotorDoSistema({ ...BASE, lembrado: 'ok' }).motor).toBe('web-speech-local')
  })

  it('NUNCA devolve a Web Speech na nuvem, qualquer que seja a entrada', () => {
    const valores = {
      desktop: [true, false],
      reconhecimentoLocalSuportado: [true, false],
      nuvemPrimeiro: [true, false],
      qualidade: ['auto', 'fast', 'accurate', 'cloud'],
      multiIdioma: [true, false],
      noAparelho: ['available', 'downloadable', 'unavailable', null],
      lembrado: ['ok', 'falhou', null],
    } as const
    let casos = [{}] as Record<string, unknown>[]
    for (const [k, vs] of Object.entries(valores)) casos = casos.flatMap((c) => vs.map((v) => ({ ...c, [k]: v })))
    for (const c of casos)
      expect(['web-speech-local', 'pipeline']).toContain(
        escolherMotorDoSistema(c as unknown as EntradaDoMotorDoSistema).motor,
      )
  })
})

/** Um Chrome com `processLocally` no protótipo e `available` respondendo. */
function escopoChrome(over: { available?: (o: unknown) => unknown; webdriver?: boolean; semLocal?: boolean } = {}) {
  class SR {}
  if (!over.semLocal) Object.defineProperty(SR.prototype, 'processLocally', { get: () => false, set: () => {} })
  Object.assign(SR, { available: over.available ?? (async () => 'available') })
  return { SpeechRecognition: SR, navigator: { webdriver: over.webdriver ?? false } }
}

describe('resolverMotorDoSistema (as perguntas ao navegador)', () => {
  const entrada = (escopo: unknown, extra: Record<string, unknown> = {}) => ({
    lang: 'en-US',
    desktop: true,
    qualidade: 'auto' as const,
    multiIdioma: false,
    nuvemPrimeiro: vi.fn(async () => false),
    lembrado: vi.fn(async () => null),
    escopo,
    ...extra,
  })

  it('tudo disponível: Web Speech local, perguntando o idioma do CONTEÚDO', async () => {
    const available = vi.fn(async () => 'available')
    const e = entrada(escopoChrome({ available }))
    expect((await resolverMotorDoSistema(e)).motor).toBe('web-speech-local')
    expect(available).toHaveBeenCalledWith({ langs: ['en-US'], processLocally: true })
  })

  it('NAVEGADOR SOB AUTOMAÇÃO (Playwright): não chama `available` (derruba o Chromium headless)', async () => {
    const available = vi.fn(async () => 'available')
    const d = await resolverMotorDoSistema(entrada(escopoChrome({ available, webdriver: true })))
    expect(available).not.toHaveBeenCalled()
    expect(d).toEqual({ motor: 'pipeline', motivo: 'idioma-indisponivel' })
  })

  it('reprovado barato (celular, sem processLocally): não pergunta nada caro', async () => {
    const available = vi.fn(async () => 'available')
    const e = entrada(escopoChrome({ available }), { desktop: false })
    expect((await resolverMotorDoSistema(e)).motivo).toBe('movel')
    const e2 = entrada(escopoChrome({ available, semLocal: true }))
    expect((await resolverMotorDoSistema(e2)).motivo).toBe('sem-reconhecimento-local')
    expect(available).not.toHaveBeenCalled()
    expect(e.nuvemPrimeiro).not.toHaveBeenCalled()
    expect(e.lembrado).not.toHaveBeenCalled()
  })

  it('falha lembrada: não pergunta available nem a rota', async () => {
    const available = vi.fn(async () => 'available')
    const e = entrada(escopoChrome({ available }), { lembrado: vi.fn(async () => 'falhou') })
    expect((await resolverMotorDoSistema(e)).motivo).toBe('falhou-antes')
    expect(available).not.toHaveBeenCalled()
    expect(e.nuvemPrimeiro).not.toHaveBeenCalled()
  })

  it('rota que não responde conta como nuvem primeiro (fica no caminho de sempre)', async () => {
    const e = entrada(escopoChrome(), { nuvemPrimeiro: vi.fn(async () => Promise.reject(new Error('rede'))) })
    expect((await resolverMotorDoSistema(e)).motivo).toBe('nuvem-primeiro')
  })

  it('sem SpeechRecognition nenhum: caminho de sempre, sem lançar', async () => {
    expect((await resolverMotorDoSistema(entrada({ navigator: {} }))).motivo).toBe('sem-reconhecimento-local')
  })
})

/* ─── o controlador da sessão ─────────────────────────────────────────────────────────────────── */

/** Um STT falso: guarda os callbacks para o teste emitir resultados/erros. */
function sttFalso(opts: { lancar?: Error } = {}) {
  const sessoes: { cb: SttCallbacks; parada: boolean }[] = []
  const criar = vi.fn((_o: { processLocally: boolean; trilha: MediaStreamTrack }) => ({
    startLive(_lang: string, cb: SttCallbacks): SttSession {
      if (opts.lancar) throw opts.lancar
      const s = { cb, parada: false }
      sessoes.push(s)
      return { stop: () => void (s.parada = true) }
    },
  }))
  return { criar, sessoes, ultima: () => sessoes[sessoes.length - 1] }
}

const TRILHA = { kind: 'audio' } as unknown as MediaStreamTrack

function iniciar(stt: ReturnType<typeof sttFalso>, extra: Record<string, unknown> = {}) {
  let agora = 0
  const ctx = {
    aoParcial: vi.fn(),
    aoFinal: vi.fn(),
    aoCair: vi.fn(),
    lembrar: vi.fn(async () => {}),
    avancar: (ms: number) => {
      agora += ms
      vi.advanceTimersByTime(ms)
    },
  }
  const ctl = iniciarWebSpeechDoSistema({
    trilha: TRILHA,
    lang: 'en-US',
    aoParcial: ctx.aoParcial,
    aoFinal: ctx.aoFinal,
    aoCair: ctx.aoCair,
    lembrar: ctx.lembrar,
    criarStt: stt.criar,
    agora: () => agora,
    ...extra,
  })
  return { ...ctx, ctl }
}

describe('iniciarWebSpeechDoSistema (controlador)', () => {
  it('abre SEMPRE no aparelho, com a trilha', () => {
    vi.useFakeTimers()
    const stt = sttFalso()
    const { ctl } = iniciar(stt)
    expect(ctl).not.toBeNull()
    expect(stt.criar).toHaveBeenCalledWith({ processLocally: true, trilha: TRILHA })
  })

  it('start que lança: devolve null, lembra "falhou" (não tenta de novo nas próximas sessões)', () => {
    vi.useFakeTimers()
    const stt = sttFalso({ lancar: new TypeError('not a MediaStreamTrack') })
    const { ctl, lembrar, aoCair } = iniciar(stt)
    expect(ctl).toBeNull()
    expect(lembrar).toHaveBeenCalledWith('falhou')
    expect(aoCair).not.toHaveBeenCalled() // quem recebeu null já sabe: segue no Whisper
  })

  it('parciais e finais viram os eventos de segmento; o primeiro final lembra "ok" uma vez', () => {
    vi.useFakeTimers()
    const stt = sttFalso()
    const { aoParcial, aoFinal, lembrar } = iniciar(stt)
    stt.ultima().cb.onPartial('hello')
    stt.ultima().cb.onFinal({ text: 'hello world' })
    stt.ultima().cb.onFinal({ text: 'again' })
    expect(aoParcial).toHaveBeenCalledWith('hello')
    expect(aoFinal).toHaveBeenNthCalledWith(1, 'hello world')
    expect(aoFinal).toHaveBeenNthCalledWith(2, 'again')
    expect(lembrar).toHaveBeenCalledTimes(1)
    expect(lembrar).toHaveBeenCalledWith('ok')
  })

  it.each(['language-not-supported', 'not-allowed', 'service-not-allowed'])(
    'erro %s antes de qualquer resultado: cai no Whisper e lembra "falhou"',
    (codigo) => {
      vi.useFakeTimers()
      const stt = sttFalso()
      const { aoCair, lembrar } = iniciar(stt)
      stt.ultima().cb.onError?.(Object.assign(new Error('x'), { codigo }))
      expect(aoCair).toHaveBeenCalledWith(`erro:${codigo}`)
      expect(lembrar).toHaveBeenCalledWith('falhou')
      expect(stt.ultima().parada).toBe(true)
    },
  )

  it('erro não fatal (rede, captura): não cai', () => {
    vi.useFakeTimers()
    const stt = sttFalso()
    const { aoCair } = iniciar(stt)
    stt.ultima().cb.onError?.(Object.assign(new Error('x'), { codigo: 'network' }))
    stt.ultima().cb.onError?.(new Error('sem código'))
    expect(aoCair).not.toHaveBeenCalled()
  })

  it('VAD ouve fala e a Web Speech fica muda por PRAZO_SEM_RESULTADO_MS: cai e lembra "falhou"', () => {
    vi.useFakeTimers()
    const stt = sttFalso()
    const { ctl, aoCair, lembrar, avancar } = iniciar(stt)
    ctl!.falaComecou()
    avancar(3000)
    ctl!.falaTerminou()
    ctl!.falaComecou()
    avancar(3000)
    ctl!.falaTerminou()
    expect(aoCair).not.toHaveBeenCalled() // duas falas, mas ainda dentro do prazo
    avancar(PRAZO_SEM_RESULTADO_MS)
    expect(aoCair).toHaveBeenCalledWith('sem-resultado')
    expect(aoCair).toHaveBeenCalledTimes(1)
    expect(lembrar).toHaveBeenCalledWith('falhou')
  })

  it('uma fala só (música, um "oi") não derruba, por mais que demore', () => {
    vi.useFakeTimers()
    const stt = sttFalso()
    const { ctl, aoCair, avancar } = iniciar(stt)
    ctl!.falaComecou()
    ctl!.falaTerminou()
    avancar(PRAZO_SEM_RESULTADO_MS * 3)
    expect(aoCair).not.toHaveBeenCalled()
  })

  it('sem fala do VAD, silêncio da Web Speech é só silêncio', () => {
    vi.useFakeTimers()
    const stt = sttFalso()
    const { aoCair, avancar } = iniciar(stt)
    avancar(PRAZO_SEM_RESULTADO_MS * 3)
    expect(aoCair).not.toHaveBeenCalled()
  })

  it('travou DEPOIS de funcionar: cai nesta sessão, mas NÃO lembra "falhou"', () => {
    vi.useFakeTimers()
    const stt = sttFalso()
    const { ctl, aoCair, lembrar, avancar } = iniciar(stt)
    stt.ultima().cb.onFinal({ text: 'it works' })
    for (let i = 0; i < 3; i++) {
      ctl!.falaComecou()
      avancar(2000)
      ctl!.falaTerminou()
    }
    avancar(PRAZO_SEM_RESULTADO_MS)
    expect(aoCair).toHaveBeenCalledWith('sem-resultado')
    expect(lembrar).not.toHaveBeenCalledWith('falhou')
  })

  it('resultado zera a contagem', () => {
    vi.useFakeTimers()
    const stt = sttFalso()
    const { ctl, aoCair, avancar } = iniciar(stt)
    ctl!.falaComecou()
    ctl!.falaTerminou()
    ctl!.falaComecou()
    ctl!.falaTerminou()
    stt.ultima().cb.onPartial('ok')
    avancar(PRAZO_SEM_RESULTADO_MS * 2)
    expect(aoCair).not.toHaveBeenCalled()
  })

  it('parar: encerra a sessão e o relógio; nada cai depois', () => {
    vi.useFakeTimers()
    const stt = sttFalso()
    const { ctl, aoCair, avancar } = iniciar(stt)
    ctl!.falaComecou()
    ctl!.falaTerminou()
    ctl!.falaComecou()
    ctl!.falaTerminou()
    ctl!.parar()
    avancar(PRAZO_SEM_RESULTADO_MS * 2)
    expect(stt.ultima().parada).toBe(true)
    expect(aoCair).not.toHaveBeenCalled()
  })

  it('pausar encerra o reconhecedor; retomar abre outro com a mesma trilha', () => {
    vi.useFakeTimers()
    const stt = sttFalso()
    const { ctl } = iniciar(stt)
    ctl!.pausar(true)
    expect(stt.ultima().parada).toBe(true)
    ctl!.pausar(false)
    expect(stt.sessoes).toHaveLength(2)
    expect(stt.ultima().parada).toBe(false)
    expect(stt.criar).toHaveBeenLastCalledWith({ processLocally: true, trilha: TRILHA })
  })

  it('retomar que lança: cai no Whisper', () => {
    vi.useFakeTimers()
    let lancar = false
    const criar = vi.fn(() => ({
      startLive: (_l: string, _cb: SttCallbacks): SttSession => {
        if (lancar) throw new Error('trilha encerrada')
        return { stop: () => {} }
      },
    }))
    const aoCair = vi.fn()
    const ctl = iniciarWebSpeechDoSistema({
      trilha: TRILHA,
      lang: 'en-US',
      aoParcial: vi.fn(),
      aoFinal: vi.fn(),
      aoCair,
      lembrar: vi.fn(async () => {}),
      criarStt: criar,
    })
    ctl!.pausar(true)
    lancar = true
    ctl!.pausar(false)
    expect(aoCair).toHaveBeenCalledWith('retomar-falhou')
  })
})
