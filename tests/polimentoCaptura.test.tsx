// @vitest-environment jsdom
/**
 * CAPTURAR NO DESENHO NOVO — o porte do protótipo de polimento (`direto.js:25-62`, `telas.js:78-380`;
 * itens D6–D18 de `fidelidade/casca-e-telas.md`): a marcação que o CSS do protótipo espera e os
 * números de cada animação (duração, atraso, curva, quadros).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/dictionary', () => ({ lookup: async () => ({ status: 'missing' }) }))
vi.mock('../src/lib/voz/haVoz', () => ({ haVozPara: () => true }))

import CapturaDoPrototipo from '../src/components/views/captura/celular/CapturaDoPrototipo'
import FolhasDoPrototipo from '../src/components/views/captura/celular/FolhasDoPrototipo'
import LegendaFlutuanteDoPrototipo from '../src/components/views/captura/legendas/LegendaFlutuanteDoPrototipo'
import type { LegendaAoVivo } from '../src/components/views/captura/legendas/LinhaDaLegenda'
import HistoricoDoPrototipo from '../src/components/views/captura/quest/HistoricoDoPrototipo'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'
import { EO, MOLA, MOLA_SUAVE } from '../src/lib/polimento/base'
import { molaFisica } from '../src/lib/polimento/captura'

interface Gravada {
  quem: string
  quadros: Keyframe[]
  d: number
  atraso: number
  e: string
  fill: string
}
let animacoes: Gravada[] = []
const original = Element.prototype.animate

beforeEach(() => {
  animacoes = []
  document.documentElement.dataset.px = 'on'
  document.body.className = 'animations-on'
  Element.prototype.animate = function (this: Element, quadros: Keyframe[], o: KeyframeAnimationOptions) {
    animacoes.push({
      quem: `${this.tagName.toLowerCase()}.${String(this.getAttribute('class') ?? '')}`,
      quadros,
      d: Number(o.duration),
      atraso: Number(o.delay),
      e: String(o.easing),
      fill: String(o.fill),
    })
    return { finished: Promise.resolve(), cancel: () => undefined } as unknown as Animation
  } as unknown as typeof Element.prototype.animate
})
afterEach(() => {
  cleanup()
  Element.prototype.animate = original
  delete document.documentElement.dataset.px
  document.body.className = ''
})

const nada = () => undefined
const base = {
  gravando: false,
  temFalas: false,
  abrindo: false,
  tempo: '00:00',
  par: 'Detectar → Português',
  parCurto: 'EN → PT',
  modelo: 'Modelo local · 589 MB',
  micLigado: true,
  micAbrindo: false,
  aoAlternarMic: nada,
  podeIniciar: true,
  aoIniciar: nada,
  aoParar: nada,
  aoAbrirIdiomas: nada,
  aoAbrirModelo: nada,
  aoAbrirAjustes: nada,
  aoAbrirAjuda: nada,
  aoFlutuante: nada,
  letra: { menor: nada, maior: nada, noMinimo: false, noMaximo: false },
  legenda: <div data-testid="legenda" />,
}

const fala = (id: string, originalText: string, translatedText = '', isPartial = false): SpeechSegment =>
  ({
    id,
    speakerId: 'system',
    source: 'system',
    timestamp: '00:03',
    originalText,
    translatedText,
    words: [],
    isPartial,
    lang: 'en',
  }) as unknown as SpeechSegment

/* SEM O NÍVEL DE SERVIÇO (`niveis` ausente) a tela é a de antes da versão enxuta, que é também a do
   headset: o chip do modelo, a ajuda e a letra na faixa. A tela do computador e do celular, com o chip
   de estado, está em `tests/capturaEnxuta.test.tsx`. */
