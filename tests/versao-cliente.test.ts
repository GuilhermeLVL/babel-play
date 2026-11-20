// @vitest-environment jsdom
/**
 * P0-7b — o cliente percebe que o servidor mudou de versão, e avisa UMA vez.
 *
 * Um deploy novo com a aba aberta: o bundle em memória é o velho e o servidor já é o novo. O
 * cabeçalho `x-babel-versao` de qualquer resposta `/api` diz isso; o `apiFetch` compara com a
 * versão embutida no bundle e dispara o evento. O aviso é discreto e não bloqueia — quem está no
 * meio de um exercício termina e atualiza quando quiser.
 */
import { describe, expect, it, vi } from 'vitest'

import { EVENTO_NOVA_VERSAO, ligarAvisoDeNovaVersao } from '../src/lib/avisoDeNovaVersao'
import { criarConferenciaDeVersao } from '../src/lib/versao'

describe('criarConferenciaDeVersao', () => {
  it('versão igual: não avisa', () => {
    const aviso = vi.fn()
    const conferir = criarConferenciaDeVersao('0.1.0+abc1234', aviso)
    expect(conferir('0.1.0+abc1234')).toBe(false)
    expect(aviso).not.toHaveBeenCalled()
  })

  it('sem cabeçalho (servidor antigo, resposta local, proxy que tirou): não avisa', () => {
    const aviso = vi.fn()
    const conferir = criarConferenciaDeVersao('0.1.0+abc1234', aviso)
    expect(conferir(null)).toBe(false)
    expect(conferir('')).toBe(false)
    expect(aviso).not.toHaveBeenCalled()
  })

  it('versão diferente: avisa UMA vez, por mais respostas que cheguem', () => {
    const aviso = vi.fn()
    const conferir = criarConferenciaDeVersao('0.1.0+abc1234', aviso)
    expect(conferir('0.2.0+def5678')).toBe(true)
    expect(conferir('0.2.0+def5678')).toBe(false)
    expect(conferir('0.3.0')).toBe(false)
    expect(aviso).toHaveBeenCalledTimes(1)
    expect(aviso).toHaveBeenCalledWith('0.2.0+def5678')
  })

  it('um lado sem o sha (bundle "0.1.0", Worker "0.1.0+<sha>"): mesma versão, não avisa', () => {
    // Foi o toast permanente do staging (diagnóstico do Safari, 22/10/2026): o build do front não via
    // o GIT_SHA que o Worker recebe como var. Sem o metadado de um dos lados, compara-se a base.
    const aviso = vi.fn()
    expect(criarConferenciaDeVersao('0.1.0', aviso)('0.1.0+0b82814')).toBe(false)
    expect(criarConferenciaDeVersao('0.1.0+0b82814', aviso)('0.1.0')).toBe(false)
    expect(aviso).not.toHaveBeenCalled()
  })

  it('um lado sem o sha mas base diferente: avisa', () => {
    const aviso = vi.fn()
    expect(criarConferenciaDeVersao('0.1.0', aviso)('0.2.0+0b82814')).toBe(true)
    expect(aviso).toHaveBeenCalledWith('0.2.0+0b82814')
  })

  it('os dois com sha, shas diferentes: avisa (deploy novo da mesma versão do pacote)', () => {
    const aviso = vi.fn()
    expect(criarConferenciaDeVersao('0.1.0+abc1234', aviso)('0.1.0+def5678')).toBe(true)
  })

  it('bundle sem versão conhecida (teste, ferramenta): nunca avisa', () => {
    const aviso = vi.fn()
    const conferir = criarConferenciaDeVersao('', aviso)
    expect(conferir('0.2.0')).toBe(false)
    expect(aviso).not.toHaveBeenCalled()
  })
})

describe('ligarAvisoDeNovaVersao', () => {
  it('o evento vira um aviso com a ação "Atualizar", que recarrega a página', () => {
    const mostrar = vi.fn()
    const recarregar = vi.fn()
    const desligar = ligarAvisoDeNovaVersao(mostrar, recarregar)
    window.dispatchEvent(new CustomEvent(EVENTO_NOVA_VERSAO, { detail: { versao: '0.2.0' } }))
    expect(mostrar).toHaveBeenCalledTimes(1)
    const { mensagem, rotuloDaAcao, aoAtualizar } = mostrar.mock.calls[0][0]
    expect(mensagem).toBe('Nova versão disponível')
    expect(rotuloDaAcao).toBe('Atualizar')
    aoAtualizar()
    expect(recarregar).toHaveBeenCalledTimes(1)
    desligar()
    window.dispatchEvent(new CustomEvent(EVENTO_NOVA_VERSAO, { detail: { versao: '0.3.0' } }))
    expect(mostrar).toHaveBeenCalledTimes(1)
  })
})
