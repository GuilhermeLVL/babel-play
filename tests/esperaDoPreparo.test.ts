/**
 * NADA DE "PRONTO PARA LEGENDAR" NEM "OUVINDO…" SEM O RECONHECIMENTO (carga-rapida-no-celular, 4.1): a tela diz que
 * está baixando, quantas falas ficaram guardadas e quando a legenda começa.
 */
import { describe, expect, it } from 'vitest'

import type { ModelPrepState } from '../src/components/ModelPrepPanel'
import { esperaDaLegenda, mioloDoPreparo, reconhecimentoBaixando } from '../src/lib/captura/esperaDoPreparo'

const MB = 1024 * 1024
const baixando: ModelPrepState = {
  whisper: 0.53,
  mt: null,
  whisperBytes: { loaded: 40 * MB, total: 76 * MB },
  vazaoMbps: 1.3,
  trechosGuardados: 4,
  fromCache: false,
  error: null,
  done: false,
}

describe('a espera do reconhecimento', () => {
  it('baixando: o miolo diz "Baixando para legendar" e quando a legenda começa', () => {
    expect(reconhecimentoBaixando(baixando)).toBe(true)
    const m = mioloDoPreparo(baixando)!
    expect(m.titulo).toBe('Baixando para legendar')
    expect(m.texto).toMatch(/A legenda começa em cerca de \d+ a \d+ min\./)
  })

  it('gravando: as falas guardadas e a estimativa, nunca "Ouvindo…"', () => {
    const e = esperaDaLegenda(baixando)!
    expect(e).toMatch(/^Baixando: suas falas ficam guardadas \(4 trechos\)\. A legenda começa em cerca de/)
    expect(e).not.toMatch(/Ouvindo/)
    expect(esperaDaLegenda({ ...baixando, trechosGuardados: 0, vazaoMbps: null })).toBe(
      'Baixando: pode falar, suas falas ficam guardadas.',
    )
  })

  it('do cache não há download: "Preparando", sem prometer espera', () => {
    expect(mioloDoPreparo({ ...baixando, fromCache: true })!.titulo).toBe('Preparando para legendar')
    expect(esperaDaLegenda({ ...baixando, fromCache: true })).toBeNull()
  })

  it('pronto, sem preparo, ou com erro: nada a dizer (vale a tela de sempre)', () => {
    expect(mioloDoPreparo(null)).toBeNull()
    expect(esperaDaLegenda({ ...baixando, whisper: 1 })).toBeNull()
    expect(esperaDaLegenda({ ...baixando, error: 'falhou' })).toBeNull()
    expect(esperaDaLegenda({ ...baixando, whisper: null })).toBeNull()
  })
})
