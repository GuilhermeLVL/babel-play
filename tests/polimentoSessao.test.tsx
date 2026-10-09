// @vitest-environment jsdom
/**
 * A SESSÃO ABERTA NO DESENHO NOVO — a marcação é a de `htmlDaSessao()` e `PAINEIS_DA_SESSAO`
 * (`telas3.js:63-104`) e o player marca palavra por palavra na cadência de `tocar()`
 * (`telas3.js:28-62`), com as falas e o áudio de verdade.
 *
 * A igualdade de medidas com o protótipo é provada pelo comparador
 * (`scripts/polimento/roteiros/sessao*.json`). Aqui fica o que ele não mede: a cadência das palavras
 * (o navegador de teste não toca som), o que cada botão faz e o que vem do dado real.
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()
  return { ...real, useQuestNovo: () => true }
})
const avisos = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }))
vi.mock('../src/components/Toast', async (original) => {
  const real = await original<typeof import('../src/components/Toast')>()
  return { ...real, toast: { ...real.toast, info: avisos.info, error: avisos.error } }
})
/* O download do áudio da sessão (`lib/audioDaSessao`): cada pedido devolve um blob novo. */
const rede = vi.hoisted(() => ({ pedidos: 0 }))
vi.mock('../src/data/api', async (original) => ({
  ...(await original<typeof import('../src/data/api')>()),
  apiFetch: async () => {
    rede.pedidos++
    return { ok: true, status: 200, blob: async () => new Blob(['audio']) }
  },
}))

import PlayerInterativo, { type PropsDoPlayerInterativo } from '../src/components/views/analise/PlayerInterativo'
import SessaoDoQuest from '../src/components/views/analise/quest/SessaoDoQuest'
import TranscricaoDoQuest from '../src/components/views/analise/quest/TranscricaoDoQuest'
import VisaoGeralDoQuest from '../src/components/views/analise/quest/VisaoGeralDoQuest'
import type { FalaDaAnalise } from '../src/lib/analise/tiposDaAnalise'
import { useAudioDaSessao } from '../src/lib/audioDaSessao'
import { MOLA_SUAVE } from '../src/lib/polimento/base'
import {
  criarMarcador,
  ENTRE_LINHAS_MS,
  ESPERA_DO_AVISO_MS,
  MS_POR_CARACTERE,
  PASSO_DA_PALAVRA_MS,
  pedacosDaFrase,
  repintarSessao,
  seguirFala,
} from '../src/lib/polimento/sessao'
import type { Recording } from '../src/types'

const fala = (index: number, original: string, extra: Partial<FalaDaAnalise> = {}): FalaDaAnalise => ({
  id: `u${index}`,
  original,
  translation: `tradução ${index}`,
  lang: 'en',
  speaker: index % 2 ? 'Leo' : 'Ana',
  time: `0:0${index * 4}`,
  words: [],
  startTime: index * 4,
  index,
  ...extra,
})
const FALAS = [fala(0, 'So, are we shipping?'), fala(1, 'We ship it today.'), fala(2, 'Fair enough.', { time: '' })]
const gravacao: Recording = {
  id: 's1',
  title: 'Reunião de produto',
  date: 'hoje',
  durationStr: '38:10',
  wordCount: 11,
  type: 'audio',
  tags: [],
  status: 'Processado',
}

interface Animacao {
  quem: Element
  quadros: Keyframe[]
  duration?: number
  delay?: number
  easing?: string
}
let animacoes: Animacao[] = []

beforeEach(() => {
  animacoes = []
  Element.prototype.animate = function (this: Element, quadros: Keyframe[], o: KeyframeAnimationOptions) {
    animacoes.push({ quem: this, quadros, duration: o.duration as number, delay: o.delay, easing: o.easing })
    return { finished: Promise.resolve(), cancel: () => undefined } as unknown as Animation
  } as typeof Element.prototype.animate
  Element.prototype.scrollIntoView = vi.fn()
  document.documentElement.dataset.px = 'on'
  document.body.classList.add('animations-on')
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  avisos.info.mockClear()
  avisos.error.mockClear()
  vi.useRealTimers()
  delete document.documentElement.dataset.px
  document.body.classList.remove('animations-on')
  delete (Element.prototype as { animate?: unknown }).animate
})

const ditas = (raiz: ParentNode = document) => [...raiz.querySelectorAll('.w.dita')].map((w) => w.textContent)
const texto = (seletor: string) => document.querySelector(seletor)?.textContent?.replace(/\s+/g, ' ').trim()

/* ---- A cadência do protótipo ------------------------------------------------------------------- */

