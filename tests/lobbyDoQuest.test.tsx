// @vitest-environment jsdom
/**
 * JOGAR NO META QUEST (maquete aprovada em 01/10/2026, tela 5): a ordem dos cartões, o motivo de quem
 * não abre no headset, o clique que abre a rodada e a Memória com seis pares.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Target } from 'lucide-react'
import React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

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

  it('o aviso traz, no máximo, uma ação', () => {
    const aoAgir = vi.fn()
    montar(comGravacao, { aviso: { texto: 'Você ainda não salvou palavras', acao: 'Capturar uma sessão', aoAgir } })
    expect(screen.getByRole('status').textContent).toContain('Você ainda não salvou palavras')
    fireEvent.click(screen.getByRole('button', { name: 'Capturar uma sessão' }))
    expect(aoAgir).toHaveBeenCalledTimes(1)
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
        itens: [{ icone: Target, texto: '32 no idioma' }],
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
    const linhas = [...screen.getByRole('dialog').querySelectorAll<HTMLElement>('[data-ordem]')]
    expect(linhas.map((l) => l.dataset.ordem)).toEqual(comGravacao.map((j) => j.id))

    const memoria = within(linhas[3])
    fireEvent.click(memoria.getByRole('button', { name: /^Favoritar/ }))
    expect(acoes.aoFavoritar.mock.calls[0][0].id).toBe('memory')
    fireEvent.click(memoria.getByRole('button', { name: /^Mover para antes/ }))
    fireEvent.click(memoria.getByRole('button', { name: /^Mover para depois/ }))
    expect(acoes.aoMover.mock.calls.map(([j, d]) => [j.id, d])).toEqual([
      ['memory', -1],
      ['memory', 1],
    ])
    fireEvent.click(memoria.getByRole('button', { name: /^Como se joga/ }))
    expect(acoes.aoComoSeJoga.mock.calls[0][0].id).toBe('memory')

    // Nas pontas, mover para fora da lista não é um alvo.
    expect((within(linhas[0]).getByRole('button', { name: /^Mover para antes/ }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(
      within(linhas[5])
        .getByRole('button', { name: /^Tirar dos favoritos/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
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
