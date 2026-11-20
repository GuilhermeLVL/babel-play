/**
 * O PRIMEIRO CONTATO com a voz no aparelho (openspec `voz-no-aparelho`, 02/11/2026): a "Automática" resolve para a
 * Supertonic quando o modelo já está pronto, e o convite do primeiro "Ouvir" só aparece para quem pode usá-la.
 */
import { describe, expect, it } from 'vitest'

import {
  convidarParaVozNoAparelho,
  type EntradaDaVozDaLeitura,
  type EntradaDoConvite,
  PRAZO_DO_CONVITE_MS,
  supertonicLe,
} from '../src/core/harness/vozNoAparelho'

const base: EntradaDaVozDaLeitura = {
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
  idiomaSuportado: true,
  modeloPronto: true,
  escolha: 'automatica',
}
const le = (p: Partial<EntradaDaVozDaLeitura>) => supertonicLe({ ...base, ...p })

describe('supertonicLe (a "Automática" prefere a voz boa)', () => {
  it('modelo pronto e Automática: a Supertonic lê desde a primeira frase', () => {
    expect(le({})).toBe(true)
  })
  it('modelo ausente: a voz do sistema', () => {
    expect(le({ modeloPronto: false })).toBe(false)
  })
  it('flag desligada: nunca', () => {
    expect(le({ flagLigada: false })).toBe(false)
  })
  it('perfil sem permissão (celular, iOS, Quest): nunca', () => {
    expect(le({ tipo: 'celular-bom', poucaMemoria: true })).toBe(false)
    expect(le({ ios: true })).toBe(false)
    expect(le({ tipo: 'quest', poucaMemoria: true })).toBe(false)
  })
  it('menor ou idade não declarada: nunca, mesmo com o modelo pronto', () => {
    expect(le({ perfilProtegido: true })).toBe(false)
    expect(le({ perfilProtegido: true, escolha: 'no-aparelho' })).toBe(false)
  })
  it('idioma fora do motor: a voz do sistema', () => {
    expect(le({ idiomaSuportado: false })).toBe(false)
  })
  it('escolha manual de uma voz do sistema ou da nuvem vence', () => {
    expect(le({ escolha: 'sistema' })).toBe(false)
    expect(le({ escolha: 'nuvem' })).toBe(false)
  })
  it('escolha explícita da voz no aparelho: lê', () => {
    expect(le({ escolha: 'no-aparelho' })).toBe(true)
  })
  it('Safari no Mac (por escolha): com o modelo já baixado, lê', () => {
    expect(le({ isolado: false, poucaMemoria: true, memoriaGb: null })).toBe(true)
  })
})

const AGORA = 1_800_000_000_000
const convite: EntradaDoConvite = {
  ...base,
  modeloPronto: false,
  audioGravado: false,
  recusadoEm: null,
  agora: AGORA,
}
const convida = (p: Partial<EntradaDoConvite>) => convidarParaVozNoAparelho({ ...convite, ...p })

describe('convidarParaVozNoAparelho (o cartão do primeiro "Ouvir")', () => {
  it('quem pode e ainda não baixou: convida', () => {
    expect(convida({})).toBe(true)
  })
  it('modelo já pronto: nada a convidar', () => {
    expect(convida({ modeloPronto: true })).toBe(false)
  })
  it('celular, tablet, iOS, Quest: nunca', () => {
    expect(convida({ tipo: 'celular-bom', poucaMemoria: true })).toBe(false)
    expect(convida({ tipo: 'celular-fraco', poucaMemoria: true })).toBe(false)
    expect(convida({ ios: true })).toBe(false)
    expect(convida({ tipo: 'quest', poucaMemoria: true })).toBe(false)
  })
  it('perfil protegido: o convite nem existe', () => {
    expect(convida({ perfilProtegido: true })).toBe(false)
  })
  it('flag desligada ou idioma fora do motor: nunca', () => {
    expect(convida({ flagLigada: false })).toBe(false)
    expect(convida({ idiomaSuportado: false })).toBe(false)
  })
  it('áudio pré-gerado em uso: o gravado tem prioridade, sem convite', () => {
    expect(convida({ audioGravado: true })).toBe(false)
  })
  it('a pessoa escolheu uma voz do sistema ou da nuvem: não insiste', () => {
    expect(convida({ escolha: 'sistema' })).toBe(false)
    expect(convida({ escolha: 'nuvem' })).toBe(false)
  })
  it('"Agora não" vale 30 dias neste aparelho', () => {
    expect(PRAZO_DO_CONVITE_MS).toBe(30 * 24 * 60 * 60 * 1000)
    expect(convida({ recusadoEm: AGORA - 1000 })).toBe(false)
    expect(convida({ recusadoEm: AGORA - PRAZO_DO_CONVITE_MS + 1 })).toBe(false)
    expect(convida({ recusadoEm: AGORA - PRAZO_DO_CONVITE_MS })).toBe(true)
  })
  it('recusa com data no futuro (relógio mexido): conta como recente', () => {
    expect(convida({ recusadoEm: AGORA + 60_000 })).toBe(false)
  })
})