describe('criarMarcador: tocar() e pararPlayer() de telas3.js:16-62', () => {
  const montar = () => {
    document.body.innerHTML = FALAS.map(
      (f) =>
        `<div class="qs-fala"><span class="qs-o">${pedacosDaFrase(f.original)
          .map((p) => `<span class="w">${p}</span>`)
          .join(' ')}</span></div>`,
    ).join('')
    return criarMarcador(() => document.body)
  }

  it('são 210 ms por palavra e 520 ms entre as linhas, como no protótipo', () => {
    expect(PASSO_DA_PALAVRA_MS).toBe(210)
    expect(ENTRE_LINHAS_MS).toBe(520)
  })

  it('a primeira palavra acende na hora e as outras a cada 210 ms', () => {
    vi.useFakeTimers()
    const m = montar()
    m.linha(0)
    expect(ditas()).toEqual(['So,'])
    vi.advanceTimersByTime(209)
    expect(ditas()).toEqual(['So,'])
    vi.advanceTimersByTime(1)
    expect(ditas()).toEqual(['So,', 'are'])
    vi.advanceTimersByTime(420)
    expect(ditas()).toEqual(['So,', 'are', 'we', 'shipping?'])
  })

  it('a linha rola para o meio e encolhe e volta na mola (0,985 → 1, 420 ms)', () => {
    vi.useFakeTimers()
    const m = montar()
    m.linha(1)
    const linha = document.querySelectorAll('.qs-fala')[1]
    expect(linha.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    expect(animacoes).toHaveLength(1)
    expect(animacoes[0].quem).toBe(linha)
    expect(animacoes[0].quadros).toEqual([{ transform: 'scale(0.985)' }, { transform: 'scale(1)' }])
    expect(animacoes[0].duration).toBe(420)
    expect(animacoes[0].easing).toBe(MOLA_SUAVE)
  })

  it('a linha seguinte deixa marcadas as palavras da anterior, mesmo as que faltavam', () => {
    vi.useFakeTimers()
    const m = montar()
    m.linha(0)
    vi.advanceTimersByTime(210) // duas das quatro
    m.linha(1)
    expect(ditas()).toEqual(['So,', 'are', 'we', 'shipping?', 'We'])
    vi.advanceTimersByTime(210 * 3)
    expect(ditas()).toHaveLength(8)
  })

  it('parar solta o relógio e desmarca tudo', () => {
    vi.useFakeTimers()
    const m = montar()
    m.linha(0)
    vi.advanceTimersByTime(210)
    m.parar()
    expect(ditas()).toEqual([])
    vi.advanceTimersByTime(2000)
    expect(ditas()).toEqual([])
  })

  it('sem relógio de fora, espera 520 ms depois da última palavra e chama a linha seguinte', () => {
    vi.useFakeTimers()
    const m = montar()
    const depois = vi.fn()
    m.linha(2, depois) // "Fair enough.": duas palavras
    vi.advanceTimersByTime(210 * 2 + 519)
    expect(depois).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(depois).toHaveBeenCalledTimes(1)
  })

  it('com menos movimento pedido a linha não se mexe, mas as palavras continuam sendo marcadas', () => {
    vi.useFakeTimers()
    document.body.classList.remove('animations-on')
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )
    const m = montar()
    m.linha(0)
    expect(animacoes).toHaveLength(0)
    expect(document.querySelector('.qs-fala')?.scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      behavior: 'auto',
    })
    vi.advanceTimersByTime(630)
    expect(ditas()).toHaveLength(4)
    vi.unstubAllGlobals()
  })

  /* O defeito relatado pelo dono: "pauso e o sublinhado continua, e marca tudo como se tivesse sido
     lido". O relógio do marcador não tinha pausa. */
  it('pausar para o relógio e MANTÉM as palavras já marcadas; nenhuma outra é marcada', () => {
    vi.useFakeTimers()
    const m = montar()
    m.linha(0)
    vi.advanceTimersByTime(210)
    expect(ditas()).toEqual(['So,', 'are'])
    m.pausar()
    vi.advanceTimersByTime(10_000)
    expect(ditas()).toEqual(['So,', 'are'])
  })

  it('retomar continua da palavra em que parou', () => {
    vi.useFakeTimers()
    const m = montar()
    m.linha(0)
    vi.advanceTimersByTime(210)
    m.pausar()
    vi.advanceTimersByTime(5000)
    m.retomar()
    expect(ditas()).toEqual(['So,', 'are'])
    vi.advanceTimersByTime(210)
    expect(ditas()).toEqual(['So,', 'are', 'we'])
    vi.advanceTimersByTime(210)
    expect(ditas()).toEqual(['So,', 'are', 'we', 'shipping?'])
    // Retomar sem pausa, ou duas vezes, não dobra o relógio.
    m.retomar()
    m.retomar()
    vi.advanceTimersByTime(2000)
    expect(ditas()).toHaveLength(4)
  })

  it('ate(i, k) deixa exatamente as k primeiras palavras da linha marcadas e desliga o relógio dela', () => {
    vi.useFakeTimers()
    const m = montar()
    m.linha(0)
    m.ate(0, 3)
    expect(ditas()).toEqual(['So,', 'are', 'we'])
    // Quem chama é que manda: o relógio de 210 ms não anda mais.
    vi.advanceTimersByTime(5000)
    expect(ditas()).toEqual(['So,', 'are', 'we'])
    // Para trás também (o áudio voltou dentro da fala).
    m.ate(0, 1)
    expect(ditas()).toEqual(['So,'])
    m.ate(0, 0)
    expect(ditas()).toEqual([])
    m.ate(0, 99)
    expect(ditas()).toHaveLength(4)
  })

  it('ate numa linha nova entra nela como `linha`: rola, encolhe e volta, e a anterior termina marcada', () => {
    vi.useFakeTimers()
    const m = montar()
    m.ate(0, 2)
    expect(animacoes).toHaveLength(1)
    m.ate(0, 3) // a mesma linha não se mexe de novo
    expect(animacoes).toHaveLength(1)
    m.ate(1, 1)
    expect(animacoes).toHaveLength(2)
    expect(animacoes[1].quem).toBe(document.querySelectorAll('.qs-fala')[1])
    expect(ditas()).toEqual(['So,', 'are', 'we', 'shipping?', 'We'])
  })

  it('cadencia: cada palavra leva o tempo dela, e a cadência pausa e retoma', () => {
    vi.useFakeTimers()
    const m = montar()
    m.cadencia(0, [100, 300, 100, 100])
    expect(ditas()).toEqual(['So,'])
    vi.advanceTimersByTime(100)
    expect(ditas()).toEqual(['So,', 'are'])
    vi.advanceTimersByTime(299)
    expect(ditas()).toEqual(['So,', 'are'])
    m.pausar()
    vi.advanceTimersByTime(3000)
    expect(ditas()).toEqual(['So,', 'are'])
    m.retomar()
    vi.advanceTimersByTime(300)
    expect(ditas()).toEqual(['So,', 'are', 'we'])
  })

  it('cadencia com espera: a primeira palavra já, e o relógio só depois do prazo do aviso', () => {
    vi.useFakeTimers()
    const m = montar()
    m.cadencia(0, [300, 300, 300, 300], 400)
    expect(ditas()).toEqual(['So,'])
    vi.advanceTimersByTime(399)
    expect(ditas()).toEqual(['So,'])
    // Aos 400 ms a fala já está na segunda palavra (a primeira leva 300): a cadência entra ali.
    vi.advanceTimersByTime(1)
    expect(ditas()).toEqual(['So,', 'are'])
    vi.advanceTimersByTime(300)
    expect(ditas()).toEqual(['So,', 'are', 'we'])
  })
})

