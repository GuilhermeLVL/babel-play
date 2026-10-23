/**
 * A OFERTA DO MODELO PRECISO na Captura (baixar o Parakeet em segundo plano):
 * - só aparece quando a rota REAL é do aparelho: quem tem nuvem no automático (ou o modo nuvem) não
 *   usaria os 672 MB, e a conta tem de ser feita com a nuvem de verdade, não com `cloudAvailable:false`;
 * - antes do download começar, os modelos da captura (Whisper/Moonshine e tradutores) são soltos: o
 *   Parakeet nunca carrega por cima deles.
 */
import { describe, expect, it, vi } from 'vitest'

import type { SttRouteInput } from '../src/gateway/sttRouter'
import { baixarSemEmpilhar, ofereceOPreciso } from '../src/lib/captura/ofertaDoPreciso'

const entrada: SttRouteInput = {
  contentLang: 'pt',
  autoDetect: false,
  quality: 'auto',
  hasWebGpu: false,
  cloudAvailable: false,
  profileId: 'free-web',
  dispositivo: {
    tipo: 'desktop-com-gpu',
    permiteSmall: false,
    economiaDeDados: false,
    memoriaGb: 8,
    poucaMemoria: false,
  },
  parakeet: true,
  parakeetNoAparelho: false,
}

describe('ofereceOPreciso', () => {
  it('rota do aparelho, sem cópia: oferece', () => {
    expect(ofereceOPreciso(entrada, { nuvemDoStt: false, modoNuvem: false })).toBe(true)
  })

  it('com nuvem disponível no automático, a rota prefere a nuvem: não oferece', () => {
    expect(ofereceOPreciso(entrada, { nuvemDoStt: true, modoNuvem: false })).toBe(false)
  })

  it('nuvem ainda não respondida (null): não oferece até saber', () => {
    expect(ofereceOPreciso(entrada, { nuvemDoStt: null, modoNuvem: false })).toBe(false)
  })

  it('modo nuvem (chave própria): não oferece', () => {
    expect(ofereceOPreciso(entrada, { nuvemDoStt: false, modoNuvem: true })).toBe(false)
  })

  it('com a cópia no aparelho: nada a oferecer', () => {
    expect(ofereceOPreciso({ ...entrada, parakeetNoAparelho: true }, { nuvemDoStt: false, modoNuvem: false })).toBe(
      false,
    )
  })
})

describe('baixarSemEmpilhar', () => {
  it('solta os modelos da captura ANTES de o download começar', async () => {
    const ordem: string[] = []
    const liberar = vi.fn(() => void ordem.push('liberar'))
    const baixar = vi.fn(async () => {
      ordem.push('baixar')
      return 'baixado' as const
    })
    expect(await baixarSemEmpilhar(liberar, baixar)).toBe('baixado')
    expect(ordem).toEqual(['liberar', 'baixar'])
  })

  it('se soltar falhar, o download segue (nunca empilha por erro de quem libera)', async () => {
    const baixar = vi.fn(async () => 'falhou' as const)
    const r = await baixarSemEmpilhar(() => {
      throw new Error('worker já morto')
    }, baixar)
    expect(r).toBe('falhou')
    expect(baixar).toHaveBeenCalledTimes(1)
  })
})
