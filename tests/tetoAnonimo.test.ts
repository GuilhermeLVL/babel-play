/**
 * O TETO DO MODO SEM CONTA POR EDIÇÃO (decisão do dono, 2026-09-28).
 *
 * A edição estática (o site de demonstração, sem servidor) guarda até 20 gravações neste
 * navegador; a completa, sem conta, continua em 5 — lá a conta existe e é a saída. O núcleo não lê
 * ambiente: quem sabe a edição passa a opção, e o espelho sem conta, a tela e os avisos perguntam
 * ao MESMO lugar (`tetoAnonimoDa`). O teto de palavras não é acoplado ao de gravações e fica igual.
 */
import { describe, expect, it } from 'vitest'

import { estadoDoTeto, motivoDoTeto, TETO_ANONIMO, tetoAnonimoDa } from '../src/core/tetoAnonimo'

describe('tetoAnonimoDa', () => {
  it('a edição completa sem conta segue com 5 gravações e 80 palavras', () => {
    expect(tetoAnonimoDa()).toEqual({ sessoes: 5, palavras: 80 })
    expect(tetoAnonimoDa({ edicaoEstatica: false })).toEqual(TETO_ANONIMO)
  })

  it('a edição estática guarda 20 gravações; as palavras não mudam', () => {
    expect(tetoAnonimoDa({ edicaoEstatica: true })).toEqual({ sessoes: 20, palavras: 80 })
  })
})

describe('estadoDoTeto por edição', () => {
  it('na completa, a 6ª gravação não cabe', () => {
    expect(estadoDoTeto('sessoes', 5).cabe).toBe(false)
    expect(estadoDoTeto('sessoes', 4).cabe).toBe(true)
  })

  it('na estática, cabem 20 — e o aviso de "perto" começa em 16', () => {
    const e = { edicaoEstatica: true }
    expect(estadoDoTeto('sessoes', 5, e)).toMatchObject({ cabe: true, perto: false, teto: 20 })
    expect(estadoDoTeto('sessoes', 16, e).perto).toBe(true)
    expect(estadoDoTeto('sessoes', 19, e).cabe).toBe(true)
    expect(estadoDoTeto('sessoes', 20, e).cabe).toBe(false)
    expect(estadoDoTeto('palavras', 80, e).cabe).toBe(false)
  })
})

describe('motivoDoTeto diz o número da edição', () => {
  it('estática: 20 gravações', () => {
    expect(motivoDoTeto('sessoes', { edicaoEstatica: true })).toContain('20 gravações')
  })

  it('completa: 5 gravações e o convite para a conta', () => {
    const texto = motivoDoTeto('sessoes')
    expect(texto).toContain('5 gravações')
    expect(texto).toMatch(/Crie uma conta/)
  })
})
