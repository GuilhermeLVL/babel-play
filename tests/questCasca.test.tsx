// @vitest-environment jsdom
/**
 * A CASCA DO QUEST (maquete aprovada em 01/10/2026): o trilho de ícones, o Início de três caminhos, o
 * encerrar sem digitação e o resumo da sessão. Só apresentação: cada teste confere o que aparece e para
 * onde cada toque leva.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import TrilhoDoQuest from '../src/components/shell/TrilhoDoQuest'
import EncerrarNoQuest from '../src/components/views/captura/quest/EncerrarNoQuest'
import ResumoDaSessaoNoQuest from '../src/components/views/captura/quest/ResumoDaSessaoNoQuest'
import InicioDoQuest from '../src/components/views/quest/InicioDoQuest'
import type { AppMetrics } from '../src/data/api'
import { definirTelaNovaDoQuest, questNovo } from '../src/lib/dispositivo/telaNovaDoQuest'
import { EMPTY_PROGRESS } from '../src/lib/progress'
import type { Recording } from '../src/types'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const gravacao = (id: string, title: string): Recording => ({
  id,
  title,
  date: 'Ontem',
  durationStr: '38 min',
  wordCount: 120,
  type: 'audio',
  tags: [],
  status: 'Processado',
})

describe('TrilhoDoQuest', () => {
  const montar = (activeView = 'hub') => {
    const ir = vi.fn()
    const r = render(
      <TrilhoDoQuest
        activeView={activeView as never}
        onChangeView={ir}
        ageProfile="pro"
        darkMode={false}
        toggleDarkMode={() => {}}
        soundEnabled
        toggleSound={() => {}}
      />,
    )
    return { ir, ...r }
  }

  it('cinco destinos e "Mais", com o destino atual marcado', () => {
    const { container } = montar('play')
    const itens = [...container.querySelectorAll('.q-trilho .q-item')]
    expect(itens.map((i) => i.textContent)).toEqual(['Início', 'Capturar', 'Intérprete', 'Jogar', 'Biblioteca', 'Mais'])
    expect(container.querySelector('.q-item[aria-current="page"]')?.textContent).toBe('Jogar')
  })

  it('"Mais" abre o painel com o resto do menu, e escolher um destino o fecha', () => {
    const { ir } = montar()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))
    const painel = screen.getByRole('dialog')
    expect(painel.textContent).toContain('Ajustes')
    expect(painel.textContent).toContain('Vocabulário')
    expect(painel.textContent).toContain('Diagnóstico do aparelho')
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }))
    expect(ir).toHaveBeenCalledWith('settings')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sem conta, a Biblioteca (que só abriria o convite) sai do trilho e fica em "Mais"', () => {
    const { container } = render(
      <TrilhoDoQuest
        activeView="hub"
        onChangeView={() => {}}
        ageProfile="pro"
        semConta
        darkMode={false}
        toggleDarkMode={() => {}}
        soundEnabled
        toggleSound={() => {}}
      />,
    )
    const itens = [...container.querySelectorAll('.q-trilho .q-item')].map((i) => i.textContent)
    expect(itens).toEqual(['Início', 'Capturar', 'Intérprete', 'Jogar', 'Mais'])
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))
    expect(screen.getByRole('dialog').textContent).toContain('Biblioteca')
  })

  it('numa tela que só existe no "Mais", é o "Mais" que fica marcado', () => {
    const { container } = montar('settings')
    expect(container.querySelector('.q-item[aria-current="page"]')?.textContent).toBe('Mais')
  })
})

describe('InicioDoQuest', () => {
  const metricas = (dueToday: number) => ({ dueToday }) as AppMetrics

  it('com palavras vencendo, o segundo caminho é revisar (no máximo uma sessão de 20)', () => {
    const ir = vi.fn()
    render(
      <InicioDoQuest
        onChangeView={ir}
        recordings={[gravacao('a', 'Aula 7')]}
        progress={EMPTY_PROGRESS}
        metrics={metricas(57)}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Revisar 20 palavras/ }))
    expect(ir).toHaveBeenLastCalledWith('study')
    fireEvent.click(screen.getByRole('button', { name: /Legendar agora/ }))
    expect(ir).toHaveBeenLastCalledWith('capture')
    fireEvent.click(screen.getByRole('button', { name: /Continuar: Aula 7/ }))
    expect(ir).toHaveBeenLastCalledWith('analysis', { id: 'a' })
  })

  it('sem nada para revisar, o caminho vira o Vocabulário; sem sessão, não há "Continuar"', () => {
    const ir = vi.fn()
    render(<InicioDoQuest onChangeView={ir} recordings={[]} progress={EMPTY_PROGRESS} metrics={metricas(0)} />)
    fireEvent.click(screen.getByRole('button', { name: /Vocabulário/ }))
    expect(ir).toHaveBeenLastCalledWith('metrics')
    expect(screen.queryByRole('button', { name: /Continuar/ })).toBeNull()
  })
})

describe('InicioDoQuest sem conta', () => {
  it('só oferece o que funciona: legendar, conversar e jogar; nada de revisão nem de sessão salva', () => {
    const ir = vi.fn()
    render(
      <InicioDoQuest
        onChangeView={ir}
        recordings={[gravacao('a', 'Aula 7')]}
        progress={EMPTY_PROGRESS}
        metrics={{ dueToday: 57 } as AppMetrics}
        semConta
      />,
    )
    expect(screen.queryByRole('button', { name: /Revisar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Continuar/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Conversar/ }))
    expect(ir).toHaveBeenLastCalledWith('interprete')
  })
})

describe('EncerrarNoQuest', () => {
  it('salvar é o botão principal; descartar pede confirmação na mesma tela', () => {
    const aoSalvar = vi.fn()
    const aoDescartar = vi.fn()
    const aoContinuar = vi.fn()
    const { container } = render(
      <EncerrarNoQuest
        resumo="3 falas · 00:42"
        nFalas={3}
        aoContinuar={aoContinuar}
        aoSalvar={aoSalvar}
        aoDescartar={aoDescartar}
      />,
    )
    expect(container.querySelectorAll('.q-ctl.pri')).toHaveLength(1)
    fireEvent.click(screen.getByTestId('salvar-no-quest'))
    expect(aoSalvar).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(aoDescartar).not.toHaveBeenCalled()
    expect(screen.getByText(/As 3 falas desta captura somem/)).toBeTruthy()
    fireEvent.click(screen.getByTestId('confirmar-descarte'))
    expect(aoDescartar).toHaveBeenCalledTimes(1)
  })

  it('Esc continua gravando', () => {
    const aoContinuar = vi.fn()
    render(
      <EncerrarNoQuest resumo="" nFalas={1} aoContinuar={aoContinuar} aoSalvar={() => {}} aoDescartar={() => {}} />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(aoContinuar).toHaveBeenCalledTimes(1)
  })
})

describe('ResumoDaSessaoNoQuest', () => {
  const montar = (palavras: number | null, nuvem = 5, aparelho = 0) => {
    const acoes = { aoRevisar: vi.fn(), aoJogar: vi.fn(), aoAbrir: vi.fn(), aoNovaCaptura: vi.fn() }
    const r = render(
      <ResumoDaSessaoNoQuest
        minutos={38}
        falas={42}
        palavras={palavras}
        falasNaNuvem={nuvem}
        falasNoAparelho={aparelho}
        {...acoes}
      />,
    )
    return { ...acoes, ...r }
  }

  it('com palavras novas, o botão principal é revisar; nunca comprar', () => {
    const { container, aoRevisar } = montar(11)
    const principais = container.querySelectorAll('.q-ctl.pri')
    expect(principais).toHaveLength(1)
    expect(principais[0].textContent).toContain('Revisar as 11 palavras')
    fireEvent.click(principais[0])
    expect(aoRevisar).toHaveBeenCalledTimes(1)
    expect(screen.getByText('38 minutos, 42 falas')).toBeTruthy()
  })

  it('sem palavras (ou ainda fichando), o principal é abrir a sessão', () => {
    const { container, aoAbrir } = montar(null)
    const principal = container.querySelector('.q-ctl.pri') as HTMLElement
    expect(principal.textContent).toContain('Abrir a sessão')
    fireEvent.click(principal)
    expect(aoAbrir).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll('[data-testid="abrir-a-sessao"]')).toHaveLength(1)
  })

  it('sem conta, a saída principal é jogar com a sessão; revisar e abrir não aparecem', () => {
    const aoJogar = vi.fn()
    const { container } = render(
      <ResumoDaSessaoNoQuest
        minutos={5}
        falas={9}
        palavras={null}
        falasNaNuvem={9}
        falasNoAparelho={0}
        semConta
        aoRevisar={() => {}}
        aoJogar={aoJogar}
        aoAbrir={() => {}}
        aoNovaCaptura={() => {}}
      />,
    )
    const principal = container.querySelector('.q-ctl.pri') as HTMLElement
    expect(principal.textContent).toContain('Jogar com esta')
    fireEvent.click(principal)
    expect(aoJogar).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-testid="abrir-a-sessao"]')).toBeNull()
    expect(container.querySelectorAll('.q-num')).toHaveLength(2)
  })

  it('a linha da cota só aparece quando parte da sessão caiu para o aparelho', () => {
    expect(montar(3, 5, 0).container.querySelector('.q-aviso')).toBeNull()
    cleanup()
    expect(montar(3, 5, 4).container.querySelector('.q-aviso')).not.toBeNull()
  })
})

describe('a chave vale só no Quest', () => {
  it('fora do Quest, `questNovo()` é falso mesmo com a chave ligada', () => {
    definirTelaNovaDoQuest(true)
    expect(questNovo()).toBe(false)
    expect(document.documentElement.dataset.questNovo).toBe('false')
  })
})
