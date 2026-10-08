// @vitest-environment jsdom
/**
 * A CASCA DOS JOGOS COMO NO PROTÓTIPO: a tabela de níveis (`src/core/minigames/regras.ts`, porte de
 * `DIF` e `ajudasDe`, `jogos4.js:30-78`), o retorno de acerto e erro (`src/lib/polimento/jogos.ts`, porte
 * de `jogos.js:196-250`), o pulso da ajuda depois de dois erros (`jogos4.js:124-137`), a sugestão de
 * nível do fim (`jogos4.js:138-153`) e a saída das telas de dentro do Jogar (`prototipo.js:233-252`).
 *
 * Os números aqui são os do protótipo: se um mudar, o teste acusa.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { Lightbulb } from 'lucide-react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ajudasDoNivel,
  BONUS_DO_DIFICIL,
  JOGOS_COM_NIVEL,
  NIVEIS_DO_JOGO,
  nivelSugerido,
  pontosComBonus,
  regrasDoJogo,
  segundosNoNivel,
  temNivel,
  textoDoNivel,
  vezesDaAjuda,
} from '../src/core/minigames/regras'
import type { MinigameId } from '../src/core/minigames/types'

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => true,
}))
vi.mock('../src/lib/juice', async (orig) => ({
  ...(await orig<typeof import('../src/lib/juice')>()),
  pontosDoElemento: vi.fn(),
  tremor: vi.fn(),
  tremorDeTela: vi.fn(),
  vibrar: vi.fn(),
  contarAte: vi.fn(async () => {}),
}))
vi.mock('../src/lib/effects', async (orig) => ({ ...(await orig()), emitBurst: vi.fn() }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn(), somMudo: () => true }))

const { textosDoJogo, jogosSeguintes, nomeCurtoDoJogo } = await import('../src/components/minigames/polimento/textos')
const { default: HudDaRodada, BotaoDeAjuda } = await import('../src/components/minigames/casca/HudDaRodada')
const { ContextoDaRodada } = await import('../src/components/minigames/casca/CascaDaRodada')
const { default: AjudasGerais } = await import('../src/components/minigames/casca/AjudasGerais')
const { celebrar } = await import('../src/lib/comemoracao')
const jogos = await import('../src/lib/polimento/jogos')

const TODOS: MinigameId[] = [
  'memory',
  'wordsearch',
  'termo',
  'scramble',
  'blitz',
  'karuta',
  'choseong',
  'tenis',
  'koffer',
  'bao',
  'vitendawili',
  'shiritori',
  'cadavre',
  'taboo',
  'karaoke',
  'escuta',
  'ditado',
  'conectores',
]
const porNivel = <T,>(f: (n: (typeof NIVEIS_DO_JOGO)[number]) => T) => NIVEIS_DO_JOGO.map(f)

describe('a tabela de níveis do protótipo (DIF)', () => {
  it('16 jogos têm nível; Cadavre e Karaokê não', () => {
    expect(JOGOS_COM_NIVEL.length).toBe(16)
    expect(TODOS.filter((j) => !temNivel(j))).toEqual(['cadavre', 'karaoke'])
  })

  it('os textos de cada nível são os que a explicação extraída do protótipo mostra', () => {
    for (const jogo of TODOS) {
      const daTela = textosDoJogo(jogo)?.niveis ?? []
      expect(
        daTela.map(([, texto]) => texto),
        jogo,
      ).toEqual(temNivel(jogo) ? porNivel((n) => textoDoNivel(jogo, n)) : [])
    }
  })

  it('o tempo: metade a mais no Fácil, um quarto a menos no Difícil, arredondado (pjSeg)', () => {
    expect(porNivel((n) => segundosNoNivel(15, n))).toEqual([23, 15, 11])
    expect(porNivel((n) => segundosNoNivel(30, n))).toEqual([45, 30, 23])
  })

  it('cada jogo muda o que o protótipo muda, com os mesmos números', () => {
    expect(porNivel((n) => regrasDoJogo('memory', n))).toEqual([
      { pares: 6, compararEmMs: 900, fecharErradoEmMs: 1100, espiarMs: 2400 },
      { pares: 8, compararEmMs: 760, fecharErradoEmMs: 520, espiarMs: 1700 },
      { pares: 8, compararEmMs: 560, fecharErradoEmMs: 300, espiarMs: 1300 },
    ])
    expect(porNivel((n) => regrasDoJogo('wordsearch', n).direcoes)).toEqual([
      [
        [0, 1],
        [1, 0],
      ],
      [
        [0, 1],
        [1, 0],
        [1, 1],
      ],
      [
        [0, 1],
        [1, 0],
        [1, 1],
        [0, -1],
        [-1, 0],
      ],
    ])
    expect(porNivel((n) => regrasDoJogo('wordsearch', n).pistaComInicial)).toEqual([true, false, false])
    expect(porNivel((n) => regrasDoJogo('termo', n))).toEqual([
      { tentativas: { umTabuleiro: 8, doisTabuleiros: 9 }, primeiraLetraDada: true },
      { tentativas: { umTabuleiro: 6, doisTabuleiros: 7 }, primeiraLetraDada: false },
      { tentativas: { umTabuleiro: 5, doisTabuleiros: 6 }, primeiraLetraDada: false },
    ])
    expect(porNivel((n) => regrasDoJogo('scramble', n))).toEqual([
      { primeiraPalavraNoLugar: true, dizQuantasCertas: true },
      { primeiraPalavraNoLugar: false, dizQuantasCertas: true },
      { primeiraPalavraNoLugar: false, dizQuantasCertas: false },
    ])
    expect(porNivel((n) => regrasDoJogo('blitz', n))).toEqual([
      { segundos: 90, alternativas: 3, cortadas: 1 },
      { segundos: 60, alternativas: 4, cortadas: 2 },
      { segundos: 45, alternativas: 4, cortadas: 2 },
    ])
    expect(porNivel((n) => regrasDoJogo('karuta', n))).toEqual([
      { cartas: 4, segundos: 12 },
      { cartas: 6, segundos: 8 },
      { cartas: 6, segundos: 6 },
    ])
    expect(porNivel((n) => regrasDoJogo('choseong', n))).toEqual([
      { primeiraVogalAberta: true, segundos: 23 },
      { primeiraVogalAberta: false, segundos: 15 },
      { primeiraVogalAberta: false, segundos: 11 },
    ])
    expect(porNivel((n) => regrasDoJogo('tenis', n))).toEqual([
      { segundos: 11, pisoDeSegundos: 6, primeiraLetraDada: true },
      { segundos: 8, pisoDeSegundos: 4, primeiraLetraDada: false },
      { segundos: 6, pisoDeSegundos: 3, primeiraLetraDada: false },
    ])
    expect(porNivel((n) => regrasDoJogo('koffer', n))).toEqual([
      { vidas: 4, aVistaMs: 3600, etiquetasComTraducao: true },
      { vidas: 3, aVistaMs: 2700, etiquetasComTraducao: true },
      { vidas: 2, aVistaMs: 1900, etiquetasComTraducao: false },
    ])
    expect(porNivel((n) => regrasDoJogo('bao', n).errosPorPalavra)).toEqual([4, 3, 2])
    expect(porNivel((n) => regrasDoJogo('vitendawili', n))).toEqual([
      { alternativas: 3, traducaoAVista: true, umaTentativa: false },
      { alternativas: 4, traducaoAVista: false, umaTentativa: false },
      { alternativas: 4, traducaoAVista: false, umaTentativa: true },
    ])
    expect(porNivel((n) => regrasDoJogo('shiritori', n))).toEqual([
      { letraAVista: true, segundos: 23, alternativas: 3 },
      { letraAVista: false, segundos: 15, alternativas: 3 },
      { letraAVista: false, segundos: 11, alternativas: 3 },
    ])
    expect(porNivel((n) => regrasDoJogo('taboo', n))).toEqual([
      { proibidasLiberadas: 1, segundos: 45, alternativas: 3 },
      { proibidasLiberadas: 0, segundos: 30, alternativas: 4 },
      { proibidasLiberadas: 0, segundos: 23, alternativas: 4 },
    ])
    expect(porNivel((n) => regrasDoJogo('escuta', n))).toEqual([
      { alternativas: 3, ouvirDevagar: true },
      { alternativas: 4, ouvirDevagar: true },
      { alternativas: 4, ouvirDevagar: false },
    ])
    expect(porNivel((n) => regrasDoJogo('ditado', n))).toEqual([
      { limiar: 70, segundaChance: true },
      { limiar: 80, segundaChance: true },
      { limiar: 90, segundaChance: false },
    ])
    expect(porNivel((n) => regrasDoJogo('conectores', n))).toEqual([
      { limiar: 60, dizQuantos: true },
      { limiar: 70, dizQuantos: false },
      { limiar: 80, dizQuantos: false },
    ])
  })

  it('no Difícil cada acerto vale 5 pontos a mais, só nos jogos com nível', () => {
    expect(BONUS_DO_DIFICIL).toBe(5)
    expect(pontosComBonus('tenis', 'dificil', 100, 4)).toBe(120)
    expect(pontosComBonus('tenis', 'medio', 100, 4)).toBe(100)
    expect(pontosComBonus('tenis', 'facil', 100, 4)).toBe(100)
    expect(pontosComBonus('karaoke', 'dificil', 100, 4)).toBe(100)
  })
})

describe('as ajudas por nível (ajudasDe)', () => {
  const vezes = (jogo: MinigameId, chave: string) => porNivel((n) => vezesDaAjuda(jogo, chave, n))

  it('as contadas ganham uma no Fácil e perdem uma no Difícil; as sem limite continuam sem', () => {
    expect(vezes('memory', 'espiar')).toEqual([3, 2, 1])
    expect(vezes('wordsearch', 'radar')).toEqual([4, 3, 2])
    expect(vezes('termo', 'letra')).toEqual([3, 2, 1])
    expect(vezes('scramble', 'dica')).toEqual([4, 3, 2])
    expect(vezes('blitz', 'cortar')).toEqual([3, 2, 1])
    expect(vezes('choseong', 'vogal')).toEqual([3, 2, 1])
    expect(vezes('tenis', 'letra')).toEqual([3, 2, 1])
    expect(vezes('ditado', 'palavra')).toEqual([4, 3, 2])
    for (const [jogo, chave] of [
      ['termo', 'ouvir'],
      ['karuta', 'ouvir'],
      ['koffer', 'espiar'],
      ['bao', 'dica'],
      ['shiritori', 'letra'],
      ['taboo', 'liberar'],
    ] as const)
      expect(vezes(jogo, chave), jogo).toEqual([Infinity, Infinity, Infinity])
  })

  it('"+10 s" 3/2/1 só nos jogos com relógio, o Duelo entre eles', () => {
    const comTempo = TODOS.filter((j) => vezesDaAjuda(j, 'tempo', 'medio') > 0)
    expect(comTempo).toEqual(['blitz', 'karuta', 'choseong', 'tenis', 'shiritori', 'taboo'])
    for (const j of comTempo) expect(vezes(j, 'tempo'), j).toEqual([3, 2, 1])
  })

  it('"Ver resposta" 2/1/1 em todos, menos Memória, Mala, Cadavre e Karaokê', () => {
    const sem = TODOS.filter((j) => vezesDaAjuda(j, 'resposta', 'medio') === 0)
    expect(sem).toEqual(['memory', 'koffer', 'cadavre', 'karaoke'])
    expect(vezes('termo', 'resposta')).toEqual([2, 1, 1])
  })

  it('a ordem no placar: as do jogo, depois "+10 s" e "Ver resposta", como na explicação do protótipo', () => {
    for (const jogo of TODOS) {
      const daTela = (textosDoJogo(jogo)?.ajudas ?? []).map((a) => a.nome)
      expect(
        ajudasDoNivel(jogo, 'medio').map((a) => a.rotulo),
        jogo,
      ).toEqual(daTela)
    }
    expect(ajudasDoNivel('tenis', 'medio')).toEqual([
      { chave: 'letra', icone: 'lightbulb', rotulo: 'Primeira letra', vezes: 2, custa: true },
      { chave: 'tempo', icone: 'timer', rotulo: '+10 s', vezes: 2, custa: false },
      { chave: 'resposta', icone: 'eye', rotulo: 'Ver resposta', vezes: 1, custa: true },
    ])
  })
})

describe('a sugestão de nível do fim (jogos4.js:146-151)', () => {
  it('desce quem acertou menos da metade; sobe quem não errou; descer tem precedência', () => {
    expect(nivelSugerido('tenis', 'medio', 2, 6)).toBe('facil')
    expect(nivelSugerido('tenis', 'dificil', 0, 8)).toBe('medio')
    expect(nivelSugerido('tenis', 'medio', 8, 0)).toBe('dificil')
    expect(nivelSugerido('tenis', 'facil', 8, 0)).toBe('medio')
  })

  it('metade exata, erro com mais da metade, as pontas e a rodada vazia não sugerem nada', () => {
    expect(nivelSugerido('tenis', 'medio', 4, 4)).toBeNull()
    expect(nivelSugerido('tenis', 'medio', 7, 1)).toBeNull()
    expect(nivelSugerido('tenis', 'facil', 1, 7)).toBeNull()
    expect(nivelSugerido('tenis', 'dificil', 8, 0)).toBeNull()
    expect(nivelSugerido('tenis', 'medio', 0, 0)).toBeNull()
  })

  it('jogo sem nível nunca sugere', () => {
    expect(nivelSugerido('cadavre', 'medio', 0, 5)).toBeNull()
    expect(nivelSugerido('karaoke', 'medio', 5, 0)).toBeNull()
  })
})

describe('a ordem dos jogos (ORDEM_JOGOS, jogos.js:116)', () => {
  it('o próximo é o seguinte, dando a volta', () => {
    expect(jogosSeguintes('tenis')[0]).toBe('koffer')
    expect(jogosSeguintes('conectores')[0]).toBe('memory')
    expect(jogosSeguintes('tenis').length).toBe(17)
    expect(nomeCurtoDoJogo('koffer')).toBe('Mala')
  })
})

/* ---- O retorno de acerto e erro ------------------------------------------------------------------- */

