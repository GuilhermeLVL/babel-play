// @vitest-environment jsdom
/**
 * JOGAR NO META QUEST (maquete aprovada em 01/10/2026, tela 5): a ordem dos cartões, o motivo de quem
 * não abre no headset, o clique que abre a rodada e a Memória com seis pares.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { JOGOS } from '../src/components/views/play/jogos'
import { PARES_DA_MEMORIA_NO_QUEST, rodadaParaOQuest } from '../src/components/views/play/quest/jogosNoQuest'
import LobbyDoQuest from '../src/components/views/play/quest/LobbyDoQuest'
import type { EstadoDoJogo } from '../src/core/minigames/estadoDosJogos'
import type { RodadaMontada } from '../src/core/minigames/rodada'
import type { MinigameId, MinigameItem } from '../src/core/minigames/types'

/** O headset: sem voz de leitura, sem reconhecimento de voz do navegador, sem teclado físico. */
const QUEST = { vozDeLeitura: false, reconhecimentoDoNavegador: false, tecladoFisico: false }

const jogo = (id: MinigameId, estado: Partial<EstadoDoJogo> = {}) => ({
  ...JOGOS.find((j) => j.id === id)!,
  estado: { id, ok: true, disponiveis: 8, faltam: 0, fonte: 'baralho', tamanhoDaRodada: 8, ...estado } as EstadoDoJogo,
})

/** Com gravação: os jogos de áudio vivem das falas dela. A ordem de entrada é a do usuário. */
const comGravacao = [
  jogo('ditado', { fonte: 'falas' }),
  jogo('karaoke', { fonte: 'falas' }),
  jogo('escuta', { fonte: 'falas' }),
  jogo('memory'),
  jogo('wordsearch', { ok: false, disponiveis: 2, faltam: 2 }),
  jogo('blitz'),
]

const montar = (jogos = comGravacao, extra: Partial<React.ComponentProps<typeof LobbyDoQuest>> = {}) => {
  const aoJogar = vi.fn()
  const aoVerTelaCompleta = vi.fn()
  const { container } = render(
    <LobbyDoQuest
      jogos={jogos}
      ageProfile="pro"
      naTrilha={false}
      palavras={32}
      fonte="Inglês · Minhas palavras"
      notaDoBloqueio={(j) => `faltam ${j.estado.faltam} palavras`}
      aoJogar={aoJogar}
      aoVerTelaCompleta={aoVerTelaCompleta}
      recursos={QUEST}
      {...extra}
    />,
  )
  const cartoes = [...container.querySelectorAll<HTMLButtonElement>('.q-tile')]
  const cartao = (id: MinigameId) => cartoes.find((c) => c.dataset.jogo === id)!
  return { container, cartoes, cartao, aoJogar, aoVerTelaCompleta }
}

afterEach(cleanup)

