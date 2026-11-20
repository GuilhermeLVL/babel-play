/**
 * Adaptadores dos motores locais (Supertonic 3, Pocket TTS): contrato HTTP, lista fechada de vozes e
 * recusa de clonagem. O `fetch` é sempre injetado; nada toca a rede.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  criarSintetizadorPocketTts,
  criarSintetizadorSupertonic,
  VOZES_POCKET_TTS,
  VOZES_POCKET_TTS_NAO_VERIFICADAS,
  VOZES_SUPERTONIC,
} from '../scripts/audiolivros/sintetizador-local.mjs'

function wavDe(duracaoS: number, taxaHz = 24000): Uint8Array {
  const dados = Math.round(duracaoS * taxaHz) * 2
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

const respostaWav = () =>
  new Response(wavDe(1) as BlobPart, {
    headers: { 'content-type': 'audio/wav', 'x-tempo-sintese': '0.2', 'x-memoria-mb': '900' },
  })
const comoFetch = (f: unknown) => f as typeof fetch

describe('Supertonic 3', () => {
  it('fala o contrato HTTP na porta padrão e lê o tempo do servidor', async () => {
    const f = vi.fn(async () => respostaWav())
    const s = criarSintetizadorSupertonic({}, { fetch: comoFetch(f) })
    const clipe = await s.sintetizar('Olá, mundo.', { voz: 'F1', idioma: 'pt' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8801/sintetizar')
    expect(JSON.parse(String(init.body))).toMatchObject({ texto: 'Olá, mundo.', voz: 'F1', idioma: 'pt' })
    expect(clipe).toMatchObject({ origemDoTempo: 'servidor', tempoDeSinteseS: 0.2, memoriaMB: 900, taxaHz: 24000 })
    expect(s.idiomas).toEqual(['pt', 'en', 'es'])
  })

  it('recusa voz fora da lista fechada, inclusive caminho de áudio, antes da rede', async () => {
    const f = vi.fn(async () => respostaWav())
    const s = criarSintetizadorSupertonic({}, { fetch: comoFetch(f) })
    await expect(s.sintetizar('oi', { voz: '/tmp/minha-voz.wav', idioma: 'pt' })).rejects.toThrow(/fora da lista/)
    await expect(s.sintetizar('oi', { voz: 'Z9', idioma: 'pt' })).rejects.toThrow(/fora da lista/)
    expect(f).not.toHaveBeenCalled()
  })

  it('recusa campo de clonagem no pedido', async () => {
    const f = vi.fn(async () => respostaWav())
    const s = criarSintetizadorSupertonic({}, { fetch: comoFetch(f) })
    const pedido = { voz: 'M1', idioma: 'pt', reference_audio: 'x.wav' }
    await expect(s.sintetizar('oi', pedido)).rejects.toThrow(/clonagem/)
    expect(f).not.toHaveBeenCalled()
  })

  it('lista 10 presets', () => {
    expect(VOZES_SUPERTONIC).toHaveLength(10)
  })
})

describe('Pocket TTS', () => {
  it('usa a porta padrão e o limite de caracteres para cortar texto longo', async () => {
    const f = vi.fn(async () => respostaWav())
    const s = criarSintetizadorPocketTts({}, { fetch: comoFetch(f) })
    await s.sintetizar('Olá.', { voz: 'marius', idioma: 'pt' })
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('http://127.0.0.1:8802/sintetizar')
    expect(s.limiteDeCaracteres).toBe(300)
  })

  it('rafael e lola (licença não documentada) só entram com incluirNaoVerificadas', async () => {
    const f = vi.fn(async () => respostaWav())
    const padrao = criarSintetizadorPocketTts({}, { fetch: comoFetch(f) })
    await expect(padrao.sintetizar('oi', { voz: 'rafael', idioma: 'pt' })).rejects.toThrow(/fora da lista/)
    const avaliacao = criarSintetizadorPocketTts({ incluirNaoVerificadas: true }, { fetch: comoFetch(f) })
    await expect(avaliacao.sintetizar('oi', { voz: 'rafael', idioma: 'pt' })).resolves.toBeDefined()
  })

  it('nunca lista vozes CC-BY-NC (Expresso: cosette; EARS: jean)', () => {
    const todas = [...VOZES_POCKET_TTS, ...VOZES_POCKET_TTS_NAO_VERIFICADAS]
    expect(todas).not.toContain('cosette')
    expect(todas).not.toContain('jean')
  })

  it('recusa campo de clonagem no pedido', async () => {
    const f = vi.fn(async () => respostaWav())
    const s = criarSintetizadorPocketTts({}, { fetch: comoFetch(f) })
    await expect(s.sintetizar('oi', { voz: 'marius', idioma: 'pt', audio_prompt: 'x' } as never)).rejects.toThrow(
      /clonagem/,
    )
    expect(f).not.toHaveBeenCalled()
  })
})
