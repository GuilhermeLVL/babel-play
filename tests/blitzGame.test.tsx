// @vitest-environment jsdom
/**
 * PRIMEIRO TESTE DE COMPONENTE DO PROJETO — e ele existe por um motivo específico.
 *
 * O Duelo aceitava a última resposta DUAS VEZES. Depois do último item, `setEscolhido(null)`
 * reabilitava as quatro alternativas e `onFinish` só disparava 900 ms depois; nessa janela a mesma
 * pergunta continuava clicável, com aparência de nova. Um segundo toque gerava um `ItemOutcome`
 * extra com o MESMO `cardId` — e como `inicioItemRef` acabara de ser zerado, entrava com `ms`
 * mínimo, que no Duelo é nota 4 ("fácil"). Um toque acidental promovia o cartão.
 *
 * NENHUM teste do repositório podia pegar isso: todos os 38 arquivos anteriores testam funções
 * puras, e este defeito é ordem de atualização de estado dentro do React. O mesmo vão deixou passar
 * o `conferido.itemRefs` que quebrava o Ditado. Daí o custo de trazer o `@testing-library/react`.
 *
 * O que estes testes travam é o CONTRATO do relatório: um item respondido produz exatamente um
 * `ItemOutcome`, e nada entra depois do fim da rodada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import React from 'react'
import type { MinigameItem, RoundReport } from '../src/core/minigames/types'

/*
 * `lib/juice` toca som e mexe em partículas/DOM — irrelevante aqui e ruidoso no jsdom.
 *
 * `multiplicador` é um STUB, e de propósito. A primeira versão o importava de
 * `core/minigames/grade` para "não medir o mock", mas estes testes não verificam pontuação nenhuma:
 * eles verificam quantos `ItemOutcome` a rodada produz. Trazer a função real só criava uma
 * dependência falsa no módulo de nota — e ela quebrou de verdade, porque o export vive numa mudança
 * que ainda não está no histórico. Teste que depende do que não precisa falha por motivo errado.
 */
vi.mock('../src/lib/juice', () => ({
  comemorar: vi.fn(),
  pontosDoElemento: vi.fn(),
  pontosFlutuantes: vi.fn(),
  tremor: vi.fn(),
  tremorDeTela: vi.fn(),
  pulsoDeZoom: vi.fn(),
  flashDeTela: vi.fn(),
  vibrar: vi.fn(),
  executarEfeito: vi.fn(),
  multiplicador: () => 1,
}))
// Sem sorteio nos testes: um evento raro (4% por acerto) tornava a rodada não-determinística.
vi.mock('../src/lib/eventosDeJogo', () => ({
  sortearEventoRaro: () => null,
  eventosCondicionais: () => [],
}))
vi.mock('../src/lib/ranking', () => ({
  enviarParaRanking: vi.fn(), lerApelido: () => '', salvarApelido: vi.fn(), apelidoValido: () => false,
}))
vi.mock('../src/lib/effects', () => ({ emitBurst: vi.fn() }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))

const { default: BlitzGame } = await import('../src/components/minigames/BlitzGame')

