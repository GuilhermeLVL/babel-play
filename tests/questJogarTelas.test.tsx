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
/** O aparelho do teste: o headset, ou o computador com o MESMO desenho (02/10/2026). */
const aparelho = vi.hoisted(() => ({ tipo: 'quest' as 'quest' | 'desktop-com-gpu' }))
vi.mock('../src/lib/dispositivo/perfil', async (orig) => {
  const real = await orig<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...real, perfilDoDispositivo: () => ({ ...real.perfilDoDispositivo(), tipo: aparelho.tipo }) }
})
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
const { default: FimDaRodada } = await import('../src/components/minigames/casca/FimDaRodada')
const { default: SalaDeEscolha } = await import('../src/components/minigames/SalaDeEscolha')
const { default: CuradoriaBaralho } = await import('../src/components/views/CuradoriaBaralho')
const { default: MapaDoConteudo } = await import('../src/components/views/MapaDoConteudo')
const { default: PainelTrilha } = await import('../src/components/views/PainelTrilha')
const { default: Recordes } = await import('../src/components/views/play/Recordes')
const { lerNivelDoJogo } = await import('../src/lib/jogos/nivelDoJogo')

beforeAll(() => prepararDialogoNoJsdom())
beforeEach(() => {
  vi.clearAllMocks()
  aparelho.tipo = 'quest'
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const botao = (nome: RegExp | string) => screen.getByRole('button', { name: nome }) as HTMLButtonElement
const principais = (raiz: ParentNode = document) =>
  [...raiz.querySelectorAll<HTMLElement>('.q-ctl.pri')].map((b) => b.textContent?.trim())

/* A gaveta da fonte (`minigames/SeletorDeConteudo`) saiu em 10/10/2026: o conteúdo é escolhido na ficha do
   cabeçalho (`components/conteudo`, coberta em `conteudoSeletor.test.tsx` e `seletorNoJogar.test.tsx`). */

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
    // O que a contagem de cada idioma quer dizer, escrito.
    expect(sala.textContent).toMatch(/621 prontas para jogo de par, de 1\.151 no idioma/)
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
    // O porquê de cada selo vem escrito (no computador é a dica ao parar o ponteiro).
    expect(porque.textContent).toContain('1 erro(s) em 2 tentativa(s)')
    expect(porque.textContent).toContain('Passou da hora de revisar')
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
    // O acerto de cada fase é texto à vista, não só o nome acessível das estrelas.
    expect(fases.textContent).toContain('100% de acerto')
    expect(fases.textContent).toContain('50% de acerto')
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

/**
 * O FIM DA RODADA NO DESENHO NOVO é a tela do protótipo (`pjFim`, `jogos.js:296-328`), dentro do palco.
 * A regra "nenhuma função some" cedeu aqui por decisão do dono (08/10/2026): o protótipo manda na tela,
 * e a raspadinha, o recorde, o resumo dos erros, o ranking e "trocar mantendo o combo" saíram dela.
 * Os números continuam os da rodada, e as três saídas chamam o que a tela de antes chamava.
 */
describe('o fim da rodada no desenho novo', () => {
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
  const montar = (extra: Partial<React.ComponentProps<typeof FimDaRodada>> = {}) => {
    const acoes = {
      onDone: vi.fn(),
      onProximo: vi.fn(),
      onJogarDeNovo: vi.fn(),
    }
    const tela = render(
      <FimDaRodada
        report={report as never}
        total={4}
        proximo="wordsearch"
        aoProximo={acoes.onProximo}
        aoJogarDeNovo={acoes.onJogarDeNovo}
        aoVoltar={acoes.onDone}
        {...extra}
      />,
    )
    return { ...tela, ...acoes }
  }

  it('a marcação é a do protótipo, com os números da rodada', () => {
    const t = montar()
    const fim = t.container.querySelector('.pj-miolo > .fim') as HTMLElement
    expect(fim.querySelector('.label-mono')?.textContent).toBe('Rodada concluída · Memória')
    expect(fim.querySelector('h2')?.textContent).toBe('Boa rodada')
    expect(screen.getByRole('img', { name: '2 de 3 estrelas' })).toBeTruthy()
    expect(fim.querySelectorAll('.estrelas-fim span.on').length).toBe(2)
    expect([...fim.querySelectorAll('.fim-numeros > div')].map((d) => d.textContent)).toEqual([
      'Acertos3 de 4',
      'Tempo0:42',
      'Pontos150',
      'Melhor combo×2',
    ])
    expect(fim.querySelector('.carimbo')).toBeNull()
    expect(fim.querySelector('.xp-fim b')?.textContent).toBe('+10 XP')
    /* O placar da rodada continua no palco, acima da tela de fim. */
    expect(t.container.querySelector('.hud [data-pj="rotulo"]')?.textContent).toBe('4 de 4 pares')
    /* O que o protótipo não mostra saiu. */
    expect(t.container.textContent).not.toContain('seu recorde')
    expect(t.container.querySelector('.raspa, canvas, [data-secao="resumo"]')).toBeNull()
  })

  it('as três saídas, na ordem do protótipo, chamam o que devem', () => {
    const t = montar()
    const acoes = [...t.container.querySelectorAll('.pj-fim-acoes > button')]
    expect(acoes.map((b) => b.textContent?.trim())).toEqual([
      'Próximo jogo: Caça-palavras',
      'Jogar de novo',
      'Voltar aos jogos',
    ])
    acoes.forEach((b) => fireEvent.click(b))
    expect(t.onProximo).toHaveBeenCalledWith('wordsearch')
    expect(t.onJogarDeNovo).toHaveBeenCalledTimes(1)
    expect(t.onDone).toHaveBeenCalledTimes(1)
  })

  it('sem outro jogo para abrir, "Próximo jogo" não aparece', () => {
    const t = montar({ proximo: null })
    expect(t.container.querySelector('[data-pj="proximo"]')).toBeNull()
  })

  it('rodada sem erro: três estrelas, "Rodada perfeita" e o carimbo', () => {
    const perfeita = { ...report, items: report.items.map((o) => ({ ...o, correct: true, attempts: 1 })) }
    const t = montar({ report: perfeita as never })
    expect(t.container.querySelector('.fim h2')?.textContent).toBe('Rodada perfeita')
    expect(t.container.querySelector('.carimbo')?.textContent).toContain('sem nenhum erro')
  })

  it('rodada que não foi gravada: diz que nada foi creditado no lugar do XP', () => {
    const t = montar({ gravacao: 'falhou' })
    expect(screen.getByRole('status').textContent).toContain('Não foi possível salvar — nada foi creditado')
    expect(t.container.textContent).not.toContain('+10 XP')
  })

  /* A oferta de nível (era `casca/SugestaoDeNivel` na tela de fim de antes): é só uma oferta, e aceitar
     guarda o nível DESTE jogo e joga de novo. A regra de quando oferecer está em `polimentoJogos.test`. */
  it('rodada puxada: oferece o Fácil; aceitar guarda o nível do jogo e joga de novo', async () => {
    const puxada = { ...report, items: report.items.map((o, i) => ({ ...o, correct: i === 0 })) }
    const t = montar({ report: puxada as never })
    expect(lerNivelDoJogo('memory')).toBe('medio')
    const oferta = await waitFor(() => {
      const b = t.container.querySelector<HTMLButtonElement>('[data-pj="trocar-nivel"]')
      if (!b) throw new Error('a oferta ainda não entrou')
      return b
    })
    expect(oferta.dataset.n).toBe('facil')
    expect(oferta.textContent).toContain('Ficou puxado? Jogar no Fácil')
    expect(t.onJogarDeNovo).not.toHaveBeenCalled()
    fireEvent.click(oferta)
    expect(lerNivelDoJogo('memory')).toBe('facil')
    expect(t.onJogarDeNovo).toHaveBeenCalledTimes(1)
  })

  it('rodada mediana: não oferece troca de nível, e nada muda sem o toque', async () => {
    const t = montar()
    await new Promise((r) => setTimeout(r, 120))
    expect(t.container.querySelector('[data-pj="trocar-nivel"]')).toBeNull()
    expect(lerNivelDoJogo('memory')).toBe('medio')
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

describe('o que muda de jeito no headset é dito do jeito do headset', () => {
  it('"Como se joga" do Caça-palavras fala em tocar nas duas pontas, não em arrastar', () => {
    render(
      <ComoSeJoga jogo="wordsearch" titulo="Caça-palavras" ageProfile="pro" onJogar={() => {}} onFechar={() => {}} />,
    )
    const passos = screen.getByRole('dialog').querySelector('.q-passos')?.textContent ?? ''
    expect(passos).toContain('toque na primeira letra dela no quadro, depois na última')
    expect(passos).not.toMatch(/arraste/i)
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

    // As etapas com nome e quanto de cada uma já está no caderno (no computador, a dica de cada traço).
    fireEvent.click(botao(/Ver a etapa|Ver as \d+ etapas/))
    const etapas = screen.getByRole('region', { name: 'Etapas do nível' })
    expect(etapas.textContent).toContain('No seu caderno')
    expect(etapas.textContent).toContain('0 de 3')
    expect(etapas.textContent).toContain('atual')
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

/* Passada de fidelidade: no desenho novo o cabeçalho do jogo é o do protótipo, sem o botão Pausar. A pausa
   continua existindo e abre pelo Esc (e pelo P). */
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
    fireEvent.keyDown(window, { key: 'Escape' })
    const pausa = screen.getByRole('dialog')
    expect(principais(pausa)).toEqual(['Continuar'])
    fireEvent.click(within(pausa).getByRole('switch', { name: 'Sons do jogo' }))
    expect(acoes.alternar).toHaveBeenCalledTimes(1)
    fireEvent.click(within(pausa).getByRole('button', { name: /Recomeçar/ }))
    expect(acoes.onRecomecar).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Como se joga/ }))
    expect(screen.getByRole('dialog').textContent).toContain('O que treina')
  })

  it('sair pede confirmação, e dá para desistir de sair', () => {
    const acoes = montar()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Sair da rodada/ }))
    expect(screen.getByRole('heading', { name: 'Sair sem terminar?' })).toBeTruthy()
    expect(acoes.onSair).not.toHaveBeenCalled()
    fireEvent.click(botao('Continuar jogando'))
    expect(screen.getByRole('dialog').textContent).toContain('Rodada em pausa')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Sair da rodada/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Sair da rodada/ }))
    expect(acoes.onSair).toHaveBeenCalledTimes(1)
  })

  it('no headset a pausa não fala em atalho de teclado', () => {
    montar()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('dialog').querySelector('kbd')).toBeNull()
  })
})

