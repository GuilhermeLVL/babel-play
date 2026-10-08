// @vitest-environment jsdom
/**
 * A EXPLICAÇÃO EM TRÊS TELAS (`src/components/minigames/polimento/ExplicacaoDoJogo.tsx`), porte de
 * `abrirOnb()` do protótipo (`jogos4.js:186-244`), e os textos extraídos dele
 * (`src/data/polimento/jogos-textos.json`). O que não pode mudar sem o desenho mudar: três telas, os
 * rótulos de cada uma, o que cada nível diz, as ajudas com o preço e a conta de quantas vezes valem.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ExplicacaoDoJogo from '../src/components/minigames/polimento/ExplicacaoDoJogo'
import { jogoTemNiveisNoDesenho, textosDoJogo, vezesDaAjuda } from '../src/components/minigames/polimento/textos'
import { type MinigameId, MINIGAMES } from '../src/core'
import { lerNivelDoJogo } from '../src/lib/jogos/nivelDoJogo'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const JOGOS = Object.keys(MINIGAMES) as MinigameId[]

describe('os textos do protótipo', () => {
  it('os 18 jogos têm título, o que treina, três passos e a miniatura', () => {
    for (const jogo of JOGOS) {
      const t = textosDoJogo(jogo)!
      expect(t, jogo).toBeTruthy()
      expect(t.titulo.length, jogo).toBeGreaterThan(3)
      expect(t.treina.length, jogo).toBeGreaterThan(10)
      expect(t.passos, jogo).toHaveLength(3)
      expect(t.mini, jogo).toContain('<')
    }
  })

  it('16 jogos têm níveis; Cadavre e Karaokê não', () => {
    const sem = JOGOS.filter((j) => !jogoTemNiveisNoDesenho(j))
    expect(sem.sort()).toEqual(['cadavre', 'karaoke'])
    expect(textosDoJogo('tenis')!.niveis).toEqual([
      ['facil', 'Bola lenta (11 s) e a primeira letra já vem'],
      ['medio', 'A regra normal do jogo'],
      ['dificil', 'Bola rápida (6 s). Cada acerto vale 5 pontos a mais'],
    ])
  })

  it('quantas vezes cada ajuda vale: +10 s 3/2/1, Ver resposta 2/1/1, as do jogo uma a mais e uma a menos', () => {
    const [letra, tempo, resposta] = textosDoJogo('tenis')!.ajudas
    expect(['facil', 'medio', 'dificil'].map((n) => vezesDaAjuda(letra, n as never))).toEqual([3, 2, 1])
    expect(['facil', 'medio', 'dificil'].map((n) => vezesDaAjuda(tempo, n as never))).toEqual([3, 2, 1])
    expect(['facil', 'medio', 'dificil'].map((n) => vezesDaAjuda(resposta, n as never))).toEqual([2, 1, 1])
    expect(resposta.custo).toBe('zera o combo')
    expect(tempo.custo).toBe('de graça')
  })
})

describe('a explicação em três telas', () => {
  const montar = (extra: Partial<Parameters<typeof ExplicacaoDoJogo>[0]> = {}) => {
    const aoFechar = vi.fn()
    render(<ExplicacaoDoJogo jogo="tenis" aoFechar={aoFechar} {...extra} />)
    return aoFechar
  }
  const tela = (n: number) => document.querySelector(`[data-pg="${n}"]`) as HTMLElement
  const botao = (acao: string) => document.querySelector(`[data-onb="${acao}"]`) as HTMLButtonElement

  it('é a folha do protótipo, com as três telas e o rodapé', () => {
    montar({ primeira: true })
    expect(document.querySelector('dialog.folha-de-baixo.pj-como-folha .folha-corpo .pj-como.pj-onb')).not.toBeNull()
    expect(tela(0).querySelector('.label-mono')?.textContent).toBe('Como se joga · 1 de 3')
    expect(tela(0).querySelector('h2')?.textContent).toBe('Rali cronometrado')
    expect(tela(0).querySelector('.px-mini')).not.toBeNull()
    expect(tela(0).querySelector('.pj-onb-treina')?.textContent).toContain('O que treina:')
    expect(tela(1).hidden).toBe(true)
    expect(botao('fechar').textContent).toBe('Pular explicação')
    expect(botao('voltar').hidden).toBe(true)
    expect(botao('prox').textContent).toBe('Próximo')

    fireEvent.click(botao('prox'))
    expect(tela(1).hidden).toBe(false)
    expect(tela(1).querySelector('.label-mono')?.textContent).toBe('Passo a passo · 2 de 3')
    expect(tela(1).querySelectorAll('ol li')).toHaveLength(3)
    expect(botao('voltar').hidden).toBe(false)

    fireEvent.click(botao('prox'))
    expect(tela(2).querySelector('.label-mono')?.textContent).toBe('Do seu jeito · 3 de 3')
    expect(tela(2).querySelectorAll('.pj-niv')).toHaveLength(3)
    expect(botao('prox').textContent).toBe('Começar')
    expect(document.querySelectorAll('.pj-onb-pontos i.on')).toHaveLength(1)
  })

  it('trocar o nível guarda na hora, refaz a conta das ajudas e muda o botão', () => {
    montar({ pagina: 2 })
    expect(botao('fechar').textContent).toBe('Fechar')
    expect(botao('prox').textContent).toBe('Continuar')
    expect(document.querySelector('[data-nivel-op="medio"]')?.getAttribute('aria-checked')).toBe('true')
    expect(document.querySelector('.pj-onb-ajudas')?.textContent).toContain('Primeira letra · 2 por rodada')

    fireEvent.click(document.querySelector('[data-nivel-op="facil"]') as HTMLElement)
    expect(lerNivelDoJogo('tenis')).toBe('facil')
    expect(document.querySelector('.pj-onb-ajudas')?.textContent).toContain('Primeira letra · 3 por rodada')
    expect(document.querySelector('.pj-onb-ajudas')?.textContent).toContain('Ver resposta · 2 por rodada')
    expect(botao('prox').textContent).toBe('Recomeçar no Fácil')
  })

  it('jogo sem níveis diz por quê', () => {
    render(<ExplicacaoDoJogo jogo="cadavre" pagina={2} aoFechar={() => undefined} />)
    expect(document.querySelector('[data-pg="2"] .pj-nivs')).toBeNull()
    expect(document.querySelector('[data-pg="2"]')?.textContent).toContain('Este jogo não tem níveis')
  })
})
