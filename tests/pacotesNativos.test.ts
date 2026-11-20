/**
 * PACOTES DE IDIOMA DO NAVEGADOR NA BARRA DE PREPARO (estágio 4, parte 1).
 *
 * O pacote do Translator (e o de voz do `SpeechRecognition.install`) baixava só com um `clog` — a
 * pessoa via a legenda sem tradução e não sabia por quê. Agora entra no MESMO painel do Whisper e
 * do opus-mt (`ModelPrepPanel`), como mais uma linha. Falhou: a linha some, sem toast (o opus-mt
 * ou o Whisper seguem). Parou a captura: nada volta à tela.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModelPrepState } from '../src/components/ModelPrepPanel'
import {
  comPacoteNativo,
  criarProgressoDosPacotesNativos,
  preparoConcluido,
  semPacotePendente,
} from '../src/lib/captura/pacotesNativos'

const WHISPER: ModelPrepState = { whisper: 0.5, mt: null, fromCache: false, error: null, done: false }

describe('comPacoteNativo', () => {
  it('sem preparo em curso: nasce um painel só com o pacote do navegador', () => {
    expect(comPacoteNativo(null, 'tradutor', 0)).toEqual({
      whisper: null,
      mt: null,
      fromCache: false,
      error: null,
      done: false,
      nativos: { tradutor: 0 },
    })
  })

  it('com o Whisper baixando: soma a linha, não mexe no resto', () => {
    const s = comPacoteNativo(WHISPER, 'voz', null)
    expect(s).toMatchObject({ whisper: 0.5, nativos: { voz: null } })
  })

  it('tirar o último pacote de um painel só de pacotes: o painel some', () => {
    const s = comPacoteNativo(null, 'tradutor', 1)
    expect(comPacoteNativo(s, 'tradutor', undefined)).toBeNull()
  })

  it('tirar o pacote de um painel com o Whisper: o painel fica, sem a linha', () => {
    const s = comPacoteNativo(WHISPER, 'tradutor', 0.3)
    expect(comPacoteNativo(s, 'tradutor', undefined)).toEqual(WHISPER)
  })

  it('o Whisper já tinha terminado e só o pacote segurava o painel: sai o pacote, sai o painel', () => {
    const s = comPacoteNativo({ ...WHISPER, whisper: 1, done: true }, 'tradutor', 1)
    expect(comPacoteNativo(s, 'tradutor', undefined)).toBeNull()
  })
})

describe('preparoConcluido / semPacotePendente', () => {
  it('o Whisper pronto não esconde o pacote do navegador que ainda baixa', () => {
    const pronto: ModelPrepState = { ...WHISPER, whisper: 1, done: true }
    expect(preparoConcluido(pronto)).toBe(true)
    expect(preparoConcluido({ ...pronto, nativos: { tradutor: 0.4 } })).toBe(false)
    expect(preparoConcluido({ ...pronto, nativos: { tradutor: 1 } })).toBe(true)
    expect(preparoConcluido({ ...pronto, mt: 0.2 })).toBe(false)
    expect(semPacotePendente({ ...WHISPER, nativos: { voz: null } })).toBe(false)
    expect(semPacotePendente(WHISPER)).toBe(true)
  })
})

describe('criarProgressoDosPacotesNativos', () => {
  let estado: ModelPrepState | null
  let ativo: boolean
  const setModelPrep = (f: ModelPrepState | null | ((s: ModelPrepState | null) => ModelPrepState | null)) => {
    estado = typeof f === 'function' ? f(estado) : f
  }

  beforeEach(() => {
    vi.useFakeTimers()
    estado = null
    ativo = true
  })
  afterEach(() => vi.useRealTimers())

  const criar = () => criarProgressoDosPacotesNativos({ setModelPrep, ativo: () => ativo })

  it('dois pares baixando viram UMA barra (a média), que some pouco depois de chegar a 100%', () => {
    const p = criar()
    p.tradutor.progresso(0, 'en|pt')
    p.tradutor.progresso(0, 'pt|en')
    p.tradutor.progresso(0.5, 'en|pt')
    expect(estado?.nativos?.tradutor).toBe(0.25)
    p.tradutor.progresso(1, 'en|pt')
    p.tradutor.progresso(1, 'pt|en')
    expect(estado?.nativos?.tradutor).toBe(1)
    vi.advanceTimersByTime(1800)
    expect(estado).toBeNull()
  })

  it('um par falha: sai da média; todos falham: a linha some na hora, sem erro no painel', () => {
    const p = criar()
    p.tradutor.progresso(0.2, 'en|pt')
    p.tradutor.progresso(0.6, 'pt|en')
    p.tradutor.falhou('en|pt')
    expect(estado?.nativos?.tradutor).toBe(0.6)
    p.tradutor.falhou('pt|en')
    expect(estado).toBeNull()
  })

  it('o pacote de voz: barra sem porcentagem enquanto instala; falhou some; pronto some depois', () => {
    const p = criar()
    p.voz('baixando')
    expect(estado?.nativos).toEqual({ voz: null })
    p.voz('falhou')
    expect(estado).toBeNull()
    p.voz('baixando')
    p.voz('pronto')
    expect(estado?.nativos).toEqual({ voz: 1 })
    vi.advanceTimersByTime(1800)
    expect(estado).toBeNull()
  })

  /* COMP-03 (auditoria de 17/11/2026): a captura prepara en|pt e pt|en; en|pt falhou e pt|en ficou em 0% para sempre, e o
     cartão "Tradutor do navegador 0%" cobriu a primeira legenda a sessão inteira. */
  it('um par falha e o outro fica parado: em 20 s o cartão some', () => {
    const p = criar()
    p.tradutor.progresso(0, 'en|pt')
    p.tradutor.progresso(0, 'pt|en')
    p.tradutor.falhou('en|pt')
    expect(estado?.nativos?.tradutor).toBe(0)
    vi.advanceTimersByTime(19_999)
    expect(estado?.nativos?.tradutor).toBe(0)
    vi.advanceTimersByTime(1)
    expect(estado).toBeNull()
  })

  it('os ouvintes vão soltos (como o `prepararNativo` os chama): o prazo não depende de `this`', () => {
    const { progresso, falhou } = criar().tradutor
    progresso(0, 'en|pt')
    progresso(0, 'pt|en')
    falhou('en|pt')
    vi.advanceTimersByTime(20_000)
    expect(estado).toBeNull()
  })

  it('sessão descartada (parou e começou outra em menos de 20 s): o prazo velho não mexe no cartão novo', () => {
    const velha = criar()
    velha.tradutor.progresso(0, 'en|pt')
    velha.descartar()
    const nova = criar()
    nova.tradutor.progresso(0.3, 'es|pt')
    vi.advanceTimersByTime(19_000)
    expect(estado?.nativos?.tradutor).toBe(0.3)
  })

  it('o par que progride não vence o prazo (o relógio recomeça a cada progresso)', () => {
    const p = criar()
    p.tradutor.progresso(0.1, 'en|pt')
    vi.advanceTimersByTime(15_000)
    p.tradutor.progresso(0.5, 'en|pt')
    vi.advanceTimersByTime(15_000)
    expect(estado?.nativos?.tradutor).toBe(0.5)
    vi.advanceTimersByTime(5_000)
    expect(estado).toBeNull()
  })

  it('o tradutor local assumiu (primeira tradução no aparelho): o cartão do nativo some na hora e não volta', () => {
    const p = criar()
    p.tradutor.progresso(0.2, 'en|pt')
    p.tradutor.localAssumiu()
    expect(estado).toBeNull()
    p.tradutor.progresso(0.4, 'en|pt')
    expect(estado).toBeNull()
    vi.advanceTimersByTime(30_000)
    expect(estado).toBeNull()
  })

  it('captura parada (ou cancelada): o progresso que chega depois não reabre o painel', () => {
    const p = criar()
    p.tradutor.progresso(0.1, 'en|pt')
    ativo = false
    estado = null // o STOP limpou o painel
    p.tradutor.progresso(0.9, 'en|pt')
    p.voz('baixando')
    expect(estado).toBeNull()
  })
})
