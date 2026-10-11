// @vitest-environment jsdom
/**
 * A REVISÃO ENXUTA NA TELA (10/10/2026, `docs/prototipos/cartoes-enxuto.html`): a cena no verso do cartão
 * nascido de captura, o convite "Juntar a cena", a folha "Minha voz" com o gravador, e as práticas de
 * recordar gravando a nota com a origem certa.
 */
import 'fake-indexeddb/auto'

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

type Espia = ReturnType<(typeof import('vitest'))['vi']['fn']>
const api = vi.hoisted(() => ({
  deck: [] as unknown[],
  ocorrencias: {} as Record<string, unknown[]>,
  falas: [] as unknown[],
  revisar: null as unknown as Espia,
  atualizar: null as unknown as Espia,
  lerOcorrencias: null as unknown as Espia,
  lerSessao: null as unknown as Espia,
}))
const avisos = vi.hoisted(() => ({ ok: null as unknown as Espia, warn: null as unknown as Espia }))
const som = vi.hoisted(() => ({ pedidos: [] as string[] }))

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => true,
}))
vi.mock('../src/lib/voz/haVoz', () => ({ haVozPara: () => true, haAlgumaVoz: () => true }))
vi.mock('../src/lib/tts', async (orig) => ({
  ...(await orig<typeof import('../src/lib/tts')>()),
  speak: vi.fn(),
  falar: (_texto: string, _idioma: string, o: { onEnd?: () => void } = {}) => {
    o.onEnd?.()
    return true
  },
  cancelSpeech: vi.fn(),
}))
/* O áudio da sessão: o teste só precisa saber SE e QUANDO ele foi pedido. */
vi.mock('../src/lib/audioDaSessao', () => ({
  urlDeAudio: (id: string) => {
    som.pedidos.push(id)
    return Promise.reject(new Error('sem áudio no teste'))
  },
  liberar: vi.fn(),
}))
vi.mock('../src/lib/langConfig', async (orig) => {
  const real = await orig<typeof import('../src/lib/langConfig')>()
  return { ...real, fetchLangConfig: async () => real.DEFAULT_LANG_CONFIG, onLangConfigChange: () => () => {} }
})
vi.mock('../src/lib/dictionary', () => ({ lookup: vi.fn(async () => null), forvoUrl: () => '#', wiktionaryUrl: () => '#' }))
vi.mock('../src/components/Toast', async (orig) => {
  avisos.ok = vi.fn()
  avisos.warn = vi.fn()
  return {
    ...(await orig<typeof import('../src/components/Toast')>()),
    toast: { ok: avisos.ok, error: vi.fn(), warn: avisos.warn, info: vi.fn() },
  }
})
vi.mock('../src/data/api', async (orig) => {
  const achar = (id: string) => (api.deck as Array<{ id: string }>).find((c) => c.id === id)
  api.revisar = vi.fn(async (id: string) => achar(id))
  api.atualizar = vi.fn(async (id: string, patch: object) => ({ ...achar(id), ...patch }))
  api.lerOcorrencias = vi.fn(async (id: string) => api.ocorrencias[id] ?? [])
  api.lerSessao = vi.fn(async () => ({ session: { title: 'Reunião de produto' }, utterances: api.falas }))
  return {
    ...(await orig<typeof import('../src/data/api')>()),
    fetchDeck: async () => api.deck,
    reviewCard: api.revisar,
    desfazerRevisao: vi.fn(async (id: string) => achar(id)),
    updateCard: api.atualizar,
    salvarRodada: vi.fn(async () => undefined),
    fetchMemoriaDoCartao: async () => ({ revisoes: 4, acertos: 3 }),
    fetchOcorrencias: api.lerOcorrencias,
    fetchSessionTranscript: api.lerSessao,
    fetchMetrics: async () => null,
    lerMissoes: async () => null,
  }
})

import Gravador from '../src/components/views/revisao/enxuta/Gravador'
import Pratica from '../src/components/views/revisao/enxuta/Pratica'
import Study from '../src/components/views/Study'
import { esquecerCenas } from '../src/lib/revisao/cena'
import type { Tocador } from '../src/lib/revisao/falaOriginal'
import { vozesGuardadas } from '../src/lib/revisao/vozGuardada'
import type { Recording, VocabCard } from '../src/types'

