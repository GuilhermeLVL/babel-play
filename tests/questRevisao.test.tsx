// @vitest-environment jsdom
/**
 * A REVISÃO NO QUEST (segunda rodada do desenho do headset, 01/10/2026): a tela nova monta em todos os
 * estados (espera, baralho vazio, rodada, fora da rodada, fim) e cada função da tela de sempre continua
 * alcançável: os quatro formatos de cartão, as quatro notas com o intervalo, desfazer, ouvir, editar,
 * suspender (com desfazer no aviso), os ajustes da memória e as saídas do fim da sessão.
 *
 * VERSÃO ENXUTA (10/10/2026, `cartoes-enxuto-src/cartoes2.js`): o desfazer subiu para o topo, e editar,
 * suspender, os ajustes e o encerrar moram na folha do "…". Os testes chegam a eles por lá.
 */
import { readFileSync } from 'node:fs'

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

const api = vi.hoisted(() => ({
  deck: [] as unknown[],
  pendente: false,
  revisar: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  desfazer: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  atualizar: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  rodada: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
}))
/** O aparelho do teste: o headset (o padrão desta suíte) ou o computador com o desenho novo ligado. */
const aparelho = vi.hoisted(() => ({ vozes: new Set<string>(['en']), quest: true }))
const avisos = vi.hoisted(() => ({
  ok: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  erro: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
}))
const voz = vi.hoisted(() => ({ falar: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']> }))

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => true,
}))
vi.mock('../src/lib/dispositivo/perfil', async (orig) => {
  const m = await orig<typeof import('../src/lib/dispositivo/perfil')>()
  return {
    ...m,
    perfilDoDispositivo: () => ({ ...m.perfilDoDispositivo(), tipo: aparelho.quest ? 'quest' : 'desktop-com-gpu' }),
  }
})
vi.mock('../src/lib/voz/haVoz', () => ({
  haVozPara: (idioma: string) => aparelho.vozes.has((idioma || '').toLowerCase().split('-')[0]),
}))
vi.mock('../src/lib/tts', async (orig) => {
  voz.falar = vi.fn()
  return { ...(await orig<typeof import('../src/lib/tts')>()), speak: voz.falar }
})
vi.mock('../src/lib/juice', async (orig) => ({
  ...(await orig<typeof import('../src/lib/juice')>()),
  ganho: vi.fn(),
}))
vi.mock('../src/lib/langConfig', async (orig) => {
  const real = await orig<typeof import('../src/lib/langConfig')>()
  return { ...real, fetchLangConfig: async () => real.DEFAULT_LANG_CONFIG, onLangConfigChange: () => () => {} }
})
vi.mock('../src/lib/dictionary', () => ({
  lookup: vi.fn(async () => null),
  forvoUrl: () => '#',
  wiktionaryUrl: () => '#',
}))
vi.mock('../src/components/Toast', async (orig) => {
  avisos.ok = vi.fn()
  avisos.erro = vi.fn()
  return {
    ...(await orig<typeof import('../src/components/Toast')>()),
    toast: { ok: avisos.ok, error: avisos.erro, warn: vi.fn(), info: vi.fn() },
  }
})
vi.mock('../src/data/api', async (orig) => {
  api.revisar = vi.fn(async (id: string) => (api.deck as Array<{ id: string }>).find((c) => c.id === id))
  api.desfazer = vi.fn(async (id: string) => (api.deck as Array<{ id: string }>).find((c) => c.id === id))
  api.atualizar = vi.fn(async (id: string, patch: object) => ({
    ...(api.deck as Array<{ id: string }>).find((c) => c.id === id),
    ...patch,
  }))
  api.rodada = vi.fn(async () => undefined)
  return {
    ...(await orig<typeof import('../src/data/api')>()),
    fetchDeck: () => (api.pendente ? new Promise(() => {}) : Promise.resolve(api.deck)),
    reviewCard: api.revisar,
    desfazerRevisao: api.desfazer,
    updateCard: api.atualizar,
    salvarRodada: api.rodada,
    fetchMemoriaDoCartao: async () => null,
    fetchOcorrencias: async () => [],
    fetchSessionTranscript: vi.fn(),
    fetchMetrics: async () => null,
    lerMissoes: async () => null,
  }
})

import Study from '../src/components/views/Study'
import type { PracticeSeed } from '../src/lib/sentences'
import type { VocabCard } from '../src/types'

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

const tres = () => [cartao('c1', 'cat', 'gato'), cartao('c2', 'dog', 'cão'), cartao('c3', 'bird', 'pássaro')]

async function montar(props: Partial<React.ComponentProps<typeof Study>> = {}) {
  const ir = vi.fn()
  const tela = render(<Study onChangeView={ir} {...props} />)
  await act(async () => {})
  const palco = () => tela.container.querySelector('.q-palco.q-revisao') as HTMLElement
  const botao = (nome: RegExp | string) => screen.getByRole('button', { name: nome }) as HTMLButtonElement
  const tocar = async (el: Element) => {
    fireEvent.click(el)
    await act(async () => {})
  }
  /** Uma ação da folha do "…": abre a folha (que chega num pedaço à parte), toca e espera os 240 ms dela. */
  const peloMais = async (nome: RegExp | string) => {
    fireEvent.click(botao('Mais ações e ajustes'))
    await assentar()
    const folha = document.querySelector('dialog.cx-folha-acoes') as HTMLElement
    fireEvent.click(within(folha).getByRole('button', { name: nome }))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    await assentar()
  }
  return { ...tela, ir, palco, botao, tocar, peloMais }
}

/** Espera o que é carregado sob demanda (as folhas e os diálogos da revisão). */
async function assentar() {
  await act(async () => {
    await vi.dynamicImportSettled()
  })
  await act(async () => {})
}

