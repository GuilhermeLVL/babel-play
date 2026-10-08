// @vitest-environment jsdom
/**
 * A CASCA DO QUEST (maquete aprovada em 01/10/2026): o trilho de ícones, o Início de três caminhos, o
 * encerrar sem digitação e o resumo da sessão. Só apresentação: cada teste confere o que aparece e para
 * onde cada toque leva.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* O APARELHO: o headset, salvo nos casos "no computador". O desenho novo vale nos dois; o que é do
   aparelho (a vibração do controle, o diagnóstico no menu, o atalho da busca) pergunta por ele. */
const aparelho = vi.hoisted(() => ({ tipo: 'quest' as string }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...real, perfilDoDispositivo: () => ({ ...real.perfilDoDispositivo(), tipo: aparelho.tipo }) }
})

import TrilhoDoQuest from '../src/components/shell/TrilhoDoQuest'
import EncerrarNoQuest from '../src/components/views/captura/quest/EncerrarNoQuest'
import ResumoDaSessaoNoQuest from '../src/components/views/captura/quest/ResumoDaSessaoNoQuest'
import InicioDoQuest from '../src/components/views/quest/InicioDoQuest'
import type { AppMetrics } from '../src/data/api'
import {
  definirDesenhoNovoNoComputador,
  definirTelaNovaDoQuest,
  questNovo,
} from '../src/lib/dispositivo/telaNovaDoQuest'
import { EMPTY_PROGRESS } from '../src/lib/progress'
import type { Recording } from '../src/types'

beforeEach(() => {
  aparelho.tipo = 'quest'
})
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

  it('sete destinos e "Mais", com o destino atual marcado', () => {
    const { container } = montar('play')
    const itens = [...container.querySelectorAll('.q-trilho .q-item')]
    expect(itens.map((i) => i.textContent)).toEqual([
      'Início',
      'Capturar',
      'Intérprete',
      'Jogar',
      'Biblioteca',
      'Vocabulário',
      'Estatísticas',
      'Mais',
    ])
    expect(container.querySelector('.q-item[aria-current="page"]')?.textContent).toBe('Jogar')
  })

  it('"Mais" abre o painel com o resto do menu, e escolher um destino o fecha', () => {
    const { ir } = montar()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))
    const painel = screen.getByRole('dialog')
    expect(painel.textContent).toContain('Ajustes')
    expect(painel.textContent).toContain('Personalizar')
    expect(painel.textContent).toContain('Diagnóstico do aparelho')
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }))
    expect(ir).toHaveBeenCalledWith('settings')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sem conta, Biblioteca e Vocabulário (que só abririam o convite) ficam em "Mais"; entram Estatísticas e Personalizar', () => {
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
    expect(itens).toEqual(['Início', 'Capturar', 'Intérprete', 'Jogar', 'Estatísticas', 'Personalizar', 'Mais'])
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))
    expect(screen.getByRole('dialog').textContent).toContain('Biblioteca')
    expect(screen.getByRole('dialog').textContent).toContain('Vocabulário')
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

