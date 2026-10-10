// @vitest-environment jsdom
/**
 * JOGAR NA TELA ENXUTA (protótipo `telas-enxutas`, `enxugarJogar()` e `abrirOrganizar()` de
 * `enxuto.js:207-343`): no computador e no celular, as mesmas funções com menos coisas à vista.
 *
 *  · o cartão "Sugestão para hoje" sobe para logo abaixo do título, com "Começar" como ÚNICO botão cheio;
 *  · "Partida rápida" vira o link "Sortear um jogo" dentro do cartão; "Por que este?" e "Outra sugestão"
 *    viram links de texto com ícone (`.ex-lig`);
 *  · os três painéis viram um, "Buscar e organizar", com as três seções — e cada função antiga continua
 *    alcançável e chamando o que chamava;
 *  · no headset nada muda (`tests/lobbyDoQuest.test.tsx` cobre a tela de lá).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Target } from 'lucide-react'
import React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const aparelho = vi.hoisted(() => ({ tipo: 'desktop-com-gpu' as 'quest' | 'desktop-com-gpu' }))
vi.mock('../src/lib/dispositivo/perfil', async (orig) => {
  const real = await orig<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...real, perfilDoDispositivo: () => ({ ...real.perfilDoDispositivo(), tipo: aparelho.tipo }) }
})

import { JOGOS } from '../src/components/views/play/jogos'
import LobbyDoQuest from '../src/components/views/play/quest/LobbyDoQuest'
import type { EstadoDoJogo } from '../src/core/minigames/estadoDosJogos'
import type { MinigameId } from '../src/core/minigames/types'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

const PC = { vozDeLeitura: true, reconhecimentoDoNavegador: true, tecladoFisico: true }

beforeAll(() => prepararDialogoNoJsdom())
beforeEach(() => {
  aparelho.tipo = 'desktop-com-gpu'
  localStorage.clear()
})
afterEach(cleanup)

const jogo = (id: MinigameId, estado: Partial<EstadoDoJogo> = {}) => ({
  ...JOGOS.find((j) => j.id === id)!,
  estado: { id, ok: true, disponiveis: 8, faltam: 0, fonte: 'baralho', tamanhoDaRodada: 8, ...estado } as EstadoDoJogo,
})
const JOGOS_DA_TELA = [
  jogo('ditado', { fonte: 'falas' }),
  jogo('karaoke', { fonte: 'falas' }),
  jogo('escuta', { fonte: 'falas' }),
  jogo('memory'),
  jogo('wordsearch', { ok: false, disponiveis: 2, faltam: 2 }),
  jogo('blitz'),
]

function montar(extra: Partial<React.ComponentProps<typeof LobbyDoQuest>> = {}) {
  const acoes = {
    aoJogar: vi.fn(),
    aoVerTelaCompleta: vi.fn(),
    aoTrocarFonte: vi.fn(),
    aoPartidaRapida: vi.fn(),
    aoTrocarCategoria: vi.fn(),
    aoBuscar: vi.fn(),
    aoTrocarHabilidade: vi.fn(),
    aoLimparFiltros: vi.fn(),
    aoFavoritar: vi.fn(),
    aoComoSeJoga: vi.fn(),
    aoTrocarPrevia: vi.fn(),
    aoMover: vi.fn(),
    aoOutraSugestao: vi.fn(),
    aoVerRecordes: vi.fn(),
    aoVerMapa: vi.fn(),
    aoAbrirCuradoria: vi.fn(),
    aoTrocarDiagnostico: vi.fn(),
  }
  const { container } = render(
    <LobbyDoQuest
      jogos={JOGOS_DA_TELA}
      ageProfile="pro"
      naTrilha={false}
      palavras={32}
      fonte="inglês · Minhas gravações"
      notaDoBloqueio={(j) => `faltam ${j.estado.faltam} palavras`}
      aoJogar={acoes.aoJogar}
      aoVerTelaCompleta={acoes.aoVerTelaCompleta}
      aoTrocarFonte={acoes.aoTrocarFonte}
      recursos={PC}
      aoPartidaRapida={acoes.aoPartidaRapida}
      categoria="todos"
      aoTrocarCategoria={acoes.aoTrocarCategoria}
      contagens={{ todos: 6, classicos: 6, favoritos: 1 }}
      busca=""
      aoBuscar={acoes.aoBuscar}
      habilidade="todas"
      aoTrocarHabilidade={acoes.aoTrocarHabilidade}
      aoLimparFiltros={acoes.aoLimparFiltros}
      favoritos={['blitz']}
      aoFavoritar={acoes.aoFavoritar}
      aoComoSeJoga={acoes.aoComoSeJoga}
      previa
      aoTrocarPrevia={acoes.aoTrocarPrevia}
      ordem={JOGOS_DA_TELA}
      aoMover={acoes.aoMover}
      sugestao={{
        jogo: JOGOS_DA_TELA[3],
        titulo: 'Revisar 12 palavras que voltaram a vencer',
        porque: [[Target, '12 palavras voltaram a vencer hoje.']],
      }}
      aoOutraSugestao={acoes.aoOutraSugestao}
      aoVerRecordes={acoes.aoVerRecordes}
      aoVerMapa={acoes.aoVerMapa}
      curadoria={{ n: 7, aoAbrir: acoes.aoAbrirCuradoria }}
      diagnostico={{ ligado: false, aoTrocar: acoes.aoTrocarDiagnostico, itens: [] }}
      trilha={<div className="qj-trilha" />}
      {...extra}
    />,
  )
  const palco = container.querySelector('.quest-jogar') as HTMLElement
  return { container, palco, acoes }
}
const painel = () => within(screen.getByRole('dialog'))
const abrirOrganizar = () => fireEvent.click(screen.getByRole('button', { name: 'Buscar e organizar os jogos' }))
const secao = (nome: string) => painel().getByRole('tab', { name: nome })

describe('Jogar na tela enxuta: a arrumação (enxuto.js:220-272)', () => {
  it('o cartão da sugestão sobe para logo abaixo do título, a trilha vem em seguida e as abas colam na grade', () => {
    const { palco } = montar()
    expect(palco.classList.contains('ex-jogar')).toBe(true)
    const ordem = [...palco.children].map((x) => x.className.split(' ')[0] || x.id)
    expect(ordem.slice(0, 4)).toEqual(['q-cab', 'q-cartao', 'qj-trilha', 'qj-ferramentas'])
    expect(palco.querySelector('.qj-ferramentas')?.nextElementSibling?.id).toBe('grade-de-jogos')
  })

  it('"Começar" é o único botão cheio da tela, e começa o jogo sugerido', () => {
    const { palco, acoes } = montar()
    const cheios = palco.querySelectorAll('.q-ctl.pri')
    expect(cheios).toHaveLength(1)
    expect(cheios[0].textContent).toBe('Começar')
    expect(cheios[0].closest('.qj-sugestao-linha')).not.toBeNull()
    fireEvent.click(cheios[0])
    expect(acoes.aoJogar.mock.calls[0][0].id).toBe('memory')
  })

  it('"Partida rápida" sai do cabeçalho e vira o link "Sortear um jogo" do cartão, com a mesma função', () => {
    const { palco, acoes } = montar()
    expect(screen.queryByRole('button', { name: 'Partida rápida' })).toBeNull()
    expect(palco.querySelector('.q-cab .q-ctl')).toBeNull()
    const sortear = screen.getByRole('button', { name: 'Sortear um jogo' })
    expect(sortear.className).toBe('ex-lig')
    expect(sortear.closest('.qj-sugestao')).not.toBeNull()
    fireEvent.click(sortear)
    expect(acoes.aoPartidaRapida).toHaveBeenCalledTimes(1)
  })

  it('"Por que este?" e "Outra sugestão" são links de texto com ícone, na ordem do protótipo', () => {
    const { palco, acoes } = montar()
    const ligs = [...palco.querySelectorAll('.ex-ligs > .ex-lig')] as HTMLElement[]
    expect(ligs.map((b) => [b.dataset.ex, b.textContent])).toEqual([
      ['porque', 'Por que este?'],
      ['outra', 'Outra sugestão'],
      ['sortear', 'Sortear um jogo'],
    ])
    expect(ligs.every((b) => !!b.querySelector('svg'))).toBe(true)
    /* Nenhum botão com caixa sobra no cartão além do "Começar". */
    expect(palco.querySelectorAll('.qj-sugestao .q-ctl')).toHaveLength(1)
    expect(palco.querySelector('.qj-sugestao .q-acoes')).toBeNull()

    expect(screen.queryByText('12 palavras voltaram a vencer hoje.')).toBeNull()
    fireEvent.click(ligs[0])
    expect(screen.getByText('12 palavras voltaram a vencer hoje.')).toBeTruthy()
    expect(ligs[0].getAttribute('aria-expanded')).toBe('true')
    expect(ligs[0].textContent).toBe('Esconder o porquê')
    fireEvent.click(ligs[1])
    expect(acoes.aoOutraSugestao).toHaveBeenCalledTimes(1)
  })

  it('o chip da fonte fica no cabeçalho, com o nome num span que encolhe', () => {
    const { palco, acoes } = montar()
    const fonte = palco.querySelector('.q-cab > .q-chip') as HTMLElement
    expect(fonte.querySelector('.ex-fonte-txt')?.textContent).toBe('Inglês · Minhas gravações')
    fireEvent.click(fonte)
    expect(acoes.aoTrocarFonte).toHaveBeenCalledTimes(1)
  })

  it('sem sugestão (nenhum jogo pronto), o sorteio continua à mão', () => {
    const { palco, acoes } = montar({ sugestao: null })
    expect(palco.querySelector('.qj-sugestao')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sortear um jogo' }))
    expect(acoes.aoPartidaRapida).toHaveBeenCalledTimes(1)
  })
})

