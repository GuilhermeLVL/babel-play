// @vitest-environment jsdom
/**
 * OS JOGOS POR DENTRO, NO META QUEST (02/10/2026): o que cada tabuleiro muda no headset.
 *
 * O que fica travado aqui (os tabuleiros são os do protótipo; o que é do APARELHO continua valendo):
 *  · o lobby abre o jogo que depende de voz quando há voz para o idioma do baralho, e diz o motivo quando não;
 *  · botão de ouvir só aparece quando há voz para o idioma do texto; sem voz a tela diz que não há;
 *  · o Karaokê diz por que não dá nota, em vez de oferecer um botão que não faz nada.
 */
import { cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RodadaEscuta } from '../src/core'
import type { EstadoDoJogo } from '../src/core/minigames/estadoDosJogos'
import type { MinigameId } from '../src/core/minigames/types'

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
const { default: EscutaGame } = await import('../src/components/minigames/EscutaDoPrototipo')
const { default: KaraokeGame } = await import('../src/components/minigames/KaraokeDoPrototipo')

const nada = () => {}
const um = (s: string) => document.querySelector<HTMLElement>(s)

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
    render(<EscutaGame rodadas={escuta('en')} audioUrl="" onFinish={nada} onExit={nada} />)
    expect(document.querySelector('[data-tour="ouvir"]')).not.toBeNull()
    expect(document.querySelector('.qj-sem-voz')).toBeNull()
  })

  it('Escuta sem voz para o idioma e sem gravação: a tela diz que não há voz, em vez de um botão mudo', () => {
    render(<EscutaGame rodadas={escuta('de')} audioUrl="" onFinish={nada} onExit={nada} />)
    expect(document.querySelector('.qj-sem-voz')?.textContent).toMatch(/Sem voz de leitura/)
  })

  it('Escuta com a gravação: o som é o clipe, e a voz não entra na conta', () => {
    render(<EscutaGame rodadas={escuta('de')} audioUrl="blob:audio" onFinish={nada} onExit={nada} />)
    expect(document.querySelector('[data-tour="ouvir"]')).not.toBeNull()
  })

  it('Karaokê: o motivo no lugar do botão de falar; ouvir e próxima continuam', () => {
    aparelho.vozes = new Set(['en'])
    const falas = [{ id: 'k1', texto: 'Good morning', lang: 'en', startMs: 0, endMs: 0 }]
    render(<KaraokeGame falas={falas} audioUrl="" onFinish={nada} onExit={nada} />)
    expect(um('.pj-nota')?.textContent).toMatch(/O headset não avalia a pronúncia/)
    expect(um('[data-pj="falar"]')).toBeNull()
    expect(um('[data-pj="ouvir"]')).not.toBeNull()
    expect(um('[data-pj="pular"]')?.textContent).toMatch(/Terminar/)
  })
})

/* ── O MESMO DESENHO NO COMPUTADOR (02/10/2026) ───────────────────────────────────────────────────
   O dono quis o desenho do headset no computador. O DESENHO vem (as peças, o veredito escrito, as ajudas
   com nome); o que era LIMITE DO APARELHO não vem: lá há mouse que arrasta, teclado físico, a voz do
   navegador e, quando o navegador tem, o reconhecimento de fala. */
describe('no computador com o desenho novo', () => {
  beforeEach(() => {
    aparelho.quest = false
    localStorage.setItem('babel.desenhoNovo', 'sim')
  })

  it('o lobby: "Clicar" e "Digitar" no lugar de "Apontar" e "Teclado na tela", e nada de "headset"', () => {
    const PC = { vozDeLeitura: true, reconhecimentoDoNavegador: false, tecladoFisico: true }
    const estado = (id: MinigameId) =>
      ({ id, ok: true, disponiveis: 8, faltam: 0, fonte: 'falas', tamanhoDaRodada: 8 }) as EstadoDoJogo
    const tiles = tilesDoQuest(
      (['memory', 'termo', 'tenis', 'karaoke'] as MinigameId[]).map((id) => ({ id, estado: estado(id) })),
      PC,
      () => '',
      { idioma: 'en' },
    )
    const de = (id: MinigameId) => tiles.find((t) => t.jogo.id === id)!
    expect(de('memory').tag).toBe('Clicar')
    expect(de('termo').tag).toBe('Digitar')
    expect(de('tenis')).toMatchObject({ tag: 'Digitar', grupo: 'apontar', apagado: false })
    // Navegador sem reconhecimento de fala (Firefox): o Karaokê abre sem nota, e a frase é a do navegador.
    expect(de('karaoke').tag).toBe('Sem nota de voz')
    expect(de('karaoke').nota).toMatch(/Este navegador não dá nota de pronúncia/)
    expect(tiles.map((t) => t.nota ?? '').join(' ')).not.toMatch(/headset/i)
  })

  it('Karaokê: com reconhecimento de fala há o botão de falar e a nota, como sempre', () => {
    const w = window as unknown as { SpeechRecognition?: unknown }
    w.SpeechRecognition = function () {}
    try {
      const falas = [{ id: 'k1', texto: 'Good morning', lang: 'en', startMs: 0, endMs: 0 }]
      render(<KaraokeGame falas={falas} audioUrl="" onFinish={nada} onExit={nada} />)
      expect(um('[data-pj="falar"]')?.textContent).toMatch(/Falar agora/)
      expect(um('.pj-nota')?.textContent ?? '').not.toMatch(/não avalia a pronúncia/)
    } finally {
      delete w.SpeechRecognition
    }
  })

  it('Karaokê num navegador sem reconhecimento de fala: o motivo é do navegador, não do headset', () => {
    const falas = [{ id: 'k1', texto: 'Good morning', lang: 'en', startMs: 0, endMs: 0 }]
    render(<KaraokeGame falas={falas} audioUrl="" onFinish={nada} onExit={nada} />)
    const aviso = um('.pj-nota')?.textContent ?? ''
    expect(aviso).toMatch(/Este navegador não tem reconhecimento de voz/)
    expect(aviso).not.toMatch(/headset/i)
    expect(um('[data-pj="falar"]')).toBeNull()
    expect(um('[data-pj="ouvir"]')).not.toBeNull()
  })
})