describe('seguirFala: a marcação presa à voz', () => {
  const montar = () => {
    document.body.innerHTML = FALAS.map(
      (f) =>
        `<div class="qs-fala">${pedacosDaFrase(f.original)
          .map((p) => `<span class="w">${p}</span>`)
          .join(' ')}</div>`,
    ).join('')
    return criarMarcador(() => document.body)
  }
  const texto = FALAS[0].original // 'So, are we shipping?'
  const palavras = pedacosDaFrase(texto)

  it('o aviso de palavra (boundary) marca até a palavra que a voz está dizendo', () => {
    vi.useFakeTimers()
    const m = montar()
    const guia = seguirFala(m, { linha: 0, texto, palavras })
    guia.comecou()
    guia.palavra(texto.indexOf('are'))
    expect(ditas()).toEqual(['So,', 'are'])
    guia.palavra(texto.indexOf('shipping?'))
    expect(ditas()).toEqual(['So,', 'are', 'we', 'shipping?'])
    // O caractere no meio de uma palavra é dela; o aviso manda, e a cadência não anda por conta.
    guia.palavra(texto.indexOf('we') + 1)
    expect(ditas()).toEqual(['So,', 'are', 'we'])
    vi.advanceTimersByTime(5000)
    expect(ditas()).toEqual(['So,', 'are', 'we'])
  })

  it('a voz que não avisa cai na cadência, pelo tamanho de cada palavra e pela velocidade', () => {
    vi.useFakeTimers()
    const m = montar()
    seguirFala(m, { linha: 0, texto, palavras, velocidade: 2 }).comecou()
    expect(ditas()).toEqual(['So,'])
    vi.advanceTimersByTime(ESPERA_DO_AVISO_MS - 1)
    expect(ditas()).toEqual(['So,'])
    // 'So,' leva (3 + 1) x 62 / 2 = 124 ms; 'are', mais 124; 'we', 93: aos 400 ms a voz diz 'shipping?'.
    expect(MS_POR_CARACTERE).toBe(62)
    vi.advanceTimersByTime(1)
    expect(ditas()).toEqual(['So,', 'are', 'we', 'shipping?'])
  })

  it('na velocidade normal a cadência é a de uma voz de leitura, não os 210 ms fixos', () => {
    vi.useFakeTimers()
    const m = montar()
    seguirFala(m, { linha: 0, texto, palavras }).comecou(0)
    expect(ditas()).toEqual(['So,'])
    vi.advanceTimersByTime(247) // (3 + 1) x 62 = 248
    expect(ditas()).toEqual(['So,'])
    vi.advanceTimersByTime(1)
    expect(ditas()).toEqual(['So,', 'are'])
  })

  it('a voz lê outro texto (a tradução): a marcação do original anda na mesma proporção', () => {
    const m = montar()
    const traducao = 'Entao, vamos publicar hoje mesmo?' // 33 caracteres para 4 palavras na tela
    const guia = seguirFala(m, { linha: 0, texto: traducao, palavras })
    guia.palavra(0)
    expect(ditas()).toHaveLength(1)
    guia.palavra(17)
    expect(ditas()).toHaveLength(3)
    guia.palavra(32)
    expect(ditas()).toHaveLength(4)
  })
})

describe('repintarSessao: repintar() de telas2.js:10-25', () => {
  it('o que vem depois das abas entra pelo lado: 56 px, desfoque 6, 520 ms, 55 ms entre os blocos', () => {
    document.body.innerHTML = `<div class="q-palco"><header class="q-cab"></header>
      <div class="q-abas px-abas-sessao"></div><div class="qs-painel"></div><div class="outro"></div></div>`
    repintarSessao(document.querySelector('.q-palco'), -1)
    expect(animacoes.map((a) => a.quem.className)).toEqual(['qs-painel', 'outro'])
    expect(animacoes[0].quadros).toEqual([
      { opacity: 0, transform: 'translateX(-56px)', filter: 'blur(6px)' },
      { opacity: 1, transform: 'translateX(0)', filter: 'blur(0)' },
    ])
    expect(animacoes.map((a) => a.duration)).toEqual([520, 520])
    expect(animacoes.map((a) => a.delay)).toEqual([0, 55])
  })
})