/** Três itens com traduções DISTINTAS: pista repetida é recusada pela invariante de rodada. */
function itens(): MinigameItem[] {
  return [
    { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en' },
    { cardId: 'c2', prompt: 'cachorro', answer: 'dog', lang: 'en' },
    { cardId: 'c3', prompt: 'gato', answer: 'cat', lang: 'en' },
  ]
}

/**
 * Clica na alternativa cujo texto é `texto`, se existir e estiver habilitada.
 *
 * `fireEvent` e não `el.click()`: o clique cru não descarrega as atualizações de estado do React, e
 * o teste passava a medir o DOM de antes do clique — foi o que fez as seis primeiras versões destes
 * testes falharem por um motivo que não era o do código.
 */
function clicar(texto: string): 'clicou' | 'desabilitado' | 'ausente' {
  const b = screen.queryByRole('button', { name: texto })
  if (!b) return 'ausente'
  if ((b as HTMLButtonElement).disabled) return 'desabilitado'
  fireEvent.click(b)
  return 'clicou'
}

/** Avança o relógio DENTRO de `act`, senão o re-render que o timer provoca não chega ao DOM. */
function avancar(ms: number): void {
  act(() => { vi.advanceTimersByTime(ms) })
}

/**
 * Deixa o cronômetro da rodada chegar a zero.
 *
 * Um único `avancar(61_000)` NÃO funciona, e o motivo é a forma do relógio: cada tique é um
 * `setTimeout` agendado por um efeito que só roda DEPOIS do re-render provocado pelo tique
 * anterior. Num avanço só, não existe render no meio para agendar o tique seguinte — o cronômetro
 * desce uma casa e para. Daí o passo de 1 s, cada um no seu `act`.
 */
function esgotarOTempo(segundos = 61): void {
  for (let i = 0; i < segundos; i++) avancar(1000)
}

/** Responde o item visível na tela lendo a pergunta e clicando na resposta certa. */
function responderCerto(items: MinigameItem[]): void {
  const pergunta = document.querySelector('[data-tour="pergunta"]')?.textContent ?? ''
  const alvo = items.find(i => i.prompt === pergunta)
  if (!alvo) throw new Error('pergunta na tela não corresponde a nenhum item: ' + pergunta)
  const r = clicar(alvo.answer)
  if (r !== 'clicou') throw new Error(`não deu para responder "${alvo.answer}": ${r}`)
}

describe('BlitzGame — a rodada congela quando acaba', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

  it('a última resposta entra UMA vez, mesmo com um segundo toque na janela do fim', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<BlitzGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    /* Responde os dois primeiros (a revelação do acerto dura 420 ms) e o último SEM avançar. */
    for (let i = 0; i < items.length - 1; i++) {
      responderCerto(items)
      avancar(560)
    }
    responderCerto(items)

    /* AQUI ESTAVA O DEFEITO: na janela da revelação do último item, um segundo toque tinha de
       encontrar os botões desabilitados — antes da correção eles reabilitavam. */
    expect(relatorio).toBeNull()
    const segundoToque = clicar('cat')
    expect(segundoToque).toBe('desabilitado')

    /* v2: a rodada termina numa TELA DE RESULTADO; o relatório só sai no "Continuar". */
    avancar(500)
    expect(relatorio).toBeNull()
    expect(clicar('Continuar')).toBe('clicou')
    expect(relatorio).not.toBeNull()
    expect(relatorio!.items).toHaveLength(3)
  })

  it('nenhum cardId aparece duas vezes no relatório — é isso que dobrava a revisão', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<BlitzGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    for (let i = 0; i < items.length - 1; i++) {
      responderCerto(items)
      avancar(560)
    }
    responderCerto(items)
    clicar('cat')          // toque extra na janela da revelação, deve ser ignorado
    clicar('dog')          // e outro, em alternativa diferente
    avancar(500)
    clicar('Continuar')

    const ids = relatorio!.items.map(o => o.cardId)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
  })

  /* O clique reflexo pegava `ms` recém-zerado, e `gradeFor('blitz')` dá 4 abaixo do limiar rápido.
     Sem outcome extra não há nota extra — é o mesmo defeito visto pelo lado da consequência. */
  it('não existe outcome com ms perto de zero vindo de toque reflexo', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<BlitzGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    for (let i = 0; i < items.length - 1; i++) {
      responderCerto(items)
      avancar(560)
    }
    responderCerto(items)
    clicar('cat')
    avancar(500)
    clicar('Continuar')
    expect(relatorio!.items).toHaveLength(3)
  })

  it('quando o tempo acaba, a pergunta não respondida deixa de ser clicável', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<BlitzGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    /* Deixa o relógio inteiro correr sem responder nada. 60 s no perfil `pro`, 1 s por tique. */
    esgotarOTempo()

    /* "quem não foi perguntado não errou" — e a pergunta nem existe mais: a tela de resultado
       tomou o lugar (v2). Acertar depois da hora continua impossível. */
    expect(clicar('house')).toBe('ausente')

    expect(relatorio).toBeNull()
    expect(clicar('Continuar')).toBe('clicou')
    expect(relatorio).not.toBeNull()
    expect(relatorio!.items).toHaveLength(0)
  })

  it('a dica "cortar duas" não funciona mais depois do fim do tempo', () => {
    const items = itens()
    render(<BlitzGame items={items} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    esgotarOTempo()
    /* v2: a tela de resultado substitui o jogo — a tesoura some junto com a pergunta. */
    const tesoura = screen.queryByRole('button', { name: 'Cortar duas alternativas' })
    expect(tesoura === null || (tesoura as HTMLButtonElement).disabled).toBe(true)
  })

  /* A rodada normal tem de continuar funcionando: sem isto, "congelar" poderia ser só travar tudo. */
  it('entre um item e outro a tela volta a aceitar resposta', () => {
    const items = itens()
    render(<BlitzGame items={items} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)

    responderCerto(items)
    /* Durante a revelação, as alternativas ficam bloqueadas. */
    expect(clicar('dog')).toBe('desabilitado')
    avancar(560)
    /* Passada a revelação, o próximo item aceita. */
    const pergunta = document.querySelector('[data-tour="pergunta"]')?.textContent ?? ''
    expect(pergunta).not.toBe('casa')
    responderCerto(items)
  })
})
