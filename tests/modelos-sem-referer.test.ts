/**
 * Correção A do diagnóstico do Safari (22/10/2026): o Hugging Face responde 404 SEM CORS a qualquer
 * `Referer` de `*.workers.dev` (o staging). Os modelos (Whisper, opus-mt, WeSpeaker, Parakeet) não
 * baixavam em navegador nenhum. Toda busca nossa a um host do Hub vai sem referer
 * (`referrerPolicy: 'no-referrer'`); a política do app para o resto não muda.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const envFalso = vi.hoisted(() => ({}) as Record<string, unknown>)
vi.mock('@huggingface/transformers', () => ({ env: envFalso }))

import { configureModelDelivery } from '../src/gateway/adapters/transformersEnv'
import { consultarRevisao } from '../src/gateway/modelManifest'
import { comPoliticaDoHub, ehHostDoHub } from '../src/gateway/semReferer'

describe('ehHostDoHub', () => {
  it('reconhece o Hub e as CDNs dele', () => {
    expect(ehHostDoHub('https://huggingface.co/onnx-community/whisper-base/resolve/abc/config.json')).toBe(true)
    expect(ehHostDoHub('https://cdn-lfs.hf.co/repos/x')).toBe(true)
    expect(ehHostDoHub('https://cas-bridge.xethub.hf.co/x')).toBe(true)
    expect(ehHostDoHub('https://cdn-lfs-us-1.huggingface.co/x')).toBe(true)
  })

  it('não confunde outros hosts (nem os que só terminam parecido)', () => {
    expect(ehHostDoHub('https://modelos.frasy.app/whisper/config.json')).toBe(false)
    expect(ehHostDoHub('https://nothuggingface.co/x')).toBe(false)
    expect(ehHostDoHub('/models/whisper/config.json')).toBe(false)
    expect(ehHostDoHub('não é url')).toBe(false)
  })
})

describe('comPoliticaDoHub', () => {
  it('host do Hub: acrescenta no-referrer e preserva o resto do init', () => {
    const sinal = new AbortController().signal
    expect(comPoliticaDoHub('https://huggingface.co/x', { signal: sinal })).toEqual({
      signal: sinal,
      referrerPolicy: 'no-referrer',
    })
    expect(comPoliticaDoHub('https://huggingface.co/x')).toEqual({ referrerPolicy: 'no-referrer' })
  })

  it('outro host: init intocado', () => {
    const init = { method: 'GET' }
    expect(comPoliticaDoHub('https://modelos.frasy.app/x', init)).toBe(init)
    expect(comPoliticaDoHub('https://modelos.frasy.app/x')).toBeUndefined()
  })
})

describe('fetch do transformers.js (env.fetch)', () => {
  beforeEach(() => {
    for (const k of Object.keys(envFalso)) delete envFalso[k]
  })

  it('URL do Hub sai com referrerPolicy no-referrer', async () => {
    const buscar = vi.fn(async () => new Response('{}'))
    envFalso.fetch = buscar
    configureModelDelivery()
    await (envFalso.fetch as typeof fetch)(
      'https://huggingface.co/onnx-community/whisper-base/resolve/main/config.json',
    )
    expect(buscar).toHaveBeenCalledTimes(1)
    const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/^https:\/\/huggingface\.co\/onnx-community\/whisper-base\/resolve\//)
    expect(init.referrerPolicy).toBe('no-referrer')
  })

  it('URL fora do Hub (self-host em /models) segue sem mudar a política', async () => {
    const buscar = vi.fn(async () => new Response('{}'))
    envFalso.fetch = buscar
    configureModelDelivery()
    await (envFalso.fetch as typeof fetch)('/models/onnx-community/whisper-base/config.json', { method: 'GET' })
    const [, init] = buscar.mock.calls[0] as unknown as [string, RequestInit]
    expect(init).toEqual({ method: 'GET' })
  })
})

describe('consultarRevisao (api/models do Hub)', () => {
  it('também vai sem referer', async () => {
    const buscar = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    await consultarRevisao('onnx-community/whisper-base', buscar)
    const [, init] = buscar.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.referrerPolicy).toBe('no-referrer')
  })
})
