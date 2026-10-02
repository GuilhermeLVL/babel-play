// @vitest-environment jsdom
/**
 * OS JOGOS POR DENTRO, NO META QUEST (02/10/2026): o que cada tabuleiro muda no headset.
 *
 * O que fica travado aqui:
 *  · nada depende de arrasto, de teclado físico nem de hover (o Caça-palavras é de dois toques, o Termo
 *    tem as teclas do cursor, as ajudas do Caça-palavras têm nome e agem na pista escolhida);
 *  · botão de ouvir só aparece quando há voz para o idioma do texto; sem voz o jogo mostra o texto;
 *  · o Karaokê diz por que não dá nota, em vez de oferecer um botão que não faz nada;
 *  · o certo e o errado vêm escritos, não só pintados;
 *  · fora do Quest os mesmos jogos continuam como eram.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RodadaConectores, RodadaDitado, RodadaEscuta, RodadaFrase, RodadaTermo } from '../src/core'
import type { EstadoDoJogo } from '../src/core/minigames/estadoDosJogos'
import type { MinigameId, MinigameItem } from '../src/core/minigames/types'

/** O aparelho do teste: Quest ou computador, e os idiomas que a voz lê agora. */
const aparelho = vi.hoisted(() => ({ quest: true, vozes: new Set<string>() }))

vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const m = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return {
    ...m,
    perfilDoDispositivo: () => ({ ...m.perfilDoDispositivo(), tipo: aparelho.quest ? 'quest' : 'desktop-com-gpu' }),
  }
})
vi.mock('../src/lib/voz/haVoz', () => ({
  haVozPara: (idioma: string) => aparelho.vozes.has((idioma || '').toLowerCase().split('-')[0]),
  aparelhoTemVoz: () => false,
  instalarVozDoSite: () => false,
}))
vi.mock('../src/lib/juice', () => ({
  contarAte: vi.fn(async () => {}),
  comemorar: vi.fn(),
  tremor: vi.fn(),
  tremorDeTela: vi.fn(),
  pulsoDeZoom: vi.fn(),
  executarEfeito: vi.fn(),
  pontosFlutuantes: vi.fn(),
  pontosDoElemento: vi.fn(),
  multiplicador: (n: number) => (n >= 6 ? 3 : n >= 3 ? 2 : 1),
}))
vi.mock('../src/lib/comemoracao', () => ({ celebrar: vi.fn(), definirJogoEmCurso: vi.fn() }))
vi.mock('../src/lib/effects', () => ({ emitBurst: vi.fn() }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))
const falar = vi.hoisted(() => vi.fn(() => true))
vi.mock('../src/lib/tts', async (original) => ({
  ...(await original<typeof import('../src/lib/tts')>()),
  falar,
  speak: vi.fn(),
  cancelSpeech: vi.fn(),
}))

const { jogosQueAbremNoQuest, tilesDoQuest } = await import('../src/components/views/play/quest/jogosNoQuest')
const { default: WordSearchGame } = await import('../src/components/minigames/WordSearchGame')
const { default: TermoGame } = await import('../src/components/minigames/TermoGame')
const { default: EscutaGame } = await import('../src/components/minigames/EscutaGame')
const { default: DitadoGame } = await import('../src/components/minigames/DitadoGame')
const { default: KaraokeGame } = await import('../src/components/minigames/KaraokeGame')
const { default: ScrambleGame } = await import('../src/components/minigames/ScrambleGame')
const { default: ConectoresGame } = await import('../src/components/minigames/ConectoresGame')
const { default: MemoryGame } = await import('../src/components/minigames/MemoryGame')
const { default: KarutaGame } = await import('../src/components/minigames/culturais/KarutaGame')
const { default: TenseTennisGame } = await import('../src/components/minigames/culturais/TenseTennisGame')
const { default: VitendawiliGame } = await import('../src/components/minigames/culturais/VitendawiliGame')
const { default: ChoseongGame } = await import('../src/components/minigames/culturais/ChoseongGame')
const { default: CadavreExquisGame } = await import('../src/components/minigames/culturais/CadavreExquisGame')

