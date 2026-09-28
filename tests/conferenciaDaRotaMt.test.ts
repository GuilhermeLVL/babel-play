/**
 * `routeMt` como conferência (dev) do gateway: parcial nunca na nuvem/terceiro, nada sai sem
 * consentimento. Ver `src/gateway/conferenciaDaRotaMt.ts` para o porquê de não rotear por ele ainda.
 */
import { describe, expect, it } from 'vitest'

import { violacaoDaRotaMt } from '../src/gateway/conferenciaDaRotaMt'

const BASE = {
  texto: 'Hello world, this is a test',
  origem: 'en',
  destino: 'pt',
  parcial: false,
  consentimento: true,
  falada: true,
}

describe('violacaoDaRotaMt', () => {
  it('motor local nunca viola', () => {
    expect(violacaoDaRotaMt({ ...BASE, parcial: true, consentimento: false, motor: 'opus-mt-local' })).toBeNull()
    expect(violacaoDaRotaMt({ ...BASE, parcial: true, motor: 'chrome-translator' })).toBeNull()
  })

  it('final com consentimento na nuvem: permitido', () => {
    expect(violacaoDaRotaMt({ ...BASE, motor: 'server-llm-mt' })).toBeNull()
    expect(violacaoDaRotaMt({ ...BASE, motor: 'mymemory' })).toBeNull()
  })

  it('PARCIAL na nuvem ou no terceiro: violação', () => {
    expect(violacaoDaRotaMt({ ...BASE, parcial: true, motor: 'server-llm-mt' })).toMatch(/parcial/)
    expect(violacaoDaRotaMt({ ...BASE, parcial: true, motor: 'mymemory' })).toMatch(/parcial/)
  })

  it('SEM consentimento, qualquer saída do aparelho: violação', () => {
    expect(violacaoDaRotaMt({ ...BASE, consentimento: false, motor: 'server-llm-mt' })).toMatch(/consentimento/)
    expect(violacaoDaRotaMt({ ...BASE, consentimento: false, motor: 'mymemory' })).toMatch(/consentimento/)
  })
})
