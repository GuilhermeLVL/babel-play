// @vitest-environment jsdom
/**
 * AS TELAS QUE FALTAVAM DO DESENHO NOVO — a aba Jogos da sessão (`telas3.js:74-82`), o narrador da
 * Leitura (`telas3.js:28-62, 71-73`) e o item "Planos" da busca (`telas2.js:143-152`).
 *
 * A igualdade de medidas com o protótipo é provada pelo comparador
 * (`scripts/polimento/roteiros/{sessao-jogos,sessao-leitura,busca,sobre,ajuda}*.json`). Aqui fica o
 * que ele não mede: o que cada ladrilho faz com o dado de verdade, a marcação palavra por palavra (o
 * navegador de teste não narra) e em que edição o "Planos" aparece.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const palco = vi.hoisted(() => ({ questNovo: true, estatica: false }))
vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()
  return { ...real, useQuestNovo: () => palco.questNovo }
})
vi.mock('../src/lib/edicaoEstatica', async (original) => {
  const real = await original<typeof import('../src/lib/edicaoEstatica')>()
  return { ...real, edicaoEstatica: () => palco.estatica }
})
vi.mock('../src/data/api', async (original) => {
  const real = await original<typeof import('../src/data/api')>()
  return { ...real, fetchDeck: vi.fn(async () => []) }
})

import BuscaGlobal from '../src/components/BuscaGlobal'
import JogosDaSessao from '../src/components/views/analise/quest/JogosDaSessao'
import type { JogoParaOQuest, TileDoQuest } from '../src/components/views/play/quest/jogosNoQuest'
import { criarMarcador, ENTRE_LINHAS_MS, PASSO_DA_PALAVRA_MS } from '../src/lib/polimento/sessao'

afterEach(cleanup)
beforeEach(() => {
  palco.questNovo = true
  palco.estatica = false
})

/* ── A aba Jogos da sessão ─────────────────────────────────────────────────────────────────────── */
const tile = (id: string, extra: Partial<TileDoQuest<JogoParaOQuest>> = {}): TileDoQuest<JogoParaOQuest> => ({
  jogo: { id, estado: { ok: !extra.apagado } } as unknown as JogoParaOQuest,
  grupo: extra.apagado ? 'material' : 'apontar',
  tag: extra.apagado ? 'Falta material' : id === 'ditado' ? 'Digitar' : 'Clicar',
  apagado: false,
  ...extra,
})

describe('A aba Jogos da sessão no desenho novo', () => {
  it('monta a marcação do protótipo: o título, a frase e os quatro ladrilhos com a miniatura', () => {
    const { container } = render(
      <JogosDaSessao
        tiles={[tile('memory'), tile('scramble'), tile('ditado'), tile('escuta'), tile('termo')]}
        aoJogar={() => {}}
      />,
    )
    const secao = container.querySelector('.q-secao.qs-jogos')!
    expect(secao.querySelector(':scope > header h2')?.textContent).toBe('Jogos com esta sessão')
    expect(secao.querySelector(':scope > header p')?.textContent).toBe(
      'As rodadas usam só as palavras e as falas desta gravação.',
    )
    const ladrilhos = [...secao.querySelectorAll<HTMLButtonElement>(':scope > .q-grade.g4 > button.q-tile')]
    // Só os quatro do protótipo, na ordem dele; o Termo, que também abriria, não entra aqui.
    expect(ladrilhos.map((b) => b.dataset.jogo)).toEqual(['memory', 'scramble', 'ditado', 'escuta'])
    expect(ladrilhos.map((b) => b.querySelector('b')?.textContent)).toEqual([
      'Memória: palavra e tradução',
      'Frase embaralhada',
      'Ditado',
      'Qual foi a fala?',
    ])
    expect(ladrilhos.map((b) => b.querySelector('.q-tag')?.textContent)).toEqual([
      'Clicar',
      'Clicar',
      'Digitar',
      'Clicar',
    ])
    expect(ladrilhos[0].querySelector('.q-d')?.textContent).toBe('Vire as cartas e feche os pares palavra ↔ tradução')
    for (const b of ladrilhos) {
      expect(b.classList.contains('px-com-mini')).toBe(true)
      // `vestirJogos()` (`minis.js:37-48`): a miniatura é o primeiro filho, e depois vem o topo.
      expect(b.firstElementChild?.matches(`span.px-mini[data-mini="${b.dataset.jogo}"]`)).toBe(true)
      expect(b.children[1].matches('span.qj-jogo-topo')).toBe(true)
      expect(b.querySelector('.qj-jogo-topo > i.qj-ponto')).toBeTruthy()
    }
  })

  it('o ladrilho que abre chama a rodada; o que não abre fica apagado e diz o que falta', () => {
    const aoJogar = vi.fn()
    const aoContar = vi.fn()
    const { container } = render(
      <JogosDaSessao
        tiles={[
          tile('memory'),
          tile('scramble', { apagado: true, nota: 'falta 1 fala · precisa de 3' }),
          tile('ditado', { apagado: true, nota: 'precisa de uma gravação com legenda' }),
          tile('escuta'),
        ]}
        aoJogar={aoJogar}
        aoContar={aoContar}
      />,
    )
    const ladrilho = (id: string) => container.querySelector<HTMLButtonElement>(`.q-tile[data-jogo="${id}"]`)!
    fireEvent.click(ladrilho('memory'))
    expect(aoJogar).toHaveBeenCalledWith('memory')

    expect(ladrilho('scramble').disabled).toBe(true)
    expect(ladrilho('scramble').classList.contains('apagado')).toBe(true)
    expect(ladrilho('scramble').querySelector('.q-tag.off')?.textContent).toBe('Falta material')
    expect(ladrilho('scramble').querySelector('.q-d')?.textContent).toBe('falta 1 fala · precisa de 3')
    fireEvent.click(ladrilho('scramble'))
    expect(aoJogar).toHaveBeenCalledTimes(1)

    // O número da aba "Jogos" é o de ladrilhos que abrem.
    expect(aoContar).toHaveBeenLastCalledWith(2)
  })

  it('enquanto o baralho não chega, os quatro ladrilhos esperam apagados e nada é contado', () => {
    const aoContar = vi.fn()
    const { container } = render(<JogosDaSessao tiles={null} aoJogar={() => {}} aoContar={aoContar} />)
    expect(container.querySelector('.qs-jogos')?.getAttribute('aria-busy')).toBe('true')
    const ladrilhos = [...container.querySelectorAll<HTMLButtonElement>('.q-tile')]
    expect(ladrilhos).toHaveLength(4)
    expect(ladrilhos.every((b) => b.disabled)).toBe(true)
    expect(aoContar).not.toHaveBeenCalled()
  })

  it('o jogo que a lista do aparelho não trouxe fica apagado, sem inventar motivo', () => {
    const { container } = render(<JogosDaSessao tiles={[tile('memory')]} aoJogar={() => {}} />)
    const escuta = container.querySelector<HTMLButtonElement>('.q-tile[data-jogo="escuta"]')!
    expect(escuta.disabled).toBe(true)
    expect(escuta.querySelector('.q-d')?.textContent).toBe('Ouça o trecho e escolha a frase certa')
  })
})