let animacoes: Array<{ el: Element; quadros: Keyframe[]; o: KeyframeAnimationOptions }> = []
let terminar: Array<() => void> = []

beforeEach(() => {
  animacoes = []
  terminar = []
  Element.prototype.animate = function (this: Element, quadros: Keyframe[], o: KeyframeAnimationOptions) {
    animacoes.push({ el: this, quadros, o })
    let fim: () => void = () => undefined
    const finished = new Promise<void>((r) => (fim = r))
    terminar.push(fim)
    return { finished, cancel: vi.fn() } as unknown as Animation
  } as never
  Element.prototype.getAnimations = () => []
  document.documentElement.dataset.px = 'on'
  document.body.className = 'animations-on'
  localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.body.innerHTML = ''
  delete document.documentElement.dataset.px
})

describe('o retorno do protótipo, peça por peça', () => {
  it('o texto que sobe nasce 8 px acima do centro e sai em 1,2 s', () => {
    const el = document.body.appendChild(document.createElement('div'))
    el.getBoundingClientRect = () => ({ left: 100, top: 200, width: 40, height: 20 }) as DOMRect
    jogos.flutuar(el, '+20 ×2', 'good')
    const g = document.querySelector('.ganho') as HTMLElement
    expect(g.className).toBe('ganho good')
    expect(g.textContent).toBe('+20 ×2')
    expect([g.style.left, g.style.top]).toEqual(['120px', '202px'])
    vi.advanceTimersByTime(1199)
    expect(document.querySelector('.ganho')).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(document.querySelector('.ganho')).toBeNull()
  })

  it('"+10" sem multiplicador, "+20 ×2" com', () => {
    expect(jogos.textoDoGanho(10, 1)).toBe('+10')
    expect(jogos.textoDoGanho(20, 2)).toBe('+20 ×2')
  })

  it('a vinheta sai em 650 ms; a tremida em 450; o selo em 1050', () => {
    const palco = document.body.appendChild(document.createElement('section'))
    palco.className = 'palco-jogo'
    jogos.vinheta('erro')
    jogos.tremer(palco)
    jogos.selo('Combo ×3')
    expect(document.querySelector('body > .fx-vinheta.erro')).not.toBeNull()
    expect(palco.classList.contains('pj-treme')).toBe(true)
    expect(palco.querySelector('.selo-combo')?.textContent).toBe('Combo ×3')
    vi.advanceTimersByTime(450)
    expect(palco.classList.contains('pj-treme')).toBe(false)
    expect(document.querySelector('.fx-vinheta')).not.toBeNull()
    vi.advanceTimersByTime(200)
    expect(document.querySelector('.fx-vinheta')).toBeNull()
    expect(palco.querySelector('.selo-combo')).not.toBeNull()
    vi.advanceTimersByTime(400)
    expect(palco.querySelector('.selo-combo')).toBeNull()
  })

  it('o combo que sobe: selo, vinheta e o salto de 640 ms (1 → 1,5 com −8° → 1)', () => {
    const palco = document.body.appendChild(document.createElement('section'))
    palco.className = 'palco-jogo'
    const combo = palco.appendChild(document.createElement('span'))
    jogos.retornoDeCombo(2, combo, 'mola')
    expect(palco.querySelector('.selo-combo')?.textContent).toBe('Combo ×2')
    expect(document.querySelector('.fx-vinheta.combo')).not.toBeNull()
    expect(animacoes[0].quadros).toEqual([
      { transform: 'scale(1)' },
      { transform: 'scale(1.5) rotate(-8deg)' },
      { transform: 'scale(1)' },
    ])
    expect(animacoes[0].o).toMatchObject({ duration: 640, easing: 'mola' })
  })

  it('o pulso escolhe a dica do jogo antes de "Ver resposta", nunca o "+10 s", e dura 3,6 s', () => {
    document.body.innerHTML = `<div class="hud-ajudas">
      <button class="ajuda-jogo" data-ajuda="tempo" title="De graça"></button>
      <button class="ajuda-jogo" data-ajuda="resposta" title="Conta como dica: zera o combo"></button>
      <button class="ajuda-jogo" data-ajuda="letra" title="Conta como dica: zera o combo"></button></div>`
    const ajudas = document.querySelector('.hud-ajudas')
    const b = jogos.chamarAjuda(ajudas)
    expect(b?.dataset.ajuda).toBe('letra')
    expect(b?.classList.contains('pj-chama')).toBe(true)
    expect(document.querySelector('body > .ganho')?.textContent).toBe('quer uma ajuda?')
    expect(document.querySelector('body > .ganho')?.className).toBe('ganho')
    vi.advanceTimersByTime(3600)
    expect(b?.classList.contains('pj-chama')).toBe(false)
    /* Sem a dica do jogo: a primeira que houver. Só com o "+10 s": nenhuma. */
    ;(b as HTMLButtonElement).disabled = true
    expect(jogos.chamarAjuda(ajudas)?.dataset.ajuda).toBe('resposta')
    ;(document.querySelector('[data-ajuda="resposta"]') as HTMLButtonElement).disabled = true
    expect(jogos.chamarAjuda(ajudas)).toBeNull()
  })
})

