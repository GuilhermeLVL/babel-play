// @vitest-environment jsdom
/**
 * A SESSÃO GRAVADA NO QUEST (a rodada "todas as telas no desenho do headset", 02/10/2026): a tela nova
 * monta, e cada função da Análise de sempre continua alcançável sem hover e sem duplo clique. O cabeçalho
 * (voltar, trocar de sessão, exportar, as quatro abas), a transcrição (o player, as falas com "Ouvir" e
 * "Opções", editar, praticar a pronúncia, as palavras, polir, ajustar exibição), os jogos e a visão geral.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React, { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

const palco = vi.hoisted(() => ({
  falas: [] as unknown[],
  cartoes: [] as unknown[],
  falhar: false,
  pendente: false,
  pedidos: 0,
  voz: true,
  erroDoAudio: null as string | null,
  verbete: null as unknown,
  falar: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  salvar: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
}))

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => true,
}))
vi.mock('../src/data/api', async (orig) => {
  palco.salvar = vi.fn(async (id: string, corpo: { sourceText: string; translatedText: string }) => ({ id, ...corpo }))
  return {
    ...(await orig<typeof import('../src/data/api')>()),
    fetchSessionTranscript: () => {
      palco.pedidos += 1
      if (palco.pendente) return new Promise(() => {})
      if (palco.falhar) return Promise.reject(new Error('fora do ar'))
      return Promise.resolve({ session: { sourceLang: 'en', targetLang: 'pt' }, utterances: palco.falas })
    },
    fetchDeck: () => Promise.resolve(palco.cartoes),
    fetchSettings: async () => null,
    searchImages: async () => [{ url: 'https://exemplo.test/retention.jpg', thumbnail: '' }],
    updateUtterance: palco.salvar,
  }
})
vi.mock('../src/lib/vocabWord', async (orig) => ({
  ...(await orig<typeof import('../src/lib/vocabWord')>()),
  buildVocabWord: async (origem: { word: string; context?: string }) => ({
    vocab: { word: origem.word, translation: `tradução de ${origem.word}`, example: origem.context, lang: 'en' },
    resolved: { lang: 'en', targetLang: 'pt' },
  }),
  resolveWord: async () => ({ lang: 'en', targetLang: 'pt' }),
  mtNoteFor: () => null,
}))
vi.mock('../src/lib/dictionary', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dictionary')>()),
  lookup: async () => palco.verbete ?? { status: 'not-found', sourceUrl: 'https://exemplo.test/wiki' },
}))
vi.mock('../src/lib/voz/haVoz', () => ({
  haVozPara: () => palco.voz,
  aparelhoTemVoz: () => false,
}))
vi.mock('../src/lib/tts', async (orig) => {
  palco.falar = vi.fn()
  return { ...(await orig<typeof import('../src/lib/tts')>()), speak: palco.falar }
})
vi.mock('../src/lib/audioDaSessao', async (orig) => ({
  ...(await orig<typeof import('../src/lib/audioDaSessao')>()),
  useAudioDaSessao: (_id: string, tem: boolean) => ({
    url: tem && !palco.erroDoAudio ? 'blob:audio' : null,
    carregando: false,
    erro: tem ? palco.erroDoAudio : null,
  }),
}))
/* O lobby dos jogos é de outra frente (e pesa 200 kB): aqui só importa que a aba o monte. */
vi.mock('../src/components/views/Play', () => ({
  default: ({ embutido }: { embutido?: boolean }) => <div data-testid="lobby-embutido">{String(embutido)}</div>,
}))
/* A Leitura tem o próprio teste (`questLeitura.test.tsx`). */
vi.mock('../src/components/views/Reading', () => ({
  default: () => <div data-testid="leitura" />,
}))

import TokensClicaveis from '../src/components/TokensClicaveis'
import Analysis from '../src/components/views/Analysis'
import { tokenizarTexto } from '../src/lib/vocabWord'
import type { Recording } from '../src/types'

const gravacao = (id: string, extra: Partial<Recording> = {}): Recording => ({
  id,
  title: `Reunião ${id}`,
  date: 'Ontem',
  durationStr: '0:12',
  wordCount: 14,
  type: 'audio',
  tags: [],
  status: 'Processado',
  audioUrl: `/api/sessions/${id}/audio`,
  ...extra,
})

const FALAS = [
  {
    id: 'u1',
    idx: 0,
    sourceText: 'We need to improve retention this quarter.',
    translatedText: 'Precisamos melhorar a retenção neste trimestre.',
    speakerName: 'Ana',
    sourceLang: 'en',
    targetLang: 'pt',
    tStartMs: 0,
    tEndMs: 4000,
    engine: 'whisper-local',
  },
  {
    id: 'u2',
    idx: 1,
    sourceText: 'Retention depends on the onboarding flow.',
    translatedText: 'A retenção depende do fluxo de entrada.',
    speakerName: 'Bruno',
    sourceLang: 'en',
    targetLang: 'pt',
    tStartMs: 5000,
    tEndMs: 9000,
    engine: 'whisper-local',
  },
]
const CARTAO = {
  id: 'c1',
  word: 'retention',
  translation: 'retenção',
  inDeck: true,
  sourceSessionId: 'a',
  sentence: 'We need to improve retention this quarter.',
  cefrLevel: 'B2',
}