const ITENS: MinigameItem[] = [
  { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en', sentence: 'My house is big.' },
  { cardId: 'c2', prompt: 'cachorro', answer: 'dog', lang: 'en', sentence: 'The dog runs fast.' },
  { cardId: 'c3', prompt: 'gato', answer: 'cat', lang: 'en', sentence: 'A cat sleeps here.' },
  { cardId: 'c4', prompt: 'água', answer: 'water', lang: 'en', sentence: 'I drink water daily.' },
]
const nada = () => {}
const avancar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const botao = (nome: string | RegExp) => screen.queryByRole('button', { name: nome }) as HTMLButtonElement | null

beforeEach(() => {
  aparelho.quest = true
  aparelho.vozes = new Set()
  vi.useFakeTimers({ shouldAdvanceTime: false })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  localStorage.clear()
})

/* ── O LOBBY: quem depende de voz abre quando há voz para o idioma do baralho ─────────────────── */
describe('tilesDoQuest: a voz do idioma do baralho', () => {
  const QUEST = { vozDeLeitura: false, reconhecimentoDoNavegador: false, tecladoFisico: false }
  const jogo = (id: MinigameId, estado: Partial<EstadoDoJogo> = {}) => ({
    id,
    estado: {
      id,
      ok: true,
      disponiveis: 8,
      faltam: 0,
      fonte: 'baralho',
      tamanhoDaRodada: 8,
      ...estado,
    } as EstadoDoJogo,
  })
  const leIngles = (idioma: string) => idioma === 'en'
  const tile = (id: MinigameId, voz?: Parameters<typeof tilesDoQuest>[3], estado: Partial<EstadoDoJogo> = {}) =>
    tilesDoQuest([jogo(id, estado)], QUEST, () => 'falta material', voz)[0]

  it('sem gravação, a Escuta abre quando a voz lê o idioma do baralho', () => {
    const t = tile('escuta', { idioma: 'en', haVozPara: leIngles })
    expect(t).toMatchObject({ apagado: false, grupo: 'audio', tag: 'Voz de leitura' })
  })

  it('sem voz para o idioma, Escuta e Ditado ABREM pela tradução, e o cartão diz isso', () => {
    // Os dois jogos têm a alternativa escrita (o ramo `!temSom`): apagar o cartão escondia um jogo jogável.
    const escuta = tile('escuta', { idioma: 'de', haVozPara: leIngles })
    expect(escuta).toMatchObject({ apagado: false, grupo: 'audio', tag: 'Pela tradução' })
    expect(escuta.nota).toMatch(/alemão/i)
    expect(escuta.nota).toMatch(/a pergunta vem escrita/)
    // O Ditado continua pedindo o teclado do sistema: fica no grupo de quem digita.
    expect(tile('ditado', { idioma: 'de', haVozPara: leIngles })).toMatchObject({
      apagado: false,
      grupo: 'teclado',
      tag: 'Pela tradução',
    })
  })

  it('quando o gate do material diz "sem voz" (não conhece a alternativa escrita), o cartão não abre', () => {
    const t = tile('escuta', { idioma: 'de', haVozPara: leIngles }, { ok: false, motivo: 'sem-voz', disponiveis: 0 })
    expect(t).toMatchObject({ apagado: true, grupo: 'aparelho', tag: 'Pede voz de leitura' })
    expect(t.nota).toMatch(/alemão/i)
  })

  it('sem saber o idioma, vale "há alguma voz aqui": o jogo confere fala a fala', () => {
    expect(tile('escuta', { haAlgumaVoz: () => true }).tag).toBe('Voz de leitura')
    expect(tile('escuta', { haAlgumaVoz: () => false }).tag).toBe('Pela tradução')
    // Sem o quarto parâmetro, nada de voz no jsdom: abre pela tradução.
    expect(tile('escuta')).toMatchObject({ apagado: false, tag: 'Pela tradução' })
  })

  it('com a gravação, a voz não entra na conta', () => {
    expect(tile('escuta', { idioma: 'de', haVozPara: leIngles }, { fonte: 'falas' })).toMatchObject({
      apagado: false,
      tag: 'Áudio da sessão',
    })
  })

  it('o Karaokê ABRE quando há som (o clipe ou a voz), avisando que não há nota de voz', () => {
    // O jogo tem o modo "ouça, repita em voz alta e siga" (`semNotaAqui`): só não há nota.
    const comClipe = tile('karaoke', { idioma: 'de', haVozPara: leIngles }, { fonte: 'falas' })
    expect(comClipe).toMatchObject({ apagado: false, grupo: 'audio', tag: 'Sem nota de voz' })
    expect(comClipe.nota).toMatch(/não dá nota de pronúncia/)
    expect(tile('karaoke', { idioma: 'en', haVozPara: leIngles })).toMatchObject({
      apagado: false,
      tag: 'Sem nota de voz',
    })
  })

  it('e só fica apagado sem som nenhum: sem gravação e sem voz para o idioma', () => {
    const t = tile('karaoke', { idioma: 'de', haVozPara: leIngles })
    expect(t).toMatchObject({ apagado: true, grupo: 'aparelho', tag: 'Pede voz de leitura' })
    expect(t.nota).toMatch(/alemão/i)
  })

  it('o Termo joga-se apontando (teclado na tela); os de campo pedem o teclado do sistema e abrem', () => {
    expect(tile('termo')).toMatchObject({ apagado: false, grupo: 'apontar', tag: 'Teclado na tela' })
    expect(tile('tenis')).toMatchObject({ apagado: false, grupo: 'teclado', tag: 'Pede teclado' })
    expect(tile('cadavre')).toMatchObject({ apagado: false, grupo: 'teclado' })
    expect(tile('choseong')).toMatchObject({ apagado: false, grupo: 'apontar', tag: 'Apontar' })
  })

  describe('a ordem é a do usuário', () => {
    // A entrada já vem na ordem de `aplicarOrdem`; aqui o que se confere é a grade do headset.
    const jogos = [
      jogo('tenis'), // teclado
      jogo('escuta', { fonte: 'falas' }), // áudio
      jogo('memory'), // apontar
      jogo('blitz'), // apontar
      jogo('wordsearch', { ok: false, faltam: 2 }), // falta material
      jogo('karaoke'), // sem som nenhum: apagado
    ]
    const ids = (ordem?: Parameters<typeof tilesDoQuest>[4]) =>
      tilesDoQuest(jogos, QUEST, () => 'falta material', { idioma: 'de', haVozPara: leIngles }, ordem).map(
        (t) => t.jogo.id,
      )

    it('sem preferência, os grupos desempatam: apontar, áudio, teclado, e no fim o que não abre', () => {
      expect(ids()).toEqual(['memory', 'blitz', 'escuta', 'tenis', 'karaoke', 'wordsearch'])
    })

    it('o favorito sobe para o começo da grade inteira, mesmo sendo do grupo do teclado', () => {
      expect(ids({ fixados: ['tenis'] })).toEqual(['tenis', 'memory', 'blitz', 'escuta', 'karaoke', 'wordsearch'])
      // Dois favoritos: na ordem em que foram fixados.
      expect(ids({ fixados: ['escuta', 'tenis'] }).slice(0, 2)).toEqual(['escuta', 'tenis'])
    })

    it('a ordem que a pessoa montou vale acima dos grupos; o que ela não ordenou vem depois', () => {
      expect(ids({ ordem: ['tenis', 'blitz'] })).toEqual([
        'tenis',
        'blitz',
        'memory',
        'escuta',
        'karaoke',
        'wordsearch',
      ])
    })

    it('favorito que não abre aqui não fura a fila: o apagado fica sempre no fim', () => {
      expect(ids({ fixados: ['karaoke', 'blitz'] })).toEqual([
        'blitz',
        'memory',
        'escuta',
        'tenis',
        'karaoke',
        'wordsearch',
      ])
    })
  })

  it('os jogos que abrem no headset: é entre eles que a partida rápida sorteia e a sugestão escolhe', () => {
    const abrem = jogosQueAbremNoQuest(
      [jogo('memory'), jogo('karaoke'), jogo('escuta'), jogo('wordsearch', { ok: false, faltam: 2 })],
      QUEST,
      { idioma: 'de', haVozPara: leIngles },
    )
    // Karaokê sem som nenhum e Caça-palavras sem material ficam de fora; a Escuta abre pela tradução.
    expect([...abrem].sort()).toEqual(['escuta', 'memory'])
  })
})

/* ── CAÇA-PALAVRAS ────────────────────────────────────────────────────────────────────────────── */
describe('Caça-palavras no Quest', () => {
  const celulas = () => [...document.querySelectorAll<HTMLButtonElement>('[data-tour="grade"] > button')]
  /** As duas pontas da palavra, lidas da grade que está na tela (a semente é aleatória). */
  function pontas(palavra: string): [HTMLButtonElement, HTMLButtonElement] {
    const cs = celulas()
    const n = Math.round(Math.sqrt(cs.length))
    const letra = (l: number, c: number) => cs[l * n + c]?.textContent?.trim()
    const W = palavra.toUpperCase()
    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [-1, 1],
      [0, -1],
      [-1, 0],
      [-1, -1],
      [1, -1],
    ]
    for (let l = 0; l < n; l++)
      for (let c = 0; c < n; c++)
        for (const [dl, dc] of dirs) {
          let ok = true
          for (let k = 0; k < W.length && ok; k++) {
            const L = l + dl * k
            const C = c + dc * k
            if (L < 0 || C < 0 || L >= n || C >= n || letra(L, C) !== W[k]) ok = false
          }
          if (ok) return [cs[l * n + c], cs[(l + dl * (W.length - 1)) * n + c + dc * (W.length - 1)]]
        }
    throw new Error('palavra fora da grade: ' + palavra)
  }
  const achadas = () => screen.queryAllByLabelText('encontrada').length
  const montar = () => render(<WordSearchGame items={ITENS} ageProfile="pro" onFinish={nada} onExit={nada} />)
  const pista = (texto: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('.qj-pista')].find((b) => b.textContent?.includes(texto))!

  it('é de dois toques: o arrasto não marca nada, e a instrução não fala em arrastar', () => {
    montar()
    expect(document.getElementById('como-marcar')?.textContent).toBe(
      'Toque na primeira letra da palavra e depois na última.',
    )
    const [a, b] = pontas('house')
    fireEvent.pointerDown(a, { pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerEnter(b, { pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(b, { pointerId: 1, pointerType: 'mouse' })
    expect(achadas()).toBe(0)

    fireEvent.click(a)
    expect(a.getAttribute('aria-pressed')).toBe('true')
    expect(document.getElementById('como-marcar')?.textContent).toMatch(/última letra/)
    fireEvent.click(b)
    expect(achadas()).toBe(1)
  })

  it('as quatro ajudas têm nome, dizem o que custam e agem na pista escolhida', () => {
    montar()
    const ajudas = [...document.querySelectorAll<HTMLButtonElement>('.qj-caca-ajudas button')]
    expect(ajudas.map((b) => b.querySelector('b')?.textContent)).toEqual(['Raspar', 'Radar', 'Dica', 'Revelar'])
    expect(ajudas.every((b) => (b.querySelector('small')?.textContent ?? '').length > 0)).toBe(true)

    // De início, a primeira pista que falta; tocar em outra troca a escolhida.
    expect(pista('casa').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(pista('gato'))
    expect(pista('gato').getAttribute('aria-pressed')).toBe('true')
    expect(pista('casa').getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(ajudas[0]) // raspar: mostra a palavra, sem encerrar a pista
    expect(pista('gato').textContent).toContain('cat')
    expect(pista('gato').disabled).toBe(false)
    expect(ajudas[0].disabled).toBe(true)

    fireEvent.click(ajudas[3]) // revelar: encerra a pista, e a escolhida passa a ser a próxima que falta
    expect(pista('gato').disabled).toBe(true)
    expect(pista('gato').dataset.estado).toBe('revelada')
    expect(pista('casa').getAttribute('aria-pressed')).toBe('true')
  })

  it('o campo de destaque continua lá (o teclado do sistema sobe no foco)', () => {
    montar()
    const campo = document.getElementById('destaque-letras') as HTMLInputElement
    fireEvent.change(campo, { target: { value: 'h' } })
    expect(document.getElementById('destaque-ajuda')?.textContent).toMatch(/aceso/)
  })

  it('fora do Quest nada muda: a instrução de sempre e os ícones por pista', () => {
    aparelho.quest = false
    montar()
    expect(document.getElementById('como-marcar')?.textContent).toMatch(/^Arraste/)
    expect(document.querySelector('.qj-caca')).toBeNull()
    expect(screen.getAllByLabelText('Raspar para ver a palavra')).toHaveLength(4)
  })
})

/* ── TERMO ────────────────────────────────────────────────────────────────────────────────────── */
describe('Termo no Quest', () => {
  const RODADAS: RodadaTermo[] = [
    { cardId: 'c1', palavra: 'home', resposta: 'HOME', pista: 'lar', lang: 'en' },
    { cardId: 'c2', palavra: 'door', resposta: 'DOOR', pista: 'porta', lang: 'en' },
    { cardId: 'c3', palavra: 'tree', resposta: 'TREE', pista: 'árvore', lang: 'en' },
  ]
  const montar = () => render(<TermoGame rodadas={RODADAS} ageProfile="pro" onFinish={nada} onExit={nada} />)
  /** A casa em digitação com o cursor: no jsdom (largura 0) ela não é botão, é `gridcell`. */
  const noCursor = () => document.querySelector<HTMLElement>('.linha-termo.atual [aria-current="true"]')
  const posicao = () => noCursor()?.getAttribute('aria-label')

  it('joga-se só com o teclado na tela: letras, enviar, apagar e as duas teclas do cursor', () => {
    montar()
    expect(document.querySelector('[data-qj="termo"]')).not.toBeNull()
    expect(posicao()).toMatch(/^Posição 1,/)
    fireEvent.click(botao('H')!)
    expect(posicao()).toMatch(/^Posição 2,/)
    fireEvent.click(botao('Casa seguinte')!)
    expect(posicao()).toMatch(/^Posição 3,/)
    fireEvent.click(botao('Casa anterior')!)
    fireEvent.click(botao('Casa anterior')!)
    expect(posicao()).toBe('Posição 1, letra H')
    expect(botao(/enviar palpite/i)).not.toBeNull()
    expect(botao('Apagar letra')).not.toBeNull()
  })

  it('"Ouvir" só aparece com voz para o idioma da palavra', () => {
    montar()
    expect(botao('Ouvir')).toBeNull()
    cleanup()
    aparelho.vozes = new Set(['en'])
    montar()
    expect(botao('Ouvir')).not.toBeNull()
  })

  it('fora do Quest não há teclas de cursor, e as casas em digitação são botões', () => {
    aparelho.quest = false
    montar()
    expect(botao('Casa anterior')).toBeNull()
    expect(document.querySelector('[data-lado]')).toBeNull()
    expect(document.querySelectorAll('.linha-termo.atual button')).toHaveLength(4)
    expect(botao('Ouvir')).not.toBeNull()
  })
})

/* ── A VOZ: escuta, ditado, karaokê, karuta, frase embaralhada, charada ───────────────────────── */
describe('a voz dentro dos jogos', () => {
  const fala = (id: string, text: string, lang: string, translation?: string) => ({
    id,
    text,
    lang,
    startMs: 0,
    endMs: 0,
    ...(translation ? { translation } : {}),
  })
  const escuta = (lang: string): RodadaEscuta[] => {
    const certa = fala('f1', lang === 'de' ? 'Guten Morgen' : 'Good morning', lang, 'Bom dia')
    return [{ correta: certa, opcoes: [certa, fala('f2', lang === 'de' ? 'Gute Nacht' : 'Good night', lang)] }]
  }

  it('Escuta com voz para o idioma: o botão de ouvir está lá, e a fala toca pela voz', () => {
    aparelho.vozes = new Set(['en'])
    render(<EscutaGame rodadas={escuta('en')} audioUrl="" ageProfile="pro" onFinish={nada} onExit={nada} />)
    expect(document.querySelector('[data-tour="ouvir"]')).not.toBeNull()
    expect(document.querySelector('.qj-sem-voz')).toBeNull()
  })

  it('Escuta sem voz: nada de botão mudo; a tradução vira a pergunta, e o veredito vem escrito', () => {
    render(<EscutaGame rodadas={escuta('de')} audioUrl="" ageProfile="pro" onFinish={nada} onExit={nada} />)
    expect(document.querySelector('[data-tour="ouvir"]')).toBeNull()
    expect(document.querySelector('.qj-sem-voz')?.textContent).toMatch(/Sem voz de leitura em alemão/i)
    expect(document.querySelector('[data-qp="enunciado"]')?.textContent).toBe('Bom dia')
    expect(falar).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Gute Nacht' }))
    const veredito = document.querySelector('.qj-veredito') as HTMLElement
    expect(veredito.dataset.estado).toBe('errado')
    expect(veredito.textContent).toMatch(/Não era essa/)
  })

  it('Escuta com a gravação: o som é o clipe, e a voz não entra na conta', () => {
    render(<EscutaGame rodadas={escuta('de')} audioUrl="blob:audio" ageProfile="pro" onFinish={nada} onExit={nada} />)
    expect(document.querySelector('[data-tour="ouvir"]')).not.toBeNull()
  })

  it('Ditado sem voz: a fala é escrita a partir da tradução; o campo é do teclado do sistema', () => {
    const rodadas: RodadaDitado[] = [
      { fala: fala('d1', 'Wo ist der Bahnhof', 'de', 'Onde fica a estação'), palavras: 4 },
    ]
    render(<DitadoGame rodadas={rodadas} audioUrl="" ageProfile="pro" onFinish={nada} onExit={nada} />)
    expect(document.querySelector('[data-tour="ouvir"]')).toBeNull()
    expect(document.querySelector('[data-qp="enunciado"]')?.textContent).toBe('Onde fica a estação')
    const campo = document.querySelector('[data-tour="entrada"]') as HTMLInputElement
    expect(campo.getAttribute('enterkeyhint')).toBe('done')
    expect(document.activeElement).not.toBe(campo) // não rouba o foco: o teclado sobe no toque
    expect(botao(/pular/)).not.toBeNull()

    fireEvent.change(campo, { target: { value: 'Wo ist der Bahnhof' } })
    fireEvent.click(botao('Conferir')!)
    expect(document.querySelector('.qj-veredito')?.textContent).toMatch(/Passou/)
  })

  it('Karaokê: o motivo no lugar do botão de falar; ouvir e próxima continuam', () => {
    aparelho.vozes = new Set(['en'])
    const falas = [{ id: 'k1', texto: 'Good morning', lang: 'en', startMs: 0, endMs: 0 }]
    render(<KaraokeGame falas={falas} audioUrl="" ageProfile="pro" onFinish={nada} onExit={nada} />)
    expect(screen.getByTestId('karaoke-sem-nota').textContent).toMatch(/O headset não avalia a pronúncia/)
    expect(botao(/Falar/)).toBeNull()
    expect(botao('Ouvir')).not.toBeNull()
    expect(botao(/Terminar/)).not.toBeNull()
  })

  it('Karuta: sem voz para o idioma da pista, ela vem escrita e sem custar dica', () => {
    render(<KarutaGame items={ITENS} ageProfile="pro" onFinish={nada} onExit={nada} />)
    expect(document.querySelector('[data-tour="pista"]')?.textContent).toBe('casa')
    expect(botao('Ouvir de novo')).toBeNull()
    expect(botao('Ler a pista')).toBeNull()
    expect(falar).not.toHaveBeenCalled()
  })

  it('Karuta: com voz para o idioma da pista, o narrador declama e ler é uma dica', () => {
    aparelho.vozes = new Set(['pt', 'en'])
    render(<KarutaGame items={ITENS} ageProfile="pro" onFinish={nada} onExit={nada} />)
    expect(document.querySelector('[data-tour="pista"]')).toBeNull()
    expect(botao('Ouvir de novo')).not.toBeNull()
    expect(botao('Ler a pista')).not.toBeNull()
    expect(falar).toHaveBeenCalledWith('casa', expect.stringMatching(/^pt/), expect.anything())
  })

  it('Frase embaralhada: "Ouvir" some sem voz; as peças não falam, e o acerto vem escrito', () => {
    const rodadas: RodadaFrase[] = [
      { correta: ['Ich', 'bin', 'hier'], embaralhada: ['hier', 'Ich', 'bin'], traducao: 'Estou aqui', lang: 'de' },
    ]
    render(<ScrambleGame rodadas={rodadas} ageProfile="pro" onFinish={nada} onExit={nada} />)
    expect(botao('Ouvir')).toBeNull()
    for (const palavra of ['Ich', 'bin', 'hier']) fireEvent.click(screen.getByRole('button', { name: palavra }))
    expect(falar).not.toHaveBeenCalled()
    expect(screen.getByText('Toque numa palavra da linha para tirá-la.')).toBeTruthy()
    fireEvent.click(botao('Conferir')!)
    expect(document.querySelector('.qj-veredito')?.textContent).toMatch(/Frase certa/)
  })

  it('Charada: o enigma está sempre escrito; "Ouvir" só com voz; a certa fica marcada', () => {
    render(<VitendawiliGame items={ITENS} ageProfile="pro" onFinish={nada} onExit={nada} />)
    expect(document.querySelector('[data-tour="enigma"]')?.textContent).toMatch(/My/)
    expect(botao('Ouvir')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'dog' }))
    expect(screen.getByRole('button', { name: 'dog' }).dataset.estado).toBe('errado')
    fireEvent.click(screen.getByRole('button', { name: 'house' }))
    expect(screen.getByRole('button', { name: 'house' }).dataset.estado).toBe('certo')
  })

  it('Memória: virar a carta não chama a voz quando não há voz para o idioma', () => {
    render(<MemoryGame items={ITENS} ageProfile="pro" onFinish={nada} onExit={nada} />)
    fireEvent.click(document.querySelector('[data-texto="house"]')!)
    expect(falar).not.toHaveBeenCalled()
    cleanup()
    aparelho.vozes = new Set(['en'])
    render(<MemoryGame items={ITENS} ageProfile="pro" onFinish={nada} onExit={nada} />)
    fireEvent.click(document.querySelector('[data-texto="house"]')!)
    expect(falar).toHaveBeenCalledWith('house', 'en', expect.anything())
  })
})

/* ── CAMPOS E PEÇAS ───────────────────────────────────────────────────────────────────────────── */
describe('campos e peças no Quest', () => {
  it('Tênis: o campo não desliga entre as bolas (o teclado do sistema fica aberto)', () => {
    render(<TenseTennisGame items={ITENS} ageProfile="pro" onFinish={nada} onExit={nada} />)
    const campo = screen.getByLabelText('Sua devolução') as HTMLInputElement
    expect(campo.getAttribute('enterkeyhint')).toBe('send')
    fireEvent.change(campo, { target: { value: 'house' } })
    fireEvent.click(botao('Devolver')!)
    expect(campo.disabled).toBe(false)
    avancar(600)
    expect(document.querySelector('[data-tour="bola"] p')?.textContent).toBe('cachorro')
  })

  it('Tênis: o saque dura três vezes mais no headset (digita-se apontando no teclado do sistema)', () => {
    render(<TenseTennisGame items={ITENS} ageProfile="pro" onFinish={nada} onExit={nada} />)
    expect(document.querySelector('[data-tour="relogio"]')?.textContent).toBe('18 s')
    cleanup()
    aparelho.quest = false
    render(<TenseTennisGame items={ITENS} ageProfile="pro" onFinish={nada} onExit={nada} />)
    expect(document.querySelector('[data-tour="relogio"]')?.textContent).toBe('6 s')
  })

  it('as ajudas do placar dizem o que fazem e o que custam num "?" (no headset não há dica ao parar o ponteiro)', () => {
    const rodadas: RodadaDitado[] = [
      {
        fala: { id: 'd1', text: 'Wo ist der Bahnhof', lang: 'de', translation: 'Onde fica a estação' } as never,
        palavras: 4,
      },
    ]
    render(<DitadoGame rodadas={rodadas} audioUrl="" ageProfile="pro" onFinish={nada} onExit={nada} />)
    expect(document.querySelector('.qj-ajudas-notas')).toBeNull()
    fireEvent.click(botao('O que cada ajuda faz')!)
    expect(document.querySelector('.qj-ajudas-notas')?.textContent).toMatch(
      /Revelar a próxima palavra \(conta como dica\)/,
    )
    cleanup()
    aparelho.quest = false
    render(<DitadoGame rodadas={rodadas} audioUrl="" ageProfile="pro" onFinish={nada} onExit={nada} />)
    expect(botao('O que cada ajuda faz')).toBeNull()
  })

  it('Tênis fora do Quest: o campo desliga enquanto a devolução é conferida, como sempre', () => {
    aparelho.quest = false
    render(<TenseTennisGame items={ITENS} ageProfile="pro" onFinish={nada} onExit={nada} />)
    const campo = screen.getByLabelText('Sua devolução') as HTMLInputElement
    expect(campo.getAttribute('enterkeyhint')).toBeNull()
    fireEvent.change(campo, { target: { value: 'house' } })
    fireEvent.click(botao('Devolver')!)
    expect(campo.disabled).toBe(true)
  })

  it('Choseong: as vogais são teclas na tela, e a tentativa errada é dita em texto', () => {
    render(<ChoseongGame items={ITENS} ageProfile="pro" onFinish={nada} onExit={nada} />)
    expect(document.querySelectorAll('[data-tour="teclado"] [data-qp="tecla"]')).toHaveLength(6)
    // "house" tem três vogais (O, U, E): três erradas fecham uma tentativa.
    for (const v of ['A', 'A', 'A']) fireEvent.click(botao(v)!)
    expect(document.querySelector('.qj-veredito')?.textContent).toMatch(/Não é essa/)
    fireEvent.click(botao('O')!)
    expect(document.querySelector('.qj-veredito')).toBeNull()
  })

  it('Conectores: cada palavra é uma peça, e o resultado de cada uma vem na marcação', () => {
    const rodadas: RodadaConectores[] = [
      {
        fala: { id: 'c1', text: 'I stayed because it rained', lang: 'en', startMs: 0, endMs: 0 },
        tokens: ['I', 'stayed', 'because', 'it', 'rained'],
        alvos: [2],
      },
    ]
    render(<ConectoresGame rodadas={rodadas} ageProfile="pro" onFinish={nada} onExit={nada} />)
    const peca = (nome: string) => screen.getByRole('button', { name: nome })
    fireEvent.click(peca('because'))
    fireEvent.click(peca('stayed'))
    expect(peca('because').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(botao('Conferir')!)
    expect(peca('because').dataset.estado).toBe('certo')
    expect(peca('stayed').dataset.estado).toBe('errado')
    expect(peca('rained').dataset.estado).toBeUndefined()
    expect(document.querySelector('.qj-veredito')).not.toBeNull()
  })

  it('Frase maluca: o campo é do teclado do sistema, e os botões de ouvir seguem a voz', () => {
    render(<CadavreExquisGame items={ITENS} ageProfile="pro" onFinish={nada} onExit={nada} />)
    expect(document.querySelector('textarea[data-qp="campo"]')).not.toBeNull()
    expect(botao('Ouvir house')).toBeNull()
    cleanup()
    aparelho.vozes = new Set(['en'])
    render(<CadavreExquisGame items={ITENS} ageProfile="pro" onFinish={nada} onExit={nada} />)
    expect(botao('Ouvir house')).not.toBeNull()
  })
})
