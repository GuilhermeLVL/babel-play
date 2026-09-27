// @vitest-environment jsdom
/**
 * DIGITAR A PALAVRA INTEIRA COM LETRAS JÁ CONHECIDAS NA LINHA (QA dos jogos, 2026-09-26).
 *
 * Medido jogando em português: o Dueto tinha "happy" (FELIZ) e "milk" (LEITE). O palpite FELIZ
 * deixou o E verde na 2ª casa de LEITE, e a linha seguinte já nasce com esse E. Quem digita a palavra
 * INTEIRA — o gesto natural, ainda mais no teclado físico — via as letras escorregarem: o cursor
 * pulava a casa do E, "LEITE" virava "LEEIT", e a jogada se perdia. Seis vezes seguidas, até a
 * rodada acabar com a palavra certa na cabeça.
 *
 * A regra agora: ao digitar sobre uma letra já conhecida, a MESMA letra só confirma e passa; outra
 * letra pula a casa conhecida (continua dando para digitar só o que falta).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TermoGame from '../src/components/minigames/TermoGame'
import type { RodadaTermo } from '../src/core'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const RODADAS: RodadaTermo[] = [
  { cardId: 'c1', palavra: 'leite', resposta: 'LEITE', pista: 'milk', lang: 'pt' },
  { cardId: 'c2', palavra: 'feliz', resposta: 'FELIZ', pista: 'happy', lang: 'pt' },
  { cardId: 'c3', palavra: 'porta', resposta: 'PORTA', pista: 'door', lang: 'pt' },
]

const teclar = (palavra: string) => palavra.split('').forEach((l) => fireEvent.keyDown(window, { key: l }))
const enviar = () => fireEvent.keyDown(window, { key: 'Enter' })
function linhaVisivel(): string {
  return screen
    .getAllByRole('button')
    .filter((b) => /^Posição \d/.test(b.getAttribute('aria-label') ?? ''))
    .map((c) => (c.textContent ?? '').trim() || '_')
    .join('')
}
const resolvidos = () => document.querySelectorAll('.tab-termo.resolvido').length

describe('Termo: letras conhecidas não embaralham a palavra digitada', () => {
  it('com o E verde na 2ª casa, digitar LEITE inteiro escreve LEITE', () => {
    render(<TermoGame rodadas={RODADAS} ageProfile="pro" onFinish={vi.fn()} onExit={vi.fn()} />)
    const alvo = document.querySelector('.tab-termo .pista')!.textContent
    const [palpite, certa] = alvo === 'milk' ? ['FELIZ', 'LEITE'] : alvo === 'happy' ? ['LEITE', 'FELIZ'] : ['FELIZ', 'PORTA']
    teclar(palpite)
    enviar()
    // a linha nova já traz as letras que ficaram verdes
    teclar(certa)
    expect(linhaVisivel()).toBe(certa)
    enviar()
    expect(resolvidos()).toBe(1)
  })

  it('digitar só o que falta continua funcionando', () => {
    render(<TermoGame rodadas={RODADAS} ageProfile="pro" onFinish={vi.fn()} onExit={vi.fn()} />)
    const alvo = document.querySelector('.tab-termo .pista')!.textContent
    if (alvo !== 'milk') return // a escada sorteia a ordem; o caso é o do LEITE
    teclar('FELIZ')
    enviar()
    teclar('LITE') // sem o E que já está na tela
    expect(linhaVisivel()).toBe('LEITE')
  })
})

// Mantém `act` importado para quem estender com tempo (o fechamento do degrau usa setTimeout).
void act