describe('LobbyDoQuest', () => {
  it('na frente o que se joga apontando, depois o áudio da sessão, o teclado por último e os que não abrem no fim', () => {
    const { cartoes } = montar()
    expect(cartoes.map((c) => c.dataset.jogo)).toEqual(['memory', 'blitz', 'escuta', 'ditado', 'karaoke', 'wordsearch'])
    expect(cartoes.map((c) => c.querySelector('.q-tag')?.textContent)).toEqual([
      'Apontar',
      'Apontar',
      'Áudio da sessão',
      'Pede teclado',
      'Pede nota de voz',
      'Falta material',
    ])
  })

  it('o cabeçalho diz quantas palavras há e de onde vêm', () => {
    montar()
    expect(screen.getByText('32 palavras prontas')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Jogar' })).toBeTruthy()
    expect(screen.getByText('Inglês · Minhas palavras')).toBeTruthy()
  })

  it('quem não abre no headset fica apagado, desligado e com o motivo escrito', () => {
    const { cartao } = montar()
    const karaoke = cartao('karaoke')
    expect(karaoke.disabled).toBe(true)
    expect(karaoke.className).toContain('apagado')
    expect(karaoke.textContent).toContain('O headset não avalia a pronúncia.')

    const semMaterial = cartao('wordsearch')
    expect(semMaterial.disabled).toBe(true)
    expect(semMaterial.textContent).toContain('faltam 2 palavras')
  })

  it('pede digitação: continua jogável, com o aviso de que é melhor em outro aparelho', () => {
    const { cartao } = montar()
    const ditado = cartao('ditado')
    expect(ditado.disabled).toBe(false)
    expect(ditado.querySelector('.q-tag')?.className).toContain('off')
    expect(ditado.textContent).toContain('Melhor no computador ou no celular.')
  })

  it('sem gravação, o jogo de escuta dependeria da voz de leitura, que o headset não tem', () => {
    // Na trilha, `estadoDoJogo` troca a fala gravada pela palavra do baralho falada por TTS.
    const { cartao } = montar([jogo('memory'), jogo('escuta', { fonte: 'baralho' })], { naTrilha: true })
    const escuta = cartao('escuta')
    expect(escuta.disabled).toBe(true)
    expect(escuta.querySelector('.q-tag')?.textContent).toBe('Pede voz de leitura')
  })

  it('num aparelho com voz, reconhecimento e teclado nada fica apagado por causa do aparelho', () => {
    const { cartoes } = montar(comGravacao, {
      recursos: { vozDeLeitura: true, reconhecimentoDoNavegador: true, tecladoFisico: true },
    })
    expect(cartoes.filter((c) => c.disabled).map((c) => c.dataset.jogo)).toEqual(['wordsearch'])
  })

  it('o clique abre o jogo pelo mesmo caminho de sempre; o apagado não é um alvo', () => {
    const { cartao, aoJogar } = montar()
    fireEvent.click(cartao('memory'))
    fireEvent.click(cartao('karaoke'))
    expect(aoJogar).toHaveBeenCalledTimes(1)
    expect(aoJogar.mock.calls[0][0].id).toBe('memory')
  })

  it('a fonte e a tela completa continuam a um toque', () => {
    const aoTrocarFonte = vi.fn()
    const { aoVerTelaCompleta } = montar(comGravacao, { aoTrocarFonte })
    fireEvent.click(screen.getByRole('button', { name: /Inglês · Minhas palavras/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Tela completa' }))
    expect(aoTrocarFonte).toHaveBeenCalledTimes(1)
    expect(aoVerTelaCompleta).toHaveBeenCalledTimes(1)
  })

  it('o aviso traz, no máximo, uma ação', () => {
    const aoAgir = vi.fn()
    montar(comGravacao, { aviso: { texto: 'Você ainda não salvou palavras', acao: 'Capturar uma sessão', aoAgir } })
    expect(screen.getByRole('status').textContent).toContain('Você ainda não salvou palavras')
    fireEvent.click(screen.getByRole('button', { name: 'Capturar uma sessão' }))
    expect(aoAgir).toHaveBeenCalledTimes(1)
  })
})

describe('a Memória no headset', () => {
  const item = (n: number): MinigameItem => ({ prompt: `pista ${n}`, answer: `palavra${n}`, lang: 'en' })
  const rodada = (jogoDaRodada: MinigameId, quantos: number): RodadaMontada => {
    const itens = Array.from({ length: quantos }, (_, i) => item(i))
    return {
      jogo: jogoDaRodada,
      previa: itens.map((i) => ({ ref: i.answer, titulo: '8 letras' })),
      material: { tipo: 'itens', jogo: jogoDaRodada, itens },
    }
  }

  it('fica em seis pares, e a prévia mostra os mesmos seis', () => {
    const ajustada = rodadaParaOQuest(rodada('memory', 8))
    expect(ajustada.material.tipo === 'itens' && ajustada.material.itens.map((i) => i.answer)).toEqual(
      Array.from({ length: PARES_DA_MEMORIA_NO_QUEST }, (_, i) => `palavra${i}`),
    )
    expect(ajustada.previa.map((p) => p.ref)).toEqual(Array.from({ length: 6 }, (_, i) => `palavra${i}`))
  })

  it('rodada pequena e os outros jogos passam intactos', () => {
    const pequena = rodada('memory', 5)
    const duelo = rodada('blitz', 20)
    expect(rodadaParaOQuest(pequena)).toBe(pequena)
    expect(rodadaParaOQuest(duelo)).toBe(duelo)
  })
})