/* ── O MESMO DESENHO NO COMPUTADOR (02/10/2026): o que é do APARELHO não vem junto ──────────────── */
describe('no computador com o desenho novo', () => {
  beforeEach(() => {
    aparelho.tipo = 'desktop-com-gpu'
  })
  it('"Como se joga" do Caça-palavras fala em arrastar: lá o mouse arrasta, como sempre', () => {
    render(
      <ComoSeJoga jogo="wordsearch" titulo="Caça-palavras" ageProfile="pro" onJogar={() => {}} onFechar={() => {}} />,
    )
    const ficha = screen.getByRole('dialog')
    expect(ficha.querySelector('.q-passos')?.textContent).toMatch(/arraste sobre as letras/)
    expect(ficha.classList.contains('qj-como')).toBe(true) // o desenho continua o novo
  })

  it('"Como se joga" do Karaokê: com reconhecimento de fala, os passos de sempre; sem, a frase do navegador', () => {
    const w = window as unknown as { SpeechRecognition?: unknown }
    w.SpeechRecognition = function () {}
    try {
      render(<ComoSeJoga jogo="karaoke" titulo="Karaokê" ageProfile="pro" onJogar={() => {}} onFechar={() => {}} />)
      expect(screen.getByRole('dialog').textContent).toContain('Toque em Falar e repita.')
    } finally {
      delete w.SpeechRecognition
    }
    cleanup()
    render(<ComoSeJoga jogo="karaoke" titulo="Karaokê" ageProfile="pro" onJogar={() => {}} onFechar={() => {}} />)
    const passos = screen.getByRole('dialog').querySelector('.q-passos')?.textContent ?? ''
    expect(passos).toContain('Este navegador não dá nota de pronúncia')
    expect(passos).not.toMatch(/headset/i)
  })

  it('a pausa diz o atalho de teclado (Esc ou P), que continua valendo', () => {
    render(
      <CascaDaRodada
        jogo="memory"
        titulo="Memória"
        total={6}
        unidade="palavras"
        ageProfile="pro"
        onRecomecar={() => {}}
        onSair={() => {}}
      >
        <p>tabuleiro</p>
      </CascaDaRodada>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    const pausa = screen.getByRole('dialog')
    expect(pausa.classList.contains('qj-pausa')).toBe(true)
    expect([...pausa.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['Esc', 'P'])
    fireEvent.keyDown(window, { key: 'p' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a curadoria fala em clique, e o botão de lote diz o que faz ao parar o ponteiro', () => {
    render(
      <CuradoriaBaralho
        triagem={{
          usaveis: [],
          outroIdioma: [],
          fora: ['dog', 'cat', 'bird'].map((w, i) => ({
            card: { id: `f${i}`, word: w, translation: '' } as VocabCard,
            motivo: 'sem-pista' as const,
          })),
        }}
        idioma="en"
        ageProfile="pro"
        onVoltar={() => {}}
        onMudou={() => {}}
      />,
    )
    expect(screen.getByText(/consertar em um clique/)).toBeTruthy()
    expect(botao(/Arquivar as/).title).toBe('Tirar dos jogos as 3 palavras deste grupo (não apaga)')
  })
})
