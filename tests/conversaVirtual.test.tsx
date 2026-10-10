// @vitest-environment jsdom
/**
 * A CONVERSA VIRTUAL (Intérprete v3, Fase 4) NO DESENHO NOVO: a tela é a da conversa nova
 * (`ConversaDoPrototipo`), a mesma do frente a frente.
 *   - a coluna da outra pessoa mostra o que vem do som do computador, e a sua o que você fala;
 *   - o botão grande da outra pessoa abre o seletor da aba ou tela (e fica aceso ouvindo); o seu liga e
 *     silencia o microfone;
 *   - o padrão é SÓ LEGENDA: a tradução do computador só é lida em voz alta se a pessoa ligar a leitura,
 *     e a do microfone nunca é lida aqui;
 *   - a ponte com a captura liga ao montar e desliga ao sair;
 *   - "Conversa" abre a lista em bolhas, onde cada fala se ouve, se corrige e se guarda, e "Exportar";
 *   - o botão "Virtual" da conversa abre a FOLHA do desenho novo por cima dela (nunca a tela de entrada
 *     antiga, que não existe mais), e a folha exige o aceite antes de começar.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const voz = vi.hoisted(() => ({ falas: [] as Array<{ texto: string; lang: string; fim?: () => void }> }))
vi.mock('../src/lib/tts', async (original) => {
  const real = await original<typeof import('../src/lib/tts')>()
  return {
    ...real,
    nativeTts: {
      speak: (texto: string, opts: { lang: string; onStart?: () => void; onEnd?: () => void }) => {
        voz.falas.push({ texto, lang: opts.lang, fim: opts.onEnd })
        opts.onStart?.()
      },
      cancel: () => {},
      isSpeaking: () => false,
    },
  }
})
const exportacao = vi.hoisted(() => ({ baixarTexto: vi.fn() }))
vi.mock('../src/lib/captura/exportarConversa', async (original) => ({
  ...(await original<typeof import('../src/lib/captura/exportarConversa')>()),
  baixarTexto: exportacao.baixarTexto,
}))

import ConversaVirtual from '../src/components/views/captura/interprete/ConversaVirtual'
import type { FalaDoInterprete } from '../src/components/views/captura/interprete/ModoInterprete'
import PaginaDoInterprete from '../src/components/views/captura/interprete/PaginaDoInterprete'
import type { PonteDoInterprete } from '../src/lib/captura/controleDoInterprete'
import { estadoDaTela, mudarEstadoDaTela } from '../src/lib/polimento/interprete'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

beforeEach(() => {
  voz.falas.length = 0
  exportacao.baixarTexto.mockClear()
  localStorage.clear()
  mudarEstadoDaTela({ emCurso: false, trocados: false, folhaVirtual: false, depois: null })
})
afterEach(() => cleanup())

const traducao = (segId: string, texto: string, de = 'en', para = 'pt') => ({
  segId,
  original: 'x',
  resultado: 'traduzida' as const,
  traducao: texto,
  de,
  para,
  aproximada: false,
  falada: true,
})

function montar(
  o: {
    falas?: FalaDoInterprete[]
    sistema?: boolean
    microfone?: boolean
    extra?: Partial<React.ComponentProps<typeof ConversaVirtual>>
  } = {},
) {
  const estado = { sistema: o.sistema ?? true, microfone: o.microfone ?? true }
  const abrirSistema = vi.fn()
  const alternarMicrofone = vi.fn()
  const aoSair = vi.fn()
  const ponte: { atual: PonteDoInterprete | null } = { atual: null }
  const registrarPonte = vi.fn((p: PonteDoInterprete | null) => {
    ponte.atual = p
  })
  const props = {
    idiomas: { meu: 'pt-BR', outro: 'en-US' },
    registrarPonte,
    fontes: { sistemaAtivo: () => estado.sistema, microfoneAtivo: () => estado.microfone },
    abrirSistema,
    alternarMicrofone,
    vozNaturalDisponivel: false,
    aoSair,
    ...o.extra,
  }
  const r = render(<ConversaVirtual {...props} falas={o.falas ?? []} />)
  const trocarFalas = (falas: FalaDoInterprete[]) => r.rerender(<ConversaVirtual {...props} falas={falas} />)
  return { estado, abrirSistema, alternarMicrofone, aoSair, ponte, registrarPonte, trocarFalas, ...r }
}

const conversa: FalaDoInterprete[] = [
  {
    id: 'sys-1',
    originalText: 'Where is the station?',
    translatedText: 'Onde fica a estação?',
    lado: 'outro',
    timestamp: '00:04',
  },
  { id: 'mic-1000001', originalText: 'Fica ali', translatedText: 'It is over there', lado: 'meu', timestamp: '00:09' },
]

/** A coluna de quem fala nela: `outro` é a da outra pessoa (o som do computador), `meu` é a sua. */
const coluna = (lado: 'meu' | 'outro') => screen.getByTestId(`interprete-${lado}`)
const abrirLista = () => fireEvent.click(screen.getByTestId('tela-conversa'))