describe('o placar dispara o retorno pelos avisos que os jogos já dão', () => {
  const Placar = ({ pontos = 0, sequencia = 0, acertos = 0 }) => (
    <section className="palco-jogo px-partida">
      <HudDaRodada
        pontos={pontos}
        sequencia={sequencia}
        acertos={acertos}
        rotulo="1 de 8 bolas"
        progresso={0}
        ajudas={
          <>
            <BotaoDeAjuda
              icone={Lightbulb}
              rotulo="Primeira letra"
              resta={2}
              title="Conta como dica: zera o combo"
              data-ajuda="letra"
              onClick={() => undefined}
            />
            <AjudasGerais
              jogo="tenis"
              parado={false}
              aoGanharTempo={() => undefined}
              resposta={() => 'storm'}
              aoVerResposta={() => undefined}
            />
          </>
        }
      />
    </section>
  )
  const flutuantes = () => [...document.querySelectorAll('body > .ganho')].map((g) => g.textContent)

  it('acerto: vinheta verde e o ganho que sobe com o que os pontos subiram', async () => {
    const t = render(<Placar />)
    act(() => celebrar({ tipo: 'acerto', combo: 1 }))
    expect(document.querySelectorAll('.fx-vinheta.acerto').length).toBe(1)
    t.rerender(<Placar pontos={10} sequencia={1} acertos={1} />)
    expect(flutuantes()).toEqual(['+10'])
    expect(document.querySelector('.ganho')?.className).toBe('ganho good')
  })

  it('os pontos podem chegar antes do aviso: o ganho sobe do mesmo jeito, com o multiplicador', () => {
    const t = render(<Placar pontos={20} sequencia={2} acertos={2} />)
    t.rerender(<Placar pontos={40} sequencia={3} acertos={3} />)
    act(() => celebrar({ tipo: 'acerto', combo: 3 }))
    expect(flutuantes()).toEqual(['+20 ×2'])
    /* O multiplicador subiu de degrau: o selo estoura no palco. */
    expect(document.querySelector('.palco-jogo > .selo-combo')?.textContent).toBe('Combo ×2')
    expect(document.querySelector('.fx-vinheta.combo')).not.toBeNull()
  })

  it('erro: vinheta vermelha; no segundo seguido, e só nele, a ajuda pulsa com "quer uma ajuda?"', async () => {
    render(<Placar />)
    const errar = async () => {
      act(() => celebrar({ tipo: 'erro' }))
      await act(async () => {
        await Promise.resolve()
      })
    }
    await errar()
    expect(document.querySelectorAll('.fx-vinheta.erro').length).toBe(1)
    expect(document.querySelector('.pj-chama')).toBeNull()
    await errar()
    expect(document.querySelector('.pj-chama')?.getAttribute('data-ajuda')).toBe('letra')
    expect(flutuantes()).toEqual(['quer uma ajuda?'])
    act(() => vi.advanceTimersByTime(3600))
    await errar()
    expect(document.querySelector('.pj-chama')).toBeNull()
  })

  it('um acerto zera a conta dos erros; "+10 s" e "Ver resposta" também, a dica do jogo não', async () => {
    render(<Placar />)
    const errar = async () => {
      act(() => celebrar({ tipo: 'erro' }))
      await act(async () => {
        await Promise.resolve()
      })
    }
    await errar()
    act(() => celebrar({ tipo: 'acerto', combo: 1 }))
    await errar()
    expect(document.querySelector('.pj-chama')).toBeNull()
    fireEvent.click(document.querySelector('[data-ajuda="tempo"]') as HTMLElement)
    await errar()
    expect(document.querySelector('.pj-chama')).toBeNull()
    fireEvent.click(document.querySelector('[data-ajuda="letra"]') as HTMLElement)
    await errar()
    expect(document.querySelector('.pj-chama')).not.toBeNull()
  })

  it('"+10 s" sobe "+10s" do botão e gasta uma das duas do Médio', () => {
    render(<Placar />)
    const tempo = document.querySelector('[data-ajuda="tempo"]') as HTMLButtonElement
    expect(tempo.querySelector('.n')?.textContent).toBe('2')
    fireEvent.click(tempo)
    expect(flutuantes()).toEqual(['+10s'])
    expect(tempo.querySelector('.n')?.textContent).toBe('1')
  })

  it('no Difícil o placar soma 5 pontos por acerto ao que o jogo manda', () => {
    const noDificil = {
      ativo: true,
      pausado: false,
      placar: { current: { pontos: 0, acertos: 0 } },
      jogo: 'tenis' as const,
      nivel: 'dificil' as const,
    }
    render(
      <ContextoDaRodada.Provider value={noDificil}>
        <HudDaRodada pontos={30} sequencia={2} acertos={2} rotulo="2 de 8 bolas" progresso={0.25} />
      </ContextoDaRodada.Provider>,
    )
    expect(document.querySelector('[data-pj="pontos"]')?.textContent).toBe('40')
    expect(noDificil.placar.current).toEqual({ pontos: 40, acertos: 2 })
  })
})