/* ---- A casca ----------------------------------------------------------------------------------- */

describe('SessaoDoQuest: htmlDaSessao() de telas3.js:95-104', () => {
  const abas = [
    { id: 'transcript', rotulo: 'Transcrição' },
    { id: 'reading', rotulo: 'Leitura' },
    { id: 'practice', rotulo: 'Jogos', contagem: 4 },
    { id: 'overview', rotulo: 'Visão geral & métricas' },
  ]
  const montar = (extra: Partial<React.ComponentProps<typeof SessaoDoQuest>> = {}) => {
    const acoes = { aoTrocarAba: vi.fn(), aoVoltar: vi.fn(), aoExportar: vi.fn() }
    const props = { gravacao, abas, abaAtiva: 'transcript', ...acoes, ...extra }
    const tela = render(
      <SessaoDoQuest {...props}>
        <p>miolo</p>
      </SessaoDoQuest>,
    )
    const refazer = (mais: Partial<React.ComponentProps<typeof SessaoDoQuest>>) =>
      tela.rerender(
        <SessaoDoQuest {...props} {...mais}>
          <p>miolo</p>
        </SessaoDoQuest>,
      )
    return { ...tela, acoes, refazer }
  }

  it('cabeçalho: a sobrancelha em minutos, o título, o apoio, "Trocar de sessão" e "Exportar"', () => {
    const { acoes } = montar()
    expect(document.querySelector('.q-palco')?.className).toBe('q-palco qs px-sessao')
    expect(texto('.q-sobre')).toBe('Sessão de áudio · 38 min')
    expect(document.querySelector('.q-sobre svg')).toBeNull()
    expect(texto('.q-cab h1')).toBe('Reunião de produto')
    expect(texto('.qs-sub')).toBe('Análise do texto, prática ativa e exercícios criados a partir desta mídia.')

    fireEvent.click(screen.getByRole('button', { name: 'Voltar à Biblioteca' }))
    fireEvent.click(screen.getByRole('button', { name: 'Trocar de sessão' }))
    expect(acoes.aoVoltar).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }))
    expect(acoes.aoExportar).toHaveBeenCalledTimes(1)
  })

  it('documento não tem duração: "Sessão de texto · texto"', () => {
    montar({ gravacao: { ...gravacao, type: 'document', durationStr: '-' } })
    expect(texto('.q-sobre')).toBe('Sessão de texto · texto')
  })

  it('as quatro abas, sem ícone, com a contagem dos jogos', () => {
    const { acoes } = montar()
    const grupo = document.querySelector('.q-abas') as HTMLElement
    expect(grupo.className).toBe('q-abas qs-abas px-abas-sessao')
    expect(grupo.querySelector('svg')).toBeNull()
    expect(screen.getAllByRole('tab').map((a) => a.textContent)).toEqual([
      'Transcrição',
      'Leitura',
      'Jogos 4',
      'Visão geral & métricas',
    ])
    expect(texto('.q-aba .n')).toBe('4')
    fireEvent.click(screen.getByRole('tab', { name: /Jogos/ }))
    expect(acoes.aoTrocarAba).toHaveBeenCalledWith('practice')
  })

  it('trocar de aba faz o painel entrar pelo lado da aba escolhida', () => {
    const { refazer } = montar()
    expect(animacoes).toHaveLength(0)
    refazer({ abaAtiva: 'overview' })
    expect(animacoes).toHaveLength(1)
    expect(animacoes[0].quem.className).toBe('qs-painel')
    expect(animacoes[0].quadros[0]).toMatchObject({ transform: 'translateX(56px)' })

    animacoes = []
    refazer({ abaAtiva: 'reading' })
    expect(animacoes[0].quadros[0]).toMatchObject({ transform: 'translateX(-56px)' })

    // As seções da Visão geral entram sempre pela direita (`telas3.js:171`).
    animacoes = []
    refazer({ abaAtiva: 'reading', repintar: 2 })
    expect(animacoes[0].quadros[0]).toMatchObject({ transform: 'translateX(56px)' })
  })
})

/* ---- A transcrição ----------------------------------------------------------------------------- */