describe('"Buscar e organizar": um painel com as três seções (enxuto.js:300-343)', () => {
  it('três chips viram um; o painel abre na busca, com as três seções em abas', () => {
    const { palco } = montar()
    const chips = palco.querySelectorAll('.qj-ferramentas > .q-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0].className).toBe('q-chip ex-organizar')
    expect(chips[0].textContent).toBe('Buscar e organizar')
    for (const antigo of ['Buscar e filtrar', 'Favoritos e ordem', 'Opções'])
      expect(screen.queryByRole('button', { name: antigo })).toBeNull()

    abrirOrganizar()
    const d = screen.getByRole('dialog')
    expect(d.className).toContain('qj qj-painel largo ex-organizar-dlg')
    expect(d.querySelector('h2')?.textContent).toBe('Buscar e organizar')
    const abas = [...d.querySelectorAll('.ex-org-abas > .q-abas.q-seg[role="tablist"] > .q-aba')]
    expect(abas.map((a) => [a.getAttribute('aria-label'), a.textContent, a.getAttribute('aria-selected')])).toEqual([
      ['Buscar e filtrar', 'Buscar', 'true'],
      ['Favoritos e ordem', 'Favoritos e ordem', 'false'],
      ['Opções', 'Opções', 'false'],
    ])
    expect(d.querySelector('.dlg-corpo')?.getAttribute('role')).toBe('tabpanel')
    expect(d.querySelector('.qj-nota')?.textContent).toBe('Por nome, por mecânica ou pelo que o jogo treina.')
    /* No computador a busca abre em foco (`enxuto.js:342`). */
    expect(painel().getByRole('searchbox', { name: 'Buscar jogo' }).hasAttribute('data-autofocus')).toBe(true)
  })

  it('seção Buscar: a busca, o filtro de habilidade e o limpar, como no painel de antes', () => {
    const { acoes } = montar()
    abrirOrganizar()
    fireEvent.change(painel().getByRole('searchbox', { name: 'Buscar jogo' }), { target: { value: 'mem' } })
    expect(acoes.aoBuscar).toHaveBeenCalledWith('mem')
    fireEvent.click(painel().getByRole('radio', { name: 'Vocabulário' }))
    expect(acoes.aoTrocarHabilidade).toHaveBeenCalledWith('vocab')
    fireEvent.click(painel().getByRole('button', { name: 'Limpar filtros e busca' }))
    expect(acoes.aoLimparFiltros).toHaveBeenCalledTimes(1)
    fireEvent.click(painel().getByRole('button', { name: 'Ver 6 jogos' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('seção Favoritos e ordem: fixa, move e abre o "como se joga", sem fechar o painel', () => {
    const { acoes } = montar()
    abrirOrganizar()
    fireEvent.click(secao('Favoritos e ordem'))
    const d = screen.getByRole('dialog')
    expect(secao('Favoritos e ordem').getAttribute('aria-selected')).toBe('true')
    expect(d.querySelector('.qj-nota')?.textContent).toContain('Fixe os favoritos no topo')
    /* O painel lista os jogos como a grade os mostra: o favorito na frente, o que não abre no fim. */
    const linhas = [...d.querySelectorAll<HTMLElement>('[data-ordem]')]
    const naGrade = linhas.map((l) => l.dataset.ordem)
    expect(naGrade).toHaveLength(6)
    expect([naGrade[0], naGrade[5]]).toEqual(['blitz', 'wordsearch'])
    const escuta = within(linhas[naGrade.indexOf('escuta')])
    fireEvent.click(escuta.getByRole('button', { name: /^Favoritar/ }))
    expect(acoes.aoFavoritar.mock.calls[0][0].id).toBe('escuta')
    fireEvent.click(escuta.getByRole('button', { name: /^Mover para antes/ }))
    fireEvent.click(escuta.getByRole('button', { name: /^Mover para depois/ }))
    expect(acoes.aoMover.mock.calls.map(([j, dir, visiveis]) => [j.id, dir, visiveis])).toEqual([
      ['escuta', -1, naGrade],
      ['escuta', 1, naGrade],
    ])
    fireEvent.click(escuta.getByRole('button', { name: /^Como se joga/ }))
    expect(acoes.aoComoSeJoga.mock.calls[0][0].id).toBe('escuta')
    fireEvent.click(painel().getByRole('button', { name: 'Pronto' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('seção Opções: a prévia, o diagnóstico, os recordes, o mapa, a curadoria e a tela de sempre', () => {
    const { acoes } = montar()
    const abrir = () => {
      abrirOrganizar()
      fireEvent.click(secao('Opções'))
    }
    abrir()
    expect(screen.getByRole('dialog').querySelector('.qj-nota')?.textContent).toBe(
      'A rodada, o seu material e a ordem dos jogos.',
    )
    const previa = painel().getByRole('switch', { name: 'Prévia antes de começar' })
    expect(previa.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(previa)
    expect(acoes.aoTrocarPrevia).toHaveBeenCalledWith(false)
    fireEvent.click(painel().getByRole('switch', { name: 'Diagnóstico do material' }))
    expect(acoes.aoTrocarDiagnostico).toHaveBeenCalledTimes(1)

    fireEvent.click(painel().getByRole('button', { name: /Recordes/ }))
    expect(acoes.aoVerRecordes).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    abrir()
    fireEvent.click(painel().getByRole('button', { name: /Mapa do conteúdo/ }))
    expect(acoes.aoVerMapa).toHaveBeenCalledTimes(1)
    abrir()
    fireEvent.click(painel().getByRole('button', { name: /Curadoria/ }))
    expect(acoes.aoAbrirCuradoria).toHaveBeenCalledTimes(1)
    abrir()
    fireEvent.click(painel().getByRole('button', { name: /Tela de sempre/ }))
    expect(acoes.aoVerTelaCompleta).toHaveBeenCalledTimes(1)
  })

  it('trocar de seção mantém UM painel aberto e troca o miolo e o pé', () => {
    montar()
    abrirOrganizar()
    const d = screen.getByRole('dialog')
    expect(d.querySelector('.dlg-pe')?.textContent).toContain('Ver 6 jogos')
    fireEvent.click(secao('Favoritos e ordem'))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog')).toBe(d)
    expect(d.querySelector('.dlg-pe')?.textContent).toBe('Pronto')
    expect(d.querySelector('.qj-ordem')).not.toBeNull()
    fireEvent.click(secao('Opções'))
    expect(d.querySelector('.dlg-pe')).toBeNull()
    expect(d.querySelector('.qj-ordem')).toBeNull()
    fireEvent.click(secao('Buscar e filtrar'))
    expect(painel().getByRole('searchbox', { name: 'Buscar jogo' })).toBeTruthy()
  })

  it('com filtro ligado, o chip mostra quantos e a tela oferece limpar', () => {
    const { palco, acoes } = montar({ busca: 'mem', habilidade: 'vocab' })
    expect(palco.querySelector('.ex-organizar .qj-n')?.textContent).toBe('2')
    const aviso = palco.querySelector('[data-filtro]') as HTMLElement
    expect(aviso.textContent).toContain('6 jogos com este filtro')
    fireEvent.click(within(aviso).getByRole('button', { name: 'Limpar filtros e busca' }))
    expect(acoes.aoLimparFiltros).toHaveBeenCalledTimes(1)
  })
})

describe('onde a tela enxuta não vale', () => {
  it('no headset fica a tela de antes: partida rápida no alto, três chips, cartão depois das abas', () => {
    aparelho.tipo = 'quest'
    const { palco } = montar()
    expect(palco.classList.contains('ex-jogar')).toBe(false)
    expect(palco.querySelector('.q-cab .q-ctl.pri')?.textContent).toBe('Partida rápida')
    expect([...palco.querySelectorAll('.qj-ferramentas > .q-chip')].map((c) => c.textContent)).toEqual([
      'Buscar e filtrar',
      'Favoritos e ordem',
      'Opções',
    ])
    expect(palco.querySelector('.ex-lig')).toBeNull()
    const ordem = [...palco.children].map((x) => x.className.split(' ')[0] || x.id)
    expect(ordem.indexOf('qj-ferramentas')).toBeLessThan(ordem.indexOf('q-cartao'))
  })

  it('a chave de prova do desenvolvimento ("Telas: Atual") mostra a arrumação de antes no computador', () => {
    localStorage.setItem('babel.px.telasDeProva', 'atual')
    const { palco } = montar()
    expect(palco.classList.contains('ex-jogar')).toBe(false)
    expect(screen.getByRole('button', { name: 'Partida rápida' })).toBeTruthy()
  })
})