describe('as telas de dentro do Jogar saem como as outras (prototipo.js:233-252)', () => {
  const tela = () => {
    document.body.innerHTML = '<main><div class="px-tela"><div class="q-palco"></div></div></main>'
    return document.querySelector('.px-tela') as HTMLElement
  }

  it('do lobby para a partida: 150 ms, ease-out, desce 18 px, 0,985 e desfoque 5; só então troca', async () => {
    const el = tela()
    const trocar = vi.fn()
    jogos.sairDaTelaDoJogar('jogar', 'partida', trocar)
    expect(animacoes[0].el).toBe(el)
    expect(animacoes[0].quadros).toEqual([
      { opacity: 0, transform: 'translateY(18px) scale(0.985)', filter: 'blur(5px)' },
    ])
    expect(animacoes[0].o).toMatchObject({ duration: 150, easing: 'ease-out', fill: 'forwards' })
    expect(trocar).not.toHaveBeenCalled()
    terminar[0]()
    await Promise.resolve()
    expect(trocar).toHaveBeenCalledTimes(1)
  })

  it('da partida para o lobby sai para cima', () => {
    tela()
    jogos.sairDaTelaDoJogar('partida', 'jogar', vi.fn())
    expect((animacoes[0].quadros[0] as { transform: string }).transform).toBe('translateY(-18px) scale(0.985)')
  })

  it('mesma tela (recomeçar, próximo jogo) e camada desligada trocam na hora, sem saída', () => {
    tela()
    const trocar = vi.fn()
    jogos.sairDaTelaDoJogar('partida', 'partida', trocar)
    document.documentElement.dataset.px = 'off'
    jogos.sairDaTelaDoJogar('jogar', 'partida', trocar)
    expect(trocar).toHaveBeenCalledTimes(2)
    expect(animacoes.length).toBe(0)
  })

  it('a troca não fica presa à animação: o relógio de 400 ms garante, e só uma vez', async () => {
    tela()
    const trocar = vi.fn()
    jogos.sairDaTelaDoJogar('jogar', 'antessala', trocar)
    vi.advanceTimersByTime(400)
    expect(trocar).toHaveBeenCalledTimes(1)
    terminar[0]()
    await Promise.resolve()
    expect(trocar).toHaveBeenCalledTimes(1)
  })
})