describe('TranscricaoDoQuest: o primeiro painel de telas3.js:64-70', () => {
  const montar = (extra: Partial<React.ComponentProps<typeof TranscricaoDoQuest>> = {}) => {
    const acoes = { aoOuvir: vi.fn(), aoAbrirFala: vi.fn(), aoAbrirPalavra: vi.fn(), aoTentarDeNovo: vi.fn() }
    const props: React.ComponentProps<typeof TranscricaoDoQuest> = {
      falas: FALAS,
      estado: 'pronta',
      documento: false,
      indiceAtivo: -1,
      tocando: false,
      classes: 't-padrao f-sans s-medio',
      traducaoPrimeiro: false,
      ocultarOriginal: false,
      traducaoDe: (f) => ({ texto: f.index === 1 ? 'polida' : f.translation, polida: f.index === 1 }),
      idiomaDaTraducao: 'pt',
      procedencia: 'Transcrição local',
      palavras: [],
      podeOuvir: () => true,
      ajustes: [],
      ...acoes,
      ...extra,
    }
    const tela = render(<TranscricaoDoQuest {...props} />)
    const refazer = (mais: Partial<React.ComponentProps<typeof TranscricaoDoQuest>>) =>
      tela.rerender(<TranscricaoDoQuest {...props} {...mais} />)
    return { ...tela, acoes, refazer }
  }

  it('os três chips, na ordem do protótipo', () => {
    montar()
    expect([...document.querySelectorAll('.qs-barra .q-chip')].map((c) => c.textContent?.trim())).toEqual([
      'Procedência',
      'Palavras desta sessão 0',
      'Ajustar exibição',
    ])
  })

  it('cada fala: quem, o tempo real, o selo "Polida" e CADA palavra numa span.w', () => {
    montar()
    const falas = [...document.querySelectorAll('.qs-fala')]
    expect(falas.map((f) => f.getAttribute('data-fala'))).toEqual(['0', '1', '2'])
    expect([...falas[0].querySelectorAll('.w')].map((w) => w.textContent)).toEqual(['So,', 'are', 'we', 'shipping?'])
    expect(falas[0].querySelector('.qs-o')?.textContent).toBe('So, are we shipping?')
    expect(falas[0].querySelector('.qs-o')?.getAttribute('lang')).toBe('en')
    expect(falas[0].querySelector('.qs-t')?.getAttribute('lang')).toBe('pt')
    expect(falas[0].querySelector('.qs-meta')?.textContent).toBe('Ana0:00')
    expect(falas[1].querySelector('.q-tag')?.textContent).toBe('Polida')
    // A fala sem tempo gravado não ganha um tempo de mentira.
    expect(falas[2].querySelector('.qs-tempo')).toBeNull()
  })

  it('tocar na fala e em "Opções da fala" abre a folha da frase; "Ouvir este trecho" toca dali', () => {
    const { acoes } = montar()
    fireEvent.click(document.querySelectorAll('.qs-fala-texto')[1])
    fireEvent.click(screen.getAllByRole('button', { name: 'Opções da fala' })[2])
    expect(acoes.aoAbrirFala.mock.calls.map((c) => c[0].index)).toEqual([1, 2])
    fireEvent.click(screen.getAllByRole('button', { name: 'Ouvir este trecho' })[1])
    expect(acoes.aoOuvir.mock.calls[0][0].index).toBe(1)
  })

  it('parado, nenhuma fala fica acesa, mesmo que o player esteja numa delas', () => {
    montar({ indiceAtivo: 1, tocando: false })
    expect(document.querySelector('.qs-fala.ativa')).toBeNull()
    expect(ditas()).toEqual([])
  })

  /* ---- Sem áudio gravado: o player narra por voz ---- */

  it('narrando por voz, a fala acende e as palavras seguem a cadência da voz', () => {
    vi.useFakeTimers()
    const { refazer } = montar({ indiceAtivo: 0, tocando: true })
    expect(document.querySelector('.qs-fala.ativa')?.getAttribute('data-fala')).toBe('0')
    expect(ditas()).toEqual(['So,'])
    act(() => void vi.advanceTimersByTime(3000))
    expect(ditas()).toEqual(['So,', 'are', 'we', 'shipping?'])

    // A voz chegou à fala seguinte: a anterior continua marcada.
    refazer({ indiceAtivo: 1, tocando: true })
    expect(document.querySelector('.qs-fala.ativa')?.getAttribute('data-fala')).toBe('1')
    expect(ditas()).toEqual(['So,', 'are', 'we', 'shipping?', 'We'])
  })

  it('pausar MANTÉM o que já foi marcado e não marca mais nada; retomar relê a fala desde o começo', () => {
    vi.useFakeTimers()
    const { refazer } = montar({ indiceAtivo: 0, tocando: true, vozAvisaPalavra: false })
    act(() => void vi.advanceTimersByTime(300))
    expect(ditas()).toEqual(['So,', 'are'])
    refazer({ indiceAtivo: 0, tocando: false, vozAvisaPalavra: false })
    expect(document.querySelector('.qs-fala.ativa')).toBeNull()
    act(() => void vi.advanceTimersByTime(10_000))
    expect(ditas()).toEqual(['So,', 'are'])
    // A voz não pausa no meio: ao retomar ela relê a fala, e a marcação recomeça com ela.
    refazer({ indiceAtivo: 0, tocando: true, vozAvisaPalavra: false })
    expect(ditas()).toEqual(['So,'])
  })

  it('um salto (anterior, "Ouvir este trecho") recomeça limpo daquela fala', () => {
    vi.useFakeTimers()
    const { refazer } = montar({ indiceAtivo: 1, tocando: true })
    act(() => void vi.advanceTimersByTime(3000))
    refazer({ indiceAtivo: 0, tocando: true })
    expect(ditas()).toEqual(['So,'])
  })

  it('o aviso de palavra da voz (boundary) marca a palavra que ela está dizendo', () => {
    vi.useFakeTimers()
    const palavraFalada = { current: null as ((posicao: number, charIndex: number) => void) | null }
    montar({ indiceAtivo: 1, tocando: true, palavraFalada })
    expect(ditas()).toEqual(['We'])
    act(() => palavraFalada.current?.(1, 'We ship it today.'.indexOf('it')))
    expect(ditas()).toEqual(['We', 'ship', 'it'])
    // Com aviso, a cadência estimada não anda por cima.
    act(() => void vi.advanceTimersByTime(5000))
    expect(ditas()).toEqual(['We', 'ship', 'it'])
    // O aviso de outra fala (uma que já foi cancelada) não mexe nesta.
    act(() => palavraFalada.current?.(0, 0))
    expect(ditas()).toEqual(['We', 'ship', 'it'])
  })

  /* ---- Com áudio gravado: a marcação segue o tempo do <audio> ---- */

  const comAudio = (duracao = 12) => {
    const el = document.createElement('audio')
    let agora = 0
    Object.defineProperty(el, 'currentTime', { get: () => agora, set: (v: number) => void (agora = v) })
    Object.defineProperty(el, 'duration', { get: () => duracao })
    const ir = (t: number) =>
      act(() => {
        agora = t
        el.dispatchEvent(new Event('timeupdate'))
      })
    return { audio: { current: el }, ir }
  }

  it('com áudio gravado, as palavras marcadas acompanham o tempo do áudio, e não um relógio', () => {
    vi.useFakeTimers()
    const { audio, ir } = comAudio()
    montar({ indiceAtivo: 0, tocando: true, audio })
    // A fala 0 vai de 0 s a 4 s (o começo da seguinte) e tem 4 palavras: uma por segundo.
    expect(ditas()).toEqual(['So,'])
    act(() => void vi.advanceTimersByTime(5000)) // o tempo do áudio não andou: nada mais é marcado
    expect(ditas()).toEqual(['So,'])
    ir(1.2)
    expect(ditas()).toEqual(['So,', 'are'])
    ir(3.5)
    expect(ditas()).toEqual(['So,', 'are', 'we', 'shipping?'])
    // O áudio chegou à fala seguinte: a anterior fica marcada e a nova começa.
    ir(4.1)
    expect(ditas()).toEqual(['So,', 'are', 'we', 'shipping?', 'We'])
    // E voltou dentro da mesma fala: a marcação volta junto.
    ir(6.5)
    expect(ditas()).toHaveLength(7)
    ir(5.1)
    expect(ditas()).toHaveLength(6)
  })

  it('com o tempo gravado da fala, a marcação vai do começo ao fim DELA (o silêncio depois não conta)', () => {
    vi.useFakeTimers()
    const { audio, ir } = comAudio()
    const falas = [fala(0, 'So, are we shipping?', { inicioExato: 0.4, fimExato: 2.4 }), FALAS[1], FALAS[2]]
    montar({ falas, indiceAtivo: 0, tocando: true, audio })
    expect(ditas()).toEqual([]) // o áudio ainda não chegou à fala
    ir(0.5)
    expect(ditas()).toEqual(['So,'])
    ir(1.5)
    expect(ditas()).toEqual(['So,', 'are', 'we'])
    ir(2.4)
    expect(ditas()).toHaveLength(4)
  })

  it('pausar o áudio mantém o que está marcado; retomar continua; um salto recomeça limpo', () => {
    vi.useFakeTimers()
    const { audio, ir } = comAudio()
    const { refazer } = montar({ indiceAtivo: 0, tocando: true, audio })
    ir(2.2)
    expect(ditas()).toEqual(['So,', 'are', 'we'])
    refazer({ indiceAtivo: 0, tocando: false, audio })
    act(() => void vi.advanceTimersByTime(10_000))
    expect(ditas()).toEqual(['So,', 'are', 'we'])
    refazer({ indiceAtivo: 0, tocando: true, audio })
    expect(ditas()).toEqual(['So,', 'are', 'we'])
    ir(3.2)
    expect(ditas()).toHaveLength(4)
    // "Ouvir este trecho" na terceira fala (8 s), saltando a segunda: recomeça limpo dali.
    ir(8)
    expect(ditas()).toEqual(['Fair'])
    // E "Fala anterior": idem.
    ir(4)
    expect(ditas()).toEqual(['We'])
  })

  it('"Procedência" diz de onde veio a transcrição', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Procedência' }))
    expect(avisos.info).toHaveBeenCalledWith('Procedência: Transcrição local')
  })
})

