import { describe, expect, it } from 'vitest'

import {
  convidarParaVozNoAparelho,
  type EntradaDaVozNoAparelho,
  FLAG_VOZ_NO_APARELHO,
  ofertaDaVozNoAparelho,
  supertonicLe,
} from '../src/core/harness/vozNoAparelho'

/** O Mac com Chrome isolado, WebGPU e 8 GB informados: a oferta padrão. */
const base: EntradaDaVozNoAparelho = {
  flagLigada: true,
  perfilProtegido: false,
  tipo: 'desktop-com-gpu',
  poucaMemoria: false,
  memoriaGb: 8,
  webGpu: true,
  wasm: true,
  isolado: true,
  ios: false,
  armazenamento: true,
}
const com = (p: Partial<EntradaDaVozNoAparelho>) => ofertaDaVozNoAparelho({ ...base, ...p })

describe('ofertaDaVozNoAparelho (portão por perfil)', () => {
  it('a flag nasce com o nome combinado', () => {
    expect(FLAG_VOZ_NO_APARELHO).toBe('voz_no_aparelho')
  })

  it('desktop isolado com GPU e memória folgada: padrão, sem aviso', () => {
    const o = com({})
    expect(o.oferta).toBe('padrao')
    expect(o.avisoDeMemoria).toBe(false)
    expect(o.backend).toBe('webgpu')
  })

  it('flag desligada: não oferece, antes de qualquer outra regra', () => {
    expect(com({ flagLigada: false })).toMatchObject({ oferta: 'nao', motivo: 'flag-desligada' })
    expect(com({ flagLigada: false, perfilProtegido: true }).motivo).toBe('flag-desligada')
  })

  it('perfil protegido (menor ou idade não declarada): não oferece', () => {
    expect(com({ perfilProtegido: true })).toMatchObject({ oferta: 'nao', motivo: 'perfil-protegido' })
  })

  it('iOS e iPadOS: não oferece, mesmo com WebGPU', () => {
    expect(com({ ios: true })).toMatchObject({ oferta: 'nao', motivo: 'ios' })
    expect(com({ ios: true, tipo: 'celular-bom', poucaMemoria: true }).motivo).toBe('ios')
  })

  it.each(['celular-bom', 'celular-fraco', 'quest'] as const)('%s: não oferece (pouca memória)', (tipo) => {
    expect(com({ tipo, poucaMemoria: true })).toMatchObject({ oferta: 'nao', motivo: 'aparelho-de-pouca-memoria' })
  })

  it('memória informada abaixo de 4 GB: não oferece', () => {
    expect(com({ memoriaGb: 2 })).toMatchObject({ oferta: 'nao', motivo: 'memoria-insuficiente' })
    expect(com({ memoriaGb: 4 }).oferta).not.toBe('nao')
  })

  it('sem WebGPU e sem WASM: não oferece', () => {
    expect(com({ webGpu: false, wasm: false })).toMatchObject({ oferta: 'nao', motivo: 'sem-motor' })
  })

  it('sem armazenamento no aparelho (OPFS): não oferece', () => {
    expect(com({ armazenamento: false })).toMatchObject({ oferta: 'nao', motivo: 'sem-armazenamento' })
  })

  it('Safari no Mac (sem isolamento, sem memória informada, com WebGPU): por escolha, com aviso', () => {
    const o = com({ isolado: false, poucaMemoria: true, memoriaGb: null })
    expect(o).toMatchObject({
      oferta: 'por-escolha',
      motivo: 'sem-isolamento',
      avisoDeMemoria: true,
      backend: 'webgpu',
    })
    expect(o.threadsWasm).toBe(1)
  })

  it('Safari no Mac sem WebGPU: por escolha, WASM em 1 thread (RTF ~0,64)', () => {
    const o = com({ isolado: false, poucaMemoria: true, memoriaGb: null, webGpu: false, tipo: 'desktop-sem-gpu' })
    expect(o).toMatchObject({ oferta: 'por-escolha', backend: 'wasm', threadsWasm: 1 })
    expect(o.rtfEstimado).toBeCloseTo(0.64, 2)
  })

  it('desktop isolado com menos de 8 GB: por escolha, com aviso', () => {
    expect(com({ memoriaGb: 6 })).toMatchObject({
      oferta: 'por-escolha',
      motivo: 'memoria-justa',
      avisoDeMemoria: true,
    })
  })

  it('desktop isolado sem GPU: padrão em WASM com threads (RTF ~0,3)', () => {
    const o = com({ webGpu: false, tipo: 'desktop-sem-gpu' })
    expect(o).toMatchObject({ oferta: 'padrao', backend: 'wasm', threadsWasm: 4 })
    expect(o.rtfEstimado).toBeCloseTo(0.31, 2)
  })
})

describe('ofertaDaVozNoAparelho — OPFS (false, true, "desconhecido")', () => {
  it('OPFS inutilizável (a sonda falhou): não oferece, com o motivo de armazenamento', () => {
    expect(com({ armazenamento: false })).toMatchObject({ oferta: 'nao', motivo: 'sem-armazenamento' })
  })
  it('OPFS funcionando: oferece como antes', () => {
    expect(com({ armazenamento: true })).toMatchObject({ oferta: 'padrao', motivo: 'aparelho-capaz' })
  })
  it('OPFS ainda "desconhecido": não bloqueia a oferta nem a leitura', () => {
    expect(com({ armazenamento: 'desconhecido' })).toMatchObject({ oferta: 'padrao', motivo: 'aparelho-capaz' })
  })
  it('o OPFS vem depois das regras de aparelho: iOS segue dizendo "ios"', () => {
    expect(com({ ios: true, armazenamento: false }).motivo).toBe('ios')
  })
})

describe('convidarParaVozNoAparelho — OPFS', () => {
  const entrada = {
    ...base,
    idiomaSuportado: true,
    modeloPronto: false,
    escolha: 'automatica' as const,
    audioGravado: false,
    recusadoEm: null,
    agora: 1_000,
  }
  it('com OPFS funcionando, convida', () => {
    expect(convidarParaVozNoAparelho({ ...entrada, armazenamento: true })).toBe(true)
  })
  it('sem OPFS utilizável, não convida', () => {
    expect(convidarParaVozNoAparelho({ ...entrada, armazenamento: false })).toBe(false)
  })
  it('antes da resposta da sonda ("desconhecido"), não convida, mas a leitura não é bloqueada', () => {
    expect(convidarParaVozNoAparelho({ ...entrada, armazenamento: 'desconhecido' })).toBe(false)
    expect(supertonicLe({ ...entrada, armazenamento: 'desconhecido', modeloPronto: true })).toBe(true)
  })
})
