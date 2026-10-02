// @vitest-environment jsdom
/**
 * JOGAR NO META QUEST (maquete aprovada em 01/10/2026, tela 5): a ordem dos cartões, o motivo de quem
 * não abre no headset, o clique que abre a rodada e a Memória com seis pares.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Target } from 'lucide-react'
import React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

/** O aparelho do teste: o headset, ou o computador com o MESMO desenho (02/10/2026). */
const aparelho = vi.hoisted(() => ({ tipo: 'quest' as 'quest' | 'desktop-com-gpu' }))
vi.mock('../src/lib/dispositivo/perfil', async (orig) => {
  const real = await orig<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...real, perfilDoDispositivo: () => ({ ...real.perfilDoDispositivo(), tipo: aparelho.tipo }) }
})

import { JOGOS } from '../src/components/views/play/jogos'
import { PARES_DA_MEMORIA_NO_QUEST, rodadaParaOQuest } from '../src/components/views/play/quest/jogosNoQuest'
import LobbyDoQuest from '../src/components/views/play/quest/LobbyDoQuest'
import type { EstadoDoJogo } from '../src/core/minigames/estadoDosJogos'
import type { RodadaMontada } from '../src/core/minigames/rodada'
import type { MinigameId, MinigameItem } from '../src/core/minigames/types'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

/** O headset: sem voz de leitura, sem reconhecimento de voz do navegador, sem teclado físico. */
const QUEST = { vozDeLeitura: false, reconhecimentoDoNavegador: false, tecladoFisico: false }
/** Sem a voz do site: o que depende de voz de leitura fica apagado, como no headset sem a nuvem. */
const SEM_VOZ = { haAlgumaVoz: () => false, haVozPara: () => false }

beforeAll(() => prepararDialogoNoJsdom())

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
      voz={SEM_VOZ}
      {...extra}
    />,
  )
  const cartoes = [...container.querySelectorAll<HTMLButtonElement>('.q-tile')]
  const cartao = (id: MinigameId) => cartoes.find((c) => c.dataset.jogo === id)!
  return { container, cartoes, cartao, aoJogar, aoVerTelaCompleta }
}

afterEach(() => {
  cleanup()
  aparelho.tipo = 'quest'
})

/* ── O MESMO DESENHO NO COMPUTADOR: o que é do aparelho (a frase, o jeito de jogar) não vem junto ── */
describe('LobbyDoQuest no computador com o desenho novo', () => {
  /** O computador: voz do navegador, teclado físico; o reconhecimento de fala depende do navegador. */
  const PC = { vozDeLeitura: true, reconhecimentoDoNavegador: true, tecladoFisico: true }
  const noPc = (extra: Partial<React.ComponentProps<typeof LobbyDoQuest>> = {}) => {
    aparelho.tipo = 'desktop-com-gpu'
    return montar(comGravacao, { recursos: PC, voz: undefined, ...extra })
  }

  it('as etiquetas dizem "Clicar" e "Digitar"; nenhum jogo de digitar vira "Pede teclado"', () => {
    const { cartao, container } = noPc()
    expect(cartao('memory').querySelector('.q-tag')?.textContent).toBe('Clicar')
    expect(cartao('ditado').querySelector('.q-tag')?.textContent).toBe('Áudio da sessão')
    expect(cartao('karaoke').querySelector('.q-tag')?.textContent).toBe('Áudio da sessão')
    expect(container.textContent).not.toMatch(/Pede teclado|Apontar|headset/i)
  })

  it('navegador sem reconhecimento de fala: o Karaokê abre sem nota, e o motivo é do navegador', () => {
    const { cartao } = noPc({ recursos: { ...PC, reconhecimentoDoNavegador: false } })
    expect(cartao('karaoke').disabled).toBe(false)
    expect(cartao('karaoke').textContent).toContain('Este navegador não dá nota de pronúncia')
  })

  it('Opções fala em clique e no "lobby de antes", sem falar no computador como outro aparelho', () => {
    noPc({ previa: true, aoTrocarPrevia: () => {} })
    fireEvent.click(screen.getByRole('button', { name: 'Opções' }))
    const opcoes = screen.getByRole('dialog').textContent ?? ''
    expect(opcoes).toContain('o clique já começa o jogo')
    expect(opcoes).toContain('O lobby de antes do desenho novo, só nesta visita.')
    expect(opcoes).not.toMatch(/lobby do computador|o toque/)
  })

  it('as abas andam pelas setas do teclado, como as da tela de sempre', () => {
    const aoTrocarCategoria = vi.fn()
    noPc({ aoTrocarCategoria, categoria: 'todos', contagens: { todos: 6, classicos: 3, favoritos: 0 } })
    const aba = (nome: RegExp) => screen.getByRole('tab', { name: nome })
    fireEvent.keyDown(aba(/Todos/), { key: 'ArrowRight' })
    expect(aoTrocarCategoria).toHaveBeenLastCalledWith('classicos')
    fireEvent.keyDown(aba(/Todos/), { key: 'ArrowLeft' })
    expect(aoTrocarCategoria).toHaveBeenLastCalledWith('favoritos')
    fireEvent.keyDown(aba(/Favoritos/), { key: 'Home' })
    expect(aoTrocarCategoria).toHaveBeenLastCalledWith('todos')
  })
})