/* ---- O player ---------------------------------------------------------------------------------- */

describe('PlayerInterativo no desenho novo: a faixa de telas3.js:69-70', () => {
  const montar = (extra: Partial<PropsDoPlayerInterativo> = {}) => {
    const acoes = { setIsPlaying: vi.fn(), seekTo: vi.fn() }
    const nada = vi.fn()
    const props: PropsDoPlayerInterativo = {
      recording: gravacao,
      parsedSentences: FALAS,
      hasRealAudio: false,
      audioSrc: null,
      audioRef: { current: null },
      audioDuration: 0,
      setAudioDuration: nada,
      isPlaying: false,
      setCurrentTime: nada,
      loopMode: false,
      activeSentenceIndex: -1,
      ...acoes,
      ...extra,
    }
    return { ...render(<PlayerInterativo {...props} />), acoes }
  }
  const principal = () => document.querySelector('[data-px="tocar"]') as HTMLButtonElement

  it('anterior, "Ouvir", próxima, o trilho e "Fala 1 de 3", numa faixa só', () => {
    montar()
    const faixa = document.querySelector('.px-player') as HTMLElement
    expect(faixa.className).toBe('q-faixa px-player')
    expect([...faixa.querySelectorAll(':scope > button')].map((b) => b.getAttribute('data-px'))).toEqual([
      'antes',
      'tocar',
      'depois',
    ])
    expect(principal().textContent?.trim()).toBe('Ouvir')
    expect(texto('.px-onde')).toBe('Fala 1 de 3')
    expect((faixa.querySelector('.px-trilho-do-player > .qs-posicao') as HTMLElement).style.width).toBe('0%')
    // O que a faixa antiga tinha e o protótipo não mostra saiu.
    expect(faixa.querySelector('input[type="range"]')).toBeNull()
    expect(screen.queryByText('Slow-Mo')).toBeNull()
  })

  it('"Ouvir" toca e vira "Pausar"; a barra anda uma fala por vez', () => {
    const { acoes } = montar()
    fireEvent.click(principal())
    expect(acoes.setIsPlaying).toHaveBeenCalledWith(true)
    cleanup()

    const tocando = montar({ isPlaying: true, activeSentenceIndex: 1 })
    expect(principal().textContent?.trim()).toBe('Pausar')
    expect(texto('.px-onde')).toBe('Fala 2 de 3')
    expect((document.querySelector('.qs-posicao') as HTMLElement).style.width).toBe(`${(2 / 3) * 100}%`)
    fireEvent.click(principal())
    expect(tocando.acoes.setIsPlaying).toHaveBeenCalledWith(false)
  })

  it('os vizinhos recomeçam da fala ao lado, sem passar das pontas', () => {
    const { acoes } = montar({ isPlaying: true, activeSentenceIndex: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Próxima fala' }))
    expect(acoes.seekTo).toHaveBeenLastCalledWith(8)
    expect(acoes.setIsPlaying).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: 'Fala anterior' }))
    expect(acoes.seekTo).toHaveBeenLastCalledWith(0)
    cleanup()

    const noFim = montar({ isPlaying: true, activeSentenceIndex: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'Próxima fala' }))
    expect(noFim.acoes.seekTo).toHaveBeenLastCalledWith(8)
  })

  it('enquanto o áudio gravado não chega, a faixa espera e diz isso', () => {
    montar({ hasRealAudio: true, audioSrc: null, carregandoAudio: true })
    expect(principal().disabled).toBe(true)
    expect(texto('.px-onde')).toBe('Carregando o áudio…')
  })

  it('erro do <audio> com a URL de blob: pede o download de novo e NÃO avisa; sem conserto, avisa', () => {
    const aoFalharOAudio = vi.fn(() => true)
    const { acoes } = montar({ hasRealAudio: true, audioSrc: 'blob:morta', isPlaying: true, aoFalharOAudio })
    fireEvent.error(document.querySelector('audio') as HTMLAudioElement)
    expect(aoFalharOAudio).toHaveBeenCalledTimes(1)
    expect(avisos.error).not.toHaveBeenCalled()
    // Quem pediu para ouvir continua querendo ouvir: toca quando o áudio novo chegar.
    expect(acoes.setIsPlaying).not.toHaveBeenCalled()

    aoFalharOAudio.mockReturnValue(false)
    fireEvent.error(document.querySelector('audio') as HTMLAudioElement)
    expect(avisos.error).toHaveBeenCalledTimes(1)
    expect(acoes.setIsPlaying).toHaveBeenLastCalledWith(false)
  })

  it('sem `src` (o áudio ainda carregando), o erro do <audio> não avisa nem pede nada', () => {
    const aoFalharOAudio = vi.fn(() => true)
    montar({ hasRealAudio: true, audioSrc: null, carregandoAudio: true, aoFalharOAudio })
    fireEvent.error(document.querySelector('audio') as HTMLAudioElement)
    expect(aoFalharOAudio).not.toHaveBeenCalled()
    expect(avisos.error).not.toHaveBeenCalled()
  })
})