beforeEach(() => {
  localStorage.clear()
  api.pendente = false
  api.deck = tres()
  aparelho.vozes = new Set(['en'])
  aparelho.quest = true
  api.revisar.mockClear()
  api.desfazer.mockClear()
  api.atualizar.mockClear()
  api.rodada.mockClear()
  avisos.ok.mockClear()
  voz.falar.mockClear()
})
afterEach(cleanup)

describe('Revisão no Quest', () => {
  it('enquanto o baralho não chega, mostra a forma do cartão; o voltar já funciona', async () => {
    api.pendente = true
    const { palco, botao, ir } = await montar()
    expect(palco().dataset.estado).toBe('carregando')
    expect(palco().querySelectorAll('.q-esqueleto').length).toBe(2)
    expect(screen.getByRole('status')).toBeTruthy()
    fireEvent.click(botao('Voltar aos Cartões'))
    expect(ir).toHaveBeenCalledWith('cartoes')
  })

  it('baralho vazio: diz de onde as palavras vêm e leva à captura, com um único botão principal', async () => {
    api.deck = []
    const { palco, botao, ir } = await montar()
    expect(palco().dataset.estado).toBe('vazio')
    expect(palco().querySelectorAll('.q-ctl.pri')).toHaveLength(1)
    fireEvent.click(botao(/Capturar uma sessão/))
    expect(ir).toHaveBeenCalledWith('capture')
  })

  it('a rodada abre sozinha: progresso, um cartão e "Mostrar resposta" como único botão principal', async () => {
    const { palco, container } = await montar()
    expect(palco().dataset.estado).toBe('rodada')
    expect(palco().dataset.formato).toBe('cloze')
    expect(container.querySelector('.qr-conta')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('1 / 3')
    expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('3')
    expect(container.querySelector('.qr-selo')?.textContent).toBe('B1')
    expect([...palco().querySelectorAll('.q-ctl.pri')].map((b) => b.textContent?.trim())).toEqual(['Mostrar resposta'])
    // Sem teclado físico: nenhum atalho na tela.
    expect(container.querySelector('kbd')).toBeNull()
    // A pele de cartão equipada continua vestindo o cartão.
    expect(container.querySelector('.qr-cartao')?.className).toMatch(/pele-/)
  })

  it('Lembrar: as quatro notas com o intervalo; a nota vai ao servidor, a fila anda e dá para desfazer', async () => {
    const { container, botao, tocar } = await montar()
    const palavra = container.querySelector('.termo')?.textContent as string
    const desfazer = () => botao('Desfazer a última nota')
    expect(desfazer().disabled).toBe(true)
    expect(desfazer().closest('header')).toBeTruthy()

    await tocar(botao(/Mostrar resposta/))
    const notas = [...container.querySelectorAll<HTMLButtonElement>('.fsrs button')]
    expect(notas.map((n) => n.firstChild?.textContent)).toEqual(['Errei', 'Difícil', 'Bom', 'Fácil'])
    expect(notas.every((n) => (n.querySelector('small')?.textContent ?? '').length > 0)).toBe(true)
    // Ouvir ao mostrar: a palavra é dita no idioma do cartão.
    expect(voz.falar).toHaveBeenCalledWith(palavra, expect.objectContaining({ lang: 'en' }))

    await tocar(notas[2])
    expect(api.revisar).toHaveBeenCalledWith(expect.any(String), 3, 0.9, expect.objectContaining({ origem: 'revisao', formato: 'lembrar', respostaMs: expect.any(Number) }))
    expect(api.rodada).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.qr-conta')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('2 / 3')

    expect(desfazer().disabled).toBe(false)
    await tocar(desfazer())
    expect(api.desfazer).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.qr-conta')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('1 / 3')
    expect(container.querySelector('.termo')?.textContent).toBe(palavra)
  })

  it('Ouvir só aparece quando há voz para o idioma da palavra', async () => {
    const com = await montar()
    /* Cartão sem sessão: o botão da fileira é "Ouvir" (a voz do aparelho), e não "Fala original". */
    const ouvir = com.botao('Ouvir na voz do aparelho')
    expect(ouvir.textContent).toContain('Ouvir')
    expect(screen.queryByRole('button', { name: 'Fala original' })).toBeNull()
    expect(ouvir.closest('.cx-fileira')?.querySelector('.qr-principal')).toBeTruthy()
    cleanup()

    api.deck = [cartao('d1', 'Katze', 'gato', { srcLang: 'de' })]
    await montar()
    expect(screen.queryByRole('button', { name: 'Ouvir na voz do aparelho' })).toBeNull()
  })

  it('Editar cartão abre a palavra num diálogo, já em edição, sem roubar o foco para o teclado', async () => {
    const { container, peloMais } = await montar()
    const palavra = container.querySelector('.termo')?.textContent as string
    await peloMais(/^Editar/)
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByRole('heading', { name: palavra })).toBeTruthy()
    expect(within(dialogo).getByLabelText('Tradução')).toBeTruthy()
    expect(document.activeElement?.id).not.toBe('pw-t')
    expect(within(dialogo).getByRole('button', { name: /Salvar/ })).toBeTruthy()
  })

  it('Suspender tira a palavra da rodada e o aviso oferece desfazer', async () => {
    const { container, peloMais } = await montar()
    const palavra = container.querySelector('.termo')?.textContent as string
    await peloMais(/^Suspender/)
    expect(api.atualizar).toHaveBeenCalledWith(expect.any(String), { inDeck: false })
    expect(container.querySelector('.termo')?.textContent).not.toBe(palavra)
    expect(container.querySelector('.qr-conta')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('1 / 2')

    const [, opcoes] = avisos.ok.mock.calls.at(-1) as [string, { action: { label: string; onClick: () => void } }]
    expect(opcoes.action.label).toBe('Desfazer')
    await act(async () => opcoes.action.onClick())
    expect(api.atualizar).toHaveBeenLastCalledWith(expect.any(String), { inDeck: true })
    expect(container.querySelector('.qr-conta')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('1 / 3')
  })

  /* O RECORTE QUE A TELA CARTÕES PEDE (10/10/2026): "Só 10 agora" e "Mais N novas". */
  it('rodada com limite: só as primeiras da fila, que são as vencidas há mais tempo', async () => {
    api.deck = [
      cartao('c1', 'cat', 'gato', { dueAtMs: Date.now() - 1 * 86_400_000 }),
      cartao('c2', 'dog', 'cão', { dueAtMs: Date.now() - 9 * 86_400_000 }),
      cartao('c3', 'bird', 'pássaro', { dueAtMs: Date.now() - 5 * 86_400_000 }),
    ].map((c) => ({ ...c, fsrsDueAt: new Date(c.dueAtMs as number).toISOString() }))
    const { palco } = await montar({ rodada: { limite: 2 } })
    expect(palco().dataset.estado).toBe('rodada')
    expect(palco().querySelector('[role="progressbar"]')?.getAttribute('aria-valuemax')).toBe('2')
    expect(palco().querySelector('.flash')?.textContent).toContain('dog')
  })

  it('rodada só de novas: as nunca vistas, sem adiantar a revisão das outras', async () => {
    api.deck = [
      cartao('c1', 'cat', 'gato', { dueAtMs: Date.now() + 3 * 86_400_000 }),
      cartao('n1', 'owl', 'coruja', { fsrsState: 'New', dueAtMs: null, lastReview: undefined, stability: undefined }),
      cartao('n2', 'fox', 'raposa', { fsrsState: 'New', dueAtMs: null, lastReview: undefined, stability: undefined }),
      cartao('n3', 'elk', 'alce', { fsrsState: 'New', dueAtMs: null, lastReview: undefined, stability: undefined }),
    ]
    const { palco } = await montar({ rodada: { soNovas: true, limite: 2 } })
    expect(palco().dataset.estado).toBe('rodada')
    expect(palco().querySelector('[role="progressbar"]')?.getAttribute('aria-valuemax')).toBe('2')
    expect(palco().querySelector('.flash')?.textContent).toContain('owl')
  })

  it('Encerrar volta aos Cartões; sem navegação, a tela diz quantas esperam e recomeça', async () => {
    const com = await montar()
    await com.peloMais(/Encerrar a revisão/)
    expect(com.ir).toHaveBeenCalledWith('cartoes')
    cleanup()

    const { palco, botao, tocar, peloMais } = await montar({ onChangeView: undefined })
    await peloMais(/Encerrar a revisão/)
    expect(palco().dataset.estado).toBe('fora')
    expect(palco().querySelector('.qr-contagem')?.textContent).toBe('3')
    expect(botao('Opções da revisão')).toBeTruthy()
    expect(palco().querySelectorAll('.q-ctl.pri')).toHaveLength(1)
    await tocar(palco().querySelector('.q-ctl.pri') as HTMLElement)
    expect(palco().dataset.estado).toBe('rodada')
  })

  it('Ajustes da memória: os sete ajustes valem e ficam guardados; "Voltar ao padrão" desfaz', async () => {
    const { tocar, peloMais } = await montar()
    await peloMais(/Ajustes da memória/)
    const dlg = within(screen.getByRole('dialog'))
    // Os sete ajustes e, na oitava linha, a porta da produção ativa.
    expect(screen.getByRole('dialog').querySelectorAll('.q-ajuste')).toHaveLength(8)

    // Dois botões de resposta (Esqueci e Lembrei) é escolha; quatro é o padrão.
    expect(dlg.getByRole('button', { name: 'Quatro' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(dlg.getByRole('button', { name: 'Dois' }))
    expect(localStorage.getItem('revisao.botoesDeNota')).toBe('2')

    fireEvent.click(dlg.getByRole('button', { name: 'Aumentar: Novas por dia' }))
    expect(localStorage.getItem('revisao.novasPorDia')).toBe('25')
    fireEvent.click(dlg.getByRole('button', { name: 'Diminuir: Revisões por dia' }))
    expect(localStorage.getItem('revisao.revisoesPorDia')).toBe('190')
    fireEvent.change(dlg.getByRole('spinbutton', { name: 'Novas por dia' }), { target: { value: '40' } })
    expect(localStorage.getItem('revisao.novasPorDia')).toBe('40')

    fireEvent.click(dlg.getByRole('button', { name: 'Misturar' }))
    expect(localStorage.getItem('revisao.ordem')).toBe('misturar')
    expect(dlg.getByRole('button', { name: 'Misturar' }).getAttribute('aria-pressed')).toBe('true')

    const ouvir = dlg.getByRole('switch', { name: 'Ouvir a palavra ao mostrar' })
    expect(ouvir.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(ouvir)
    expect(localStorage.getItem('revisao.ouvirAoMostrar')).toBe('false')

    fireEvent.click(dlg.getByRole('button', { name: 'Aumentar: Meta de retenção' }))
    expect(localStorage.getItem('revisao.metaDeRetencao')).toBe('91')
    fireEvent.change(dlg.getByRole('slider', { name: 'Meta de retenção' }), { target: { value: '95' } })
    expect(localStorage.getItem('revisao.metaDeRetencao')).toBe('95')

    fireEvent.click(dlg.getByRole('button', { name: 'Escolher' }))
    expect(localStorage.getItem('revisao.tipoDeCartao')).toBe('escolha')

    fireEvent.click(dlg.getByRole('button', { name: /Voltar ao padrão/ }))
    expect(localStorage.getItem('revisao.novasPorDia')).toBe('20')
    expect(localStorage.getItem('revisao.tipoDeCartao')).toBe('lembrar')
    expect(localStorage.getItem('revisao.metaDeRetencao')).toBe('90')
    expect(localStorage.getItem('revisao.botoesDeNota')).toBe('4')
    expect(ouvir.getAttribute('aria-checked')).toBe('true')

    await tocar(dlg.getByRole('button', { name: /Pronto/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sem voz para o idioma estudado, "ouvir ao mostrar" diz o motivo', async () => {
    aparelho.vozes = new Set()
    const { peloMais } = await montar()
    await peloMais(/Ajustes da memória/)
    expect(screen.getByRole('dialog').textContent).toContain('Este aparelho não tem voz para o idioma que você estuda.')
  })

  it('Digitar: o campo não pega o foco sozinho, Verificar confere e Avançar dá a nota', async () => {
    localStorage.setItem('revisao.tipoDeCartao', 'digitar')
    api.deck = [cartao('c1', 'cat', 'gato')]
    const { palco, botao, tocar } = await montar()
    expect(palco().dataset.formato).toBe('typing')
    const campo = screen.getByLabelText('Digite a tradução') as HTMLInputElement
    expect(document.activeElement).not.toBe(campo)
    expect(botao(/Verificar/).disabled).toBe(true)

    fireEvent.change(campo, { target: { value: 'gato' } })
    await tocar(botao(/Verificar/))
    expect(palco().querySelector('.qr-veredito.certo')?.textContent).toContain('Correto! A tradução era “gato”.')
    await tocar(botao(/Avançar/))
    expect(api.revisar).toHaveBeenCalledWith('c1', 3, 0.9, expect.objectContaining({ origem: 'revisao', formato: 'digitar', respostaMs: expect.any(Number) }))
    expect(palco().dataset.estado).toBe('fim')
  })

  it('Digitar errado: a tela diz a tradução certa e o que foi escrito, e a nota é "Errei"', async () => {
    localStorage.setItem('revisao.tipoDeCartao', 'digitar')
    api.deck = [cartao('c1', 'cat', 'gato')]
    const { palco, botao, tocar } = await montar()
    fireEvent.change(screen.getByLabelText('Digite a tradução'), { target: { value: 'cavalo' } })
    await tocar(botao(/Verificar/))
    const veredito = palco().querySelector('.qr-veredito.errado')?.textContent
    expect(veredito).toContain('“gato”')
    expect(veredito).toContain('“cavalo”')
    await tocar(botao(/Avançar/))
    expect(api.revisar).toHaveBeenCalledWith('c1', 1, 0.9, expect.objectContaining({ origem: 'revisao', formato: 'digitar', respostaMs: expect.any(Number) }))
  })

  it('Escolher: quatro alternativas; a escolha é gravada e Avançar dá a nota', async () => {
    localStorage.setItem('revisao.tipoDeCartao', 'escolha')
    api.deck = [...tres(), cartao('c4', 'fish', 'peixe')]
    const { palco, container, botao, tocar } = await montar()
    expect(palco().dataset.formato).toBe('mc')
    const opcoes = [...container.querySelectorAll<HTMLButtonElement>('.qr-opcao')]
    expect(opcoes).toHaveLength(4)
    // A palavra certa é a única que não aparece na frase com lacuna.
    const certa = opcoes.find((o) => !container.querySelector('.qr-lacuna')?.textContent?.includes(o.textContent ?? ''))
    const alvo = certa ?? opcoes[0]
    await tocar(alvo)
    expect(api.rodada).toHaveBeenCalledWith(expect.objectContaining({ exerciseKind: 'multiple-choice' }))
    expect(palco().querySelector('.qr-veredito')).toBeTruthy()
    await tocar(botao(/Avançar/))
    expect(api.revisar).toHaveBeenCalledTimes(1)
  })

  it('Produção ativa: a frase com lacuna, a conferência local e o próximo exercício', async () => {
    api.deck = [cartao('c1', 'cat', 'gato', { stability: 30, fsrsStability: 30 })]
    const semente = { exercise: 'active_production' } as unknown as PracticeSeed
    const { palco, botao, tocar } = await montar({ practiceSeed: semente, onSeedConsumed: vi.fn() })
    expect(palco().dataset.formato).toBe('active-production')
    const exercicio = screen.getByTestId('producao-no-quest')
    expect(exercicio.querySelector('.qr-vao')).toBeTruthy()
    expect(exercicio.textContent).toContain('gato')
    expect(exercicio.textContent).not.toMatch(/\p{Extended_Pictographic}/u)

    const campo = screen.getByLabelText('Sua resposta') as HTMLInputElement
    expect(document.activeElement).not.toBe(campo)
    fireEvent.change(campo, { target: { value: 'cat' } })
    await tocar(botao(/Verificar resposta/))
    expect(exercicio.querySelector('.qr-veredito.certo')?.textContent).toContain('Resposta correta!')
    expect(exercicio.textContent).toContain('Verificado localmente')
    expect(within(exercicio).getByRole('button', { name: /Ouvir a frase completa/ })).toBeTruthy()
    await tocar(botao(/Próximo exercício/))
    // Produção ativa é mais difícil: um acerto vale "Fácil".
    expect(api.revisar).toHaveBeenCalledWith('c1', 4, 0.9, expect.objectContaining({ origem: 'revisao', formato: 'producao-ativa', respostaMs: expect.any(Number) }))
  })

  it('a instrução aparece só nos três primeiros cartões, e o lugar dela existe sempre', async () => {
    api.deck = [...tres(), cartao('c4', 'fish', 'peixe'), cartao('c5', 'frog', 'sapo')]
    const { palco, container, botao, tocar } = await montar()
    const instrucao = () => palco().querySelector('.cx-linha .qr-dica')?.textContent
    expect(instrucao()).toBe('Tente lembrar a tradução antes de mostrar a resposta. Depois diga como foi.')
    for (let i = 0; i < 3; i++) {
      await tocar(botao(/Mostrar resposta/))
      await tocar(container.querySelector('.fsrs button.b') as HTMLElement)
    }
    expect(container.querySelector('.qr-conta')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('4 / 5')
    expect(instrucao()).toBeUndefined()
    // A linha continua lá, vazia: um aviso que chegue não empurra o cartão.
    expect(palco().querySelector('.cx-linha')).toBeTruthy()
  })

  it('produção ativa tem botão (não há teclado para a paleta): fora da rodada e nas opções', async () => {
    api.deck = [cartao('c1', 'cat', 'gato', { stability: 30, fsrsStability: 30 }), cartao('c2', 'dog', 'cão')]
    const { palco, tocar, peloMais } = await montar({ onChangeView: undefined })
    await peloMais(/Encerrar a revisão/)
    const fora = within(screen.getByTestId('producao-ativa-fora')).getByRole('button') as HTMLButtonElement
    expect(fora.disabled).toBe(false)
    await tocar(fora)
    expect(palco().dataset.formato).toBe('active-production')
    expect(palco().querySelector('.qr-conta')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('1 / 1')

    await peloMais(/Ajustes da memória/)
    const nasOpcoes = within(screen.getByTestId('producao-ativa-nas-opcoes')).getByRole('button', { name: /Começar/ })
    await tocar(nasOpcoes)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(palco().dataset.formato).toBe('active-production')
  })

  it('sem palavra madura, o botão da produção ativa aparece desligado e diz o motivo', async () => {
    const { peloMais } = await montar({ onChangeView: undefined })
    await peloMais(/Encerrar a revisão/)
    const bloco = screen.getByTestId('producao-ativa-fora')
    expect((within(bloco).getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    expect((bloco.querySelector('small')?.textContent ?? '').length).toBeGreaterThan(0)
  })

  it('dentro do <main> do app (coluna flex), a raiz é o palco da revisão em TODOS os estados', async () => {
    /* O defeito das fotos: a raiz se chamava `qr`, e `prototipo.css` tem um `.qr` (o desenho de um QR
       code, 150 px, fundo branco) que esmagava a tela numa coluna. O jsdom não calcula layout: confere-se
       o nome da raiz, e que o CSS dela manda ocupar a largura toda com o fundo da tela. */
    const raizDe = async (props: Partial<React.ComponentProps<typeof Study>> = {}) => {
      const ir = vi.fn()
      const tela = render(
        <main style={{ display: 'flex', flexDirection: 'column' }}>
          <Study onChangeView={ir} {...props} />
        </main>,
      )
      await act(async () => {})
      const main = tela.container.querySelector('main') as HTMLElement
      return { main, raiz: () => main.firstElementChild as HTMLElement }
    }
    const confere = (raiz: HTMLElement, estado: string) => {
      expect(raiz.dataset.estado).toBe(estado)
      expect(raiz.classList.contains('q-palco')).toBe(true)
      expect(raiz.classList.contains('q-revisao')).toBe(true)
      expect(raiz.classList.contains('qr')).toBe(false)
    }

    api.pendente = true
    confere((await raizDe()).raiz(), 'carregando')
    cleanup()

    api.pendente = false
    api.deck = []
    confere((await raizDe()).raiz(), 'vazio')
    cleanup()

    api.deck = [cartao('c1', 'cat', 'gato')]
    const rodada = await raizDe()
    confere(rodada.raiz(), 'rodada')
    fireEvent.click(screen.getByRole('button', { name: /Mostrar resposta/ }))
    await act(async () => {})
    fireEvent.click(rodada.main.querySelector('.fsrs button.b') as HTMLElement)
    await act(async () => {})
    confere(rodada.raiz(), 'fim')
    cleanup()

    const fora = await raizDe({ onChangeView: undefined })
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações e ajustes' }))
    await assentar()
    fireEvent.click(screen.getByRole('button', { name: /Encerrar a revisão/ }))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    confere(fora.raiz(), 'fora')

    const css = readFileSync('src/styles/questRevisao.css', 'utf8')
    const regra = css.match(/html\[data-quest-novo='true'\] \.q-palco\.q-revisao \{([^}]*)\}/)?.[1] ?? ''
    expect(regra).toContain('width: 100%')
    expect(regra).toContain('align-self: stretch')
    expect(regra).toContain('margin: 0')
    expect(regra).toContain('background: var(--canvas)')
  })

  it('o CSS da revisão e do vocabulário só vale no Quest, e as raízes não colidem com classes de sempre', () => {
    const semComentario = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const arquivo of ['src/styles/questRevisao.css', 'src/styles/questVocabulario.css']) {
      const fora: string[] = []
      for (const [, seletores] of semComentario(arquivo).matchAll(/([^{}]+)\{/g)) {
        const s = seletores.trim()
        if (!s || s.startsWith('@') || /^(from|to|\d+%)$/.test(s)) continue
        for (const parte of s.split(/,(?![^(]*\))/)) {
          if (!parte.trim().startsWith("html[data-quest-novo='true']")) fora.push(parte.trim())
        }
      }
      expect(fora, arquivo).toEqual([])
    }
    const deSempre = ['src/styles/prototipo.css', 'src/index.css'].map(semComentario).join('\n')
    for (const raiz of ['q-revisao', 'qv', 'qv-anki', 'qv-dlg']) {
      expect(new RegExp(`\\.${raiz}(?![-\\w])`).test(deSempre), raiz).toBe(false)
    }
  })

  it('fim da sessão, enxuto: três números, o ganho creditado, dois botões e o desfazer da última nota', async () => {
    api.deck = [cartao('c1', 'cat', 'gato')]
    const { palco, container, botao, tocar, ir } = await montar()
    await tocar(botao(/Mostrar resposta/))
    await tocar(container.querySelector('.fsrs button.b') as HTMLElement)
    expect(palco().dataset.estado).toBe('fim')
    expect(screen.getByRole('heading', { level: 1, name: 'Sessão concluída' })).toBeTruthy()
    const numeros = [...palco().querySelectorAll('.qr-numeros .q-num')].map((n) => [
      n.querySelector('.q-rotulo')?.textContent,
      n.querySelector('b')?.textContent,
    ])
    expect(numeros).toHaveLength(3)
    expect(numeros.slice(0, 2)).toEqual([
      ['Cartões', '1'],
      ['Lembradas', '100%'],
    ])
    expect(numeros[2][0]).toBe('Tempo')
    // O ganho é o que o servidor creditou; sem as recompensas v2 não há Seeds nem missão.
    expect(screen.getByTestId('ganho-da-sessao').textContent).toMatch(/\+\d+ XP/)
    expect(screen.getByTestId('ganho-da-sessao').textContent).not.toContain('Seeds')
    expect(screen.queryByTestId('hoje-em-uma-linha')).toBeNull()
    expect(palco().querySelector('.cx-mudou')?.textContent).toContain('Todas lembradas')
    const pe = within(screen.getByRole('toolbar', { name: 'O que fazer agora' }))
    expect(pe.getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Praticar de outro jeito', 'Voltar'])

    // "Praticar de outro jeito" abre a folha das práticas sobre os cartões da sessão.
    fireEvent.click(pe.getByRole('button', { name: /Praticar de outro jeito/ }))
    await assentar()
    const folha = document.querySelector('dialog.cx-folha-praticar') as HTMLElement
    expect(folha.querySelector('.cx-recorte')?.textContent).toContain('A desta sessão')
    expect([...folha.querySelectorAll('[data-pratica]')].map((b) => (b as HTMLElement).dataset.pratica)).toEqual([
      'falar',
      'ditado',
      'completar',
      'jogo',
    ])
    // Um cartão só não dá um jogo: o ladrilho fica desligado e diz o motivo.
    const jogo = folha.querySelector('[data-pratica="jogo"]') as HTMLButtonElement
    expect(jogo.disabled).toBe(true)
    expect(jogo.textContent).toContain('pelo menos 4 cartões')
    // Os selos dizem o que cada prática faz com a agenda.
    expect(folha.querySelector('[data-pratica="falar"] .cx-selo')?.textContent).toBe('conta como revisão')
    expect(jogo.querySelector('.cx-selo')?.textContent).toBe('não mexe na sua agenda')
    fireEvent.click(within(folha).getByRole('button', { name: 'Fechar' }))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 320))
    })

    fireEvent.click(pe.getByRole('button', { name: /Voltar/ }))
    expect(ir.mock.calls.map(([v]) => v)).toEqual(['cartoes'])

    await tocar(botao('Desfazer a última nota'))
    expect(api.desfazer).toHaveBeenCalledTimes(1)
    expect(palco().dataset.estado).toBe('rodada')
  })

  it('fim da sessão: as que escaparam aparecem em "O que mudou" e viram o recorte do botão principal', async () => {
    const { palco, container, botao, tocar } = await montar()
    for (const nota of ['e', 'b', 'e']) {
      await tocar(botao(/Mostrar resposta/))
      await tocar(container.querySelector(`.fsrs button.${nota}`) as HTMLElement)
    }
    expect(palco().dataset.estado).toBe('fim')
    const escaparam = palco().querySelector('.cx-subiu li') as HTMLElement
    expect(escaparam.querySelector('.q-tag')?.textContent?.trim()).toBe('2')
    expect(escaparam.querySelectorAll('.q-chip')).toHaveLength(2)
    expect(palco().querySelector('.cx-fim-pe .q-ctl.pri')?.textContent?.trim()).toBe('Praticar as 2 que escaparam')
    expect([...palco().querySelectorAll('.qr-numeros .q-num b')].map((b) => b.textContent)[1]).toBe('33%')
  })

  it('dois botões de resposta: Esqueci grava Errei (1) e Lembrei grava Bom (3)', async () => {
    localStorage.setItem('revisao.botoesDeNota', '2')
    const { container, botao, tocar } = await montar()
    await tocar(botao(/Mostrar resposta/))
    const notas = [...container.querySelectorAll<HTMLButtonElement>('.fsrs button')]
    expect(notas.map((n) => n.firstChild?.textContent)).toEqual(['Esqueci', 'Lembrei'])
    await tocar(notas[1])
    expect(api.revisar).toHaveBeenLastCalledWith(expect.any(String), 3, 0.9, expect.anything())
    await tocar(botao(/Mostrar resposta/))
    await tocar(container.querySelector('.fsrs button.e') as HTMLElement)
    expect(api.revisar).toHaveBeenLastCalledWith(expect.any(String), 1, 0.9, expect.anything())
  })

  it('a folha do "…": três grandes, os menores, os dois interruptores e o pé', async () => {
    const { botao } = await montar()
    fireEvent.click(botao('Mais ações e ajustes'))
    await assentar()
    const folha = document.querySelector('dialog.cx-folha-acoes') as HTMLElement
    expect([...folha.querySelectorAll('.cx-tres .cx-grande b')].map((b) => b.textContent)).toEqual([
      'Editar',
      'Deixar para amanhã',
      'Suspender',
    ])
    // Na frente do cartão a folha não entrega a tradução.
    expect(folha.querySelector('.folha-glosa')?.textContent).toBe('Ações deste cartão')
    expect(folha.querySelectorAll('.cx-menores .folha-acao')).toHaveLength(4)
    // Sem sessão de origem não há o que abrir: o botão existe desligado, não morto.
    expect((within(folha).getByRole('button', { name: /Abrir na sessão/ }) as HTMLButtonElement).disabled).toBe(true)
    const dizer = within(folha).getByRole('switch', { name: 'Dizer antes de virar' })
    const guardar = within(folha).getByRole('switch', { name: 'Guardar minha voz no cartão' })
    expect(dizer.getAttribute('aria-checked')).toBe('true')
    // Guardar a voz vem DESLIGADO de fábrica.
    expect(guardar.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(dizer)
    expect(localStorage.getItem('revisao.dizerAntesDeVirar')).toBe('false')
    fireEvent.click(guardar)
    expect(localStorage.getItem('revisao.guardarMinhaVoz')).toBe('true')
    // No headset não há teclado: sem o botão "Atalhos".
    expect(within(folha).queryByRole('button', { name: /Atalhos/ })).toBeNull()
    expect(within(folha).getByRole('button', { name: /Encerrar a revisão/ })).toBeTruthy()
  })

  it('"Deixar para amanhã" adia sem dar nota, tira da rodada e o aviso desfaz', async () => {
    const { container, peloMais } = await montar()
    const palavra = container.querySelector('.termo')?.textContent as string
    await peloMais(/Deixar para amanhã/)
    const [id, patch] = api.atualizar.mock.calls.at(-1) as [string, { adiarAte: number }]
    expect(patch.adiarAte).toBeGreaterThan(Date.now())
    expect(patch.adiarAte - Date.now()).toBeLessThanOrEqual(86_400_000)
    expect(api.revisar).not.toHaveBeenCalled()
    expect(container.querySelector('.termo')?.textContent).not.toBe(palavra)
    expect(container.querySelector('.qr-conta')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('1 / 2')
    const [, opcoes] = avisos.ok.mock.calls.at(-1) as [string, { action: { label: string; onClick: () => void } }]
    await act(async () => opcoes.action.onClick())
    expect(api.atualizar).toHaveBeenLastCalledWith(id, { adiarAte: expect.any(Number) })
    expect((api.atualizar.mock.calls.at(-1) as [string, { adiarAte: number }])[1].adiarAte).toBeLessThan(Date.now())
    expect(container.querySelector('.qr-conta')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('1 / 3')
  })

  it('"Dizer antes de virar": o convite aparece em parte dos cartões e "Agora não" o tira desta rodada', async () => {
    /* A regra é a do protótipo (`cxPedeDizer`): um de cada três, pelo id do cartão. */
    const { pedeDizer } = await import('../src/lib/revisao/enxuta')
    const e = { ligado: true, semDizerNestaRodada: false, formatoLembrar: true }
    const ids = Array.from({ length: 40 }, (_, i) => `cartao-${i}`)
    const com = ids.find((id) => pedeDizer(id, e)) as string
    const sem = ids.find((id) => !pedeDizer(id, e)) as string
    api.deck = [cartao(com, 'cat', 'gato'), cartao(`${com}`.replace(/\d+$/, 'x'), 'dog', 'cão')]
    const { palco, botao } = await montar()
    expect(palco().querySelector('.cx-diga')?.textContent).toContain('Diga em voz alta antes de virar')
    fireEvent.click(botao('Agora não'))
    expect(palco().querySelector('.cx-diga')).toBeNull()
    cleanup()

    api.deck = [cartao(sem, 'cat', 'gato')]
    const outro = await montar()
    expect(outro.palco().querySelector('.cx-diga')).toBeNull()
    cleanup()

    localStorage.setItem('revisao.dizerAntesDeVirar', 'false')
    api.deck = [cartao(com, 'cat', 'gato')]
    const desligado = await montar()
    expect(desligado.palco().querySelector('.cx-diga')).toBeNull()
  })

  it('sem rede: a nota fica numa linha de aviso, "Tentar" manda de novo e o cartão não sai do lugar', async () => {
    const { palco, container, botao, tocar } = await montar()
    api.revisar.mockRejectedValueOnce(new Error('sem rede'))
    await tocar(botao(/Mostrar resposta/))
    await tocar(container.querySelector('.fsrs button.b') as HTMLElement)
    const aviso = palco().querySelector('.cx-linha .cx-aviso.ct-sem-rede') as HTMLElement
    expect(aviso.textContent).toContain('1 nota não foi gravada')
    await tocar(within(aviso).getByRole('button', { name: 'Tentar enviar agora' }))
    expect(api.revisar).toHaveBeenCalledTimes(2)
    expect(palco().querySelector('.cx-aviso')).toBeNull()
  })

  it('palavra que não entra: a linha aparece quando uma palavra com muitos erros escapa de novo', async () => {
    api.deck = [cartao('c1', 'cat', 'gato', { lapses: 8 } as Partial<VocabCard>), cartao('c2', 'dog', 'cão')]
    api.deck = (api.deck as VocabCard[]).map((c, i) => ({ ...c, dueAtMs: Date.now() - (9 - i) * 86_400_000 }))
    const { palco, container, botao, tocar } = await montar()
    expect(palco().querySelector('.ct-dif')?.textContent).toContain('difícil')
    await tocar(botao(/Mostrar resposta/))
    await tocar(container.querySelector('.fsrs button.e') as HTMLElement)
    const aviso = palco().querySelector('.cx-linha .cx-aviso.ct-aviso-dif') as HTMLElement
    expect(aviso.textContent).toContain('“cat” não está entrando.')
    // As saídas que o app cumpre: trocar a frase, rever a cena e descansar 30 dias (sem lembrete).
    fireEvent.click(aviso.querySelector('.cx-aviso-corpo') as HTMLElement)
    await assentar()
    const folha = document.querySelector('dialog.cx-folha-saidas') as HTMLElement
    expect([...folha.querySelectorAll('.cx-saidas .q-linha b')].map((b) => b.textContent)).toEqual([
      'Trocar a frase',
      'Rever a cena',
      'Descansar 30 dias',
    ])
    // Sem outra ocorrência e sem captura, as duas primeiras ficam desligadas, com o motivo escrito.
    const [trocar, cena, descansar] = [...folha.querySelectorAll<HTMLButtonElement>('.cx-saidas .q-linha')]
    expect(trocar.disabled).toBe(true)
    expect(cena.disabled).toBe(true)
    fireEvent.click(descansar)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    const [, patch] = api.atualizar.mock.calls.at(-1) as [string, { adiarAte: number }]
    expect(Math.round((patch.adiarAte - Date.now()) / 86_400_000)).toBe(30)
  })
})

/* O MESMO DESENHO NO COMPUTADOR (02/10/2026): o que era limite do headset (sem teclado físico) volta. */
describe('Revisão no computador com o desenho novo', () => {
  beforeEach(() => {
    aparelho.quest = false
  })

  it('as teclas aparecem (Espaço, 1 a 4, Z) e funcionam: Espaço mostra a resposta, 3 dá "Bom", Z desfaz', async () => {
    const { palco, container, botao } = await montar()
    expect(palco().dataset.estado).toBe('rodada')
    /* A linha discreta de teclas no pé, só no computador (`cx-teclas`). */
    const teclas = () => [...container.querySelectorAll('.cx-teclas kbd')].map((k) => k.textContent)
    expect(teclas()).toEqual(['Espaço', 'R', 'Z', '?'])
    expect(botao('Desfazer a última nota').title).toBe('Desfazer a última nota (Z)')

    fireEvent.keyDown(window, { key: ' ', code: 'Space' })
    await act(async () => {})
    expect(teclas()).toEqual(['1', '4', 'R', 'M', 'Z', '?'])
    const notas = [...container.querySelectorAll<HTMLButtonElement>('.fsrs button')]
    expect(notas.map((n) => n.title)).toEqual(['Tecla 1', 'Tecla 2', 'Tecla 3', 'Tecla 4'])
    // As teclas são dica, não conteúdo: só existem onde o CSS as mostra (`data-precisa="teclado"`).
    expect([...container.querySelectorAll('kbd')].every((k) => k.closest('[data-precisa="teclado"]'))).toBe(true)

    fireEvent.keyDown(window, { key: '3' })
    await act(async () => {})
    expect(api.revisar).toHaveBeenCalledWith(expect.any(String), 3, 0.9, expect.objectContaining({ origem: 'revisao', formato: 'lembrar', respostaMs: expect.any(Number) }))
    expect(container.querySelector('.qr-conta')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('2 / 3')

    fireEvent.keyDown(window, { key: 'z' })
    await act(async () => {})
    expect(api.desfazer).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.qr-conta')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('1 / 3')
  })

  it('Digitar: o campo pega o foco sozinho e convida a digitar; Enter confere', async () => {
    localStorage.setItem('revisao.tipoDeCartao', 'digitar')
    api.deck = [cartao('c1', 'cat', 'gato')]
    const { palco } = await montar()
    const campo = screen.getByLabelText('Digite a tradução') as HTMLInputElement
    expect(document.activeElement).toBe(campo)
    expect(campo.placeholder).toBe('Digite a tradução…')
    fireEvent.change(campo, { target: { value: 'gato' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    await act(async () => {})
    expect(palco().querySelector('.qr-veredito.certo')).toBeTruthy()
  })

  it('Editar cartão: o campo da tradução pega o foco, como na tela de sempre', async () => {
    const { peloMais } = await montar()
    await peloMais(/^Editar/)
    expect(document.activeElement?.id).toBe('pw-t')
  })

  it('fim da sessão: o desfazer diz a tecla Z', async () => {
    api.deck = [cartao('c1', 'cat', 'gato')]
    const { palco, container, botao, tocar } = await montar()
    await tocar(botao(/Mostrar resposta/))
    await tocar(container.querySelector('.fsrs button.b') as HTMLElement)
    expect(palco().dataset.estado).toBe('fim')
    expect(botao('Desfazer a última nota').title).toBe('Desfazer a última nota (Z)')
  })

  it('as teclas novas: "?" abre os atalhos, "-" deixa para amanhã e a folha do "…" oferece "Atalhos"', async () => {
    const { botao, container } = await montar()
    fireEvent.keyDown(window, { key: '?' })
    await assentar()
    const atalhos = screen.getByRole('dialog')
    expect(atalhos.textContent).toContain('Atalhos e gestos')
    expect([...atalhos.querySelectorAll('.atalho kbd')].map((k) => k.textContent)).toEqual(
      expect.arrayContaining(['Espaço', 'Z', 'R', 'M', '?']),
    )
    fireEvent.click(atalhos.querySelector('.dlg-pe .q-ctl.pri') as HTMLElement)
    await act(async () => {})

    const palavra = container.querySelector('.termo')?.textContent
    fireEvent.keyDown(window, { key: '-' })
    await act(async () => {})
    expect(api.atualizar).toHaveBeenCalledWith(expect.any(String), { adiarAte: expect.any(Number) })
    expect(container.querySelector('.termo')?.textContent).not.toBe(palavra)

    fireEvent.click(botao('Mais ações e ajustes'))
    await assentar()
    expect(
      within(document.querySelector('dialog.cx-folha-acoes') as HTMLElement).getByRole('button', { name: /Atalhos/ }),
    ).toBeTruthy()
  })
})