describe('o que a primeira versão da casca tinha deixado de fora (auditoria de 02/10/2026)', () => {
  const progresso = {
    ...EMPTY_PROGRESS,
    available: true,
    level: 4,
    xp: 320,
    xpIntoLevel: 20,
    xpForLevel: 100,
    levelPct: 20,
    seeds: 45,
  }
  const sessao = (id: string, title: string, type: Recording['type']): Recording => ({ ...gravacao(id, title), type })

  it('Início: sem métricas, a forma da linha; com elas, nível, XP, Seeds e a frase da ofensiva, levando às Estatísticas', () => {
    const ir = vi.fn()
    const { container, rerender } = render(
      <InicioDoQuest onChangeView={ir} recordings={[]} progress={EMPTY_PROGRESS} metrics={null} />,
    )
    expect(container.querySelector('.q-esqueleto')).not.toBeNull()
    expect(screen.queryByTestId('progresso-no-inicio')).toBeNull()
    rerender(
      <InicioDoQuest onChangeView={ir} recordings={[]} progress={progresso} metrics={{ dueToday: 0 } as AppMetrics} />,
    )
    const linha = screen.getByTestId('progresso-no-inicio')
    expect(linha.textContent).toContain('Nível 4')
    expect(linha.textContent).toContain('45 Seeds')
    expect(linha.textContent).toContain('Uma revisão hoje começa a sua ofensiva.')
    expect(linha.textContent).toContain('Faltam 80 XP')
    fireEvent.click(linha)
    expect(ir).toHaveBeenLastCalledWith('estatisticas')
  })

  it('Início: as sessões recentes têm o filtro por tipo, com contagem, e o vazio da categoria', () => {
    const ir = vi.fn()
    render(
      <InicioDoQuest
        onChangeView={ir}
        recordings={[sessao('a', 'Aula 7', 'audio'), sessao('b', 'Vídeo do canal', 'video')]}
        progress={progresso}
        metrics={{ dueToday: 0 } as AppMetrics}
      />,
    )
    const recentes = screen.getByTestId('recentes-no-inicio')
    expect(recentes.querySelectorAll('.q-linha')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /^YouTube/ }))
    expect(recentes.querySelectorAll('.q-linha')).toHaveLength(1)
    expect(recentes.textContent).toContain('Vídeo do canal')
    fireEvent.click(screen.getByRole('button', { name: /^Documentos/ }))
    expect(recentes.querySelectorAll('.q-linha')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas as categorias' }))
    expect(recentes.querySelectorAll('.q-linha')).toHaveLength(2)
  })

  it('Início: com conta e nenhuma sessão, o vazio leva a capturar', () => {
    const ir = vi.fn()
    render(
      <InicioDoQuest onChangeView={ir} recordings={[]} progress={progresso} metrics={{ dueToday: 0 } as AppMetrics} />,
    )
    expect(screen.getByText('Nenhuma sessão ainda')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Nova captura/ }))
    expect(ir).toHaveBeenLastCalledWith('capture')
  })

  it('Início: as missões do dia com o progresso do servidor e os congelamentos guardados', () => {
    render(
      <InicioDoQuest
        onChangeView={() => {}}
        recordings={[]}
        progress={progresso}
        metrics={{ dueToday: 0 } as AppMetrics}
        missoes={
          {
            missoes: [{ id: 'm1', tipo: 'revisar', alvo: 20, atual: 5 }],
            recompensa: { seeds: 15, xp: 20 },
            metaConcluida: false,
            congelamentos: 2,
          } as never
        }
      />,
    )
    const missoes = screen.getByTestId('missoes-no-inicio')
    expect(missoes.textContent).toContain('Revise 20 palavras')
    expect(missoes.textContent).toContain('5/20')
    expect(missoes.textContent).toContain('2 congelamentos guardados')
  })

  it('Início: o cabeçalho fala a língua do perfil (kids, sênior)', () => {
    const { rerender } = render(
      <InicioDoQuest onChangeView={() => {}} recordings={[]} progress={progresso} metrics={null} ageProfile="kids" />,
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Pronto para os desafios?')
    rerender(
      <InicioDoQuest onChangeView={() => {}} recordings={[]} progress={progresso} metrics={null} ageProfile="senior" />,
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Bem-vindo ao Babel Play')
  })

  const trilho = (extra: Record<string, unknown> = {}) => {
    const ir = vi.fn()
    render(
      <TrilhoDoQuest
        activeView="hub"
        onChangeView={ir}
        ageProfile="pro"
        darkMode={false}
        toggleDarkMode={() => {}}
        soundEnabled
        toggleSound={() => {}}
        {...extra}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Mais/ }))
    return ir
  }

  it('painel Mais: a busca abre a busca global e fecha o painel', () => {
    const aoBuscar = vi.fn()
    trilho({ aoBuscar })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(aoBuscar).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('painel Mais: a aba Avisos, vazia, e "Preferências de notificação" pede a aba certa de Ajustes', () => {
    const ir = trilho()
    fireEvent.click(screen.getByRole('tab', { name: /Avisos/ }))
    expect(screen.getByTestId('avisos-no-quest').textContent).toContain('Nada por aqui')
    fireEvent.click(screen.getByRole('button', { name: /Preferências de notificação/ }))
    expect(ir).toHaveBeenLastCalledWith('settings', { aba: 'notificacoes' })
  })

  it('painel Mais: a vibração ao apontar roda entre forte, desligada e suave, e fica guardada', () => {
    trilho()
    const botao = screen.getByTestId('vibracao-do-quest')
    expect(botao.textContent).toContain('forte')
    fireEvent.click(botao)
    expect(botao.textContent).toContain('desligada')
    fireEvent.click(botao)
    expect(botao.textContent).toContain('suave')
    expect(localStorage.getItem('babel.quest.vibracao')).toBe('suave')
  })

  it('painel Mais: diz quem eu sou (o estado da conta) e, onde há login, oferece entrar', () => {
    const aoEntrar = vi.fn()
    trilho({ aoEntrar })
    expect(screen.getByTestId('conta-no-quest').textContent).toMatch(
      /conta local|sem conta|sessão ativa|edição de demonstração/,
    )
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

  it('o que foi dito ocupa o meio: cada fala com a tradução, e a sem tradução só com o original', () => {
    const { container } = render(
      <ResumoDaSessaoNoQuest
        minutos={1}
        falas={2}
        palavras={3}
        falasNaNuvem={2}
        falasNoAparelho={0}
        ditas={[
          { id: 'a', original: 'Where is the station?', traducao: 'Onde fica a estação?' },
          { id: 'b', original: 'Obrigado.', traducao: '', minha: true },
        ]}
        aoRevisar={() => {}}
        aoJogar={() => {}}
        aoAbrir={() => {}}
        aoNovaCaptura={() => {}}
      />,
    )
    const falas = [...container.querySelectorAll('.q-resumo-falas li')]
    expect(falas.map((li) => li.textContent)).toEqual(['Where is the station?Onde fica a estação?', 'Obrigado.'])
    expect(falas.map((li) => li.getAttribute('data-fonte'))).toEqual(['system', 'mic'])
  })

  it('sem falas para mostrar, o cartão do que foi dito não aparece', () => {
    expect(montar(3).container.querySelector('.q-resumo-falas')).toBeNull()
  })

  it('a linha da cota só aparece quando parte da sessão caiu para o aparelho', () => {
    expect(montar(3, 5, 0).container.querySelector('.q-aviso')).toBeNull()
    cleanup()
    expect(montar(3, 5, 4).container.querySelector('.q-aviso')).not.toBeNull()
  })
})

describe('a casca no computador com o desenho novo', () => {
  const montar = (extra: Record<string, unknown> = {}) => {
    aparelho.tipo = 'desktop-com-gpu'
    const ir = vi.fn()
    const aoBuscar = vi.fn()
    const r = render(
      <TrilhoDoQuest
        activeView="hub"
        onChangeView={ir}
        aoBuscar={aoBuscar}
        ageProfile="pro"
        darkMode={false}
        toggleDarkMode={() => {}}
        soundEnabled
        toggleSound={() => {}}
        {...extra}
      />,
    )
    return { ir, aoBuscar, ...r }
  }

  it('os mesmos sete destinos, e a busca no próprio trilho com o atalho à vista', () => {
    const { container, aoBuscar } = montar()
    const itens = [...container.querySelectorAll('.q-trilho .q-item')]
    expect(itens.map((i) => i.querySelector('span')?.textContent)).toEqual([
      'Início',
      'Capturar',
      'Intérprete',
      'Jogar',
      'Biblioteca',
      'Vocabulário',
      'Estatísticas',
      'Buscar',
      'Mais',
    ])
    const busca = screen.getByTestId('busca-no-trilho')
    expect(busca.textContent).toMatch(/Buscar(Ctrl|⌘) K/)
    expect(busca.getAttribute('aria-keyshortcuts')).toBe('Control+K Meta+K')
    expect(busca.getAttribute('title')).toContain('Ctrl+K')
    fireEvent.click(busca)
    expect(aoBuscar).toHaveBeenCalledTimes(1)
    // Não abre o painel: a busca é um diálogo próprio.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('painel Mais: sem a vibração do controle e sem o diagnóstico; o resto continua', () => {
    const { ir, aoBuscar } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))
    const painel = screen.getByRole('dialog')
    expect(screen.queryByTestId('vibracao-do-quest')).toBeNull()
    expect(painel.textContent).not.toContain('Vibração')
    expect(painel.textContent).not.toContain('Diagnóstico do aparelho')
    for (const destino of ['Personalizar', 'Sobre', 'Ajustes', 'Seu perfil', 'Ajuda e suporte'])
      expect(painel.textContent).toContain(destino)
    expect(painel.textContent).toMatch(/Tema (claro|escuro)/)
    expect(painel.textContent).toContain('Som dos toques: ligado')
    expect(screen.getByTestId('conta-no-quest')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Avisos/ })).toBeTruthy()

    const busca = screen.getByRole('button', { name: 'Buscar' })
    expect(busca.getAttribute('aria-keyshortcuts')).toBe('Control+K Meta+K')
    fireEvent.click(busca)
    expect(aoBuscar).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda e suporte' }))
    expect(ir).toHaveBeenLastCalledWith('ajuda')
  })

  it('painel Mais: Planos e Premium é uma entrada fixa, antes dos interruptores (telas2.js:119-124)', () => {
    const { ir } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))
    const entrada = screen.getByTestId('planos-no-mais')
    expect(entrada.className).toContain('px-entrada-premium')
    expect(entrada.querySelector('b')?.textContent).toBe('Planos e Premium')
    expect(entrada.nextElementSibling?.className).toContain('q-faixa-do-mais')
    fireEvent.click(entrada)
    expect(ir).toHaveBeenLastCalledWith('planos')
  })

  it('sem quem abra a busca, o trilho não inventa o botão', () => {
    montar({ aoBuscar: undefined })
    expect(screen.queryByTestId('busca-no-trilho')).toBeNull()
  })
})