const FRASE = "That's a big deal. Customers were complaining about it."
const cartao = (id: string, word: string, translation: string, extra: Partial<VocabCard> = {}): VocabCard =>
  ({
    id,
    word,
    translation,
    phonetics: '',
    explanation: '',
    sentence: `I saw a ${word} yesterday.`,
    srcLang: 'en',
    tgtLang: 'pt',
    cefrLevel: 'B1',
    inDeck: true,
    leitnerBox: 1,
    leitnerDueAt: '',
    fsrsState: 'Review',
    fsrsStability: 4,
    fsrsDifficulty: 5,
    fsrsPredictedRetention: 0.9,
    fsrsDueAt: '',
    dueAtMs: Date.now() - 86_400_000,
    lastReview: Date.now() - 5 * 86_400_000,
    stability: 4,
    reps: 3,
    ...extra,
  }) as unknown as VocabCard
const SESSAO = { id: 's1', title: 'Reunião de produto', audioUrl: '/api/sessions/s1/audio' } as Recording
const FALA = {
  id: 'u1',
  speakerName: 'Ana',
  sourceText: FRASE,
  translatedText: 'Isso é importante. Os clientes estavam reclamando disso.',
  tStartMs: 38_000,
  tEndMs: 42_000,
}
const daSessao = { originKind: 'sessao', originRef: 's1', sentence: FRASE, utteranceId: null, occurredAt: 1 }

async function assentar() {
  await act(async () => {
    await vi.dynamicImportSettled()
  })
  await act(async () => {})
}
async function montar(props: Partial<React.ComponentProps<typeof Study>> = {}) {
  const ir = vi.fn()
  const tela = render(<Study onChangeView={ir} gravacoes={[SESSAO]} {...props} />)
  await assentar()
  const palco = () => tela.container.querySelector('.q-palco.q-revisao') as HTMLElement
  const tocar = async (el: Element) => {
    fireEvent.click(el)
    await assentar()
  }
  return { ...tela, ir, palco, tocar }
}