/* ── O narrador da Leitura: o mesmo marcador da Transcrição, sobre as `.ql-frase` ──────────────── */
describe('O narrador da Leitura marca palavra por palavra', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('acende as `.w` da frase narrada a cada 210 ms e segue sozinho depois de 520 ms', () => {
    document.body.innerHTML = `<div id="r">
      <button class="ql-frase"><span class="ql-o"><span class="w">We</span> <span class="w">ship</span></span></button>
      <button class="ql-frase"><span class="ql-o"><span class="w">Fair</span></span></button>
    </div>`
    const raiz = document.getElementById('r')!
    const marcador = criarMarcador(() => raiz, '.ql-frase')
    const ditas = () => [...raiz.querySelectorAll('.w.dita')].map((w) => w.textContent)
    const seguinte = vi.fn()

    marcador.linha(0, seguinte)
    expect(ditas()).toEqual(['We'])
    vi.advanceTimersByTime(PASSO_DA_PALAVRA_MS)
    expect(ditas()).toEqual(['We', 'ship'])
    vi.advanceTimersByTime(PASSO_DA_PALAVRA_MS + ENTRE_LINHAS_MS - 1)
    expect(seguinte).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(seguinte).toHaveBeenCalledTimes(1)

    marcador.parar()
    expect(ditas()).toEqual([])
    document.body.innerHTML = ''
  })
})

/* ── A busca: "Planos" depois do último item ───────────────────────────────────────────────────── */
describe('A busca do desenho novo tem o item "Planos"', () => {
  const abrir = async () => {
    const aoNavegar = vi.fn()
    const tela = render(
      <BuscaGlobal
        aberta
        aoFechar={() => {}}
        recordings={[]}
        aoNavegar={aoNavegar}
        vencidasAgora={0}
        escuro={false}
        aoAlternarTema={() => {}}
        perfil="pro"
      />,
    )
    await act(async () => {})
    const itens = () => [...document.querySelectorAll<HTMLButtonElement>('.paleta-cmd .cmd-item')]
    return { ...tela, aoNavegar, itens }
  }

  it('é o último das sugestões, com o ícone do protótipo, e leva aos Planos', async () => {
    const { itens, aoNavegar } = await abrir()
    const rotulos = itens().map((b) => b.querySelector('.cmd-t')?.textContent)
    // `prototipo.js:605-615` + `telas2.js:143-152`: captura, as cinco primeiras telas e "Planos".
    expect(rotulos).toHaveLength(7)
    expect(rotulos[0]).toBe('Iniciar captura')
    expect(rotulos.at(-1)).toBe('Planos')
    const planos = itens().at(-1)!
    expect(planos.querySelector('.cmd-ico svg')?.classList.contains('lucide-sparkles')).toBe(true)
    fireEvent.click(planos)
    expect(aoNavegar).toHaveBeenCalledWith('planos')
  })

  it('digitando, "Planos" continua achável e com o mesmo ícone', async () => {
    const { itens } = await abrir()
    fireEvent.change(document.querySelector('#cmd-q')!, { target: { value: 'plan' } })
    const achados = itens().filter((b) => b.querySelector('.cmd-t')?.textContent === 'Planos')
    expect(achados).toHaveLength(1)
    expect(achados[0].querySelector('.cmd-ico svg')?.classList.contains('lucide-sparkles')).toBe(true)
  })

  it('não entra nas sugestões da edição sem servidor', async () => {
    palco.estatica = true
    const estatica = await abrir()
    expect(estatica.itens().map((b) => b.querySelector('.cmd-t')?.textContent)).not.toContain('Planos')
  })
})
