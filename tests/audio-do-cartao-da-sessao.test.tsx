// @vitest-environment jsdom
/**
 * "GUARDAR O ÁUDIO DESTE CARTÃO" (openspec `cartao-com-audio-do-trecho`, tarefa 4.2): o corte do trecho da sessão, o
 * guardar só no aparelho (mesmo armazém por conta) e o aviso quando a sessão não tem áudio. Atrás da flag
 * `cartao_com_audio`.
 */
import 'fake-indexeddb/auto'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import GuardarAudioDoCartao from '../src/components/views/vocab/GuardarAudioDoCartao'
import { abrirClipeDoCartao, gravarDestinoDoAudio } from '../src/lib/cartoes/audioDoCartao'
import { _reiniciarGuardaDoAudioDoCartao } from '../src/lib/cartoes/audioDoCartao/armazem'
import {
  cortarDaSessao,
  type DependenciasDoClipeDaSessao,
  guardarClipeDaSessao,
} from '../src/lib/cartoes/audioDoCartao/daSessao'
import { FOLGA_MS } from '../src/lib/cartoes/audioDoCartao/recorte'
import { definirEstadoDasFlags } from '../src/lib/flagsCache'

const SR = 16000
const sessao = (segundos: number) => new Float32Array(Math.round(segundos * SR)).map((_, i) => (i / SR >= 2 ? 0.3 : 0))

const deps = (segundos = 10): DependenciasDoClipeDaSessao & { baixar: ReturnType<typeof vi.fn> } => ({
  baixar: vi.fn(async () => new ArrayBuffer(8)),
  decodificar: async () => ({ pcm: sessao(segundos), sr: SR }),
})

const trecho = { sessionId: 's1', temAudio: true, inicioMs: 2000, fimMs: 5000 }

function ligarFlag(ligada: boolean) {
  definirEstadoDasFlags({ cartao_com_audio: { ligada } } as never)
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _reiniciarGuardaDoAudioDoCartao()
  localStorage.clear()
  ligarFlag(true)
})
afterEach(() => {
  cleanup()
  definirEstadoDasFlags(null)
})

describe('cortarDaSessao', () => {
  it('corta exatamente o trecho e recusa intervalo fora do áudio', () => {
    const pcm = sessao(10)
    const c = cortarDaSessao(pcm, SR, 2000, 5000)!
    expect(c.length).toBe(3 * SR)
    expect(c[0]).toBeCloseTo(0.3)
    expect(cortarDaSessao(pcm, SR, 11_000, 12_000)).toBeNull()
    expect(cortarDaSessao(pcm, SR, 5000, 5000)).toBeNull()
    expect(cortarDaSessao(pcm, SR, -1, 1000)).toBeNull()
    /* Fim além do áudio: leva até onde há. */
    expect(cortarDaSessao(pcm, SR, 9000, 20_000)!.length).toBe(SR)
  })
})

describe('guardarClipeDaSessao', () => {
  it('guarda o clipe do trecho no aparelho (3 s de fala + folga) e o cartão passa a ter áudio', async () => {
    const d = deps()
    expect(await guardarClipeDaSessao('c1', trecho, d)).toBe('guardou')
    expect(d.baixar).toHaveBeenCalledWith('s1')
    const clipe = await abrirClipeDoCartao('c1')
    expect(clipe).not.toBeNull()
    /* WAV 16 kHz mono 16 bits sem WebCodecs: 44 + 2 bytes por amostra de (3 s + 2 x folga). */
    const esperado = Math.round(((3000 + 2 * FOLGA_MS) / 1000) * SR) * 2
    expect(Math.abs(clipe!.size - esperado)).toBeLessThan(2000)
  })

  it('sessão sem áudio ou sem tempo da fala: avisa e não baixa nada', async () => {
    const d = deps()
    expect(await guardarClipeDaSessao('c1', { ...trecho, temAudio: false }, d)).toBe('sem-audio')
    expect(await guardarClipeDaSessao('c1', { ...trecho, inicioMs: null }, d)).toBe('sem-audio')
    expect(d.baixar).not.toHaveBeenCalled()
    expect(await abrirClipeDoCartao('c1')).toBeNull()
  })

  it('flag desligada ou "Não guardar": nada é baixado nem guardado', async () => {
    const d = deps()
    ligarFlag(false)
    expect(await guardarClipeDaSessao('c1', trecho, d)).toBe('desligado')
    ligarFlag(true)
    gravarDestinoDoAudio('nao')
    expect(await guardarClipeDaSessao('c1', trecho, d)).toBe('desligado')
    expect(d.baixar).not.toHaveBeenCalled()
  })

  it('falha de rede ou trecho fora do áudio: devolve "falhou", sem lançar', async () => {
    const quebrada = { ...deps(), baixar: vi.fn(async () => Promise.reject(new Error('offline'))) }
    expect(await guardarClipeDaSessao('c1', trecho, quebrada)).toBe('falhou')
    expect(await guardarClipeDaSessao('c1', { ...trecho, inicioMs: 30_000, fimMs: 33_000 }, deps(10))).toBe('falhou')
    expect(await abrirClipeDoCartao('c1')).toBeNull()
  })
})

describe('GuardarAudioDoCartao', () => {
  it('com áudio na sessão: o botão guarda e vira "Áudio guardado"', async () => {
    render(<GuardarAudioDoCartao cartaoId="c1" trecho={trecho} deps={deps()} />)
    const botao = await screen.findByRole('button', { name: 'Guardar o áudio deste cartão' })
    await act(async () => {
      fireEvent.click(botao)
    })
    await waitFor(() => expect(screen.getByTestId('audio-guardado')).toBeTruthy())
    expect(await abrirClipeDoCartao('c1')).not.toBeNull()
  })

  it('cartão que já tem o clipe: só diz que está guardado', async () => {
    await guardarClipeDaSessao('c1', trecho, deps())
    render(<GuardarAudioDoCartao cartaoId="c1" trecho={trecho} deps={deps()} />)
    expect(await screen.findByTestId('audio-guardado')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('sessão sem áudio: o aviso no lugar do botão', async () => {
    render(<GuardarAudioDoCartao cartaoId="c1" trecho={{ ...trecho, temAudio: false }} deps={deps()} />)
    expect(await screen.findByTestId('sem-audio-para-guardar')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('flag desligada, "Não guardar" ou cartão sem sessão: não renderiza nada', async () => {
    ligarFlag(false)
    const a = render(<GuardarAudioDoCartao cartaoId="c1" trecho={trecho} deps={deps()} />)
    expect(a.container.innerHTML).toBe('')
    a.unmount()
    ligarFlag(true)
    const b = render(<GuardarAudioDoCartao cartaoId="c1" trecho={null} deps={deps()} />)
    await act(async () => {})
    expect(b.container.innerHTML).toBe('')
    b.unmount()
    gravarDestinoDoAudio('nao')
    const c = render(<GuardarAudioDoCartao cartaoId="c1" trecho={trecho} deps={deps()} />)
    await act(async () => {})
    expect(c.container.innerHTML).toBe('')
  })
})

void React