/** O microfone e o gravador do navegador, de mentira: o que importa é o caminho do componente. */
function microfone(o: { erro?: string } = {}) {
  const trilha = { stop: vi.fn() }
  const getUserMedia = vi.fn(async () => {
    if (o.erro) throw Object.assign(new Error(o.erro), { name: o.erro })
    return { getTracks: () => [trilha] }
  })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  class Falso {
    state = 'inactive'
    mimeType = 'audio/webm'
    ondataavailable: ((e: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    start() {
      this.state = 'recording'
    }
    stop() {
      this.state = 'inactive'
      this.ondataavailable?.({ data: new Blob([new Uint8Array(40).fill(3)], { type: 'audio/webm' }) })
      this.onstop?.()
    }
  }
  vi.stubGlobal('MediaRecorder', Falso)
  return { getUserMedia, trilha }
}

beforeEach(() => {
  localStorage.clear()
  esquecerCenas()
  som.pedidos.length = 0
  api.ocorrencias = {}
  api.falas = [FALA]
  api.revisar?.mockClear()
  api.atualizar?.mockClear()
  api.lerOcorrencias?.mockClear()
  api.lerSessao?.mockClear()
  avisos.ok?.mockClear()
  URL.createObjectURL = vi.fn(() => 'blob:teste')
  URL.revokeObjectURL = vi.fn()
  vi.stubGlobal(
    'Audio',
    class {
      onended: (() => void) | null = null
      onerror: (() => void) | null = null
      pause() {}
      play() {
        queueMicrotask(() => this.onended?.())
        return Promise.resolve()
      }
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('a cena no verso', () => {
  it('cartão nascido de captura: nada é lido na frente; no verso, a frase, quem falou, o tempo e a sessão', async () => {
    api.deck = [cartao('c1', 'complain', 'reclamar', { sourceSessionId: 's1', sentence: FRASE })]
    api.ocorrencias = { c1: [daSessao] }
    const { palco, tocar, ir } = await montar()

    // A FRENTE: sem cena (ela entregaria a resposta) e sem leitura nenhuma; a fileira tem a fala original.
    expect(palco().dataset.cxLado).toBe('frente')
    expect(palco().querySelector('.cx-cena')).toBeNull()
    expect(api.lerOcorrencias).not.toHaveBeenCalled()
    expect(api.lerSessao).not.toHaveBeenCalled()
    const fileira = palco().querySelector('.cx-fileira') as HTMLElement
    expect([...fileira.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual([
      'Fala original',
      'Mostrar resposta',
    ])
    expect(palco().querySelector('.cx-onde')?.textContent).toBe('Reunião de produto')

    await tocar(screen.getByRole('button', { name: /Mostrar resposta/ }))
    expect(palco().dataset.cxLado).toBe('verso')
    const cena = palco().querySelector('.cx-cena.audio') as HTMLElement
    expect(cena.querySelector('.cx-cena-de')?.textContent).toBe('Reunião de produto · Ana')
    expect(cena.querySelector('.cx-cena-tempo')?.textContent).toBe('00:38')
    // A onda com a inicial de quem falou: o app não guarda quadro de vídeo.
    expect(cena.querySelector('svg text')?.textContent).toBe('A')
    expect(cena.querySelectorAll('svg g rect')).toHaveLength(30)
    expect(palco().querySelector('.ct-trad-da-frase')?.textContent).toBe(`“${FALA.translatedText}”`)
    expect(palco().querySelector('.exemplo mark')?.textContent).toBe('complaining')
    // Fala original e Minha voz viram dois ícones ao lado da frase.
    expect(palco().querySelectorAll('.cx-icones .q-ctl.cx-ic')).toHaveLength(2)

    // O ÁUDIO SÓ DESCE NO TOQUE: mostrar o verso não pediu nada.
    expect(som.pedidos).toEqual([])
    await tocar(screen.getByRole('button', { name: 'Fala original: Ana' }))
    expect(som.pedidos).toEqual(['s1'])

    fireEvent.click(within(cena).getByRole('button', { name: /Abrir na sessão/ }))
    expect(ir).toHaveBeenCalledWith('analysis', { id: 's1' })
  })

  it('cartão do Anki: verso simples; o convite "Juntar a cena" só quando a palavra está numa sessão da pessoa', async () => {
    api.deck = [
      cartao('a1', 'complain', 'reclamar', { daAnki: true, dueAtMs: Date.now() - 9 * 86_400_000 }),
      cartao('a2', 'towel', 'toalha', { daAnki: true }),
    ]
    api.ocorrencias = { a1: [{ originKind: 'anki', originRef: 'd1', sentence: 'x', utteranceId: null }, daSessao] }
    const { palco, tocar } = await montar()
    expect(palco().querySelector('.cx-fileira button')?.textContent?.trim()).toBe('Ouvir')

    await tocar(screen.getByRole('button', { name: /Mostrar resposta/ }))
    expect(palco().querySelector('.cx-cena')).toBeNull()
    const convite = palco().querySelector('.cx-juntar') as HTMLElement
    expect(convite.textContent).toContain('Reunião de produto')
    await tocar(convite)
    expect(palco().querySelector('.cx-cena .cx-cena-de')?.textContent).toBe('Reunião de produto · Ana')
    expect(palco().querySelector('.cx-juntar')).toBeNull()
    expect(palco().querySelector('.exemplo mark')?.textContent).toBe('complaining')
    expect(JSON.parse(localStorage.getItem('revisao.cenasJuntadas') as string)).toEqual(['a1'])

    // O outro cartão do Anki nunca apareceu numa captura: verso simples, sem convite.
    await tocar(palco().querySelector('.fsrs button.b') as HTMLElement)
    await tocar(screen.getByRole('button', { name: /Mostrar resposta/ }))
    expect(palco().querySelector('.termo')?.textContent).toBe('towel')
    expect(palco().querySelector('.cx-cena')).toBeNull()
    expect(palco().querySelector('.cx-juntar')).toBeNull()
  })
})

describe('o gravador de "Minha voz"', () => {
  const montarGravador = (extra: Partial<React.ComponentProps<typeof Gravador>> = {}) => {
    const aoGravar = vi.fn()
    const aoComparar = vi.fn()
    const aoOuvirOriginal = vi.fn(async () => undefined)
    const tela = render(
      <Gravador
        frase="We ship it."
        idioma="en"
        quem="Ana"
        originalGravada
        aoOuvirOriginal={aoOuvirOriginal}
        aoGravar={aoGravar}
        aoComparar={aoComparar}
        {...extra}
      />,
    )
    const raiz = () => tela.container.querySelector('.cx-voz') as HTMLElement
    return { ...tela, raiz, aoGravar, aoComparar, aoOuvirOriginal }
  }

  it('grava com o microfone, mostra as duas ondas, toca a original e depois a gravação; sem nota', async () => {
    const mic = microfone()
    const { raiz, aoGravar, aoComparar, aoOuvirOriginal } = montarGravador()
    expect(raiz().dataset.fase).toBe('pronto')
    expect(raiz().querySelector('.cx-trilha.orig .cx-quem')?.textContent).toBe('Fala original · Ana')
    expect(raiz().querySelectorAll('.cx-trilha.orig .cx-onda-base i')).toHaveLength(44)

    fireEvent.click(screen.getByRole('button', { name: 'Gravar a minha voz' }))
    await act(async () => {})
    expect(mic.getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(raiz().dataset.fase).toBe('gravando')
    fireEvent.click(screen.getByRole('button', { name: 'Parar de gravar' }))
    await act(async () => {})

    // O microfone é solto assim que a gravação para.
    expect(mic.trilha.stop).toHaveBeenCalled()
    expect(aoGravar).toHaveBeenCalledTimes(1)
    const gravado = aoGravar.mock.calls[0][0] as { picos: number[]; dur: number; audio: Blob }
    expect(gravado.picos).toHaveLength(44)
    expect(gravado.audio.size).toBe(40)
    expect(raiz().dataset.fase).toBe('ouvindo')
    expect(aoOuvirOriginal).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(raiz().dataset.fase).toBe('feito'), { timeout: 6000 })
    expect(aoComparar).toHaveBeenCalledTimes(1)
    expect(raiz().querySelectorAll('.cx-trilha.eu .cx-onda-base i')).toHaveLength(44)
    expect(screen.getByRole('button', { name: /Ouvir de novo/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Gravar de novo/ })).toBeTruthy()
    // Sem nota e sem reprovar: nenhum número, nenhum veredito.
    expect(raiz().querySelector('.qr-veredito, .fsrs')).toBeNull()
    expect(raiz().textContent).toContain('quem julga é você')
    // O palpite só existe onde o navegador reconhece fala (o jsdom não reconhece).
    expect(screen.queryByRole('button', { name: /O que o aparelho entendeu/ })).toBeNull()
  }, 12000)

  it('permissão negada: texto claro, sem onda inventada, e dá para tentar de novo', async () => {
    microfone({ erro: 'NotAllowedError' })
    const { raiz, aoGravar } = montarGravador()
    fireEvent.click(screen.getByRole('button', { name: 'Gravar a minha voz' }))
    await act(async () => {})
    expect(raiz().dataset.fase).toBe('negado')
    expect(raiz().querySelector('.cx-voz-status')?.textContent).toContain('O navegador não deixou usar o microfone')
    expect(raiz().querySelector('.cx-voz-status')?.textContent).toContain('não sai deste aparelho')
    expect(raiz().querySelectorAll('.cx-trilha.eu .cx-onda-base i')).toHaveLength(0)
    expect(aoGravar).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Tentar de novo/ })).toBeTruthy()
    // Nada de "ver com uma simulação": no app não há gravação de mentira.
    expect(screen.queryByRole('button', { name: /simula/i })).toBeNull()
  })

  it('aparelho sem microfone: a tela diz isso', async () => {
    microfone({ erro: 'NotFoundError' })
    const { raiz } = montarGravador()
    fireEvent.click(screen.getByRole('button', { name: 'Gravar a minha voz' }))
    await act(async () => {})
    expect(raiz().querySelector('.cx-voz-status')?.textContent).toContain('Não achei um microfone')
  })
})

describe('a folha "Minha voz" na revisão', () => {
  it('abre pelo ícone do verso; guardar vem desligado; ligado, a gravação fica só no aparelho e dá para apagar', async () => {
    microfone()
    api.deck = [cartao('c1', 'complain', 'reclamar', { sourceSessionId: 's1', sentence: FRASE })]
    api.ocorrencias = { c1: [daSessao] }
    await vozesGuardadas().limpar()
    const { palco, tocar } = await montar()
    await tocar(screen.getByRole('button', { name: /Mostrar resposta/ }))
    await tocar(screen.getByRole('button', { name: 'Minha voz: gravar e comparar' }))

    const folha = document.querySelector('dialog.cx-folha-voz') as HTMLElement
    expect(folha.querySelector('.cx-frase-da-folha mark')?.textContent).toBe('complaining')
    const guardar = within(folha).getByRole('switch', { name: 'Guardar minha voz neste cartão' })
    expect(guardar.getAttribute('aria-checked')).toBe('false')
    // Abre gravando; ao parar, com o guardar desligado nada fica no aparelho.
    expect((folha.querySelector('.cx-voz') as HTMLElement).dataset.fase).toBe('gravando')
    fireEvent.click(within(folha).getByRole('button', { name: 'Parar de gravar' }))
    await assentar()
    expect(await vozesGuardadas().listar('c1')).toEqual([])
    expect(folha.querySelector('.cx-linha-do-tempo')).toBeNull()

    // Ligar guarda a gravação que acabou de ser feita, só neste aparelho.
    fireEvent.click(guardar)
    await waitFor(async () => expect(await vozesGuardadas().listar('c1')).toHaveLength(1))
    await assentar()
    expect(localStorage.getItem('revisao.guardarMinhaVoz')).toBe('true')
    expect(folha.querySelector('.cx-linha-do-tempo .q-chip')?.textContent).toBe('você hoje')
    // Nada da voz vai ao servidor: nenhuma rota foi chamada além das leituras do cartão.
    expect(api.revisar).not.toHaveBeenCalled()
    expect(api.atualizar).not.toHaveBeenCalled()
    // O ícone do verso ganha o ponto de "tem gravação".
    expect(palco().querySelector('.cx-icones .cx-ponto')).toBeTruthy()

    fireEvent.click(within(folha).getByRole('button', { name: /Apagar/ }))
    await waitFor(async () => expect(await vozesGuardadas().listar('c1')).toEqual([]))
    await assentar()
    expect(folha.querySelector('.cx-linha-do-tempo')).toBeNull()
    expect(palco().querySelector('.cx-icones .cx-ponto')).toBeNull()
  }, 12000)
})

describe('as práticas de recordar', () => {
  const tocador = (): Tocador => ({
    original: vi.fn(async () => undefined),
    voz: vi.fn(async () => undefined),
    parar: vi.fn(),
    soltar: vi.fn(),
  })

  it('Completar: confere a lacuna, tolera deslize, e só no fim entrega uma nota por cartão', async () => {
    const aoGravar = vi.fn(async () => ({ gravadas: 2, falhas: 0 }))
    const aoSair = vi.fn()
    const t = tocador()
    const { container } = render(
      <Pratica
        tipo="completar"
        rotulo="As 2 que escaparam"
        itens={[
          { cartao: cartao('c1', 'complain', 'reclamar', { sentence: FRASE }), cena: null },
          { cartao: cartao('c2', 'ship', 'entregar', { sentence: 'Today we ship it.' }), cena: null },
        ]}
        idiomaDe={() => 'en'}
        tocador={t}
        atalhos={false}
        voltaSeErrar={() => 'ainda hoje'}
        aoGravar={aoGravar}
        aoTrocar={vi.fn()}
        aoSair={aoSair}
      />,
    )
    const palco = () => container.querySelector('.cx-pr') as HTMLElement
    expect(palco().dataset.pr).toBe('completar')
    expect(palco().querySelector('.cx-selo')?.textContent).toBe('conta como revisão')
    expect(palco().querySelector('.cx-pr-frase-vao .qr-vao')).toBeTruthy()
    expect(palco().querySelector('.cx-pr-frase-vao')?.textContent).not.toContain('complaining')

    // "Ouvir até a lacuna" lê só o começo da frase, na voz do aparelho.
    fireEvent.click(screen.getByRole('button', { name: /Ouvir até a lacuna/ }))
    expect(t.voz).toHaveBeenLastCalledWith("That's a big deal. Customers were", 'en', 1)

    fireEvent.change(screen.getByLabelText('A palavra que falta'), { target: { value: 'complainig' } })
    fireEvent.click(screen.getByRole('button', { name: /Verificar/ }))
    expect(palco().querySelector('.qr-veredito.parcial')?.textContent).toContain('deslize de digitação')
    expect(palco().querySelector('.ct-consequencia')?.textContent).toBe('Conta como lembrada.')
    expect(aoGravar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Não sei' }))
    expect(palco().querySelector('.qr-veredito.errado')?.textContent).toContain('Era “ship”.')
    // O texto diz quando o cartão volta pela conta de verdade, não um "amanhã" fixo.
    expect(palco().querySelector('.ct-consequencia')?.textContent).toBe('Conta como esquecida: volta ainda hoje.')
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }))
    await act(async () => {})

    expect(aoGravar).toHaveBeenCalledWith([
      { id: 'c1', lembrou: true },
      { id: 'c2', lembrou: false },
    ])
    expect(palco().dataset.estado).toBe('pratica-fim')
    expect(palco().textContent).toContain('1 de 2 lacunas completadas.')
    expect(palco().querySelector('.cx-fecho-conta.conta')?.textContent).toContain('Contou como revisão.')
    fireEvent.click(document.querySelector('.cx-fim-pe .q-ctl:not(.pri)') as HTMLElement)
    expect(aoSair).toHaveBeenCalledWith(false)
  })

  it('sair no meio não grava nada, e a tela de quem chamou fica sabendo que foi interrompida', () => {
    const aoGravar = vi.fn(async () => ({ gravadas: 0, falhas: 0 }))
    const aoSair = vi.fn()
    render(
      <Pratica
        tipo="ditado"
        rotulo="Hoje"
        itens={[
          { cartao: cartao('c1', 'ship', 'entregar', { sentence: 'We ship it.' }), cena: null },
          { cartao: cartao('c2', 'nap', 'cochilo', { sentence: 'A short nap.' }), cena: null },
        ]}
        idiomaDe={() => 'en'}
        tocador={tocador()}
        atalhos={false}
        voltaSeErrar={() => 'ainda hoje'}
        aoGravar={aoGravar}
        aoTrocar={vi.fn()}
        aoSair={aoSair}
      />,
    )
    fireEvent.change(screen.getByLabelText(/A frase em/), { target: { value: 'we ship it' } })
    fireEvent.click(screen.getByRole('button', { name: /Verificar/ }))
    expect(document.querySelector('.qr-veredito.certo')?.textContent).toContain('Certo, palavra por palavra.')
    fireEvent.click(screen.getByRole('button', { name: 'Sair da prática' }))
    expect(aoSair).toHaveBeenCalledWith(true)
    expect(aoGravar).not.toHaveBeenCalled()
  })

  it('pela revisão: "Praticar as que escaparam" grava a nota com a origem da prática', async () => {
    api.deck = [cartao('c1', 'complain', 'reclamar', { sentence: FRASE })]
    const { palco, tocar } = await montar()
    await tocar(screen.getByRole('button', { name: /Mostrar resposta/ }))
    await tocar(palco().querySelector('.fsrs button.e') as HTMLElement)
    expect(palco().dataset.estado).toBe('fim')
    await tocar(screen.getByRole('button', { name: 'Praticar a que escapou' }))
    const folha = document.querySelector('dialog.cx-folha-praticar') as HTMLElement
    fireEvent.click(folha.querySelector('[data-pratica="completar"]') as HTMLElement)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 320))
    })
    await assentar()
    expect(palco().dataset.estado).toBe('pratica')

    api.revisar.mockClear()
    fireEvent.change(screen.getByLabelText('A palavra que falta'), { target: { value: 'complaining' } })
    fireEvent.click(screen.getByRole('button', { name: /Verificar/ }))
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }))
    await assentar()
    expect(api.revisar).toHaveBeenCalledTimes(1)
    expect(api.revisar).toHaveBeenCalledWith('c1', 3, 0.9, { origem: 'pratica:completar', formato: 'completar' })
    expect(palco().querySelector('.cx-fecho-conta.conta')?.textContent).toContain('1 cartão recebeu a nota Bom')

    // Voltar de uma prática que nasceu do fim da sessão devolve ao fim da sessão.
    await tocar(document.querySelector('.cx-fim-pe .q-ctl:not(.pri)') as HTMLElement)
    expect(palco().dataset.estado).toBe('fim')
  })

  it('"Jogo rápido" manda ao Jogar só as palavras do recorte, fora da agenda', async () => {
    api.deck = ['cat', 'dog', 'bird', 'fish'].map((w, i) => cartao(`c${i}`, w, `t${i}`))
    const { tocar, ir } = await montar({
      praticar: { origem: 'selecao', rotulo: 'As 3 escolhidas', ids: ['c0', 'c1', 'c2', 'c3'] },
    })
    // Quem chega para praticar não começa uma rodada: a folha abre sobre o recorte.
    const folha = document.querySelector('dialog.cx-folha-praticar') as HTMLElement
    expect(folha.querySelector('.cx-recorte')?.textContent).toContain('As 3 escolhidas')
    expect(folha.querySelector('.cx-recorte')?.textContent).toContain('4 cartões')
    await tocar(folha.querySelector('[data-pratica="jogo"]') as HTMLElement)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 320))
    })
    expect(ir).toHaveBeenCalledWith('play', {
      recorte: { palavras: ['cat', 'dog', 'bird', 'fish'], semAgenda: true, rotulo: 'As 3 escolhidas' },
    })
    expect(api.revisar).not.toHaveBeenCalled()
  })
})