describe('ConversaVirtual: a tela é a conversa do desenho novo', () => {
  it('desenha as duas colunas e a faixa da conversa nova, e esconde a tela pronta que fica por baixo', () => {
    const { unmount } = montar()
    const raiz = screen.getByTestId('conversa-virtual')
    expect(raiz.className).toBe('int px-int')
    expect(raiz.getAttribute('role')).toBe('dialog')
    expect(raiz.getAttribute('aria-label')).toBe('Conversa virtual')
    expect([...raiz.children].map((f) => f.className)).toEqual(['int-metade', 'int-faixa', 'int-metade'])
    expect(coluna('outro').querySelector('.int-quem')?.textContent).toBe('A outra pessoa')
    expect(coluna('meu').querySelector('.int-quem')?.textContent).toBe('Você')
    // Nada do desenho antigo: nem as pílulas de fonte, nem a lista como tela única.
    expect(raiz.querySelector('.int-fonte, .int-nota-fone, [data-tela]')).toBeNull()
    expect(screen.queryByTestId('abrir-conversa-virtual')).toBeNull()
    expect(estadoDaTela().emCurso).toBe(true)
    unmount()
    expect(estadoDaTela().emCurso).toBe(false)
  })

  it('trocar os lados troca as colunas de lugar', () => {
    montar({ falas: conversa })
    fireEvent.click(screen.getByLabelText('Trocar os lados'))
    expect(coluna('outro').querySelector('.int-quem')?.textContent).toBe('Você')
    expect(coluna('meu').querySelector('.int-quem')?.textContent).toBe('A outra pessoa')
    expect(coluna('meu').querySelector('.int-traducao')?.textContent).toBe('Onde fica a estação?')
  })
})