describe('LobbyDoQuest', () => {
  it('no headset, Opções fala em toque e no lobby do computador', () => {
    montar(comGravacao, { previa: true, aoTrocarPrevia: () => {} })
    fireEvent.click(screen.getByRole('button', { name: 'Opções' }))
    const opcoes = screen.getByRole('dialog').textContent ?? ''
    expect(opcoes).toContain('o toque já começa o jogo')
    expect(opcoes).toContain('O lobby do computador, só nesta visita.')
  })

  it('sem preferência do usuário: o que se joga apontando, depois o áudio, o teclado e, no fim, o que não abre', () => {
    const { cartoes } = montar()
    expect(cartoes.map((c) => c.dataset.jogo)).toEqual(['memory', 'blitz', 'karaoke', 'escuta', 'ditado', 'wordsearch'])
    expect(cartoes.map((c) => c.querySelector('.q-tag')?.textContent)).toEqual([
      'Apontar',
      'Apontar',
      'Sem nota de voz',
      'Áudio da sessão',
      'Pede teclado',
      'Falta material',
    ])
  })

  it('os favoritos vêm primeiro na grade inteira, e a ordem do usuário vale acima dos grupos', () => {
    // O Ditado é do grupo do teclado (o último): favorito, sobe para o começo da grade.
    const comFavorito = montar(comGravacao, { favoritos: ['ditado'] })
    expect(comFavorito.cartoes.map((c) => c.dataset.jogo)).toEqual([
      'ditado',
      'memory',
      'blitz',
      'karaoke',
      'escuta',
      'wordsearch',
    ])
    cleanup()
    const comOrdem = montar(comGravacao, { favoritos: ['ditado'], ordemEscolhida: ['escuta', 'blitz'] })
    expect(comOrdem.cartoes.map((c) => c.dataset.jogo)).toEqual([
      'ditado',
      'escuta',
      'blitz',
      'memory',
      'karaoke',
      'wordsearch',
    ])
  })

  it('o cabeçalho diz quantas palavras há e de onde vêm', () => {
    montar()
    expect(screen.getByText('32 palavras prontas')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Jogar' })).toBeTruthy()
    expect(screen.getByText('Inglês · Minhas palavras')).toBeTruthy()
  })

  it('quem não abre no headset fica apagado, desligado e com o motivo escrito', () => {
    // Karaokê sem gravação e sem voz de leitura: não há som nenhum para repetir.
    const { cartao } = montar([...comGravacao.filter((j) => j.id !== 'karaoke'), jogo('karaoke')])
    const karaoke = cartao('karaoke')
    expect(karaoke.disabled).toBe(true)
    expect(karaoke.className).toContain('apagado')
    expect(karaoke.textContent).toContain('não há o que ouvir e repetir')

    const semMaterial = cartao('wordsearch')
    expect(semMaterial.disabled).toBe(true)
    expect(semMaterial.textContent).toContain('faltam 2 palavras')
  })

  it('o Karaokê com som abre: o headset não dá nota, e o cartão avisa', () => {
    const { cartao, aoJogar } = montar()
    const karaoke = cartao('karaoke')
    expect(karaoke.disabled).toBe(false)
    expect(karaoke.querySelector('.q-tag')?.textContent).toBe('Sem nota de voz')
    expect(karaoke.textContent).toContain('ouça, repita em voz alta e siga')
    fireEvent.click(karaoke)
    expect(aoJogar.mock.calls[0][0].id).toBe('karaoke')
  })

  it('pede digitação: continua jogável, com o aviso de que é melhor em outro aparelho', () => {
    const { cartao } = montar()
    const ditado = cartao('ditado')
    expect(ditado.disabled).toBe(false)
    expect(ditado.querySelector('.q-tag')?.className).toContain('off')
    expect(ditado.textContent).toContain('Melhor no computador ou no celular.')
  })

  it('sem gravação e sem voz de leitura, Escuta e Ditado abrem pela tradução, e o cartão diz isso', () => {
    // Na trilha, `estadoDoJogo` troca a fala gravada pela palavra do baralho; sem voz, o jogo a escreve.
    const { cartao } = montar([jogo('memory'), jogo('escuta'), jogo('ditado')], { naTrilha: true })
    for (const id of ['escuta', 'ditado'] as const) {
      expect(cartao(id).disabled).toBe(false)
      expect(cartao(id).querySelector('.q-tag')?.textContent).toBe('Pela tradução')
      expect(cartao(id).textContent).toContain('a pergunta vem escrita, pela tradução')
    }
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
    fireEvent.click(cartao('wordsearch'))
    expect(aoJogar).toHaveBeenCalledTimes(1)
    expect(aoJogar.mock.calls[0][0].id).toBe('memory')
  })

  it('a fonte continua a um toque; a tela de sempre fica em Opções', () => {
    const aoTrocarFonte = vi.fn()
    const { aoVerTelaCompleta } = montar(comGravacao, { aoTrocarFonte })
    fireEvent.click(screen.getByRole('button', { name: /Inglês · Minhas palavras/ }))
    expect(aoTrocarFonte).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Opções' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Tela de sempre/ }))
    expect(aoVerTelaCompleta).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('o aviso curto traz o que houve e a saída', () => {
    const aoAgir = vi.fn()
    montar(comGravacao, { aviso: { texto: 'Você ainda não salvou palavras', acao: 'Capturar uma sessão', aoAgir } })
    expect(screen.getByRole('status').textContent).toContain('Você ainda não salvou palavras')
    fireEvent.click(screen.getByRole('button', { name: 'Capturar uma sessão' }))
    expect(aoAgir).toHaveBeenCalledTimes(1)
  })

  it('acervo pequeno: diz quanto há e quanto falta, e oferece escolher o que praticar E capturar', () => {
    const escolher = vi.fn()
    const capturar = vi.fn()
    montar(comGravacao, {
      aviso: {
        texto: 'Você ainda não tem palavras suas para jogar. Dá para jogar com as da trilha.',
        detalhe: 'Você tem 2 e precisa de 4 para a primeira rodada.',
        acoes: [
          { rotulo: 'Escolher o que praticar', aoAgir: escolher },
          { rotulo: 'Capturar uma sessão', aoAgir: capturar },
        ],
      },
    })
    const aviso = screen.getByRole('status')
    expect(aviso.textContent).toContain('Você tem 2 e precisa de 4 para a primeira rodada.')
    fireEvent.click(within(aviso).getByRole('button', { name: 'Escolher o que praticar' }))
    fireEvent.click(within(aviso).getByRole('button', { name: 'Capturar uma sessão' }))
    expect(escolher).toHaveBeenCalledTimes(1)
    expect(capturar).toHaveBeenCalledTimes(1)
  })

  it('baralho que não carregou: o motivo e as duas saídas, tentar de novo e capturar', () => {
    const tentar = vi.fn()
    const capturar = vi.fn()
    montar([], {
      aviso: {
        texto: 'Não consegui carregar o seu baralho: sem rede',
        acoes: [
          { rotulo: 'Tentar de novo', aoAgir: tentar },
          { rotulo: 'Capturar uma sessão', aoAgir: capturar },
        ],
      },
    })
    const aviso = screen.getByRole('status')
    expect(aviso.textContent).toContain('sem rede')
    fireEvent.click(within(aviso).getByRole('button', { name: 'Tentar de novo' }))
    fireEvent.click(within(aviso).getByRole('button', { name: 'Capturar uma sessão' }))
    expect(tentar).toHaveBeenCalledTimes(1)
    expect(capturar).toHaveBeenCalledTimes(1)
  })
})

/**
 * NENHUMA FUNÇÃO DO LOBBY DE SEMPRE SOME (segunda rodada, 01/10/2026): partida rápida, abas, sugestão,
 * busca, habilidade, prévia, favoritos, ordem, "como se joga", recordes, mapa, curadoria, diagnóstico e
 * a saída de cada jogo bloqueado. Cada teste confere que a função está alcançável e chama o que deve.
 */
describe('LobbyDoQuest completo', () => {
  const completo = () => {
    const acoes = {
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
      aoAbrirPorta: vi.fn(),
    }
    const extra: Partial<React.ComponentProps<typeof LobbyDoQuest>> = {
      aoPartidaRapida: acoes.aoPartidaRapida,
      categoria: 'todos',
      aoTrocarCategoria: acoes.aoTrocarCategoria,
      contagens: { todos: 6, classicos: 6, favoritos: 1 },
      busca: '',
      aoBuscar: acoes.aoBuscar,
      habilidade: 'todas',
      aoTrocarHabilidade: acoes.aoTrocarHabilidade,
      aoLimparFiltros: acoes.aoLimparFiltros,
      favoritos: ['blitz'],
      aoFavoritar: acoes.aoFavoritar,
      aoComoSeJoga: acoes.aoComoSeJoga,
      previa: true,
      aoTrocarPrevia: acoes.aoTrocarPrevia,
      ordem: comGravacao,
      aoMover: acoes.aoMover,
      sugestao: {
        jogo: comGravacao[3],
        titulo: 'Revisar 12 palavras que voltaram a vencer',
        porque: [[Target, '12 palavras voltaram a vencer hoje.']],
      },
      aoOutraSugestao: acoes.aoOutraSugestao,
      aoVerRecordes: acoes.aoVerRecordes,
      aoVerMapa: acoes.aoVerMapa,
      curadoria: { n: 7, aoAbrir: acoes.aoAbrirCuradoria },
      diagnostico: {
        ligado: false,
        aoTrocar: acoes.aoTrocarDiagnostico,
        itens: [
          {
            icone: Target,
            texto: '32 no idioma',
            explicacao: '32 palavras do idioma escolhido passaram na régua de qualidade.',
          },
        ],
      },
      portaDoJogo: (j) =>
        j.id === 'wordsearch' ? { rotulo: 'Jogar com a trilha', aoAbrir: acoes.aoAbrirPorta } : null,
      correnteEncerrada: { rodadas: 3, pontos: 420, precisao: 85 },
    }
    return { ...montar(comGravacao, extra), acoes, extra }
  }
  const painel = () => within(screen.getByRole('dialog'))

  it('a tela tem um único botão principal: a partida rápida', () => {
    const { container, acoes } = completo()
    const principais = container.querySelectorAll('.q-ctl.pri')
    expect(principais).toHaveLength(1)
    fireEvent.click(principais[0])
    expect(acoes.aoPartidaRapida).toHaveBeenCalledTimes(1)
    expect(principais[0].textContent).toContain('Partida rápida')
  })

  it('as abas Todos, Clássicos e Favoritos trazem a contagem e trocam a categoria', () => {
    const { acoes } = completo()
    const abas = screen.getAllByRole('tab')
    expect(abas.map((a) => a.textContent)).toEqual(['Todos6', 'Clássicos6', 'Favoritos1'])
    expect(abas[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.click(abas[2])
    expect(acoes.aoTrocarCategoria).toHaveBeenCalledWith('favoritos')
  })

  it('a sugestão para hoje começa o jogo sugerido, gira e explica o porquê', () => {
    const { acoes, aoJogar } = completo()
    expect(screen.getByText('Revisar 12 palavras que voltaram a vencer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    expect(aoJogar.mock.calls[0][0].id).toBe('memory')
    fireEvent.click(screen.getByRole('button', { name: 'Outra sugestão' }))
    expect(acoes.aoOutraSugestao).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('12 palavras voltaram a vencer hoje.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Por que este?' }))
    expect(screen.getByText('12 palavras voltaram a vencer hoje.')).toBeTruthy()
  })

  it('"Buscar e filtrar" abre a busca e o filtro de habilidade num painel', () => {
    const { acoes } = completo()
    fireEvent.click(screen.getByRole('button', { name: /Buscar e filtrar/ }))
    fireEvent.change(painel().getByRole('searchbox', { name: 'Buscar jogo' }), { target: { value: 'mem' } })
    expect(acoes.aoBuscar).toHaveBeenCalledWith('mem')
    fireEvent.click(painel().getByRole('radio', { name: 'Vocabulário' }))
    expect(acoes.aoTrocarHabilidade).toHaveBeenCalledWith('vocab')
    fireEvent.click(painel().getByRole('button', { name: 'Limpar filtros e busca' }))
    expect(acoes.aoLimparFiltros).toHaveBeenCalledTimes(1)
  })

  it('com filtro ligado, a tela diz quantos jogos sobraram e oferece limpar', () => {
    const { container, acoes } = montarComFiltro()
    const aviso = container.querySelector('[data-filtro]') as HTMLElement
    expect(aviso.textContent).toContain('6 jogos com este filtro')
    expect(aviso.textContent).toContain('“mem”')
    expect(aviso.textContent).toContain('Vocabulário')
    fireEvent.click(within(aviso).getByRole('button', { name: 'Limpar filtros e busca' }))
    expect(acoes.aoLimparFiltros).toHaveBeenCalledTimes(1)

    function montarComFiltro() {
      const base = completo()
      cleanup()
      return { ...montar(comGravacao, { ...base.extra, busca: 'mem', habilidade: 'vocab' }), acoes: base.acoes }
    }
  })

  it('"Opções" guarda a prévia, o diagnóstico, os recordes, o mapa e a curadoria', () => {
    const { acoes } = completo()
    const abrir = () => fireEvent.click(screen.getByRole('button', { name: 'Opções' }))

    abrir()
    const previa = painel().getByRole('switch', { name: 'Prévia antes de começar' })
    expect(previa.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(previa)
    expect(acoes.aoTrocarPrevia).toHaveBeenCalledWith(false)
    fireEvent.click(painel().getByRole('switch', { name: 'Diagnóstico do material' }))
    expect(acoes.aoTrocarDiagnostico).toHaveBeenCalledTimes(1)

    fireEvent.click(painel().getByRole('button', { name: /Recordes/ }))
    expect(acoes.aoVerRecordes).toHaveBeenCalledTimes(1)
    abrir()
    fireEvent.click(painel().getByRole('button', { name: /Mapa do conteúdo/ }))
    expect(acoes.aoVerMapa).toHaveBeenCalledTimes(1)
    abrir()
    const curadoria = painel().getByRole('button', { name: /Curadoria/ })
    expect(curadoria.textContent).toContain('7 palavras ficaram de fora dos jogos.')
    fireEvent.click(curadoria)
    expect(acoes.aoAbrirCuradoria).toHaveBeenCalledTimes(1)
  })

  it('"Favoritos e ordem" fixa, move e abre o "como se joga" de cada jogo', () => {
    const { acoes, cartao } = completo()
    // O favorito é marcado no próprio cartão, sem virar um botão dentro dele.
    expect(cartao('blitz').querySelector('.qj-favorito')).not.toBeNull()
    expect(cartao('memory').querySelector('.qj-favorito')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Favoritos e ordem/ }))
    // O painel lista os jogos como a grade os mostra: o favorito na frente, o que não abre no fim.
    const naGrade = ['blitz', 'memory', 'karaoke', 'escuta', 'ditado', 'wordsearch']
    const linhas = [...screen.getByRole('dialog').querySelectorAll<HTMLElement>('[data-ordem]')]
    expect(linhas.map((l) => l.dataset.ordem)).toEqual(naGrade)

    const escuta = within(linhas[3])
    fireEvent.click(escuta.getByRole('button', { name: /^Favoritar/ }))
    expect(acoes.aoFavoritar.mock.calls[0][0].id).toBe('escuta')
    fireEvent.click(escuta.getByRole('button', { name: /^Mover para antes/ }))
    fireEvent.click(escuta.getByRole('button', { name: /^Mover para depois/ }))
    // A seta entrega a lista como o painel a mostra: troca-se com o vizinho que se vê.
    expect(acoes.aoMover.mock.calls.map(([j, d, visiveis]) => [j.id, d, visiveis])).toEqual([
      ['escuta', -1, naGrade],
      ['escuta', 1, naGrade],
    ])
    fireEvent.click(escuta.getByRole('button', { name: /^Como se joga/ }))
    expect(acoes.aoComoSeJoga.mock.calls[0][0].id).toBe('escuta')

    // Nas pontas do grupo (favoritos entre si, o resto entre si), mover para fora não é um alvo.
    const desligado = (linha: HTMLElement, nome: RegExp) =>
      (within(linha).getByRole('button', { name: nome }) as HTMLButtonElement).disabled
    expect(desligado(linhas[0], /^Mover para antes/)).toBe(true)
    expect(desligado(linhas[0], /^Mover para depois/)).toBe(true)
    expect(desligado(linhas[1], /^Mover para antes/)).toBe(true)
    expect(desligado(linhas[5], /^Mover para depois/)).toBe(true)
    expect(
      within(linhas[0])
        .getByRole('button', { name: /^Tirar dos favoritos/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(linhas[5].textContent).toContain('Não abre agora')
  })

  it('jogo que abre mostra a conta da rodada; o bloqueado, a saída logo abaixo', () => {
    const { container, cartao, acoes } = completo()
    expect(cartao('memory').querySelector('.qj-conta')?.textContent).toBe('faltam 0 palavras')
    expect(cartao('wordsearch').querySelector('.qj-conta')).toBeNull()
    const porta = container.querySelector('[data-porta="wordsearch"]') as HTMLButtonElement
    expect(porta.textContent).toContain('Jogar com a trilha')
    fireEvent.click(porta)
    expect(acoes.aoAbrirPorta).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll('[data-porta]')).toHaveLength(1)
  })

  it('a sequência que acabou de encerrar é dita, e o diagnóstico aparece quando ligado', () => {
    const { container, extra } = completo()
    expect(container.querySelector('[data-corrente]')?.textContent).toContain('3 rodadas, 420 pontos, 85% de acerto')
    expect(screen.queryByText('32 no idioma')).toBeNull()
    cleanup()
    montar(comGravacao, { ...extra, diagnostico: { ...extra.diagnostico!, ligado: true } })
    expect(screen.getByText('32 no idioma')).toBeTruthy()
    // O que o número quer dizer vem escrito (na tela de sempre é a dica ao parar o ponteiro).
    expect(screen.getByText('32 palavras do idioma escolhido passaram na régua de qualidade.')).toBeTruthy()
  })

  it('filtro sem nenhum jogo: diz o que houve em vez de uma grade vazia', () => {
    const { extra } = completo()
    cleanup()
    const { container } = montar([], { ...extra, busca: 'xyz', sugestao: null })
    expect(container.querySelector('.q-tile')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Nenhum jogo pronto com esse filtro' })).toBeTruthy()
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
