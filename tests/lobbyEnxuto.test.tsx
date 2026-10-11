// @vitest-environment jsdom
/**
 * JOGAR NA TELA ENXUTA (protótipo `telas-enxutas`, `enxugarJogar()` e `abrirOrganizar()` de
 * `enxuto.js:207-343`): no computador e no celular, as mesmas funções com menos coisas à vista.
 *
 *  · o cabeçalho é o título e a FICHA de conteúdo (protótipo `cartoes-enxuto`, `fontes.js:187-191`); o cartão
 *    "Sugestão para hoje" SAIU (decisão do dono), e com ele "Por que este?" e "Outra sugestão";
 *  · "Partida rápida" é o botão pequeno "Sortear", ao lado de "Buscar e organizar";
 *  · o aviso do estado e a faixa de anúncio ficam logo abaixo do cabeçalho; sem eles, a grade sobe;
 *  · o jogo que não serve ao conteúdo desce para "Precisam de outro material", com o motivo e a saída;
 *  · os três painéis viram um, "Buscar e organizar", com as três seções — e cada função antiga continua
 *    alcançável e chamando o que chamava;
 *  · no headset nada muda (`tests/lobbyDoQuest.test.tsx` cobre a tela de lá).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { GraduationCap, Plus } from 'lucide-react'
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
const FALTA = 'Precisa de 4 palavras; aqui há 2.'

function montar(extra: Partial<React.ComponentProps<typeof LobbyDoQuest>> = {}) {
  const acoes = {
    aoJogar: vi.fn(),
    aoVerTelaCompleta: vi.fn(),
    aoVerOQueServe: vi.fn(),
    aoTrocarConteudo: vi.fn(),
    aoPartidaRapida: vi.fn(),
    aoTrocarCategoria: vi.fn(),
    aoBuscar: vi.fn(),
    aoTrocarHabilidade: vi.fn(),
    aoLimparFiltros: vi.fn(),
    aoFavoritar: vi.fn(),
    aoComoSeJoga: vi.fn(),
    aoTrocarPrevia: vi.fn(),
    aoMover: vi.fn(),
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
      ficha={<span className="fs-ficha" data-fs-ficha />}
      aoVerOQueServe={acoes.aoVerOQueServe}
      aoTrocarConteudo={acoes.aoTrocarConteudo}
      notaDoBloqueio={(j) => (j.estado.ok ? `${j.estado.tamanhoDaRodada} nesta rodada` : FALTA)}
      aoJogar={acoes.aoJogar}
      aoVerTelaCompleta={acoes.aoVerTelaCompleta}
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

describe('Jogar na tela enxuta: o cabeçalho com a ficha (fontes.js:187-205)', () => {
  it('título, ficha e nada mais no cabeçalho; a trilha vem em seguida e as abas colam na grade', () => {
    const { palco } = montar()
    expect(palco.classList.contains('ex-jogar')).toBe(true)
    const cab = palco.querySelector('header.q-cab') as HTMLElement
    expect(cab.className).toBe('q-cab fs-cab ct-cab fx-cab')
    expect([...cab.children].map((x) => x.tagName + (x.className ? '.' + x.className.split(' ')[0] : ''))).toEqual([
      'H1',
      'SPAN.fs-ficha',
      'SPAN.q-espaco',
    ])
    expect(cab.querySelector('h1')?.textContent).toBe('Jogar')
    const ordem = [...palco.children].map((x) => x.className.split(' ')[0] || x.id)
    expect(ordem.slice(0, 3)).toEqual(['q-cab', 'qj-trilha', 'qj-ferramentas'])
    expect(palco.querySelector('.qj-ferramentas')?.nextElementSibling?.id).toBe('grade-de-jogos')
  })

  it('a "Sugestão para hoje" saiu: nem o cartão, nem "Por que este?", nem "Outra sugestão", nem botão cheio', () => {
    const { palco } = montar()
    expect(palco.querySelector('.qj-sugestao')).toBeNull()
    expect(screen.queryByText('Sugestão para hoje')).toBeNull()
    for (const nome of ['Por que este?', 'Outra sugestão', 'Começar', 'Partida rápida'])
      expect(screen.queryByRole('button', { name: nome })).toBeNull()
    expect(palco.querySelectorAll('.q-ctl.pri')).toHaveLength(0)
  })

  it('"Sortear" é o botão pequeno ao lado de "Buscar e organizar", com a função da partida rápida', () => {
    const { palco, acoes } = montar()
    const chips = [...palco.querySelectorAll('.qj-ferramentas > .q-chip')] as HTMLElement[]
    expect(chips.map((c) => c.className)).toEqual(['q-chip fx-sortear', 'q-chip ex-organizar'])
    const sortear = screen.getByRole('button', { name: 'Sortear um jogo' })
    expect(sortear).toBe(chips[0])
    expect(sortear.textContent).toBe('Sortear')
    expect(sortear.dataset.ex).toBe('sortear')
    fireEvent.click(sortear)
    expect(acoes.aoPartidaRapida).toHaveBeenCalledTimes(1)
  })

  it('o aviso do estado e a faixa de anúncio ficam entre o cabeçalho e as abas; sem eles a grade sobe', () => {
    const aoTrazer = vi.fn()
    const { palco } = montar({
      avisosDoEstado: [
        {
          tom: 'trilha',
          icone: GraduationCap,
          forte: 'Você joga com as palavras prontas da Trilha.',
          texto: 'Traga as suas e o jogo fica com a sua cara.',
          acoes: [{ rotulo: 'Trazer uma fonte', icone: Plus, primaria: true, aoAgir: aoTrazer }],
        },
      ],
      anuncio: <div className="q-linha fx-anuncio" />,
      trilha: undefined,
    })
    const ordem = [...palco.children].map((x) => x.className.split(' ').slice(0, 2).join(' ') || x.id)
    expect(ordem.slice(0, 4)).toEqual(['q-cab fs-cab', 'q-aviso fx-aviso', 'q-linha fx-anuncio', 'qj-ferramentas'])
    const aviso = palco.querySelector('.fx-aviso') as HTMLElement
    expect(aviso.className).toBe('q-aviso fx-aviso fx-aviso-trilha')
    expect(aviso.querySelector('.qv-aviso-texto b')?.textContent).toBe('Você joga com as palavras prontas da Trilha.')
    const trazer = within(aviso).getByRole('button', { name: 'Trazer uma fonte' })
    expect(trazer.className).toBe('q-ctl pri')
    expect(trazer.closest('.fx-aviso-acoes')).not.toBeNull()
    fireEvent.click(trazer)
    expect(aoTrazer).toHaveBeenCalledTimes(1)

    cleanup()
    const semNada = montar({ trilha: undefined }).palco
    expect(semNada.querySelector('.fx-aviso, .fx-anuncio')).toBeNull()
    expect(semNada.querySelector('header.q-cab')?.nextElementSibling?.className).toBe('qj-ferramentas')
  })
})

describe('os jogos que não servem ao conteúdo (fontes.js:208-253)', () => {
  it('descem para "Precisam de outro material", com a arte, o motivo e "Ver o que serve"', () => {
    const { palco, acoes } = montar()
    const secaoDosPresos = palco.querySelector('.qj-presos.fx-faltam') as HTMLElement
    expect(secaoDosPresos.querySelector('h2')?.textContent).toBe('Precisa de outro material')
    expect(secaoDosPresos.querySelector('header p')?.textContent).toBe(
      'Não está quebrado: pede algo que este conteúdo não tem.',
    )
    const caixa = secaoDosPresos.querySelector('.fx-grade-falta > .qj-jogo.fx-falta') as HTMLElement
    const tile = caixa.querySelector('.q-tile') as HTMLButtonElement
    expect(tile.dataset.jogo).toBe('wordsearch')
    expect(tile.classList.contains('apagado')).toBe(true)
    expect(tile.disabled).toBe(false)
    expect(tile.querySelector('.px-mini')).not.toBeNull()
    expect(tile.querySelector('.q-tag.off.fx-tag-falta')?.textContent).toBe('Falta\u00a0material')
    expect(tile.querySelector('.q-tag svg')).not.toBeNull()
    expect(tile.querySelector('.q-d.fx-motivo')?.textContent).toBe(FALTA)
    expect(tile.querySelector('.qj-conta')).toBeNull()
    expect(tile.getAttribute('aria-label')).toContain('Não serve para este conteúdo: ' + FALTA)

    const porta = within(caixa).getByRole('button', { name: /^Ver o conteúdo que serve para/ })
    expect(porta.className).toBe('q-ctl qj-porta')
    expect(porta.textContent?.trim()).toBe('Ver o que serve')
    fireEvent.click(porta)
    fireEvent.click(tile)
    expect(acoes.aoVerOQueServe.mock.calls.map(([j, falta]) => [j.id, falta])).toEqual([
      ['wordsearch', FALTA],
      ['wordsearch', FALTA],
    ])
  })

  it('muitos presos (conteúdo pequeno): uma saída só, "Trocar o conteúdo", no título da seção', () => {
    const presos = (['memory', 'wordsearch', 'blitz', 'karuta', 'tenis'] as const).map((id) =>
      jogo(id, { ok: false, disponiveis: 3, faltam: 1 }),
    )
    const { palco, acoes } = montar({ jogos: [jogo('termo'), ...presos], ordem: [jogo('termo'), ...presos] })
    const secaoDosPresos = palco.querySelector('.qj-presos') as HTMLElement
    expect(secaoDosPresos.querySelector('h2')?.textContent).toBe('Precisam de outro material')
    expect(secaoDosPresos.querySelectorAll('.qj-porta')).toHaveLength(0)
    fireEvent.click(within(secaoDosPresos).getByRole('button', { name: 'Trocar o conteúdo' }))
    expect(acoes.aoTrocarConteudo).toHaveBeenCalledTimes(1)
  })

  it('sem rede, o Karaokê diz "Sem rede", não tem saída e não abre o catálogo', () => {
    const { palco, acoes } = montar({
      jogos: [jogo('memory'), jogo('karaoke', { ok: false, fonte: 'falas', motivo: 'sem-rede' })],
      notaDoBloqueio: (j) => (j.estado.ok ? '8 nesta rodada' : 'Precisa de internet para ouvir a sua voz.'),
    })
    const tile = palco.querySelector('.fx-falta .q-tile') as HTMLButtonElement
    expect(tile.querySelector('.fx-tag-falta')?.textContent).toBe('Sem rede')
    expect(palco.querySelector('.fx-falta .qj-porta')).toBeNull()
    fireEvent.click(tile)
    expect(acoes.aoVerOQueServe).not.toHaveBeenCalled()
  })
})

describe('"Buscar e organizar": um painel com as três seções (enxuto.js:300-343)', () => {
  it('três chips viram um; o painel abre na busca, com as três seções em abas', () => {
    const { palco } = montar()
    const chips = palco.querySelectorAll('.qj-ferramentas > .q-chip.ex-organizar')
    expect(chips).toHaveLength(1)
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
  it('no headset fica a arrumação de lá: partida rápida no alto e três chips; a ficha é a mesma', () => {
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
    expect(palco.querySelector('header.q-cab.fs-cab > .fs-ficha')).not.toBeNull()
    expect(palco.querySelector('.fx-sortear, .qj-sugestao')).toBeNull()
  })

  it('a chave de prova do desenvolvimento ("Telas: Atual") mostra a arrumação de antes no computador', () => {
    localStorage.setItem('babel.px.telasDeProva', 'atual')
    const { palco } = montar()
    expect(palco.classList.contains('ex-jogar')).toBe(false)
    expect(screen.getByRole('button', { name: 'Partida rápida' })).toBeTruthy()
  })
})