/* ---- O áudio que se recupera sozinho ----------------------------------------------------------- */

describe('useAudioDaSessao: a URL de blob revogada com o player montado', () => {
  let criadas = 0
  let revogadas: string[] = []
  let sessao = 0
  beforeEach(() => {
    criadas = 0
    revogadas = []
    rede.pedidos = 0
    globalThis.URL.createObjectURL = vi.fn(() => `blob:audio-${++criadas}`)
    globalThis.URL.revokeObjectURL = vi.fn((u: string) => void revogadas.push(u))
  })
  const nova = () => `sessao-do-player-${++sessao}`

  /** O player de verdade ligado ao hook de verdade, como a `Analysis` os liga. */
  function PlayerComAudio({ id }: { id: string }) {
    const audio = useAudioDaSessao(id, true)
    const [tocando, setTocando] = React.useState(false)
    return (
      <PlayerInterativo
        recording={gravacao}
        parsedSentences={FALAS}
        hasRealAudio
        audioSrc={audio.url}
        audioRef={{ current: null }}
        audioDuration={0}
        setAudioDuration={() => undefined}
        isPlaying={tocando}
        setIsPlaying={setTocando}
        setCurrentTime={() => undefined}
        loopMode={false}
        activeSentenceIndex={-1}
        seekTo={() => undefined}
        carregandoAudio={audio.carregando}
        erroDoAudio={audio.erro}
        aoFalharOAudio={audio.refazer}
      />
    )
  }
  const som = () => document.querySelector('audio') as HTMLAudioElement

  it('o erro refaz o download UMA vez, sem avisar; só o segundo erro mostra o aviso', async () => {
    render(<PlayerComAudio id={nova()} />)
    await act(async () => {})
    expect(som().getAttribute('src')).toBe('blob:audio-1')
    expect(rede.pedidos).toBe(1)

    // A URL morreu (revogada) e a pessoa clica em Ouvir: o <audio> dá erro.
    fireEvent.click(document.querySelector('[data-px="tocar"]') as HTMLButtonElement)
    fireEvent.error(som())
    expect(avisos.error).not.toHaveBeenCalled()
    expect(texto('.px-onde')).toBe('Carregando o áudio…')
    await act(async () => {})
    expect(rede.pedidos).toBe(2)
    expect(som().getAttribute('src')).toBe('blob:audio-2')
    expect(revogadas).toEqual(['blob:audio-1'])
    // O pedido de ouvir continua de pé: o botão não voltou a "Ouvir".
    expect(document.querySelector('[data-px="tocar"]')?.textContent?.trim()).toBe('Pausar')
    expect(texto('.px-onde')).toBe('Fala 1 de 3')

    // Falhou de novo: aí sim o aviso, e nenhum terceiro download.
    fireEvent.error(som())
    await act(async () => {})
    expect(avisos.error).toHaveBeenCalledTimes(1)
    expect(avisos.error.mock.calls[0][0]).toMatch(/áudio/)
    expect(rede.pedidos).toBe(2)
    expect(document.querySelector('[data-px="tocar"]')?.textContent?.trim()).toBe('Ouvir')
  })

  it('refazer vale uma vez por sessão aberta', async () => {
    const id = nova()
    const { result } = renderHook(() => useAudioDaSessao(id, true))
    await act(async () => {})
    let refez = false
    act(() => void (refez = result.current.refazer()))
    expect(refez).toBe(true)
    await act(async () => {})
    expect(result.current.url).toBe('blob:audio-2')
    act(() => void (refez = result.current.refazer()))
    expect(refez).toBe(false)
    expect(rede.pedidos).toBe(2)
  })

  it('o efeito que solta e pega de novo (StrictMode) não revoga a URL nem baixa duas vezes', async () => {
    vi.useFakeTimers()
    const id = nova()
    const { result, unmount } = renderHook(() => useAudioDaSessao(id, true), { wrapper: React.StrictMode })
    await act(async () => {})
    expect(result.current.url).toBe('blob:audio-1')
    expect(rede.pedidos).toBe(1)
    // Passada a carência, a referência que o efeito soltou não zerou a contagem: a URL segue viva.
    await act(async () => void vi.advanceTimersByTime(10_000))
    expect(revogadas).toEqual([])
    // Ao sair da tela, aí sim: revogada depois da carência.
    unmount()
    await act(async () => void vi.advanceTimersByTime(10_000))
    expect(revogadas).toEqual(['blob:audio-1'])
  })
})

