// @vitest-environment jsdom
/**
 * A EXPLICAÇÃO EM TRÊS TELAS (`src/components/minigames/polimento/ExplicacaoDoJogo.tsx`), porte de
 * `abrirOnb()` do protótipo (`jogos4.js:186-244`), e os textos extraídos dele
 * (`src/data/polimento/jogos-textos.json`). O que não pode mudar sem o desenho mudar: três telas, os
 * rótulos de cada uma, o que cada nível diz, as ajudas com o preço e a conta de quantas vezes valem.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

/**
 * O ESPAÇAMENTO DA FOLHA (10/10/2026). O protótipo esconde a pega da folha no computador sem devolver o
 * respiro de cima: a miniatura (e o rótulo, nas telas 2 e 3) colava na borda do cartão. No celular a folha
 * ficava encostada à esquerda, e a lista de ajudas vazia abria um vão dobrado. O acerto é do app
 * (`src/styles/polimentoExplicacao.css`); o CSS copiado do protótipo não é editado. Sem navegador, o que
 * dá para travar é a regra existir, estar ligada ao componente e as premissas dela continuarem de pé.
 */
describe('o espaçamento da folha da explicação', () => {
  /** A folha de estilo com os espaços e as quebras de linha reduzidos a um espaço (a formatação não importa). */
  const ler = (caminho: string) => readFileSync(resolve(__dirname, '..', caminho), 'utf8').replace(/\s+/g, ' ')
  /** O miolo de um bloco `@media`: vai até o próximo `@media` (ou até o fim da folha). */
  const bloco = (css: string, media: string) => {
    const inicio = css.indexOf(media)
    expect(inicio, media).toBeGreaterThan(-1)
    const fim = css.indexOf('@media', inicio + media.length)
    return css.slice(inicio, fim === -1 ? undefined : fim)
  }
  const acerto = ler('src/styles/polimentoExplicacao.css')
  const FOLHA = 'html dialog.folha-de-baixo.pj-como-folha:has(.pj-onb)'

  it('o componente carrega o acerto e monta a marcação que ele mira', () => {
    expect(ler('src/components/minigames/polimento/ExplicacaoDoJogo.tsx')).toContain(
      " import '../../../styles/polimentoExplicacao.css';",
    )
    render(<ExplicacaoDoJogo jogo="wordsearch" primeira aoFechar={() => undefined} />)
    const folha = document.querySelector('dialog.folha-de-baixo.pj-como-folha') as HTMLElement
    expect(folha.querySelector(':scope > .folha-pega')).not.toBeNull()
    expect(folha.querySelector(':scope > .folha-corpo > .pj-como.pj-onb')).not.toBeNull()
    /* A miniatura é o primeiro bloco da tela 1: é ela que encostava na borda. */
    expect(folha.querySelector('[data-pg="0"]')?.firstElementChild?.className).toBe('px-mini')
  })

  it('no computador a folha ganha em cima a margem que tem dos lados', () => {
    const regra = bloco(acerto, '@media (min-width: 721px)')
    expect(regra).toContain(`${FOLHA} { padding-top: 16px; }`)
  })

  it('as premissas: a base não tem respiro em cima e o protótipo esconde a pega no computador', () => {
    /* Se a base ganhar um `padding-top`, ou a pega voltar a aparecer, o respiro dobra: reveja o acerto. */
    const base = ler('src/styles/capturaNoCelular.css')
    const daFolha = base.slice(base.indexOf('dialog.folha-de-baixo {'), base.indexOf('dialog.folha-de-baixo[open]'))
    expect(daFolha).toContain(' padding: 0 16px calc(20px + env(safe-area-inset-bottom, 0px));')
    const doPrototipo = bloco(ler('src/styles/polimento/jogos4.css'), '@media (min-width: 721px)')
    expect(doPrototipo).toContain('dialog.folha-de-baixo.pj-como-folha .folha-pega { display: none; }')
    expect(doPrototipo).not.toContain('padding')
  })

  it('no celular a folha fica no centro (a regra do protótipo perdia para o !important da base)', () => {
    const regra = bloco(acerto, '@media (max-width: 720px)')
    expect(regra).toContain(`${FOLHA} { margin-inline: auto !important; }`)
    expect(ler('src/styles/capturaNoCelular.css')).toContain('dialog.folha-de-baixo { margin: auto 0 0 !important;')
    expect(ler('src/styles/polimento/telas.css')).toContain('dialog.folha-de-baixo { margin-inline: auto; }')
  })

  it('jogo sem ajudas: a lista vazia não ocupa um vão', () => {
    expect(acerto).toContain('.pj-onb .pj-onb-ajudas:empty { display: none; }')
    for (const jogo of ['cadavre', 'karaoke'] as const) {
      cleanup()
      render(<ExplicacaoDoJogo jogo={jogo} pagina={2} aoFechar={() => undefined} />)
      /* `:empty` só vale sem nenhum nó dentro, nem texto em branco. */
      expect(document.querySelector('.pj-onb-ajudas')?.childNodes, jogo).toHaveLength(0)
    }
    cleanup()
    render(<ExplicacaoDoJogo jogo="tenis" pagina={2} aoFechar={() => undefined} />)
    expect(document.querySelector('.pj-onb-ajudas')?.childNodes.length).toBeGreaterThan(0)
  })

  it('o painel "Como se joga" no celular: o preço da ajuda desce para a linha de baixo', () => {
    const regra = bloco(ler('src/styles/questJogarTelas.css'), '@media (max-width: 720px)')
    expect(regra).toContain('.qj-ajudas li { flex-wrap: wrap; }')
    expect(regra).toContain('.qj-ajudas li > span:first-of-type { flex-basis: calc(100% - 34px); }')
    /* O recuo da etiqueta é o do ícone (22 px) mais o vão da linha (12 px): os dois números andam juntos. */
    expect(regra).toContain('.qj-ajudas .q-tag { max-width: none; margin-left: 34px;')
  })
})