describe('no headset, a casca não ganha nada do computador', () => {
  it('a busca continua só no painel Mais, sem dica de tecla', () => {
    render(
      <TrilhoDoQuest
        activeView="hub"
        onChangeView={() => {}}
        aoBuscar={() => {}}
        ageProfile="pro"
        darkMode={false}
        toggleDarkMode={() => {}}
        soundEnabled
        toggleSound={() => {}}
      />,
    )
    expect(screen.queryByTestId('busca-no-trilho')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))
    expect(screen.getByRole('button', { name: 'Buscar' }).hasAttribute('aria-keyshortcuts')).toBe(false)
  })
})

describe('onde o desenho novo vale', () => {
  it('no celular, `questNovo()` é falso mesmo com as duas chaves ligadas', () => {
    aparelho.tipo = 'celular-bom'
    definirTelaNovaDoQuest(true)
    definirDesenhoNovoNoComputador(true)
    expect(questNovo()).toBe(false)
    expect(document.documentElement.dataset.questNovo).toBe('false')
  })

  it('no computador, desligado de fábrica; liga e desliga com a escolha de Ajustes', () => {
    aparelho.tipo = 'desktop-sem-gpu'
    definirTelaNovaDoQuest(true)
    expect(questNovo()).toBe(false)
    definirDesenhoNovoNoComputador(true)
    expect(questNovo()).toBe(true)
    expect(document.documentElement.dataset.questNovo).toBe('true')
    definirDesenhoNovoNoComputador(false)
    expect(questNovo()).toBe(false)
    expect(document.documentElement.dataset.questNovo).toBe('false')
  })
})