describe('ConversaVirtual: as duas fontes', () => {
  it('ouvindo o computador, a coluna da outra pessoa diz isso e o botão dela fica aceso, sem o que tocar', () => {
    const { abrirSistema } = montar()
    const botao = screen.getByTestId('falar-outro') as HTMLButtonElement
    expect(coluna('outro').querySelector('.int-status')?.textContent).toBe('Ouvindo o computador…')
    expect(botao.hasAttribute('data-ouvindo')).toBe(true)
    expect(botao.disabled).toBe(true)
    fireEvent.click(botao)
    expect(abrirSistema).not.toHaveBeenCalled()
    expect(coluna('meu').querySelector('.int-status')?.textContent).toBe('Ouvindo…')
  })

  it('sem o áudio do computador, o botão da outra pessoa abre o seletor da aba ou tela', () => {
    const { abrirSistema } = montar({ sistema: false })
    const botao = screen.getByTestId('falar-outro') as HTMLButtonElement
    expect(botao.getAttribute('aria-label')).toBe('Compartilhar áudio')
    expect(botao.hasAttribute('data-ouvindo')).toBe(false)
    expect(coluna('outro').querySelector('.int-status')?.textContent).toBe('')
    fireEvent.click(botao)
    expect(abrirSistema).toHaveBeenCalledTimes(1)
  })

  it('o botão da sua coluna silencia e religa o microfone', () => {
    const { alternarMicrofone } = montar()
    expect(screen.getByTestId('falar-meu').getAttribute('aria-label')).toBe('Silenciar o meu microfone')
    fireEvent.click(screen.getByTestId('falar-meu'))
    expect(alternarMicrofone).toHaveBeenLastCalledWith(false)
    cleanup()
    const m = montar({ microfone: false })
    expect(screen.getByTestId('falar-meu').textContent).toBe('Falar')
    expect(screen.getByTestId('falar-meu').getAttribute('aria-label')).toBe('Ligar o meu microfone')
    fireEvent.click(screen.getByTestId('falar-meu'))
    expect(m.alternarMicrofone).toHaveBeenLastCalledWith(true)
  })

  it('com o microfone abrindo, a sua coluna diz que está abrindo', () => {
    montar({ extra: { abrindo: true } })
    expect(coluna('meu').querySelector('.int-status')?.textContent).toBe('Abrindo o microfone…')
  })

  it('acompanha a captura: o estado das fontes é relido', () => {
    vi.useFakeTimers()
    try {
      const m = montar({ sistema: false })
      expect(screen.getByTestId('falar-outro').hasAttribute('data-ouvindo')).toBe(false)
      m.estado.sistema = true
      act(() => {
        vi.advanceTimersByTime(600)
      })
      expect(screen.getByTestId('falar-outro').hasAttribute('data-ouvindo')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('o aviso do preparo aparece na faixa', () => {
    montar({ extra: { aviso: 'Baixando o tradutor…' } })
    expect(screen.getByTestId('aviso-do-interprete').textContent).toBe('Baixando o tradutor…')
  })
})

describe('ConversaVirtual: as colunas e a lista', () => {
  it('a coluna da outra pessoa mostra o que veio do computador; a sua, o que você falou', () => {
    montar({ falas: conversa })
    expect(coluna('outro').querySelector('.int-traducao')?.textContent).toBe('Onde fica a estação?')
    expect(coluna('outro').querySelector('.int-original')?.textContent).toBe('Where is the station?')
    expect(coluna('meu').querySelector('.int-traducao')?.textContent).toBe('Fica ali')
    expect(coluna('meu').querySelector('.int-original')?.textContent).toBe('It is over there')
  })

  it('o que está sendo dito agora aparece na coluna de quem fala; sem fala nenhuma, a dica diz o que fazer', () => {
    const { trocarFalas } = montar({ sistema: true })
    expect(screen.getByText(/Estou ouvindo o áudio do computador/)).toBeTruthy()
    expect(coluna('meu').querySelector('.int-dica')?.textContent).toMatch(/De fone, o microfone não ouve/)
    trocarFalas([{ id: 'sys-2', originalText: 'Hello there', translatedText: '…', lado: 'outro', isPartial: true }])
    expect(coluna('outro').querySelector('.int-ao-vivo')?.textContent?.trim()).toBe('Hello there')
  })

  it('sem o áudio compartilhado, a dica pede para compartilhar', () => {
    montar({ sistema: false })
    expect(screen.getByText(/Compartilhe uma aba ou a tela com áudio/)).toBeTruthy()
  })

  it('"Conversa" abre a lista em bolhas, cada fala no seu lado, e esconde as colunas', () => {
    montar({ falas: conversa })
    expect(screen.queryByTestId('int-bolhas')).toBeNull()
    abrirLista()
    expect([...document.querySelectorAll<HTMLElement>('.int-metade')].map((m) => m.hidden)).toEqual([true, true])
    const bolhas = screen.getByTestId('int-bolhas')
    const todas = bolhas.querySelectorAll('.int-bolha')
    expect(todas).toHaveLength(2)
    expect(todas[0].getAttribute('data-lado')).toBe('outro')
    expect(todas[1].getAttribute('data-lado')).toBe('meu')
    expect(bolhas.textContent).toContain('Onde fica a estação?')
    expect(bolhas.textContent).toContain('Where is the station?')
  })

  it('a lista vazia diz que a conversa aparece ali', () => {
    montar()
    abrirLista()
    expect(screen.getByTestId('interprete-conversa').textContent).toContain(
      'A conversa aparece aqui conforme vocês falam.',
    )
  })
})

describe('ConversaVirtual: só legenda por padrão, leitura por escolha', () => {
  it('a ponte liga ao montar e desliga ao sair', () => {
    const { ponte, registrarPonte, unmount } = montar()
    expect(ponte.atual).not.toBeNull()
    expect(ponte.atual!.direcao()).toBeNull()
    expect(ponte.atual!.automatico()).toBe(false)
    expect(ponte.atual!.idiomasDaConversa()).toEqual(['pt-BR', 'en-US'])
    unmount()
    expect(registrarPonte).toHaveBeenLastCalledWith(null)
  })

  it('por padrão a tradução do computador não é lida, e a faixa diz "Só legenda"', () => {
    const { ponte } = montar()
    act(() => ponte.atual!.aoTraduzirFinal(traducao('sys-1', 'Onde fica a estação?')))
    expect(voz.falas).toHaveLength(0)
    expect(screen.getByTestId('ler-em-voz-alta').textContent).toContain('Só legenda')
    expect(screen.getByTestId('ler-em-voz-alta').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('voz-em-uso').textContent).toBe('Só legenda')
  })

  it('com a leitura ligada, lê a tradução do computador no meu idioma e a faixa diz a voz em uso', () => {
    const { ponte } = montar()
    fireEvent.click(screen.getByTestId('ler-em-voz-alta'))
    expect(screen.getByTestId('ler-em-voz-alta').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('ler-em-voz-alta').textContent).toContain('Lendo em voz alta')
    expect(screen.getByTestId('voz-em-uso').textContent).toBe('Voz do aparelho')
    act(() => ponte.atual!.aoTraduzirFinal(traducao('sys-1', 'Onde fica a estação?')))
    expect(voz.falas).toEqual([expect.objectContaining({ texto: 'Onde fica a estação?', lang: 'pt-BR' })])
  })

  it('a tradução do microfone nunca é lida aqui, e o que não foi traduzido também não', () => {
    const { ponte } = montar()
    fireEvent.click(screen.getByTestId('ler-em-voz-alta'))
    act(() => ponte.atual!.aoTraduzirFinal(traducao('mic-1000001', 'It is over there', 'pt', 'en')))
    act(() =>
      ponte.atual!.aoTraduzirFinal({ ...traducao('sys-2', ''), resultado: 'sem-traducao' as never, traducao: '' }),
    )
    expect(voz.falas).toHaveLength(0)
    // A sua coluna não tem o que repetir nem o que calar.
    expect(coluna('meu').querySelectorAll('.int-acoes > button')).toHaveLength(1)
  })

  it('desligar a leitura volta ao só legenda', () => {
    const { ponte } = montar()
    fireEvent.click(screen.getByTestId('ler-em-voz-alta'))
    fireEvent.click(screen.getByTestId('ler-em-voz-alta'))
    act(() => ponte.atual!.aoTraduzirFinal(traducao('sys-3', 'Oi')))
    expect(voz.falas).toHaveLength(0)
  })

  it('"Repetir" lê de novo a última tradução da outra pessoa, no meu idioma', () => {
    montar({ falas: conversa })
    fireEvent.click(coluna('outro').querySelector('[aria-label="Repetir a tradução"]')!)
    expect(voz.falas.at(-1)).toMatchObject({ texto: 'Onde fica a estação?', lang: 'pt-BR' })
  })

  it('na lista, tocar numa palavra lê a palavra no idioma dela', () => {
    montar({ falas: conversa })
    abrirLista()
    const palavra = screen.getByTestId('int-bolhas').querySelector('.int-bolha-fala .int-w')!
    fireEvent.click(palavra)
    expect(voz.falas.at(-1)).toMatchObject({ lang: 'en-US' })
  })
})

describe('ConversaVirtual: corrigir, guardar, exportar e sair', () => {
  it('corrige a fala que veio do computador na direção do idioma dela', () => {
    const aoCorrigirFala = vi.fn()
    montar({ falas: conversa, extra: { aoCorrigirFala } })
    abrirLista()
    const bolha = screen.getByTestId('int-bolhas').querySelector('.int-bolha[data-lado="outro"]')!
    fireEvent.click(bolha.querySelector('.int-bolha-fala .int-ouvir[aria-label="Corrigir o que foi reconhecido"]')!)
    fireEvent.change(screen.getByTestId('int-edicao').querySelector('textarea')!, {
      target: { value: 'Where is the train station?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Corrigir e traduzir' }))
    expect(aoCorrigirFala).toHaveBeenCalledWith('sys-1', 'Where is the train station?', { de: 'en', para: 'pt' })
  })

  it('guarda a fala para estudar, com os idiomas dela', () => {
    const aoGuardar = vi.fn()
    montar({ falas: conversa, extra: { aoGuardar } })
    abrirLista()
    const bolha = screen.getByTestId('int-bolhas').querySelector('.int-bolha[data-lado="outro"]')!
    const guardar = [...bolha.querySelectorAll<HTMLElement>('.int-bolha-fala .int-ouvir')].at(-1)!
    fireEvent.click(guardar)
    expect(aoGuardar).toHaveBeenCalledWith({
      id: 'sys-1',
      texto: 'Where is the station?',
      traducao: 'Onde fica a estação?',
      lang: 'en-US',
      langDaTraducao: 'pt-BR',
    })
  })

  it('exporta a conversa em Markdown, com os nomes das colunas', () => {
    montar({ falas: conversa })
    abrirLista()
    fireEvent.click(screen.getByTestId('exportar-conversa'))
    const [nome, texto] = exportacao.baixarTexto.mock.calls[0]
    expect(nome).toMatch(/\.md$/)
    expect(texto).toContain('**A outra pessoa**')
    expect(texto).toContain('Where is the station?')
    expect(texto).toContain('> Onde fica a estação?')
  })

  it('sem falas não há o que exportar', () => {
    montar()
    abrirLista()
    fireEvent.click(screen.getByTestId('exportar-conversa'))
    expect(exportacao.baixarTexto).not.toHaveBeenCalled()
  })

  it('sair avisa a captura', () => {
    const { aoSair } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Sair da conversa virtual' }))
    expect(aoSair).toHaveBeenCalledTimes(1)
  })
})

describe('a folha da conversa virtual (o botão "Virtual" da conversa)', () => {
  const base = {
    idiomas: { meu: 'pt-BR', outro: 'en-US' },
    possivel: true,
    aviso: null,
    aoComecar: vi.fn(),
    aoEscolherIdiomas: vi.fn(),
  }

  it('sem o gancho da captura (celular, headset, chave desligada), o botão não aparece', () => {
    render(<PaginaDoInterprete {...base} />)
    expect(screen.queryByTestId('abrir-conversa-virtual')).toBeNull()
  })

  it('o botão abre a folha por cima da conversa, sem sair dela nem mostrar a tela de entrada antiga', () => {
    render(<PaginaDoInterprete {...base} aoComecarVirtual={vi.fn()} />)
    expect(screen.queryByTestId('folha-conversa-virtual')).toBeNull()
    fireEvent.click(screen.getByTestId('abrir-conversa-virtual'))
    const folha = screen.getByRole('dialog', { name: 'Conversa virtual' })
    expect(folha.className).toContain('folha-de-baixo')
    expect(folha.textContent).toContain('Traduz o áudio do computador')
    // A conversa continua na tela, por baixo da folha.
    expect(screen.getByTestId('conversa-pronta')).toBeTruthy()
    expect(screen.getByTestId('falar-meu')).toBeTruthy()
    // Nada da tela antiga.
    expect(screen.queryByTestId('comecar-conversa')).toBeNull()
    expect(screen.queryByTestId('painel-conversa-virtual')).toBeNull()
    expect(document.querySelector('.estudio, .virtual-painel, .par-idiomas')).toBeNull()
    expect(screen.queryByText('Uma conversa, dois idiomas')).toBeNull()
  })

  it('exige o aceite, entrega a escolha do fone e fecha a folha; o aceite é pedido de novo a cada conversa', () => {
    const aoComecarVirtual = vi.fn()
    render(<PaginaDoInterprete {...base} aoComecarVirtual={aoComecarVirtual} />)
    fireEvent.click(screen.getByTestId('abrir-conversa-virtual'))
    const comecar = () => screen.getByTestId('comecar-conversa-virtual') as HTMLButtonElement
    expect(comecar().disabled).toBe(true)
    // Só o fone não basta: o aceite é o obrigatório.
    fireEvent.click(screen.getByTestId('fone-da-conversa-virtual'))
    expect(comecar().disabled).toBe(true)
    fireEvent.click(screen.getByTestId('fone-da-conversa-virtual'))
    fireEvent.click(screen.getByTestId('aceite-da-conversa-virtual'))
    expect(comecar().disabled).toBe(false)
    fireEvent.click(comecar())
    expect(aoComecarVirtual).toHaveBeenLastCalledWith({ comMicrofone: false })
    expect(screen.queryByTestId('folha-conversa-virtual')).toBeNull()
    expect(estadoDaTela().folhaVirtual).toBe(false)

    fireEvent.click(screen.getByTestId('abrir-conversa-virtual'))
    expect(comecar().disabled).toBe(true)
    fireEvent.click(screen.getByTestId('aceite-da-conversa-virtual'))
    fireEvent.click(screen.getByTestId('fone-da-conversa-virtual'))
    fireEvent.click(comecar())
    expect(aoComecarVirtual).toHaveBeenLastCalledWith({ comMicrofone: true })
    expect(aoComecarVirtual).toHaveBeenCalledTimes(2)
  })

  it('"Agora não" fecha a folha sem começar nada', () => {
    const aoComecarVirtual = vi.fn()
    render(<PaginaDoInterprete {...base} aoComecarVirtual={aoComecarVirtual} />)
    fireEvent.click(screen.getByTestId('abrir-conversa-virtual'))
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(screen.queryByTestId('folha-conversa-virtual')).toBeNull()
    expect(aoComecarVirtual).not.toHaveBeenCalled()
    expect(screen.getByTestId('conversa-pronta')).toBeTruthy()
  })

  it('pedida de dentro de uma conversa, a folha só abre depois de a sessão encerrar', () => {
    const { rerender } = render(<PaginaDoInterprete {...base} sessaoAberta aoComecarVirtual={vi.fn()} />)
    act(() => mudarEstadoDaTela({ depois: 'virtual' }))
    expect(screen.queryByTestId('folha-conversa-virtual')).toBeNull()
    rerender(<PaginaDoInterprete {...base} sessaoAberta={false} aoComecarVirtual={vi.fn()} />)
    expect(screen.getByTestId('folha-conversa-virtual')).toBeTruthy()
    expect(estadoDaTela().depois).toBe(null)
  })

  /* Quem barra o início com os idiomas iguais é a captura (`entrarNaConversaVirtual` em `LiveCapture`,
     que sai sem abrir nada); a tela diz por quê. */
  it('com os idiomas iguais, a tela diz que faltam dois idiomas diferentes', () => {
    render(<PaginaDoInterprete {...base} possivel={false} aoComecarVirtual={vi.fn()} />)
    expect(screen.getByTestId('aviso-do-interprete').textContent).toMatch(/dois idiomas diferentes/)
  })
})

describe('conversa virtual: detectar idioma', () => {
  const falasEmVariosIdiomas: FalaDoInterprete[] = [
    {
      id: 'sys-1',
      lado: 'outro',
      originalText: 'Donde esta la estacion?',
      translatedText: 'Onde fica a estação?',
      lang: 'es',
      paraLang: 'pt',
    },
    {
      id: 'sys-2',
      lado: 'outro',
      originalText: 'Bonjour a tous',
      translatedText: 'Bom dia a todos',
      lang: 'fr',
      paraLang: 'pt',
    },
    {
      id: 'sys-3',
      lado: 'outro',
      originalText: 'Bom dia, pessoal',
      translatedText: '',
      lang: 'pt',
      paraLang: 'pt',
      semTraducao: true,
    },
  ]

  it('vem ligado e mostra o idioma de cada fala e os idiomas ouvidos', () => {
    montar({ falas: falasEmVariosIdiomas })
    expect(screen.getByTestId('detectar-idioma').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('detectar-idioma').textContent).toBe('Detectando idiomas')
    // A coluna da outra pessoa diz o idioma medido da fala que está na tela.
    expect(coluna('outro').querySelector('.int-idioma')?.textContent).toMatch(/Portugu/)
    abrirLista()
    expect(screen.getAllByTestId('bolha-idioma')).toHaveLength(3)
    const ouvidos = screen.getByTestId('idiomas-ouvidos').textContent ?? ''
    expect(ouvidos).toMatch(/Espa/)
    expect(ouvidos).toMatch(/Fran/)
  })

  it('a fala no meu idioma aparece sem "…" de tradução pendente', () => {
    montar({ falas: falasEmVariosIdiomas })
    // Na coluna, o que foi dito é o que se lê (não há tradução a esperar).
    expect(coluna('outro').querySelector('.int-traducao')?.textContent).toBe('Bom dia, pessoal')
    expect(coluna('outro').querySelector('.int-original')).toBeNull()
    abrirLista()
    const bolhas = screen.getByTestId('int-bolhas').querySelectorAll('.int-bolha')
    expect(bolhas[2].textContent).not.toContain('…')
    expect(bolhas[2].getAttribute('data-sem-traducao')).toBe('true')
  })

  it('desligar grava a escolha, avisa a captura e tira as etiquetas', () => {
    const aoDetectarIdioma = vi.fn()
    montar({ falas: falasEmVariosIdiomas, extra: { aoDetectarIdioma } })
    abrirLista()
    fireEvent.click(screen.getByTestId('detectar-idioma'))
    expect(screen.getByTestId('detectar-idioma').textContent).toBe('Idiomas fixos')
    expect(aoDetectarIdioma).toHaveBeenCalledWith(false)
    expect(localStorage.getItem('babel.interprete.virtualDetectar')).toBe('nao')
    expect(screen.queryAllByTestId('bolha-idioma')).toHaveLength(0)
    expect(screen.queryByTestId('idiomas-ouvidos')).toBeNull()
  })
})