function Tela({
  rec,
  todas,
  abaInicial,
  ir,
  trocar,
}: {
  rec: Recording
  todas: Recording[]
  abaInicial: string
  ir: (view: string, data?: unknown) => void
  trocar: (aba: string) => void
}) {
  const [aba, setAba] = useState(abaInicial)
  return (
    <Analysis
      onChangeView={ir}
      recording={rec}
      allRecordings={todas}
      subTab={aba}
      onSubTabChange={(nova) => {
        trocar(nova)
        // 'study' abre a revisão (outra tela, de outra frente): o teste só confere o pedido.
        if (nova !== 'study') setAba(nova)
      }}
      progress={{} as never}
      metrics={null}
    />
  )
}

async function montar(opcoes: { rec?: Recording; aba?: string } = {}) {
  const rec = opcoes.rec ?? gravacao('a')
  const ir = vi.fn()
  const trocar = vi.fn()
  const tela = render(
    <Tela rec={rec} todas={[rec, gravacao('b')]} abaInicial={opcoes.aba ?? 'transcript'} ir={ir} trocar={trocar} />,
  )
  await act(async () => {})
  const botao = (nome: RegExp | string) => screen.getByRole('button', { name: nome }) as HTMLButtonElement
  const falas = () => [...tela.container.querySelectorAll<HTMLElement>('.qs-fala')]
  return { ...tela, ir, trocar, botao, falas }
}

/** A folha aberta por último (as folhas empilham: a da palavra abre sobre a da fala). */
const folha = () => {
  const todas = screen.getAllByRole('dialog')
  return todas[todas.length - 1]
}

