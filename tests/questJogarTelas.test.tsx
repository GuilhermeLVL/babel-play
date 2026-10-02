// @vitest-environment jsdom
/**
 * JOGAR NO META QUEST, AS TELAS EM VOLTA DOS JOGOS (segunda rodada, 01/10/2026).
 *
 * A regra que não se negocia é "nenhuma função some": cada teste monta a tela no desenho do headset
 * (`useQuestNovo()` verdadeiro) e confere que as funções da tela de sempre continuam alcançáveis e
 * chamam o mesmo que chamavam. A aparência é das fotos; aqui só se prova o que a tela FAZ.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DadoTrilha } from '../src/core/learning/trilha'
import type { FaseJogada } from '../src/core/minigames/fases'
import type { VocabCard } from '../src/types'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => true,
}))
const atualizarCartao = vi.fn(async (_id: string, _mudanca: unknown) => ({}))
vi.mock('../src/data/api', async (orig) => ({
  ...(await orig<typeof import('../src/data/api')>()),
  fetchRecordes: vi.fn(async () => [
    { exerciseKind: 'memory', melhorPontos: 320, melhorEm: 1, rodadas: 4, melhorCombo: 6, precisao: 88 },
  ]),
  updateCard: (id: string, mudanca: unknown) => atualizarCartao(id, mudanca),
}))
vi.mock('../src/lib/juice', async (orig) => ({
  ...(await orig<typeof import('../src/lib/juice')>()),
  comemorar: vi.fn(),
  pontosDoElemento: vi.fn(),
  tremor: vi.fn(),
  flashDeTela: vi.fn(),
}))
vi.mock('../src/lib/effects', async (orig) => ({ ...(await orig()), burstFromElement: vi.fn() }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))
vi.mock('../src/lib/protecaoDoMenor', async (orig) => ({ ...(await orig()), perfilProtegido: () => false }))
const lerRanking = vi.fn(async (_jogo: string) => [
  { apelido: 'ana', pontos: 900, combo: 7 },
  { apelido: 'bia', pontos: 500, combo: 3 },
])
vi.mock('../src/lib/ranking', async (orig) => ({
  ...(await orig<typeof import('../src/lib/ranking')>()),
  lerRanking: (jogo: string) => lerRanking(jogo),
}))

const { default: AntessalaDaRodada } = await import('../src/components/minigames/AntessalaDaRodada')
const { default: CascaDaRodada } = await import('../src/components/minigames/casca/CascaDaRodada')
const { default: ComoSeJoga } = await import('../src/components/minigames/ComoSeJoga')
const { default: ResultadoDaRodada } = await import('../src/components/minigames/ResultadoDaRodada')
const { default: SalaDeEscolha } = await import('../src/components/minigames/SalaDeEscolha')
const { default: SeletorDeConteudo } = await import('../src/components/minigames/SeletorDeConteudo')
const { default: TourGuiado } = await import('../src/components/minigames/TourGuiado')
const { default: CuradoriaBaralho } = await import('../src/components/views/CuradoriaBaralho')
const { default: MapaDoConteudo } = await import('../src/components/views/MapaDoConteudo')
const { default: PainelTrilha } = await import('../src/components/views/PainelTrilha')
const { default: Recordes } = await import('../src/components/views/play/Recordes')

beforeAll(() => prepararDialogoNoJsdom())
beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const botao = (nome: RegExp | string) => screen.getByRole('button', { name: nome }) as HTMLButtonElement
const principais = (raiz: ParentNode = document) =>
  [...raiz.querySelectorAll<HTMLElement>('.q-ctl.pri')].map((b) => b.textContent?.trim())

describe('a fonte no Quest (SeletorDeConteudo)', () => {
  const montar = () => {
    const acoes = { aoTrocar: vi.fn(), aoAlternar: vi.fn(), aoLimpar: vi.fn() }
    render(
      <SeletorDeConteudo
        soGaveta
        aberta
        total={847}
        nomeDaFonte="Minhas gravações"
        idioma="inglês"
        aoAlternar={acoes.aoAlternar}
        aoLimpar={acoes.aoLimpar}
        avisoDeVazio="nenhum item passa; desligue um recorte"
        acoes={<button type="button">Trazer do Anki</button>}
        facetas={[
          {
            id: 'idioma',
            rotulo: 'Idioma',
            exclusiva: true,
            valor: ['en'],
            aoTrocar: acoes.aoTrocar,
            opcoes: [
              { id: 'en', rotulo: 'inglês', contagem: 847 },
              { id: 'pt', rotulo: 'português', contagem: 0, motivoBloqueio: 'nenhuma palavra pronta neste idioma' },
            ],
          },
          {
            id: 'recorte',
            rotulo: 'Recorte',
            valor: [],
            aoTrocar: acoes.aoTrocar,
            opcoes: [{ id: 'nuncaVistas', rotulo: 'Nunca vistas', contagem: 12 }],
          },
          { id: 'nivel', rotulo: 'Nível do curso', valor: [], aoTrocar: acoes.aoTrocar, opcoes: [] },
        ]}
      />,
    )
    return { ...acoes, painel: screen.getByRole('dialog') }
  }

  it('abre no centro com cada faceta, a contagem e o motivo ESCRITO da opção travada', () => {
    const { painel, aoTrocar } = montar()
    expect(painel.className).not.toContain('gaveta')
    expect([...painel.querySelectorAll('[data-faceta]')].map((f) => (f as HTMLElement).dataset.faceta)).toEqual([
      'idioma',
      'recorte',
    ])
    const portugues = within(painel).getByRole('radio', { name: /português/ }) as HTMLButtonElement
    expect(portugues.disabled).toBe(true)
    expect(painel.textContent).toContain('nenhuma palavra pronta neste idioma')

    fireEvent.click(within(painel).getByRole('button', { name: /Nunca vistas/ }))
    expect(aoTrocar).toHaveBeenCalledWith('nuncaVistas')
    expect(within(painel).getByRole('button', { name: 'Trazer do Anki' })).toBeTruthy()
  })

  it('o pé diz o total do recorte, limpa tudo e fecha no único botão principal', () => {
    const { painel, aoLimpar, aoAlternar } = montar()
    expect(painel.querySelector('.qj-total')?.textContent).toContain('847')
    expect(painel.textContent).toContain('nenhum item passa; desligue um recorte')
    fireEvent.click(within(painel).getByRole('button', { name: 'Limpar tudo' }))
    expect(aoLimpar).toHaveBeenCalledTimes(1)
    expect(principais(painel)).toEqual(['Pronto'])
    fireEvent.click(within(painel).getByRole('button', { name: 'Pronto' }))
    expect(aoAlternar).toHaveBeenCalledTimes(1)
  })
})

describe('a sala de escolha no Quest', () => {
  const trilhaDe = (lang: string) =>
    lang === 'en'
      ? { niveis: ['A1', 'A2'] as never[], total: 2784, porNivel: { A1: 900, A2: 600 } }
      : { niveis: [], total: 0 }
  const montar = (
    idiomas = [
      { lang: 'en', total: 1151, jogaveis: 621 },
      { lang: 'pt', total: 993, jogaveis: 40 },
    ],
  ) => {
    const aoConfirmar = vi.fn()
    const aoFechar = vi.fn()
    render(
      <SalaDeEscolha
        escolhaAtual={{ origem: 'gravacoes', escopo: 'todas', lang: 'pt' }}
        idiomas={idiomas}
        dificeis={0}
        gravacoes={[
          { id: 's1', title: 'Reunião de segunda', audioUrl: '/a.mp3' },
          { id: 's2', title: 'Podcast de terça' },
        ]}
        trilhaDe={trilhaDe}
        ageProfile="pro"
        aoConfirmar={aoConfirmar}
        aoFechar={aoFechar}
      />,
    )
    return { aoConfirmar, aoFechar, sala: screen.getByRole('dialog') }
  }

  it('a trilha e as difíceis aparecem travadas com o motivo escrito; um único botão principal confirma', () => {
    const { sala, aoConfirmar } = montar()
    expect((within(sala).getByRole('radio', { name: /Trilha/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(sala.textContent).toContain('ainda não existe trilha em')
    expect(sala.textContent).toContain('o ranking de difíceis ainda não tem material')
    expect(principais(sala)).toEqual(['Usar estas palavras'])
    fireEvent.click(within(sala).getByRole('button', { name: 'Usar estas palavras' }))
    expect(aoConfirmar).toHaveBeenCalledWith(
      expect.objectContaining({ origem: 'gravacoes', escopo: 'todas', lang: 'pt' }),
    )
  })

  it('escolher uma gravação: a lista vira linhas, e a sem áudio é avisada antes', () => {
    const { sala, aoConfirmar } = montar()
    fireEvent.click(within(sala).getByRole('radio', { name: /Uma gravação/ }))
    const linhas = [...sala.querySelectorAll<HTMLButtonElement>('.q-linha')]
    expect(linhas.map((l) => l.querySelector('b')?.textContent)).toEqual(['Reunião de segunda', 'Podcast de terça'])
    expect(linhas[1].textContent).toContain('sem áudio')
    fireEvent.click(linhas[1])
    expect(linhas[1].getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(sala).getByRole('button', { name: 'Usar estas palavras' }))
    expect(aoConfirmar).toHaveBeenCalledWith(expect.objectContaining({ escopo: 'uma', sessionId: 's2' }))
  })

  it('trocar para o inglês libera a trilha e os níveis dela; fechar não confirma nada', () => {
    const { sala, aoConfirmar, aoFechar } = montar()
    fireEvent.click(within(sala).getByRole('radio', { name: /inglês/i }))
    fireEvent.click(within(sala).getByRole('radio', { name: /Trilha/ }))
    fireEvent.click(within(sala).getByRole('radio', { name: /A2/ }))
    fireEvent.click(within(sala).getByRole('button', { name: 'Usar estas palavras' }))
    expect(aoConfirmar).toHaveBeenCalledWith(expect.objectContaining({ origem: 'trilha', lang: 'en', nivel: 'A2' }))
    fireEvent.click(within(sala).getByRole('button', { name: 'Fechar sem mudar nada' }))
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })
})

describe('a antessala no Quest', () => {
  const FASES: FaseJogada[] = [
    {
      roundId: 'r2',
      quando: Date.now(),
      pontos: 200,
      combo: 5,
      acertos: 4,
      total: 4,
      precisao: 100,
      estrelas: 3,
      refs: ['a', 'b'],
    },
    {
      roundId: 'r1',
      quando: Date.now() - 86_400_000,
      pontos: 90,
      combo: 2,
      acertos: 2,
      total: 4,
      precisao: 50,
      estrelas: 1,
      refs: [],
    },
  ]
  const montar = (extra: Partial<React.ComponentProps<typeof AntessalaDaRodada>> = {}) => {
    const acoes = {
      onRepetir: vi.fn(),
      onTrocar: vi.fn(),
      onJogar: vi.fn(),
      onSair: vi.fn(),
      onComoSeJoga: vi.fn(),
      onMudarPularSempre: vi.fn(),
      onJogarFase: vi.fn(),
      onResgate: vi.fn(),
    }
    const tela = render(
      <AntessalaDaRodada
        titulo="Memória: palavra e tradução"
        gameId="memory"
        itens={[
          { ref: 'gato', titulo: 'gato', forma: '4 letras', pista: 'cat' } as never,
          { ref: 'casa', titulo: 'casa', forma: '4 letras', pista: 'house' } as never,
        ]}
        historico={new Map([['gato', { vezes: 2, erros: 1, ultimoAcerto: false }]])}
        vencidos={new Set(['casa'])}
        repetidos={1}
        ageProfile="pro"
        fonte={{ rotulo: 'Minhas palavras', idioma: 'inglês' }}
        fases={FASES}
        leeches={['dog']}
        pularSempre={false}
        {...acoes}
        {...extra}
      />,
    )
    return { ...tela, ...acoes }
  }

  it('Jogar é o único botão principal, e as outras saídas ficam na faixa fixa', () => {
    const t = montar()
    const faixa = t.container.querySelector('.qj-coluna > .q-faixa') as HTMLElement
    expect(principais()).toEqual(['Jogar'])
    fireEvent.click(within(faixa).getByRole('button', { name: /Jogar/ }))
    fireEvent.click(within(faixa).getByRole('button', { name: /Trocar por outras/ }))
    fireEvent.click(within(faixa).getByRole('button', { name: /Repetir a última/ }))
    fireEvent.click(within(faixa).getByRole('switch', { name: 'Começar direto da próxima vez' }))
    expect(t.onJogar).toHaveBeenCalledTimes(1)
    expect(t.onTrocar).toHaveBeenCalledTimes(1)
    expect(t.onRepetir).toHaveBeenCalledTimes(1)
    expect(t.onMudarPularSempre).toHaveBeenCalledWith(true)
  })

  it('voltar, "Como se joga" e a rodada de resgate continuam a um toque', () => {
    const t = montar()
    fireEvent.click(botao('Voltar para Jogar'))
    fireEvent.click(botao(/Como se joga/))
    fireEvent.click(botao(/Rodada de resgate/))
    expect(t.onSair).toHaveBeenCalledTimes(1)
    expect(t.onComoSeJoga).toHaveBeenCalledTimes(1)
    expect(t.onResgate).toHaveBeenCalledTimes(1)
  })

  it('diz de onde vem a rodada, o saldo dela e por que estas palavras', () => {
    const t = montar()
    expect(t.container.querySelector('.qj-chips')?.textContent).toContain('2 itens na rodada')
    expect(t.container.querySelector('.qj-chips')?.textContent).toContain('Minhas palavras')
    expect([...t.container.querySelectorAll('.qj-saldo .q-num b')].map((b) => b.textContent)).toEqual([
      '2',
      '1',
      '1',
      '1',
    ])
    const porque = t.container.querySelector('[data-secao="porque"]') as HTMLElement
    expect(porque.textContent).toContain('1 vencida')
    expect(porque.textContent).toContain('1 item de 2 já caiu na sua última rodada deste jogo')
    // A lista abre num toque, e cada item traz o estado em texto, não só em cor.
    fireEvent.click(within(porque).getByRole('button', { name: 'Ver os 2 itens' }))
    expect(within(porque).getByText('gato')).toBeTruthy()
    expect(within(porque).getByText('você errou')).toBeTruthy()
    fireEvent.click(within(porque).getByRole('button', { name: /Como funciona a repetição/ }))
    expect(porque.textContent).toContain('Cada rodada garante pelo menos 30% de itens novos')
  })

  it('as fases rejogam os itens exatos; a que não guardou as palavras diz o motivo', () => {
    const t = montar()
    const fases = t.container.querySelector('[data-secao="fases"]') as HTMLElement
    fireEvent.click(within(fases).getByRole('button', { name: 'Repetir a fase 2' }))
    expect(t.onJogarFase).toHaveBeenCalledWith(['a', 'b'])
    expect((within(fases).getByRole('button', { name: 'Repetir a fase 1' }) as HTMLButtonElement).disabled).toBe(true)
    expect(fases.textContent).toContain('Esta rodada antiga não guardou as palavras')
  })

  it('o progresso neste jogo aparece quando há histórico', async () => {
    montar({ acervoTotal: 20, itensJogados: 5 })
    await waitFor(() => expect(screen.getByText(/Nível 2 no Memória/)).toBeTruthy())
    expect(screen.getByText(/melhor 320/)).toBeTruthy()
    expect(screen.getByText(/25% do vocabulário já enfrentado/)).toBeTruthy()
  })

  it('nível e foco: abre no lugar, e a faixa sem material diz por quê', () => {
    const aoTrocarFaixa = vi.fn()
    const aoTrocarEstrategia = vi.fn()
    const t = montar({
      filtroDificuldade: {
        faixas: [],
        estrategia: 'auto',
        aoTrocarFaixa,
        aoTrocarEstrategia,
        disponivelPorFaixa: { facil: 12, medio: 2, dificil: 0 },
        minimoDoJogo: 4,
        origemDaComposicao: 'servidor',
      },
      auto: { faixa: 'facil', motivo: 'você acertou 62% nas últimas rodadas' },
    })
    const nivel = t.container.querySelector('[data-secao="nivel"]') as HTMLElement
    expect(nivel.textContent).toContain('Fácil (automático)')
    fireEvent.click(within(nivel).getByRole('button', { name: /Trocar/ }))
    fireEvent.click(within(nivel).getByRole('button', { name: /Fácil/ }))
    expect(aoTrocarFaixa).toHaveBeenCalledWith('facil')
    expect((within(nivel).getByRole('button', { name: /Difícil/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(nivel.textContent).toContain('este jogo precisa de 4')
    fireEvent.click(within(nivel).getByRole('radio', { name: 'Recentes' }))
    expect(aoTrocarEstrategia).toHaveBeenCalledWith('recentes')
  })

  it('rodada vazia: diz o que houve e não deixa começar', () => {
    montar({ itens: [] })
    expect(screen.getByText('Nenhum item elegível para esta rodada.')).toBeTruthy()
    expect(botao(/^Jogar$/).disabled).toBe(true)
  })
})

describe('o fim da rodada no Quest', () => {
  const report = {
    gameId: 'memory' as const,
    items: [
      { itemRef: 'a', correct: true, attempts: 1, ms: 900 },
      { itemRef: 'b', correct: true, attempts: 1, ms: 900 },
      { itemRef: 'c', correct: true, attempts: 1, ms: 900 },
      { itemRef: 'd', correct: false, attempts: 2, ms: 900 },
    ],
    score: 150,
    durationMs: 42_000,
  }
  const itens = report.items.map((o) => ({ ...o, back: `trad-${o.itemRef}` }))
  const montar = (extra: Partial<React.ComponentProps<typeof ResultadoDaRodada>> = {}) => {
    const acoes = { onContinuar: vi.fn(), onRepetir: vi.fn(), onRefazerErradas: vi.fn(), onDone: vi.fn() }
    const tela = render(
      <ResultadoDaRodada
        report={report as never}
        jogo="Memória: palavra e tradução"
        ageProfile="pro"
        sequencia={null}
        recorde={400}
        itens={itens}
        onPularVez={null}
        custoPular={40}
        saldoSeeds={0}
        {...acoes}
        {...extra}
      />,
    )
    return { ...tela, ...acoes }
  }

  it('antes de revelar, o único botão principal é revelar; os números são os da rodada', () => {
    const t = montar()
    expect(screen.getByRole('heading', { name: '3 de 4 pares' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '2 de 3 estrelas (75% de acerto)' })).toBeTruthy()
    expect([...t.container.querySelectorAll('.qj-fim .q-num span')].map((s) => s.textContent)).toEqual([
      'Pontos',
      'Precisão',
      'Tempo',
      'Melhor sequência',
    ])
    expect(t.container.textContent).toContain('seu recorde: 400')
    expect(principais()).toEqual(['Revelar a recompensa'])
    expect(screen.queryByRole('button', { name: /Voltar aos jogos/ })).toBeNull()
  })

  it('depois de revelar: mais uma (principal), de novo, o que escapou e voltar', () => {
    const t = montar()
    fireEvent.click(botao('Revelar a recompensa'))
    expect(screen.getByLabelText(/Recompensa revelada: mais 10 XP e 3 seeds/)).toBeTruthy()
    expect(principais()).toEqual(['Mais uma, com palavras novas'])
    fireEvent.click(botao(/Mais uma/))
    fireEvent.click(botao(/De novo/))
    fireEvent.click(botao(/Voltar aos jogos/))
    expect(t.onContinuar).toHaveBeenCalledTimes(1)
    expect(t.onRepetir).toHaveBeenCalledTimes(1)
    expect(t.onDone).toHaveBeenCalledTimes(1)

    fireEvent.click(botao(/Ver o que escapou/))
    const resumo = t.container.querySelector('[data-secao="resumo"]') as HTMLElement
    expect(resumo.textContent).toContain('trad-d')
    fireEvent.click(within(resumo).getByRole('button', { name: 'Refazer só a errada' }))
    expect(t.onRefazerErradas.mock.calls[0][0].map((e: { itemRef: string }) => e.itemRef)).toEqual(['d'])
    expect(resumo.textContent).not.toContain('trad-a')
    fireEvent.click(within(resumo).getByRole('button', { name: 'Acertou (3)' }))
    expect(resumo.textContent).toContain('trad-a')
  })

  it('tocar na raspadinha também revela', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Raspe para revelar a recompensa' }))
    expect(botao(/Voltar aos jogos/)).toBeTruthy()
  })

  it('com combo vivo, trocar mantendo o combo fica à vista; sem saldo, diz quanto custa', () => {
    const onPularVez = vi.fn()
    const sequencia = { rodadas: 3, pontos: 500, precisao: 90, combo: 4, melhorSequencia: 6 } as never
    const t = montar({ sequencia, onPularVez })
    fireEvent.click(botao('Revelar a recompensa'))
    fireEvent.click(within(t.container.querySelector('[data-secao="pular"]') as HTMLElement).getByRole('button'))
    expect(onPularVez).toHaveBeenCalledTimes(1)
    cleanup()
    const semSaldo = montar({ sequencia, onPularVez: null, saldoSeeds: 12 })
    fireEvent.click(botao('Revelar a recompensa'))
    expect(semSaldo.container.querySelector('[data-secao="pular"]')?.textContent).toContain(
      'Custa 40 seeds, e você tem 12.',
    )
  })

  it('rodada que não foi gravada: diz que nada foi creditado; sem material, não oferece "mais uma"', () => {
    montar({ gravacao: 'falhou', semMaterial: true })
    fireEvent.click(botao('Revelar a recompensa'))
    expect(screen.getAllByText('Não foi possível salvar — nada foi creditado').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Mais uma/ })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Acabaram as palavras elegíveis')
  })
})

describe('"Como se joga" no Quest', () => {
  it('os passos, as ajudas com o preço e o que o jogo não mede; "Começar" é o principal', () => {
    const onJogar = vi.fn()
    const onFechar = vi.fn()
    render(<ComoSeJoga jogo="memory" titulo="Memória" ageProfile="pro" onJogar={onJogar} onFechar={onFechar} />)
    const ficha = screen.getByRole('dialog')
    expect(ficha.querySelectorAll('.q-passos li')).toHaveLength(3)
    expect(ficha.querySelector('.qj-ajudas')?.textContent).toContain('limita a nota a "difícil"')
    expect(ficha.textContent).toContain('O que este jogo não mede.')
    expect(principais(ficha)).toEqual(['Começar'])
    fireEvent.click(within(ficha).getByRole('button', { name: /Começar/ }))
    expect(onJogar).toHaveBeenCalledTimes(1)
    fireEvent.click(within(ficha).getByRole('button', { name: 'Agora não' }))
    expect(onFechar).toHaveBeenCalledTimes(1)
  })
})

describe('o tour guiado no Quest', () => {
  it('avança por botão (não há teclado) e pode ser pulado', () => {
    const medida = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        top: 100,
        left: 100,
        width: 200,
        height: 60,
        right: 300,
        bottom: 160,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      })
    try {
      const onFim = vi.fn()
      render(
        <>
          <div data-tour="a">alvo a</div>
          <div data-tour="b">alvo b</div>
          <TourGuiado
            titulo="Memória"
            onFim={onFim}
            passos={[
              { alvo: '[data-tour="a"]', texto: 'Vire uma carta.' },
              { alvo: '[data-tour="b"]', texto: 'Feche o par.' },
            ]}
          />
        </>,
      )
      expect(screen.getByText('Passo 1 de 2')).toBeTruthy()
      expect(principais()).toEqual(['Próximo'])
      fireEvent.click(botao(/Próximo/))
      expect(screen.getByText('Feche o par.')).toBeTruthy()
      fireEvent.click(botao('Jogar'))
      expect(onFim).toHaveBeenCalledTimes(1)
      fireEvent.click(botao('Pular a explicação'))
      expect(onFim).toHaveBeenCalledTimes(2)
    } finally {
      medida.mockRestore()
    }
  })
})

describe('os recordes no Quest', () => {
  it('os meus: três números e a tabela por jogo; o ranking global traz a posição escrita', async () => {
    const onFechar = vi.fn()
    render(<Recordes ageProfile="pro" onFechar={onFechar} />)
    const painel = screen.getByRole('dialog')
    await waitFor(() => expect(painel.querySelector('.q-tabela')).not.toBeNull())
    expect([...painel.querySelectorAll('.q-num span')].map((s) => s.textContent)).toEqual([
      'Melhor placar',
      'Rodadas',
      'Eventos raros',
    ])
    expect(painel.querySelector('.q-tabela tbody')?.textContent).toContain('320')

    fireEvent.click(within(painel).getByRole('radio', { name: 'Ranking global' }))
    await waitFor(() => expect(painel.textContent).toContain('1º lugar'))
    expect(lerRanking).toHaveBeenCalledWith('blitz')
    expect(painel.textContent).toContain('ana')
    expect(painel.textContent).toContain('No ranking aparece só o seu apelido.')
    fireEvent.click(within(painel).getByRole('button', { name: 'Fechar' }))
    expect(onFechar).toHaveBeenCalledTimes(1)
  })
})

describe('o mapa do conteúdo no Quest', () => {
  const item = (ref: string, extra: Partial<React.ComponentProps<typeof MapaDoConteudo>['itens'][number]> = {}) => ({
    ref,
    titulo: ref,
    pista: `trad-${ref}`,
    vencido: false,
    vezes: 0,
    erros: 0,
    ultimoAcerto: true,
    ...extra,
  })
  const montar = () => {
    const acoes = { onVoltar: vi.fn(), onTrocarFonte: vi.fn(), onEscolherNivel: vi.fn() }
    const tela = render(
      <MapaDoConteudo
        titulo="Trilha A1"
        ageProfile="pro"
        itens={[
          item('casa', { vencido: true, vezes: 2 }),
          item('gato', { vezes: 3, erros: 1, ultimoAcerto: false }),
          item('pão'),
          item('rua', { vezes: 1 }),
        ]}
        niveis={[
          { nivel: 'A1', total: 900, jaCairam: 800, pct: 89 },
          { nivel: 'A2', total: 600, jaCairam: 60, pct: 10 },
        ]}
        nivelAtivo="A1"
        historicoDesde={Date.UTC(2026, 7, 1)}
        {...acoes}
      />,
    )
    return { ...tela, ...acoes }
  }

  it('os cinco números, a cobertura e o aviso de quando o registro começou', () => {
    const t = montar()
    expect([...t.container.querySelectorAll('.qj-g5 .q-num')].map((n) => n.textContent)).toEqual([
      '4No conjunto',
      '1Nunca entraram',
      '3Já vistos',
      '1Erro pendente',
      '1Vencidos',
    ])
    expect(t.container.textContent).toContain('75% deste conjunto já apareceu numa rodada.')
    expect(t.container.textContent).toContain('O registro do que caiu em cada rodada começou em')
  })

  it('voltar, trocar a fonte e escolher o nível', () => {
    const t = montar()
    fireEvent.click(botao('Voltar para Jogar'))
    fireEvent.click(botao(/Trocar a fonte/))
    const niveis = within(screen.getByRole('radiogroup', { name: 'Nível da trilha' })).getAllByRole('radio')
    expect(niveis[0].getAttribute('aria-checked')).toBe('true')
    expect(niveis[0].textContent).toContain('feito')
    fireEvent.click(niveis[1])
    expect(t.onVoltar).toHaveBeenCalledTimes(1)
    expect(t.onTrocarFonte).toHaveBeenCalledTimes(1)
    expect(t.onEscolherNivel).toHaveBeenCalledWith('A2')
  })

  it('o filtro mostra a contagem de cada grupo e recorta a lista; o estado é dito em texto', () => {
    const t = montar()
    const linhas = () =>
      [...t.container.querySelectorAll('.q-tabela tbody tr')].map((l) => l.querySelector('b')?.textContent)
    expect(linhas()).toEqual(['casa', 'gato', 'pão', 'rua'])
    expect(t.container.querySelector('.q-tabela tbody tr')?.textContent).toContain('vencida')
    const filtros = screen.getByRole('radiogroup', { name: 'Filtrar o mapa' })
    fireEvent.click(within(filtros).getByRole('radio', { name: /Inéditos/ }))
    expect(linhas()).toEqual(['pão'])
    expect(within(filtros).getByRole('radio', { name: /Com erro pendente/ }).textContent).toContain('1')
  })
})

describe('a curadoria no Quest', () => {
  const cartao = (id: string, word: string, translation = ''): VocabCard => ({ id, word, translation }) as VocabCard
  const montar = (fora = 4) => {
    const acoes = { onVoltar: vi.fn(), onMudou: vi.fn() }
    const tela = render(
      <CuradoriaBaralho
        triagem={{
          usaveis: [cartao('u1', 'house', 'casa')],
          outroIdioma: [cartao('o1', 'maison', 'casa')],
          fora: ['dog', 'cat', 'bird', 'fish']
            .slice(0, fora)
            .map((w, i) => ({ card: cartao(`f${i}`, w), motivo: 'sem-pista' as const })),
        }}
        idioma="en"
        ageProfile="pro"
        {...acoes}
      />,
    )
    return { ...tela, ...acoes }
  }

  it('o saldo no alto e, por palavra, as três ações escritas', async () => {
    const t = montar()
    expect([...t.container.querySelectorAll('.q-grade .q-num b')].map((b) => b.textContent)).toEqual([
      '1',
      '4',
      '1',
      '20%',
    ])
    const linha = within(t.container.querySelector('.qj-lista li') as HTMLElement)
    expect(linha.getByRole('button', { name: 'Editar a tradução de dog' }).textContent).toContain('Editar')
    expect(linha.getByRole('button', { name: 'dog está certo assim' }).textContent).toContain('Está certo')
    await act(async () => {
      fireEvent.click(linha.getByRole('button', { name: 'Arquivar dog' }))
    })
    expect(atualizarCartao).toHaveBeenCalledWith('f0', { inDeck: false })
    expect(t.onMudou).toHaveBeenCalled()
  })

  it('editar a tradução abre o campo na própria linha, e arquivar o grupo fica no cabeçalho', async () => {
    const t = montar()
    fireEvent.click(botao('Editar a tradução de dog'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Tradução curta de dog' }), { target: { value: 'cachorro' } })
    await act(async () => {
      fireEvent.click(botao(/Salvar/))
    })
    expect(atualizarCartao).toHaveBeenCalledWith('f0', { translation: 'cachorro' })
    await act(async () => {
      fireEvent.click(botao(/Arquivar as/))
    })
    expect(
      atualizarCartao.mock.calls.filter(([, m]) => (m as { inDeck?: boolean }).inDeck === false).length,
    ).toBeGreaterThanOrEqual(3)
    expect(t.onMudou).toHaveBeenCalled()
  })

  it('nada para revisar: uma frase e um único botão principal, que volta aos jogos', () => {
    const t = montar(0)
    expect(screen.getByRole('heading', { name: 'Nada para revisar' })).toBeTruthy()
    expect(principais()).toEqual(['Voltar aos jogos'])
    fireEvent.click(botao('Voltar aos jogos'))
    expect(t.onVoltar).toHaveBeenCalledTimes(1)
  })
})

describe('o painel da trilha no Quest', () => {
  const dado: DadoTrilha = {
    lang: 'en',
    fonte: 'teste',
    versao: '0',
    niveis: {
      A1: [
        ['house', 'casa'],
        ['water', 'água'],
        ['bread', 'pão'],
      ],
      A2: [
        ['bridge', 'ponte'],
        ['candle', 'vela'],
      ],
    },
  }

  it('é uma linha que abre no lugar os níveis, a etapa e a procedência', () => {
    const onEscolherNivel = vi.fn()
    render(
      <PainelTrilha
        dado={dado}
        deck={[]}
        ageProfile="pro"
        nivel="A1"
        onEscolherNivel={onEscolherNivel}
        nativo="pt"
        paresDeGlosa={['pt']}
      />,
    )
    const linha = botao(/Trilha de vocabulário · A1/)
    expect(linha.getAttribute('aria-expanded')).toBe('false')
    expect(linha.textContent).toContain('3 palavras do A1 prontas para jogar')
    expect(screen.queryByRole('radiogroup')).toBeNull()

    fireEvent.click(linha)
    const niveis = within(screen.getByRole('radiogroup', { name: 'Nível da trilha' })).getAllByRole('radio')
    expect(niveis.map((n) => n.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    fireEvent.click(niveis[1])
    expect(onEscolherNivel).toHaveBeenCalledWith('A2')
    expect(screen.getByText(/Nível e tradução vêm de listas públicas curadas/)).toBeTruthy()
  })

  it('sem tradução para o idioma da pessoa, o aviso aparece ao abrir', () => {
    render(
      <PainelTrilha
        dado={dado}
        deck={[]}
        ageProfile="pro"
        nivel="A1"
        onEscolherNivel={() => {}}
        nativo="es"
        paresDeGlosa={['pt']}
      />,
    )
    fireEvent.click(botao(/Trilha de vocabulário/))
    expect(screen.getByText(/Esta trilha ainda não tem tradução para/)).toBeTruthy()
  })
})

describe('a pausa da rodada no Quest', () => {
  const montar = () => {
    const acoes = { onRecomecar: vi.fn(), onSair: vi.fn(), alternar: vi.fn() }
    render(
      <CascaDaRodada
        jogo="memory"
        titulo="Memória"
        total={6}
        unidade="palavras"
        ageProfile="pro"
        onRecomecar={acoes.onRecomecar}
        onSair={acoes.onSair}
        som={{ ligado: true, alternar: acoes.alternar }}
      >
        <p>tabuleiro</p>
      </CascaDaRodada>,
    )
    return acoes
  }

  it('continuar é o único principal; som, recomeçar e "como se joga" estão na pausa', () => {
    const acoes = montar()
    fireEvent.click(botao(/Pausar/))
    const pausa = screen.getByRole('dialog')
    expect(principais(pausa)).toEqual(['Continuar'])
    fireEvent.click(within(pausa).getByRole('switch', { name: 'Sons do jogo' }))
    expect(acoes.alternar).toHaveBeenCalledTimes(1)
    fireEvent.click(within(pausa).getByRole('button', { name: /Recomeçar/ }))
    expect(acoes.onRecomecar).toHaveBeenCalledTimes(1)

    fireEvent.click(botao(/Pausar/))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Como se joga/ }))
    expect(screen.getByRole('dialog').textContent).toContain('O que treina')
  })

  it('sair pede confirmação, e dá para desistir de sair', () => {
    const acoes = montar()
    fireEvent.click(botao(/Pausar/))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Sair da rodada/ }))
    expect(screen.getByRole('heading', { name: 'Sair sem terminar?' })).toBeTruthy()
    expect(acoes.onSair).not.toHaveBeenCalled()
    fireEvent.click(botao('Continuar jogando'))
    expect(screen.getByRole('dialog').textContent).toContain('Rodada em pausa')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Sair da rodada/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Sair da rodada/ }))
    expect(acoes.onSair).toHaveBeenCalledTimes(1)
  })
})
