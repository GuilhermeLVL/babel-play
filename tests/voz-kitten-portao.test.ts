/** A VOZ NATURAL NO APARELHO (Kitten): a quem oferecer, qual variante, quando confirmar o download e quem lê. */
import { describe, expect, it } from 'vitest'

import {
  confirmarDownloadDoKitten,
  type EntradaDeQuemLe,
  type EntradaDoKitten,
  mbDoDownload,
  ofertaDoKitten,
  quemLeEmVozAlta,
  varianteDoKitten,
} from '../src/core/harness/vozKitten'
import { haVozAceita } from '../src/core/voz/vozesUteis'

const desktop: EntradaDoKitten = {
  flagLigada: true,
  tipo: 'desktop-com-gpu',
  ios: false,
  memoriaGb: 8,
  webGpu: true,
  wasm: true,
  isolado: true,
  armazenamento: true,
  confirmarAcimaDeMb: 300,
}

describe('ofertaDoKitten', () => {
  it('flag desligada, sem WASM ou sem OPFS: não oferece', () => {
    expect(ofertaDoKitten({ ...desktop, flagLigada: false }).motivo).toBe('flag-desligada')
    expect(ofertaDoKitten({ ...desktop, wasm: false }).motivo).toBe('sem-motor')
    expect(ofertaDoKitten({ ...desktop, armazenamento: false }).motivo).toBe('sem-armazenamento')
    expect(ofertaDoKitten({ ...desktop, armazenamento: 'desconhecido' }).oferecida).toBe(true)
  })

  it('não há corte por perfil protegido (Apache-2.0, sem GPL): a entrada nem tem o campo', () => {
    expect('perfilProtegido' in desktop).toBe(false)
  })

  it('mini no computador com isolamento (WebGPU primeiro); pico no celular, no iOS e sem isolamento', () => {
    expect(ofertaDoKitten(desktop)).toMatchObject({ variante: 'mini', backend: 'webgpu', threadsWasm: 4 })
    expect(ofertaDoKitten({ ...desktop, webGpu: false })).toMatchObject({ variante: 'mini', backend: 'wasm' })
    expect(varianteDoKitten({ ...desktop, isolado: false })).toBe('pico') // WASM em 1 thread: mini com RTF 1,15
    expect(varianteDoKitten({ ...desktop, tipo: 'celular-bom' })).toBe('pico')
    expect(varianteDoKitten({ ...desktop, ios: true })).toBe('pico')
    expect(varianteDoKitten({ ...desktop, memoriaGb: 2 })).toBe('pico')
    expect(ofertaDoKitten({ ...desktop, tipo: 'celular-fraco', isolado: false })).toMatchObject({
      oferecida: true,
      variante: 'pico',
      backend: 'wasm',
      threadsWasm: 1,
    })
  })

  it('confirmação acima do teto do perfil (teto 0 = sempre; null = nunca)', () => {
    expect(mbDoDownload('pico', 'pt')).toBeLessThanOrEqual(11)
    expect(mbDoDownload('mini', 'pt')).toBeGreaterThan(80)
    /* o mini é um modelo só: com o pt já baixado, o es custa só as vozes */
    expect(mbDoDownload('mini', 'es', ['pt'])).toBeLessThan(8)
    expect(confirmarDownloadDoKitten(100, mbDoDownload('pico', 'pt'))).toBe(false)
    expect(confirmarDownloadDoKitten(0, mbDoDownload('pico', 'pt'))).toBe(true)
    expect(confirmarDownloadDoKitten(300, mbDoDownload('mini', 'en'))).toBe(false)
    expect(confirmarDownloadDoKitten(null, 999)).toBe(false)
  })
})

describe('quemLeEmVozAlta', () => {
  const base: EntradaDeQuemLe = {
    kittenPronto: true,
    supertonicLe: false,
    escolha: 'automatica',
    vozDoSistemaAceita: true,
  }
  it('voz natural no aparelho → voz boa do sistema → nenhuma', () => {
    expect(quemLeEmVozAlta(base)).toBe('kitten')
    expect(quemLeEmVozAlta({ ...base, kittenPronto: false })).toBe('sistema')
    expect(quemLeEmVozAlta({ ...base, kittenPronto: false, vozDoSistemaAceita: false })).toBe('nenhuma')
    /* lista de vozes ainda não chegou: o navegador escolhe, como sempre */
    expect(quemLeEmVozAlta({ ...base, kittenPronto: false, vozDoSistemaAceita: 'desconhecido' })).toBe('sistema')
  })
  it('escolha explícita vence', () => {
    expect(quemLeEmVozAlta({ ...base, escolha: 'sistema' })).toBe('sistema')
    expect(quemLeEmVozAlta({ ...base, escolha: 'kitten' })).toBe('kitten')
    expect(quemLeEmVozAlta({ ...base, escolha: 'no-aparelho', supertonicLe: true })).toBe('supertonic')
    expect(quemLeEmVozAlta({ ...base, kittenPronto: false, supertonicLe: true })).toBe('supertonic')
  })
})

describe('haVozAceita', () => {
  it('voz robótica ou de efeito não conta', () => {
    expect(haVozAceita([{ name: 'Fred', lang: 'en-US' }], 'en')).toBe(false)
    expect(
      haVozAceita(
        [
          { name: 'Zarvox', lang: 'en-US' },
          { name: 'Samantha', lang: 'en-US' },
        ],
        'en',
      ),
    ).toBe(true)
    expect(haVozAceita([{ name: 'Luciana', lang: 'pt-BR' }], 'en')).toBe(false)
  })
})