let tocar: ReturnType<typeof vi.fn>
beforeEach(() => {
  palco.falas = FALAS
  palco.cartoes = [CARTAO]
  palco.falhar = false
  palco.pendente = false
  palco.pedidos = 0
  palco.voz = true
  palco.erroDoAudio = null
  palco.verbete = null
  palco.falar.mockClear()
  palco.salvar.mockClear()
  tocar = vi.fn(() => Promise.resolve())
  HTMLMediaElement.prototype.play = tocar as unknown as HTMLMediaElement['play']
  HTMLMediaElement.prototype.pause = vi.fn()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('sem rede no teste')
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('A sessão no Quest: a casca', () => {
  it('cabeçalho no desenho do headset: voltar, o tipo e a duração, o título e as quatro abas', async () => {
    const { container, ir, botao } = await montar()
    expect(container.querySelector('.q-palco.qs')).toBeTruthy()
    // Nada da tela de sempre: nem a marcação antiga, nem o cartão que abria por hover.
    expect(container.querySelector('.tela, .fala-s, .sessao-grade')).toBeNull()
    expect(container.querySelector('.q-sobre')?.textContent).toContain('Sessão de áudio · 0:12')
    expect(screen.getByRole('heading', { level: 1, name: 'Reunião a' })).toBeTruthy()
    expect(container.querySelector('.qs-sub')?.textContent).toContain('Análise do texto, prática ativa e exercícios')
    expect(screen.getAllByRole('tab').map((a) => a.textContent?.trim())).toEqual([
      'Transcrição',
      'Leitura',
      'Jogos',
      'Visão geral & métricas',
    ])
    expect(screen.getByRole('tab', { name: 'Transcrição' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(botao('Voltar para a Biblioteca'))
    expect(ir).toHaveBeenCalledWith('library')
  })

  it('as abas trocam o painel: Leitura, Jogos e Visão geral', async () => {
    const { trocar } = await montar()
    fireEvent.click(screen.getByRole('tab', { name: 'Leitura' }))
    expect(trocar).toHaveBeenLastCalledWith('reading')
    expect(screen.getByTestId('leitura')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Visão geral/ }))
    expect(screen.getByTestId('visao-geral-do-quest')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Visão geral/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('"Trocar de sessão" abre a lista no centro; a escolhida navega para ela', async () => {
    const { ir, botao } = await montar()
    fireEvent.click(botao(/Trocar de sessão/))
    const linhas = within(folha())
      .getAllByRole('button')
      .filter((b) => b.classList.contains('q-linha'))
    expect(linhas.map((l) => l.querySelector('b')?.textContent)).toEqual(['Reunião a', 'Reunião b'])
    expect(linhas[0].getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(linhas[1])
    expect(ir).toHaveBeenCalledWith('analysis', { id: 'b' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('"Exportar" abre as quatro saídas; o vídeo continua na lista, bloqueado', async () => {
    const { botao } = await montar()
    fireEvent.click(botao(/Exportar/))
    const opcoes = [...folha().querySelectorAll<HTMLButtonElement>('.q-linha')]
    expect(opcoes.map((o) => o.querySelector('b')?.textContent?.trim())).toEqual([
      'Áudio da sessão',
      'Vídeo da sessão',
      'Flashcards para Anki',
      'Métricas e desempenho',
    ])
    expect(opcoes.map((o) => o.getAttribute('aria-disabled'))).toEqual([null, 'true', null, null])
  })

  it('documento: a primeira aba é "Texto", sem player e sem prática de pronúncia', async () => {
    const { container, falas } = await montar({ rec: gravacao('a', { type: 'document', audioUrl: undefined }) })
    expect(screen.getAllByRole('tab')[0].textContent?.trim()).toBe('Texto')
    expect(container.querySelector('.q-sobre')?.textContent).toContain('Sessão de documento · texto')
    expect(container.querySelector('.qs-player')).toBeNull()
    // Sem áudio, "Ouvir" lê a frase com a voz do idioma dela.
    fireEvent.click(within(falas()[0]).getByRole('button', { name: 'Ouvir este trecho' }))
    expect(palco.falar).toHaveBeenCalledWith(FALAS[0].sourceText, expect.objectContaining({ lang: 'en' }))
    fireEvent.click(within(falas()[0]).getByRole('button', { name: 'Opções da fala' }))
    expect(within(folha()).queryByRole('button', { name: /Praticar a pronúncia/ })).toBeNull()
  })
})

describe('A sessão no Quest: transcrição', () => {
  it('enquanto a transcrição não chega, mostra a forma do que vem', async () => {
    palco.pendente = true
    const { container, falas } = await montar()
    expect(screen.getByTestId('falas-carregando').querySelectorAll('.q-esqueleto')).toHaveLength(3)
    expect(falas()).toHaveLength(0)
    expect(container.querySelector('.q-vazio')).toBeNull()
  })

  it('o pedido falhou: a tela diz, e "Tentar de novo" repete o pedido', async () => {
    palco.falhar = true
    const { botao, falas } = await montar()
    expect(screen.getByRole('alert').textContent).toContain('Não deu para carregar a transcrição')
    const antes = palco.pedidos
    palco.falhar = false
    fireEvent.click(botao(/Tentar de novo/))
    await act(async () => {})
    expect(palco.pedidos).toBe(antes + 1)
    expect(falas()).toHaveLength(2)
  })

  it('sessão sem falas: o estado vazio, e não uma lista em branco', async () => {
    palco.falas = []
    const { container } = await montar()
    expect(container.querySelector('.q-vazio h2')?.textContent).toBe('Sem texto nesta sessão')
  })

  it('cada fala traz quem falou, o tempo, o original, a tradução e os alvos "Ouvir" e "Opções"', async () => {
    const { falas } = await montar()
    expect(falas()).toHaveLength(2)
    const primeira = falas()[0]
    expect(primeira.querySelector('.qs-quem')?.textContent).toBe('Ana')
    expect(primeira.querySelector('.qs-tempo')?.textContent).toBe('0:00')
    expect(primeira.querySelector('.qs-o')?.textContent).toBe(FALAS[0].sourceText)
    expect(primeira.querySelector('.qs-t')?.textContent).toBe(FALAS[0].translatedText)
    expect(
      within(primeira)
        .getAllByRole('button')
        .slice(1)
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Ouvir a partir deste trecho', 'Opções da fala'])
    // O que o selo é fica escrito (na tela de sempre era a dica do ponteiro).
    expect(screen.getByTestId('procedencia').textContent).toMatch(/Procedência\s*Transcrição local/)
  })

  it('"Ouvir" toca o áudio gravado a partir daquela fala (o clique na fala da tela de sempre)', async () => {
    const { container, falas } = await montar()
    fireEvent.click(within(falas()[1]).getByRole('button', { name: 'Ouvir a partir deste trecho' }))
    await act(async () => {})
    expect(tocar).toHaveBeenCalled()
    expect(container.querySelector('audio')?.currentTime).toBe(5)
    expect(falas()[1].classList.contains('ativa')).toBe(true)
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy()
  })

  it('o player: tocar, a posição, quem fala, as três velocidades, Slow-Mo, loop e reiniciar', async () => {
    const { container, botao } = await montar()
    const player = container.querySelector<HTMLElement>('.qs-player')!
    expect(player.querySelectorAll('.q-ctl.pri')).toHaveLength(1)
    fireEvent.click(botao('Tocar'))
    await act(async () => {})
    expect(tocar).toHaveBeenCalledTimes(1)
    expect(player.querySelector('.qs-falando')?.textContent).toBe('Ana falando')

    const velocidades = within(within(player).getByRole('group', { name: 'Velocidade' })).getAllByRole('button')
    expect(velocidades.map((v) => v.textContent)).toEqual(['0,75×', '1×', '1,25×'])
    fireEvent.click(velocidades[2])
    expect(velocidades[2].getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('audio')?.playbackRate).toBe(1.25)

    const lento = botao(/Smart Slow-Mo/)
    fireEvent.click(lento)
    expect(lento.getAttribute('aria-pressed')).toBe('true')
    const loop = botao(/Modo loop/)
    fireEvent.click(loop)
    expect(loop.getAttribute('aria-pressed')).toBe('true')

    const posicao = within(player).getByRole('slider', { name: 'Posição na gravação' })
    fireEvent.change(posicao, { target: { value: '6' } })
    expect(container.querySelector('audio')?.currentTime).toBe(6)
    fireEvent.click(botao('Reiniciar'))
    expect(container.querySelector('audio')?.currentTime).toBe(0)

    // Os rótulos ficam à vista, e o "?" diz por escrito o que cada um faz (não há dica de ponteiro).
    expect(lento.textContent).toContain('Slow-Mo')
    expect(loop.textContent).toContain('Loop')
    const ajuda = botao('O que fazem Slow-Mo e Loop')
    fireEvent.click(ajuda)
    expect(ajuda.getAttribute('aria-expanded')).toBe('true')
    const texto = container.querySelector('.qs-ajuda-do-player')?.textContent ?? ''
    expect(texto).toContain('Diminui a velocidade nos trechos com vocabulário difícil.')
    expect(texto).toContain('Repete o trecho ativo, bom para fixar pronúncia.')
  })

  it('sessão SEM áudio gravado: "Ouvir" segue narrando dali em diante, pela voz do app', async () => {
    const { container, falas, botao } = await montar({ rec: gravacao('a', { audioUrl: undefined }) })
    expect(container.querySelector('.qs-faixa-do-player')).toBeTruthy()
    fireEvent.click(within(falas()[0]).getByRole('button', { name: 'Ouvir a partir deste trecho' }))
    await act(async () => {})
    const [texto, opcoes] = palco.falar.mock.calls.at(-1) as [string, { lang: string; onEnd?: () => void }]
    expect(texto).toBe(FALAS[0].sourceText)
    expect(opcoes.lang).toBe('en')
    expect(falas()[0].classList.contains('ativa')).toBe(true)
    // A fala terminou: a seguinte começa sozinha, como no player da tela de sempre.
    await act(async () => opcoes.onEnd?.())
    expect(palco.falar.mock.calls.at(-1)?.[0]).toBe(FALAS[1].sourceText)
    expect(falas()[1].classList.contains('ativa')).toBe(true)
    fireEvent.click(botao('Pausar'))
    expect(botao('Tocar')).toBeTruthy()
  })

  it('o áudio gravado não veio: "Ouvir" lê só aquela fala pela voz, e o rótulo diz isso', async () => {
    palco.erroDoAudio = 'áudio indisponível (500)'
    const { container, falas } = await montar()
    expect(container.querySelector('.qs-falando')?.textContent).toContain('Não deu para carregar o áudio')
    expect(within(falas()[0]).queryByRole('button', { name: 'Ouvir a partir deste trecho' })).toBeNull()
    fireEvent.click(within(falas()[0]).getByRole('button', { name: 'Ouvir este trecho' }))
    expect(palco.falar).toHaveBeenCalledWith(FALAS[0].sourceText, expect.objectContaining({ lang: 'en' }))
    expect(tocar).not.toHaveBeenCalled()
    fireEvent.click(within(falas()[0]).getByRole('button', { name: 'Opções da fala' }))
    expect(within(folha()).getByRole('button', { name: /Ouvir esta fala/ })).toBeTruthy()
  })

  it('o áudio gravado não veio e não há voz: a fala não oferece "Ouvir", e as opções dizem o motivo', async () => {
    palco.erroDoAudio = 'áudio indisponível (500)'
    palco.voz = false
    const { falas } = await montar()
    expect(within(falas()[0]).queryByRole('button', { name: /Ouvir/ })).toBeNull()
    fireEvent.click(within(falas()[0]).getByRole('button', { name: 'Opções da fala' }))
    expect(screen.getByTestId('fala-sem-voz').textContent).toContain('Não há como ouvir esta fala aqui')
  })

  it('sem áudio gravado e sem voz no aparelho, o player diz o motivo em vez de um botão que não toca', async () => {
    palco.voz = false
    const { container, falas } = await montar({ rec: gravacao('a', { audioUrl: undefined }) })
    expect(container.querySelector('.qs-player')).toBeNull()
    expect(container.querySelector('.qs-player-sem-voz')?.textContent).toContain('não tem áudio gravado')
    // Sem voz para o idioma, a fala não oferece "Ouvir"; as opções dizem por quê.
    expect(within(falas()[0]).queryByRole('button', { name: /Ouvir/ })).toBeNull()
    fireEvent.click(within(falas()[0]).getByRole('button', { name: 'Opções da fala' }))
    expect(screen.getByTestId('fala-sem-voz')).toBeTruthy()
  })

  it('tocar na fala abre as opções no centro: ouvir dali, praticar a pronúncia e editar', async () => {
    const { falas } = await montar()
    fireEvent.click(falas()[0].querySelector<HTMLButtonElement>('.qs-fala-texto')!)
    const opcoes = within(folha())
    expect(folha().querySelector('.qs-folha-texto')?.textContent).toBe(FALAS[0].sourceText)
    expect(folha().querySelector('.qs-folha-trad')?.textContent).toBe(FALAS[0].translatedText)
    expect(folha().querySelectorAll('.q-ctl.pri')).toHaveLength(1)
    fireEvent.click(opcoes.getByRole('button', { name: /Ouvir a partir daqui/ }))
    await act(async () => {})
    expect(tocar).toHaveBeenCalled()

    // Praticar a pronúncia: o Quest não tem reconhecimento de fala, então a prática diz o motivo.
    const praticar = opcoes.getByRole('button', { name: /Praticar a pronúncia/ })
    fireEvent.click(praticar)
    expect(praticar.getAttribute('aria-pressed')).toBe('true')
    const sombra = screen.getByTestId('sombra-sem-reconhecimento')
    // Só a NOTA fica de fora, com o motivo; gravar a própria voz e ouvir a gravação continuam.
    expect(screen.getByTestId('nota-indisponivel').textContent).toContain(
      'reconhecimento de fala do navegador, que o headset não tem',
    )
    expect(within(sombra).getByRole('button', { name: /Ouvir original/ })).toBeTruthy()
    expect(within(sombra).getByRole('button', { name: /Gravar a minha voz/ })).toBeTruthy()
  })

  it('prática de pronúncia sem reconhecimento: gravar, parar, ouvir a minha gravação e tentar de novo', async () => {
    const parada = vi.fn()
    class Gravador {
      state = 'inactive'
      mimeType = 'audio/webm'
      stream: unknown
      ondataavailable: ((e: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      constructor(stream: unknown) {
        this.stream = stream
      }
      start() {
        this.state = 'recording'
      }
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['voz'], { type: 'audio/webm' }) })
        this.onstop?.()
      }
    }
    vi.stubGlobal('MediaRecorder', Gravador)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: parada }] })) },
    })
    URL.createObjectURL = vi.fn(() => 'blob:minha-voz')
    URL.revokeObjectURL = vi.fn()

    const { falas } = await montar()
    fireEvent.click(within(falas()[0]).getByRole('button', { name: 'Opções da fala' }))
    fireEvent.click(within(folha()).getByRole('button', { name: /Praticar a pronúncia/ }))
    const sombra = () => within(screen.getByTestId('sombra-sem-reconhecimento'))
    fireEvent.click(sombra().getByRole('button', { name: /Gravar a minha voz/ }))
    await act(async () => {})
    expect(screen.getByTestId('sombra-sem-reconhecimento').textContent).toContain('Gravando: fale a frase agora.')
    fireEvent.click(sombra().getByRole('button', { name: /Parar/ }))
    expect(parada).toHaveBeenCalled()
    const minha = sombra().getByRole('button', { name: /Ouvir minha gravação/ }) as HTMLButtonElement
    expect(minha.disabled).toBe(false)
    expect(sombra().getByRole('button', { name: /Tentar de novo/ })).toBeTruthy()
    expect(sombra().getByRole('button', { name: /Ouvir original/ })).toBeTruthy()
    // A nota de 0 a 100 não aparece: o motivo continua escrito.
    expect(screen.getByTestId('nota-indisponivel')).toBeTruthy()
  })

  it('"Editar" troca o duplo clique: dois campos, Salvar grava e a fala muda; Cancelar desiste', async () => {
    const { falas } = await montar()
    fireEvent.click(within(falas()[0]).getByRole('button', { name: 'Opções da fala' }))
    fireEvent.click(within(folha()).getByRole('button', { name: /Editar/ }))
    const campos = within(screen.getByTestId('edicao-da-fala')).getAllByRole('textbox') as HTMLTextAreaElement[]
    expect(campos.map((c) => c.value)).toEqual([FALAS[0].sourceText, FALAS[0].translatedText])
    fireEvent.click(within(folha()).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByTestId('edicao-da-fala')).toBeNull()

    fireEvent.click(within(folha()).getByRole('button', { name: /Editar/ }))
    const [origem] = within(screen.getByTestId('edicao-da-fala')).getAllByRole('textbox')
    fireEvent.change(origem, { target: { value: 'We must improve retention.' } })
    fireEvent.click(within(folha()).getByRole('button', { name: /Salvar/ }))
    await act(async () => {})
    expect(palco.salvar).toHaveBeenCalledWith('u1', {
      sourceText: 'We must improve retention.',
      translatedText: FALAS[0].translatedText,
    })
    expect(falas()[0].querySelector('.qs-o')?.textContent).toBe('We must improve retention.')
  })

  it('a edição que não grava diz o erro e mantém o texto digitado', async () => {
    palco.salvar.mockResolvedValueOnce(null)
    const { falas } = await montar()
    fireEvent.click(within(falas()[0]).getByRole('button', { name: 'Opções da fala' }))
    fireEvent.click(within(folha()).getByRole('button', { name: /Editar/ }))
    fireEvent.click(within(folha()).getByRole('button', { name: /Salvar/ }))
    await act(async () => {})
    expect(within(folha()).getByRole('alert').textContent).toContain('Não foi possível salvar')
    expect(screen.getByTestId('edicao-da-fala')).toBeTruthy()
  })

  it('as palavras da fala viram botões; a que já está no caderno vem marcada', async () => {
    const { falas } = await montar()
    fireEvent.click(within(falas()[0]).getByRole('button', { name: 'Opções da fala' }))
    const palavras = [...folha().querySelectorAll<HTMLButtonElement>('.qs-palavra')]
    expect(palavras.map((p) => p.textContent)).toEqual(['need', 'improve', 'retention', 'this', 'quarter'])
    expect(palavras.map((p) => p.hasAttribute('data-no-caderno'))).toEqual([false, false, true, false, false])
  })

  it('tocar numa palavra abre a folha dela: imagem, tradução, ouvir, deck, revisar e duelo', async () => {
    const { falas, ir } = await montar()
    fireEvent.click(within(falas()[0]).getByRole('button', { name: 'Opções da fala' }))
    fireEvent.click(within(folha()).getByRole('button', { name: 'improve' }))
    await act(async () => {})
    const palavra = within(folha())
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    expect(palavra.getByRole('heading', { name: 'improve' })).toBeTruthy()
    expect(folha().querySelector('.qp-traducao')?.textContent).toBe('tradução de improve')
    expect(folha().querySelector('.qp-imagem img')?.getAttribute('src')).toBe('https://exemplo.test/retention.jpg')
    expect(folha().querySelector('.qp-exemplo')?.textContent).toContain(FALAS[0].sourceText)

    fireEvent.click(palavra.getByRole('button', { name: /^Ouvir$/ }))
    expect(palco.falar).toHaveBeenCalledWith('improve', expect.objectContaining({ lang: 'en-US', rate: 1 }))
    // Sem verbete: a folha diz em que idioma procurou. E o que "Revisar agora" e o Duelo fazem, por escrito.
    expect(folha().textContent).toMatch(/O Wiktionary não tem verbete para esta palavra em \S+/)
    expect(folha().querySelector('.qp-o-que-fazem')?.textContent).toContain('adiciona a palavra ao deck')
    expect(folha().querySelector('.qp-o-que-fazem')?.textContent).toContain('Duelo relâmpago')
    const velocidades = within(palavra.getByRole('group', { name: 'Velocidade do áudio' })).getAllByRole('button')
    expect(velocidades.map((v) => v.textContent)).toEqual(['0,5×', '1×'])
    fireEvent.click(velocidades[0])
    expect(velocidades[0].getAttribute('aria-pressed')).toBe('true')

    expect(palavra.getByRole('button', { name: /Adicionar ao Deck/ })).toBeTruthy()
    expect(palavra.getByRole('button', { name: /Revisar agora/ })).toBeTruthy()
    fireEvent.click(palavra.getByRole('button', { name: /Duelo com esta palavra/ }))
    await act(async () => {})
    expect(ir).toHaveBeenCalledWith(
      'play',
      expect.objectContaining({ id: 'a', seed: expect.objectContaining({ word: 'improve' }) }),
    )
  })

  it('a folha da palavra traz a fonética com o link da fonte dela; sem fonética, o verbete diz', async () => {
    const verbete = (ipa?: string) => ({
      status: 'found',
      entry: {
        lang: 'en',
        glossLang: 'pt',
        ipa,
        ipaSource: ipa ? { wiki: 'Wiktionary (en)', url: 'https://exemplo.test/ipa' } : undefined,
        senses: [{ partOfSpeech: 'verbo', definition: 'Tornar melhor.', examples: [] }],
        source: { wiki: 'Wikcionário', license: 'CC BY-SA', url: 'https://exemplo.test/verbete' },
      },
    })
    palco.verbete = verbete('/ɪmˈpruːv/')
    const { falas } = await montar()
    fireEvent.click(within(falas()[0]).getByRole('button', { name: 'Opções da fala' }))
    fireEvent.click(within(folha()).getByRole('button', { name: 'improve' }))
    await act(async () => {})
    const fonetica = screen.getByTestId('fonetica-da-palavra')
    expect(fonetica.textContent).toContain('/ɪmˈpruːv/')
    expect(
      within(fonetica)
        .getByRole('link', { name: /Fonética do Wiktionary \(en\)/ })
        .getAttribute('href'),
    ).toBe('https://exemplo.test/ipa')
    expect(folha().querySelector('.qp-sentidos')?.textContent).toContain('Tornar melhor.')
    // O selo de procedência ("Calculado") fica na moldura que o CSS do headset mede.
    expect(folha().querySelector('.qp-procedencia .badge-tag')).toBeTruthy()

    fireEvent.click(within(folha()).getByRole('button', { name: 'Fechar' }))
    palco.verbete = verbete()
    fireEvent.click(within(folha()).getByRole('button', { name: 'need' }))
    await act(async () => {})
    expect(screen.getByTestId('fonetica-da-palavra').textContent).toContain('O verbete não traz transcrição fonética.')
  })

  it('a folha da palavra fecha no X e volta às opções da fala', async () => {
    const { falas } = await montar()
    fireEvent.click(within(falas()[0]).getByRole('button', { name: 'Opções da fala' }))
    fireEvent.click(within(folha()).getByRole('button', { name: 'retention' }))
    await act(async () => {})
    // Palavra que já está no caderno: o estado, e não o botão de adicionar.
    expect(folha().querySelector('.qp-no-deck')?.textContent).toContain('Já está no Deck')
    fireEvent.click(within(folha()).getByRole('button', { name: 'Fechar' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByTestId('opcoes-da-fala')).toBeTruthy()
  })

  it('sem voz para o idioma da palavra, a folha diz isso em vez de oferecer "Ouvir"', async () => {
    const { falas } = await montar()
    fireEvent.click(within(falas()[0]).getByRole('button', { name: 'Opções da fala' }))
    palco.voz = false
    fireEvent.click(within(folha()).getByRole('button', { name: 'improve' }))
    await act(async () => {})
    expect(screen.getByTestId('palavra-sem-voz')).toBeTruthy()
    expect(within(folha()).queryByRole('button', { name: /^Ouvir$/ })).toBeNull()
  })

  it('"Palavras desta sessão" abre a lista do caderno, e cada palavra abre a folha dela', async () => {
    const { botao } = await montar()
    const chip = botao(/Palavras desta sessão/)
    expect(chip.querySelector('.qs-n')?.textContent).toBe('1')
    fireEvent.click(chip)
    const linha = within(folha()).getByRole('button', { name: /retention/ })
    expect(linha.textContent).toContain('retenção')
    expect(linha.textContent).toContain('B2')
    fireEvent.click(linha)
    await act(async () => {})
    expect(within(folha()).getByRole('heading', { name: 'retention' })).toBeTruthy()
  })

  it('"Ajustar exibição": os cinco ajustes, e cada um vale na lista de falas', async () => {
    const { container, botao } = await montar()
    fireEvent.click(botao(/Ajustar exibição/))
    const grupo = (nome: string) => within(within(folha()).getByRole('group', { name: nome })).getAllByRole('button')
    expect(grupo('Ordem').map((b) => b.textContent)).toEqual(['Original primeiro', 'Tradução primeiro'])
    expect(grupo('Original').map((b) => b.textContent)).toEqual(['Mostrar', 'Ocultar'])
    expect(grupo('Tamanho').map((b) => b.textContent)).toEqual(['P', 'M', 'G', 'GG'])
    expect(grupo('Fonte').map((b) => b.textContent)).toEqual(['Sans', 'Serif', 'Mono'])
    expect(grupo('Tema do texto').map((b) => b.textContent)).toEqual(['Padrão', 'Sépia', 'Contraste', 'Oceano', 'Neon'])

    const lista = () => container.querySelector<HTMLElement>('.qs-falas')!
    fireEvent.click(grupo('Tamanho')[3])
    fireEvent.click(grupo('Fonte')[1])
    fireEvent.click(grupo('Tema do texto')[1])
    expect(lista().className).toContain('s-gigante')
    expect(lista().className).toContain('f-serif')
    expect(lista().className).toContain('t-sepia')

    fireEvent.click(grupo('Ordem')[1])
    const texto = lista().querySelector('.qs-fala-texto')!
    expect([...texto.children].map((c) => c.className)).toEqual(['qs-meta', 'qs-t', 'qs-o'])
    fireEvent.click(grupo('Original')[1])
    expect(lista().querySelector('.qs-o')).toBeNull()
    expect(lista().querySelector('.qs-t')).toBeTruthy()
  })

  it('"Polir a tradução da sessão" continua acima das falas, com a ação dela', async () => {
    const { container } = await montar()
    const polir = await screen.findByTestId('polir-sessao')
    // Sem a Tradução Nuance é o convite com cadeado; com ela e sem a nuvem autorizada, o pedido de autorização.
    expect(within(polir).getAllByRole('button').length).toBeGreaterThan(0)
    const lista = container.querySelector('.qs-falas')!
    expect(polir.compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('A sessão no Quest: jogos e visão geral', () => {
  it('Jogos: a faixa de revisão desta sessão e o lobby embutido', async () => {
    const { trocar, botao, container } = await montar({ aba: 'practice' })
    const faixa = container.querySelector<HTMLElement>('.qs-revisar')!
    expect(faixa.textContent).toContain('Revisar as palavras desta sessão')
    expect(faixa.textContent).toContain('retention')
    expect((await screen.findByTestId('lobby-embutido')).textContent).toBe('true')
    fireEvent.click(botao(/Revisar agora/))
    expect(trocar).toHaveBeenCalledWith('study')
  })

  it('Jogos sem palavras desta sessão no caderno: só o lobby, sem a faixa', async () => {
    palco.cartoes = []
    const { container } = await montar({ aba: 'practice' })
    expect(container.querySelector('.qs-revisar')).toBeNull()
    expect(await screen.findByTestId('lobby-embutido')).toBeTruthy()
  })

  it('Painel: os nove ladrilhos com o número e a explicação, e as palavras-chave', async () => {
    const { container } = await montar({ aba: 'overview' })
    const ladrilhos = [...container.querySelectorAll<HTMLElement>('.qs-ladrilhos .q-num')]
    expect(ladrilhos.map((l) => l.querySelector('.q-rotulo')?.textContent)).toEqual([
      'Palavras',
      'Minutos de leitura',
      'Facilidade de leitura',
      'Densidade lexical',
      'Palavras únicas',
      'Palavras por minuto',
      'Vícios de linguagem',
      'Riqueza (TTR)',
      'Pausas longas',
    ])
    expect(ladrilhos[0].querySelector('b')?.textContent).toBe('13')
    expect(ladrilhos[0].textContent).toContain('na transcrição inteira')
    expect(screen.getAllByRole('tab', { selected: true }).map((a) => a.textContent?.trim())).toContain('Painel')
  })

  it('uma palavra-chave leva à inteligência lexical, com as ocorrências que tocam o trecho', async () => {
    const { container, trocar } = await montar({ aba: 'overview' })
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Palavras-chave da sessão' })).getByRole('button', {
        name: 'retention',
      }),
    )
    expect(screen.getByRole('tab', { name: /Inteligência lexical/ }).getAttribute('aria-selected')).toBe('true')
    const topologia = screen.getByRole('region', { name: 'Topologia lexical da sessão' })
    expect([...topologia.querySelectorAll('.q-num b')].map((b) => b.textContent)).toEqual(['12', '1'])
    expect(container.querySelector('.qs-palavra-do-micro')?.textContent).toBe('retention')
    const ocorrencias = [...container.querySelectorAll<HTMLButtonElement>('.qs-ocorrencia')]
    expect(ocorrencias).toHaveLength(2)
    expect(ocorrencias[1].querySelector('.q-fim')?.textContent).toBe('0:05')
    fireEvent.click(ocorrencias[1])
    expect(trocar).toHaveBeenLastCalledWith('transcript')
    await act(async () => {})
    expect(screen.getByRole('tab', { name: 'Transcrição' }).getAttribute('aria-selected')).toBe('true')
  })

  it('microdados de uma palavra com caractere especial ("c++") não derrubam a tela', async () => {
    palco.falas = [
      ...FALAS,
      { ...FALAS[1], id: 'u3', idx: 2, sourceText: 'We write c++ daily.', tStartMs: 10000, tEndMs: 12000 },
    ]
    palco.cartoes = [CARTAO, { ...CARTAO, id: 'c2', word: 'c++', translation: 'c++', sentence: 'We write c++ daily.' }]
    const { container } = await montar({ aba: 'overview' })
    fireEvent.click(screen.getByRole('tab', { name: /Inteligência lexical/ }))
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Palavra dos microdados' })).getByRole('button', { name: 'c++' }),
    )
    expect(container.querySelector('.qs-palavra-do-micro')?.textContent).toBe('c++')
    const ocorrencias = [...container.querySelectorAll<HTMLElement>('.qs-ocorrencia')]
    expect(ocorrencias.map((o) => o.querySelector('.qs-frase-da-ocorrencia')?.textContent)).toEqual([
      'We write c++ daily.',
    ])
  })

  it('Fluência: silêncio, vícios, pausas e o ritmo de cada falante', async () => {
    const { container } = await montar({ aba: 'overview' })
    fireEvent.click(screen.getByRole('tab', { name: /Fluência/ }))
    const numeros = [...container.querySelectorAll<HTMLElement>('.qs-secao-da-visao .q-num')]
    expect(numeros.map((n) => n.querySelector('.q-rotulo')?.textContent)).toEqual([
      'Silêncio total',
      'Vícios de linguagem',
      'Pausas longas',
    ])
    expect(numeros[0].querySelector('b')?.textContent).toBe('1 s')
    const falantes = [...container.querySelectorAll<HTMLElement>('.qs-falante')]
    expect(falantes.map((f) => f.querySelector('b')?.textContent)).toEqual(['Ana', 'Bruno'])
    expect(falantes[0].querySelector('.qs-ppm')?.textContent).toBe('105 palavras/min')
  })

  it('documento não tem a seção de fluência', async () => {
    await montar({ aba: 'overview', rec: gravacao('a', { type: 'document', audioUrl: undefined }) })
    expect(screen.getAllByRole('tab').map((a) => a.textContent?.trim())).not.toContain('Fluência')
    expect(screen.getByRole('tab', { name: /Inteligência lexical/ })).toBeTruthy()
  })
})

describe('TokensClicaveis fora das folhas do Quest', () => {
  it('sem `comoBotoes`, mostra a frase inteira (o Quest não troca o texto por botões sozinho)', () => {
    const frase = 'We need to improve retention.'
    const { container } = render(
      <TokensClicaveis
        tokens={tokenizarTexto(frase)}
        className="orig"
        estaNoDeck={() => false}
        onMouseEnter={() => {}}
        onMouseLeave={() => {}}
        onExaminar={() => {}}
      />,
    )
    expect(container.textContent?.trim()).toBe(frase)
    expect(container.querySelector('button')).toBeNull()
  })
})