/* ---- A visão geral ----------------------------------------------------------------------------- */

describe('VisaoGeralDoQuest: o quarto painel de telas3.js:83-93', () => {
  const montar = (secao: 'dashboard' | 'lexical' | 'fluency', documento = false) => {
    const aoTrocarSecao = vi.fn()
    render(
      <VisaoGeralDoQuest
        documento={documento}
        secao={secao}
        aoTrocarSecao={aoTrocarSecao}
        painel={[
          ['Palavras', '1.234'],
          ['Duração', '38 min'],
          ['Palavras novas', '37'],
          ['Falantes', '2'],
        ]}
        palavrasChave={['roadmap', 'review']}
        nuvem={['roadmap', 'review', 'ship']}
        micro={[{ palavra: 'roadmap', glosa: 'roteiro', vezes: 5 }]}
        fluencia={{ silencio: '130 s', vicios: '14', pausas: '6', ritmo: [{ nome: 'Ana', ppm: 148, pct: 74 }] }}
      />,
    )
    return { aoTrocarSecao }
  }

  it('os três segmentos, sem ícone, com `aria-checked`', () => {
    const { aoTrocarSecao } = montar('dashboard')
    const grupo = document.querySelector('.px-abas-visao') as HTMLElement
    expect(grupo.className).toBe('q-abas q-seg px-abas-visao')
    expect(grupo.querySelector('svg')).toBeNull()
    expect(screen.getAllByRole('radio').map((a) => [a.textContent, a.getAttribute('aria-checked')])).toEqual([
      ['Painel', 'true'],
      ['Inteligência lexical', 'false'],
      ['Fluência', 'false'],
    ])
    fireEvent.click(screen.getByRole('radio', { name: 'Fluência' }))
    expect(aoTrocarSecao).toHaveBeenCalledWith('fluency')
  })

  it('Painel: quatro cartões de número e as palavras-chave', () => {
    montar('dashboard')
    expect([...document.querySelectorAll('.qs-ladrilhos > .q-cartao.q-num')].map((c) => c.textContent)).toEqual([
      'Palavras1.234',
      'Duração38 min',
      'Palavras novas37',
      'Falantes2',
    ])
    expect(texto('.qs-titulo-do-cartao')).toBe('Palavras-chave da sessão')
    expect([...document.querySelectorAll('span.q-chip')].map((c) => c.textContent)).toEqual(['roadmap', 'review'])
  })

  it('Inteligência lexical: a nuvem com o tamanho pela posição e os microdados', () => {
    montar('lexical')
    expect(
      [...document.querySelectorAll<HTMLElement>('.px-nuvem span')].map((s) => s.style.getPropertyValue('--px-tam')),
    ).toEqual(['14px', '21px', '28px'])
    expect(texto('.qs-ocorrencia')).toBe('roadmaproteiro5×')
  })

  it('Fluência: três números e o ritmo de cada falante; documento não tem a seção', () => {
    montar('fluency')
    expect([...document.querySelectorAll('.q-grade.g3 .q-num')].map((c) => c.textContent)).toEqual([
      'Silêncio total130 s',
      'Vícios de linguagem14',
      'Pausas longas6',
    ])
    expect(texto('.qs-falante')).toBe('Ana148 ppm')
    expect((document.querySelector('.qs-falante .q-barra > span') as HTMLElement).style.width).toBe('74%')
    cleanup()

    montar('fluency', true)
    expect(screen.queryByRole('radio', { name: 'Fluência' })).toBeNull()
    expect(document.querySelector('.qs-ladrilhos')).not.toBeNull()
  })
})