describe('a captura pronta (direto.js:25-47)', () => {
  it('monta o topo, o miolo e a faixa do protótipo, com o texto do computador', () => {
    const { container } = render(<CapturaDoPrototipo {...base} />)
    const v = container.firstElementChild as HTMLElement
    expect(v.className).toBe('cel cel-gravando quest-vivo px-vivo px-pronto')
    expect([...v.querySelectorAll('.px-vivo-topo > *')].map((x) => x.className)).toEqual([
      'q-chip',
      'q-chip px-so-largo',
      'q-espaco',
      'q-ctl',
      'q-ctl',
      'q-ctl',
    ])
    expect(v.querySelector('.px-vivo-topo [role="switch"]')?.getAttribute('aria-label')).toBe('Microfone ativo')
    expect(v.querySelector('.cel-conversa > .q-leg > .q-historico[aria-live="polite"] > .px-pronto-miolo')).toBeTruthy()
    expect(v.querySelector('.px-pronto-miolo h2')?.textContent).toBe('Pronto para legendar')
    expect(v.querySelector('.px-pronto-miolo p')?.textContent).toBe(
      'O som do computador entra sozinho. Dê play no vídeo, aula ou chamada e clique em Iniciar. A legenda bilíngue aparece aqui e nas Legendas flutuantes.',
    )
    const faixa = [...v.querySelectorAll('.q-faixa > *')].map((x) => x.textContent?.trim())
    expect(faixa).toEqual(['00:00', 'Iniciar captura', 'Legendas flutuantes', '', 'A−', 'A+', 'EN → PT'])
    expect(v.querySelector('[data-px="iniciar"]')).toBeTruthy()
  })

  it('no celular o texto é o do celular', () => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes('max-width: 720px'),
    })) as unknown as typeof window.matchMedia
    render(<CapturaDoPrototipo {...base} />)
    expect(document.querySelector('.px-pronto-miolo p')?.textContent).toBe(
      'Toque em Iniciar e deixe o celular perto do som. A legenda nos dois idiomas aparece aqui.',
    )
    /* O jsdom não tem matchMedia: volta a não ter. */
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('entra com os números do protótipo: ícone 700 ms na mola com 200 ms de atraso, o resto em cascata de 60 ms', () => {
    render(<CapturaDoPrototipo {...base} />)
    const icone = animacoes.find((a) => a.quem === 'span.q-ic')
    expect(icone).toMatchObject({ d: 700, atraso: 200, e: MOLA })
    expect(icone?.quadros).toEqual([{ transform: 'scale(0.4)' }, { transform: 'scale(1)' }])
    const cascata = animacoes.filter((a) => a.d === 480)
    expect(cascata.map((a) => a.atraso)).toEqual([120, 180, 240, 300, 360, 420, 480, 540])
    expect(cascata.every((a) => a.e === EO)).toBe(true)
  })

  it('o microfone só liga em Iniciar: o toque chama o início e o botão afunda 420 ms na mola', () => {
    const aoIniciar = vi.fn()
    render(<CapturaDoPrototipo {...base} aoIniciar={aoIniciar} />)
    expect(aoIniciar).not.toHaveBeenCalled()
    animacoes = []
    fireEvent.click(screen.getByText('Iniciar captura'))
    expect(aoIniciar).toHaveBeenCalledTimes(1)
    expect(animacoes).toHaveLength(1)
    expect(animacoes[0]).toMatchObject({ d: 420, e: MOLA })
    expect(animacoes[0].quadros).toEqual([
      { transform: 'scale(1)' },
      { transform: 'scale(0.9)' },
      { transform: 'scale(1)' },
    ])
  })

  it('ao gravar o miolo sai (260 ms) e a legenda ocupa o lugar, com Encerrar na faixa', async () => {
    const { rerender, container } = render(<CapturaDoPrototipo {...base} />)
    animacoes = []
    rerender(<CapturaDoPrototipo {...base} gravando />)
    const saida = animacoes.find((a) => a.quem === 'div.px-pronto-miolo')
    expect(saida).toMatchObject({ d: 260, fill: 'forwards' })
    expect(saida?.quadros).toEqual([{ opacity: 0, transform: 'scale(0.9)', filter: 'blur(8px)' }])
    await act(async () => undefined)
    expect(container.firstElementChild?.className).toBe('cel cel-gravando quest-vivo px-vivo')
    expect(screen.getByTestId('legenda')).toBeTruthy()
    expect(container.querySelector('[data-px="encerrar"]')?.textContent?.trim()).toBe('Encerrar')
    expect(container.querySelector('[data-px="encerrar"] .q-quadrado')).toBeTruthy()
  })

  it('parada com falas na tela, mostra a legenda e mantém Iniciar', () => {
    const { container } = render(<CapturaDoPrototipo {...base} temFalas />)
    expect(container.firstElementChild?.className).toBe('cel cel-gravando quest-vivo px-vivo px-parada')
    expect(screen.getByTestId('legenda')).toBeTruthy()
    expect(container.querySelector('[data-px="iniciar"]')).toBeTruthy()
  })
})

