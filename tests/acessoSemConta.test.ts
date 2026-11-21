import { describe, expect, it } from 'vitest'

import {
  type EdicaoDoApp,
  type EntradaDoAcesso,
  estadoDoAcesso,
  type FaixaDeclarada,
  podeLer,
} from '../src/core/acessoSemConta'
import { TETO_ANONIMO } from '../src/core/tetoAnonimo'

const base: EntradaDoAcesso = {
  sessoesLocais: 1,
  faixaDeclarada: null,
  flagLigada: true,
  temConta: false,
  edicao: 'web',
}
const com = (p: Partial<EntradaDoAcesso>): EntradaDoAcesso => ({ ...base, ...p })

describe('estadoDoAcesso', () => {
  it('a 1ª sessão é livre para qualquer faixa', () => {
    for (const faixa of [null, 'adulto', 'menor'] as FaixaDeclarada[]) {
      expect(estadoDoAcesso(com({ sessoesLocais: 0, faixaDeclarada: faixa }))).toBe('livre')
    }
  })

  it('depois de 1 sessão, adulto ou sem resposta cai na porta', () => {
    expect(estadoDoAcesso(com({ faixaDeclarada: null }))).toBe('porta')
    expect(estadoDoAcesso(com({ faixaDeclarada: 'adulto' }))).toBe('porta')
    expect(estadoDoAcesso(com({ sessoesLocais: TETO_ANONIMO.sessoes, faixaDeclarada: 'adulto' }))).toBe('porta')
  })

  it('menor segue local: livre até chegar perto do teto, depois só convida', () => {
    const perto = Math.floor(TETO_ANONIMO.sessoes * 0.8)
    expect(estadoDoAcesso(com({ sessoesLocais: 1, faixaDeclarada: 'menor' }))).toBe('livre')
    expect(estadoDoAcesso(com({ sessoesLocais: perto - 1, faixaDeclarada: 'menor' }))).toBe('livre')
    expect(estadoDoAcesso(com({ sessoesLocais: perto, faixaDeclarada: 'menor' }))).toBe('convite')
    expect(estadoDoAcesso(com({ sessoesLocais: TETO_ANONIMO.sessoes, faixaDeclarada: 'menor' }))).toBe('convite')
  })

  it('flag desligada: sempre livre (comportamento de hoje)', () => {
    for (const faixa of [null, 'adulto', 'menor'] as FaixaDeclarada[]) {
      expect(estadoDoAcesso(com({ flagLigada: false, faixaDeclarada: faixa, sessoesLocais: 9 }))).toBe('livre')
    }
  })

  it('quem tem conta: sempre livre', () => {
    expect(estadoDoAcesso(com({ temConta: true, faixaDeclarada: 'adulto', sessoesLocais: 9 }))).toBe('livre')
    expect(estadoDoAcesso(com({ temConta: true, faixaDeclarada: 'menor', sessoesLocais: 9 }))).toBe('livre')
  })

  it('edição estática e self-host ficam fora da regra', () => {
    for (const edicao of ['estatica', 'selfhost'] as EdicaoDoApp[]) {
      expect(estadoDoAcesso(com({ edicao, faixaDeclarada: 'adulto', sessoesLocais: 9 }))).toBe('livre')
      expect(estadoDoAcesso(com({ edicao, faixaDeclarada: 'menor', sessoesLocais: 9 }))).toBe('livre')
    }
  })
})

describe('podeLer', () => {
  it('adulto ou sem resposta, sem conta, com a flag: não lê', () => {
    expect(podeLer(com({ faixaDeclarada: 'adulto' }))).toBe(false)
    expect(podeLer(com({ faixaDeclarada: null }))).toBe(false)
  })
  it('menor lê como hoje', () => {
    expect(podeLer(com({ faixaDeclarada: 'menor' }))).toBe(true)
  })
  it('flag desligada, com conta ou fora da edição web: lê', () => {
    expect(podeLer(com({ flagLigada: false }))).toBe(true)
    expect(podeLer(com({ temConta: true }))).toBe(true)
    expect(podeLer(com({ edicao: 'estatica' }))).toBe(true)
    expect(podeLer(com({ edicao: 'selfhost' }))).toBe(true)
  })
  it('não depende de quantas sessões há (livro pede conta já na 1ª)', () => {
    expect(podeLer(com({ sessoesLocais: 0, faixaDeclarada: 'adulto' }))).toBe(false)
  })
})