describe('a fala ao vivo (telas.js:111-160)', () => {
  const historico = (falas: SpeechSegment[]) => (
    <HistoricoDoPrototipo
      falas={falas}
      escala={1}
      idiomaPadrao="en"
      idiomaDaTraducao={() => 'pt-BR'}
      aoTocar={nada}
      aoOuvir={nada}
    />
  )

  it('sem falas, espera; a fala nova chega palavra por palavra na linha grande', () => {
    const { rerender, container } = render(historico([]))
    expect(container.querySelector('.q-espera')?.textContent).toBe('Ouvindo… a legenda aparece aqui.')
    animacoes = []
    rerender(historico([fala('a', 'So, are we', '', true)]))
    const linha = container.querySelector('.q-linha-da-fala.atual[data-fala="a"]') as HTMLElement
    expect(linha).toBeTruthy()
    expect(linha.querySelector('.q-meta .tn')?.textContent).toBe('00:03')
    const alvo = linha.querySelector('.q-t') as HTMLElement
    expect(alvo.lang).toBe('en')
    expect([...alvo.children].map((s) => s.textContent)).toEqual(['So, ', 'are ', 'we '])
    expect(linha.querySelector('.q-o')).toBeNull()
    expect(container.querySelector('.q-transcrevendo .q-pontos')?.children).toHaveLength(3)
    expect([...linha.querySelectorAll('.q-acoes-da-fala .q-ctl')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Ouvir de novo',
      'Opções da fala',
    ])
    const daLinha = animacoes.find((a) => a.quem.startsWith('div.q-linha-da-fala'))
    expect(daLinha).toMatchObject({ d: 520, e: EO })
    expect(daLinha?.quadros).toEqual([
      { opacity: 0, transform: 'translateY(26px) scale(0.98)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ])
    const palavras = animacoes.filter((a) => a.d === 320)
    expect(palavras).toHaveLength(3)
    expect(palavras[0].quadros).toEqual([
      { opacity: 0, filter: 'blur(6px)', transform: 'translateY(6px)' },
      { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' },
    ])
    /* A palavra seguinte entra sozinha: as que já estavam não refazem a entrada. */
    animacoes = []
    rerender(historico([fala('a', 'So, are we still', '', true)]))
    expect(animacoes.filter((a) => a.d === 320)).toHaveLength(1)
  })

  it('a tradução assume a linha: a original sai (140 ms), sobe para a pequena e a tradução entra', async () => {
    const { rerender, container } = render(historico([]))
    rerender(historico([fala('a', 'So, are we still shipping?')]))
    animacoes = []
    rerender(historico([fala('a', 'So, are we still shipping?', 'Então, ainda vamos entregar?')]))
    await act(async () => undefined)
    const saida = animacoes.find((a) => a.d === 140)
    expect(saida).toMatchObject({ e: 'ease', fill: 'forwards' })
    expect(saida?.quadros).toEqual([{ opacity: 0, filter: 'blur(6px)' }])
    const linha = container.querySelector('.q-linha-da-fala') as HTMLElement
    expect(linha.querySelector('.q-o')?.textContent).toBe('So, are we still shipping?')
    expect(linha.querySelector('.q-o')?.getAttribute('lang')).toBe('en')
    expect(linha.querySelector('.q-t')?.textContent).toBe('Então, ainda vamos entregar?')
    expect(linha.querySelector('.q-t')?.getAttribute('lang')).toBe('pt-BR')
    expect(animacoes.find((a) => a.d === 480)?.quadros).toEqual([
      { opacity: 0, filter: 'blur(8px)', transform: 'translateY(10px)' },
      { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' },
    ])
    expect(animacoes.find((a) => a.d === 420)?.quadros).toEqual([
      { opacity: 0, transform: 'translateY(14px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ])
  })

  /* O protótipo encena e toda fala tem texto; na captura real a fala ABRE antes de haver o que ler. */
  it('a fala aberta sem texto é a linha de escuta, e o texto entra NESSA linha', () => {
    const aoTocar = vi.fn()
    const com = (falas: SpeechSegment[]) => (
      <HistoricoDoPrototipo falas={falas} escala={1} idiomaPadrao="en" aoTocar={aoTocar} aoOuvir={nada} />
    )
    const { rerender, container } = render(com([]))
    animacoes = []
    rerender(com([fala('a', '', '…', true)]))
    const linha = container.querySelector('.q-linha-da-fala.atual[data-fala="a"]') as HTMLElement
    expect(linha).toBeTruthy()
    expect(linha.hasAttribute('data-ouvindo')).toBe(true)
    expect(linha.querySelector('.q-fala > .q-meta .tn')?.textContent).toBe('00:03')
    const pontos = linha.querySelector('.q-fala > .q-pontos') as HTMLElement
    expect(pontos.children).toHaveLength(3)
    expect(pontos.getAttribute('aria-label')).toBe('Ouvindo…')
    expect(linha.querySelector('.q-t')).toBeNull()
    /* A linha é o sinal: nem a espera vazia, nem o "Transcrevendo…" solto. */
    expect(container.querySelector('.q-espera')).toBeNull()
    expect(container.querySelector('.q-transcrevendo')).toBeNull()
    expect(animacoes.find((a) => a.quem.startsWith('div.q-linha-da-fala'))).toMatchObject({ d: 520, e: EO })
    /* Sem texto não há frase para abrir, e os botões da fala guardam o lugar sem aparecer. */
    fireEvent.click(linha.querySelector('.q-fala') as HTMLElement)
    expect(aoTocar).not.toHaveBeenCalled()
    expect((linha.querySelector('.q-acoes-da-fala') as HTMLElement).style.visibility).toBe('hidden')

    animacoes = []
    rerender(com([fala('a', 'So, are', '…', true)]))
    expect(container.querySelectorAll('.q-linha-da-fala')).toHaveLength(1)
    expect(container.querySelector('.q-linha-da-fala[data-fala="a"]')).toBe(linha)
    expect(linha.hasAttribute('data-ouvindo')).toBe(false)
    expect(linha.querySelector('.q-pontos')).toBeNull()
    expect([...(linha.querySelector('.q-t') as HTMLElement).children].map((s) => s.textContent)).toEqual([
      'So, ',
      'are ',
    ])
    expect((linha.querySelector('.q-acoes-da-fala') as HTMLElement).style.visibility).toBe('')
    /* A linha não refaz a entrada: só as palavras chegam. */
    expect(animacoes.filter((a) => a.quem.startsWith('div.q-linha-da-fala'))).toHaveLength(0)
    expect(animacoes.filter((a) => a.d === 320)).toHaveLength(2)
    fireEvent.click(linha.querySelector('.q-fala') as HTMLElement)
    expect(aoTocar).toHaveBeenCalledTimes(1)
  })

  it('a fala que termina vazia sai apagando (180 ms) e não deixa nada na lista', async () => {
    const { rerender, container } = render(historico([fala('a', 'One.', 'Um.')]))
    rerender(historico([fala('a', 'One.', 'Um.'), fala('b', '', '…', true)]))
    expect(container.querySelector('[data-fala="b"]')?.className).toBe('q-linha-da-fala atual')
    expect(container.querySelector('[data-fala="a"]')?.className).toBe('q-linha-da-fala')
    animacoes = []
    rerender(historico([fala('a', 'One.', 'Um.')]))
    /* A fala saiu do estado: a linha dela já não existe, e a anterior volta a ser a atual. */
    expect(container.querySelector('[data-fala="b"]')).toBeNull()
    expect(container.querySelector('[data-fala="a"]')?.className).toBe('q-linha-da-fala atual')
    /* Uma cópia sem toque fica no lugar só para apagar (o `animate` daqui já devolve "acabou"). */
    await act(async () => undefined)
    const saida = animacoes.find((a) => a.d === 180)
    expect(saida).toMatchObject({ quem: 'div.q-linha-da-fala atual', e: 'ease', fill: 'forwards' })
    expect(saida?.quadros[1]).toMatchObject({ opacity: 0, height: '0px' })
    expect(container.querySelectorAll('.q-linha-da-fala')).toHaveLength(1)
    expect(container.querySelector('.q-pontos')).toBeNull()
  })

  it('remontar os efeitos sem tirar a linha da tela (React em desenvolvimento) não cria cópia', async () => {
    const { container } = render(<React.StrictMode>{historico([fala('a', '', '…', true)])}</React.StrictMode>)
    await act(async () => undefined)
    expect(container.querySelectorAll('.q-linha-da-fala')).toHaveLength(1)
    expect(animacoes.filter((a) => a.d === 180)).toHaveLength(0)
  })

  it('a fala com texto que sai (descartada) não deixa cópia', async () => {
    const { rerender, container } = render(historico([fala('a', 'One.', '', true)]))
    animacoes = []
    rerender(historico([]))
    await act(async () => undefined)
    expect(container.querySelector('.q-linha-da-fala')).toBeNull()
    expect(animacoes.filter((a) => a.d === 180)).toHaveLength(0)
  })

  it('a tradução parcial fica até a do final, que entra em UMA troca', async () => {
    const provisoria = (f: SpeechSegment, traducaoProvisoria: string) => ({ ...f, traducaoProvisoria }) as SpeechSegment
    const { rerender, container } = render(historico([]))
    rerender(historico([fala('a', 'So, are we', '…', true)]))
    rerender(historico([fala('a', 'So, are we', 'Então, nós', true)]))
    await act(async () => undefined)
    const linha = container.querySelector('.q-linha-da-fala') as HTMLElement
    expect(linha.querySelector('.q-t')?.textContent).toBe('Então, nós')

    /* O FINAL chegou: o balão volta a "…", com a parcial à parte. Na tela nada pisca. */
    animacoes = []
    rerender(historico([provisoria(fala('a', 'So, are we still shipping?', '…'), 'Então, nós')]))
    await act(async () => undefined)
    expect(linha.querySelector('.q-t')?.textContent).toBe('Então, nós')
    expect(linha.querySelector('.q-t')?.getAttribute('lang')).toBe('pt-BR')
    expect(linha.querySelector('.q-o')?.textContent).toBe('So, are we still shipping?')
    expect(animacoes).toHaveLength(0)

    /* A tradução do final: uma troca, com a entrada da tradução (480 ms) e só ela. */
    rerender(historico([fala('a', 'So, are we still shipping?', 'Então, ainda vamos entregar?')]))
    await act(async () => undefined)
    expect(linha.querySelector('.q-t')?.textContent).toBe('Então, ainda vamos entregar?')
    expect(animacoes.map((a) => a.d)).toEqual([480])
    expect(animacoes[0].quem).toBe('span.q-t')
  })

  it('a tradução do final igual à parcial não troca nada', async () => {
    const { rerender } = render(historico([fala('a', 'Thank you', 'Obrigado', true)]))
    await act(async () => undefined)
    animacoes = []
    rerender(historico([{ ...fala('a', 'Thank you.', '…'), traducaoProvisoria: 'Obrigado' } as SpeechSegment]))
    rerender(historico([fala('a', 'Thank you.', 'Obrigado')]))
    await act(async () => undefined)
    expect(animacoes).toHaveLength(0)
  })

  it('a parcial não sobrevive à falha nem à espera do tradutor: vale o tratamento de sempre', async () => {
    const com = (extra: Partial<SpeechSegment>) =>
      historico([{ ...fala('a', 'So, are we still shipping?', '…'), traducaoProvisoria: 'Então, nós', ...extra }])
    const { rerender, container } = render(historico([fala('a', 'So, are we', 'Então, nós', true)]))
    await act(async () => undefined)
    /* A tradução do final falhou: o original entre parênteses, como sempre. */
    rerender(com({ translatedText: '(So, are we still shipping?)', traducaoProvisoria: undefined }))
    await act(async () => undefined)
    expect(container.querySelector('.q-t')?.textContent).toBe('(So, are we still shipping?)')
    /* O tradutor ainda carrega (pode levar minutos): a parcial não fica; volta o original. */
    rerender(com({ traducaoPendente: true }))
    await act(async () => undefined)
    expect(container.querySelector('.q-o')).toBeNull()
    expect(container.querySelector('.q-t')?.textContent).toBe('So, are we still shipping? ')
  })

  it('só a última fala é a atual; tocar numa fala abre a folha dela', () => {
    const aoTocar = vi.fn()
    const falas = [fala('a', 'One.', 'Um.'), fala('b', 'Two.', 'Dois.')]
    const { container } = render(<HistoricoDoPrototipo falas={falas} escala={1} idiomaPadrao="en" aoTocar={aoTocar} />)
    expect([...container.querySelectorAll('.q-linha-da-fala')].map((l) => l.className)).toEqual([
      'q-linha-da-fala',
      'q-linha-da-fala atual',
    ])
    fireEvent.click(container.querySelector('[data-fala="a"] .q-fala') as HTMLElement)
    expect(aoTocar).toHaveBeenCalledWith(falas[0], 'en')
  })
})

describe('as folhas (telas.js:190-255)', () => {
  const falaTocada = {
    id: 'a',
    texto: 'So, are we still shipping the roadmap today?',
    traducao: 'Então, ainda vamos entregar o roteiro hoje?',
    lang: 'en',
    langDaTraducao: 'pt-BR',
  }
  const folha = {
    fala: falaTocada,
    palavra: null,
    aoOuvir: nada,
    aoTocarPalavra: nada,
    aoConsultar: async () => ({ traducao: 'entregando' }),
    aoSalvar: async () => '"shipping" adicionado ao seu deck (FSRS)!',
    aoFechar: nada,
  }

  it('a folha da frase: cinco ações, a Nuance com cadeado no Grátis e as palavras como botões', () => {
    const aoConhecer = vi.fn()
    render(
      <FolhasDoPrototipo
        {...folha}
        ehNova={(p) => p === 'shipping'}
        guardada={(p) => p === 'roadmap'}
        nuance={{ disponivel: false, destino: 'pt', aoConhecer, aoEscolher: nada }}
      />,
    )
    const d = document.querySelector('dialog.folha-de-baixo.folha-da-frase') as HTMLElement
    expect(d.getAttribute('aria-label')).toBe('Ações')
    expect(d.firstElementChild?.matches('span.folha-pega[aria-hidden]')).toBe(true)
    expect(d.querySelector('.folha-frase')?.getAttribute('lang')).toBe('en')
    expect(d.querySelector('.folha-frase-trad')?.textContent).toBe(falaTocada.traducao)
    expect([...d.querySelectorAll('.folha-grade .folha-acao')].map((b) => b.textContent?.trim())).toEqual([
      'Ouvir',
      'Ouvir devagar',
      'Ouvir tradução',
      'Repetir eu',
      'Copiar',
    ])
    expect(d.querySelector('.folha-acao.pri')?.textContent?.trim()).toBe('Ouvir')
    const nuance = d.querySelector('.q-aviso.px-nuance') as HTMLElement
    expect(nuance.querySelector('b')?.textContent?.trim()).toBe('Outras formas de dizer')
    expect(nuance.querySelector('.px-nuance-previa')?.getAttribute('aria-hidden')).toBe('true')
    expect([...nuance.querySelectorAll('.px-nuance-previa i')].map((i) => i.textContent)).toEqual([
      'Formal',
      'Informal',
    ])
    expect(nuance.textContent).toContain('Sua legenda já usa a Tradução rápida ao vivo, sem esperar.')
    fireEvent.click(nuance.querySelector('.q-ctl[data-px="planos"]') as HTMLElement)
    expect(aoConhecer).toHaveBeenCalled()
    expect(d.querySelector('.folha-rotulo')?.textContent).toBe('Toque numa palavra')
    const palavras = [...d.querySelectorAll('.folha-palavras button')]
    expect(palavras.map((b) => b.textContent)).toEqual([
      'So',
      'are',
      'we',
      'still',
      'shipping',
      'the',
      'roadmap',
      'today',
    ])
    expect(palavras.filter((b) => b.hasAttribute('data-nova')).map((b) => b.textContent)).toEqual(['shipping'])
    expect(palavras.filter((b) => b.hasAttribute('data-aprendida')).map((b) => b.textContent)).toEqual(['roadmap'])
  })

  it('a folha da palavra: Guardar ficha de verdade, vira Guardada e comemora (520 ms na mola)', async () => {
    const aoSalvar = vi.fn(folha.aoSalvar)
    const { rerender } = render(<FolhasDoPrototipo {...folha} aoSalvar={aoSalvar} />)
    animacoes = []
    rerender(
      <FolhasDoPrototipo
        {...folha}
        aoSalvar={aoSalvar}
        aoVoltar={nada}
        palavra={{ palavra: 'shipping', frase: falaTocada.texto, lang: 'en' }}
      />,
    )
    /* É o MESMO diálogo que troca de conteúdo e sobe de novo (telas.js:180-186). */
    const d = document.querySelector('dialog.folha-de-baixo.folha-da-palavra') as HTMLElement
    expect(document.querySelectorAll('dialog')).toHaveLength(1)
    expect(animacoes.find((a) => a.quem.startsWith('dialog.'))).toMatchObject({ d: 560, e: MOLA_SUAVE })
    await act(async () => undefined)
    expect(d.querySelector('.folha-voltar.q-chip')?.textContent?.trim()).toBe('Voltar à frase')
    expect(d.querySelector('.folha-pal')?.textContent).toBe('shipping')
    expect(d.querySelector('.folha-glosa')?.textContent).toBe('entregando')
    expect([...d.querySelectorAll('.folha-grade .folha-acao')].map((b) => b.textContent?.trim())).toEqual([
      'Ouvir',
      'Falar eu',
      'Guardar',
    ])
    expect(d.querySelector('.folha-status[role="status"]')?.textContent).toBe('')
    animacoes = []
    await act(async () => {
      fireEvent.click(d.querySelector('[data-px="guardar"]') as HTMLElement)
    })
    expect(aoSalvar).toHaveBeenCalledWith({
      palavra: 'shipping',
      frase: falaTocada.texto,
      lang: 'en',
      traducao: 'entregando',
    })
    expect(d.querySelector('[data-px="guardar"]')?.textContent?.trim()).toBe('Guardada')
    expect(d.querySelector('.folha-status')?.textContent).toBe('No seu caderno. Ela volta nos jogos e na revisão.')
    const doBotao = animacoes.find((a) => a.quem.startsWith('button.folha-acao'))
    expect(doBotao).toMatchObject({ d: 520, e: MOLA })
    expect(doBotao?.quadros).toEqual([
      { transform: 'scale(1)' },
      { transform: 'scale(1.12)' },
      { transform: 'scale(1)' },
    ])
    expect(animacoes.find((a) => a.quem.startsWith('svg'))?.quadros).toEqual([
      { transform: 'scale(0) rotate(-90deg)' },
      { transform: 'scale(1) rotate(0deg)' },
    ])
  })

  it('a palavra que o caderno recusou mostra o motivo e não comemora', async () => {
    render(
      <FolhasDoPrototipo
        {...folha}
        aoSalvar={async () => '"shipping" não entrou: já está no baralho.'}
        palavra={{ palavra: 'shipping', frase: falaTocada.texto, lang: 'en' }}
      />,
    )
    await act(async () => undefined)
    animacoes = []
    await act(async () => {
      fireEvent.click(document.querySelector('[data-px="guardar"]') as HTMLElement)
    })
    expect(document.querySelector('[data-px="guardar"]')?.textContent?.trim()).toBe('Guardar')
    expect(document.querySelector('.folha-status')?.textContent).toBe('"shipping" não entrou: já está no baralho.')
    expect(animacoes).toHaveLength(0)
  })
})

describe('as legendas flutuantes (telas.js:257-380)', () => {
  const leg = (id: string, original: string, traducao = ''): LegendaAoVivo => ({
    id,
    quem: 'Eles',
    original,
    traducao,
    lado: 'eles',
    lang: 'en',
  })

  it('nasce com a última fala, guarda só as duas últimas e fecha pelo botão', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const aoFechar = vi.fn()
    const montar = (falas: LegendaAoVivo[], aberta = true) => (
      <LegendaFlutuanteDoPrototipo aberta={aberta} falas={falas} idiomaDaTraducao={() => 'pt-BR'} aoFechar={aoFechar} />
    )
    const falas = [leg('a', 'One.', 'Um.'), leg('b', 'Two.', 'Dois.')]
    const { rerender } = render(montar(falas, false))
    expect(document.querySelector('#leg-flut')).toBeNull()
    animacoes = []
    rerender(montar(falas))
    const el = document.querySelector('#leg-flut.leg-flut.modo-video') as HTMLElement
    expect(el.parentElement).toBe(document.body)
    expect(el.getAttribute('aria-label')).toBe('Legendas flutuantes')
    expect(el.querySelector('.leg-barra .leg-tit')?.textContent?.trim()).toBe('Legendas')
    expect(
      [...el.querySelectorAll('.leg-barra button:not(.leg-tit)')].map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Pausar legendas', 'Fechar as legendas flutuantes'])
    expect([...el.querySelectorAll('.leg-fala')].map((f) => f.getAttribute('data-fala'))).toEqual(['b'])
    expect(animacoes.find((a) => a.quem.startsWith('div.leg-flut'))).toMatchObject({ d: 560, e: MOLA_SUAVE })
    expect(animacoes.find((a) => a.quem.startsWith('div.leg-flut'))?.quadros).toEqual([
      { opacity: 0, scale: '0.7', filter: 'blur(8px)' },
      { opacity: 1, scale: '1', filter: 'blur(0)' },
    ])
    rerender(montar([...falas, leg('c', 'Three.'), leg('d', 'Four.')]))
    /* O ritmo de leitura (`lib/captura/ritmoDaLegenda`): a fala nova espera a atual cumprir o tempo dela. */
    expect([...el.querySelectorAll('.leg-fala')].map((f) => f.getAttribute('data-fala'))).toEqual(['b'])
    act(() => void vi.advanceTimersByTime(1600))
    expect([...el.querySelectorAll('.leg-fala')].map((f) => f.getAttribute('data-fala'))).toEqual(['b', 'c'])
    act(() => void vi.advanceTimersByTime(1600))
    expect([...el.querySelectorAll('.leg-fala')].map((f) => f.className)).toEqual([
      'leg-fala anterior',
      'leg-fala atual',
    ])
    expect([...el.querySelectorAll('.leg-fala')].map((f) => f.getAttribute('data-fala'))).toEqual(['c', 'd'])
    expect(el.querySelector('.leg-fala.atual')?.getAttribute('aria-current')).toBe('true')
    animacoes = []
    rerender(montar([...falas, leg('c', 'Three.'), leg('d', 'Four.', 'Quatro.')]))
    expect(animacoes.find((a) => a.d === 380)?.quadros).toEqual([
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ])
    fireEvent.click(el.querySelector('[data-px="fechar"]') as HTMLElement)
    expect(aoFechar).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('sem falas, espera a primeira', () => {
    render(<LegendaFlutuanteDoPrototipo aberta falas={[]} aoFechar={nada} />)
    expect(document.querySelector('#leg-flut .leg-corpo .leg-vazio')?.textContent).toBe('Esperando a primeira fala')
  })
})

describe('a mola que herda a velocidade do dedo (telas.js:30-48)', () => {
  it('chega ao destino e para', () => {
    let agora = 0
    const fila: FrameRequestCallback[] = []
    vi.spyOn(performance, 'now').mockImplementation(() => agora)
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => fila.push(f))
    const passos: number[] = []
    molaFisica(0, 100, 800, (x) => passos.push(x))
    for (let i = 0; i < 400 && fila.length; i++) {
      agora += 16
      fila.shift()?.(agora)
    }
    expect(passos[passos.length - 1]).toBe(100)
    expect(fila).toHaveLength(0)
    /* Sai com a velocidade do dedo: o primeiro passo já anda para o lado do gesto. */
    expect(passos[0]).toBeGreaterThan(0)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
})
