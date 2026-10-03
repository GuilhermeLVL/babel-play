// @vitest-environment jsdom
/**
 * A TELA DA CONVERSA VIRTUAL (Intérprete v3, Fase 4):
 *   - mostra o estado das duas fontes ("Eles" = áudio do computador, "Você" = microfone) e oferece
 *     compartilhar o áudio quando "Eles" está desligado e silenciar o microfone;
 *   - a lista em bolhas é a do histórico; o que "Eles" estão dizendo agora aparece em cinza no fim;
 *   - o padrão é SÓ LEGENDA: a tradução de "Eles" só é lida em voz alta se a pessoa ligar a leitura, e a
 *     do microfone ("Você") nunca é lida aqui;
 *   - a ponte com a captura liga ao montar e desliga ao sair;
 *   - corrigir e exportar valem como na tela frente a frente;
 *   - a página do intérprete só oferece a conversa virtual quando a captura deixa, e exige o aviso aceito.
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

beforeEach(() => {
  voz.falas.length = 0
  exportacao.baixarTexto.mockClear()
  localStorage.clear()
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
    layout: 'computador' as const,
    aoSair,
    ...o.extra,
  }
  const r = render(<ConversaVirtual {...props} falas={o.falas ?? []} />)
  const trocarFalas = (falas: FalaDoInterprete[]) => r.rerender(<ConversaVirtual {...props} falas={falas} />)
  return { estado, abrirSistema, alternarMicrofone, aoSair, ponte, registrarPonte, trocarFalas, ...r }
}

const conversa: FalaDoInterprete[] = [
  { id: 'sys-1', originalText: 'Where is the station?', translatedText: 'Onde fica a estação?', lado: 'outro', timestamp: '00:04' },
  { id: 'mic-1000001', originalText: 'Fica ali', translatedText: 'It is over there', lado: 'meu', timestamp: '00:09' },
]

describe('ConversaVirtual: as duas fontes', () => {
  it('mostra "Eles" ouvindo o computador e "Você" ouvindo', () => {
    montar()
    expect(screen.getByTestId('fonte-eles').textContent).toContain('ouvindo o computador')
    expect(screen.getByTestId('fonte-voce').textContent).toContain('Você · ouvindo')
    expect(screen.queryByTestId('compartilhar-audio')).toBeNull()
  })

  it('com "Eles" desligado, oferece compartilhar o áudio e abre o seletor', () => {
    const { abrirSistema } = montar({ sistema: false })
    expect(screen.getByTestId('fonte-eles').textContent).toContain('desligado')
    fireEvent.click(screen.getByTestId('compartilhar-audio'))
    expect(abrirSistema).toHaveBeenCalledTimes(1)
  })

  it('o botão do microfone silencia e religa', () => {
    const { alternarMicrofone, estado } = montar()
    fireEvent.click(screen.getByTestId('fonte-voce'))
    expect(alternarMicrofone).toHaveBeenLastCalledWith(false)
    cleanup()
    const m = montar({ microfone: false })
    expect(m.estado.microfone).toBe(false)
    fireEvent.click(screen.getByTestId('fonte-voce'))
    expect(m.alternarMicrofone).toHaveBeenLastCalledWith(true)
    void estado
  })

  it('acompanha a captura: o estado das fontes é relido', () => {
    vi.useFakeTimers()
    try {
      const m = montar({ sistema: false })
      expect(screen.getByTestId('fonte-eles').textContent).toContain('desligado')
      m.estado.sistema = true
      act(() => {
        vi.advanceTimersByTime(600)
      })
      expect(screen.getByTestId('fonte-eles').textContent).toContain('ouvindo o computador')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ConversaVirtual: a lista', () => {
  it('mostra as falas em bolhas, cada uma no seu lado', () => {
    montar({ falas: conversa })
    const bolhas = screen.getByTestId('int-bolhas')
    const todas = bolhas.querySelectorAll('.int-bolha')
    expect(todas).toHaveLength(2)
    expect(todas[0].getAttribute('data-lado')).toBe('outro')
    expect(todas[1].getAttribute('data-lado')).toBe('meu')
    expect(bolhas.textContent).toContain('Onde fica a estação?')
    expect(bolhas.textContent).toContain('Where is the station?')
  })

  it('o que "Eles" estão dizendo agora aparece em cinza; sem fala nenhuma, a dica diz o que fazer', () => {
    const { trocarFalas } = montar({ sistema: true })
    expect(screen.getByText(/Estou ouvindo o áudio do computador/)).toBeTruthy()
    trocarFalas([{ id: 'sys-2', originalText: 'Hello there', translatedText: '…', lado: 'outro', isPartial: true }])
    expect(screen.getByTestId('eles-dizendo').textContent).toBe('Hello there')
  })

  it('sem o áudio compartilhado, a dica pede para compartilhar', () => {
    montar({ sistema: false })
    expect(screen.getByText(/Compartilhe uma aba ou a tela com áudio/)).toBeTruthy()
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

  it('por padrão a tradução de "Eles" não é lida', () => {
    const { ponte } = montar()
    act(() => ponte.atual!.aoTraduzirFinal(traducao('sys-1', 'Onde fica a estação?')))
    expect(voz.falas).toHaveLength(0)
    expect(screen.getByTestId('ler-em-voz-alta').textContent).toContain('Só legenda')
  })

  it('com a leitura ligada, lê a tradução de "Eles" no meu idioma', () => {
    const { ponte } = montar()
    fireEvent.click(screen.getByTestId('ler-em-voz-alta'))
    expect(screen.getByTestId('ler-em-voz-alta').getAttribute('aria-pressed')).toBe('true')
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
  })

  it('desligar a leitura volta ao só legenda', () => {
    const { ponte } = montar()
    fireEvent.click(screen.getByTestId('ler-em-voz-alta'))
    fireEvent.click(screen.getByTestId('ler-em-voz-alta'))
    act(() => ponte.atual!.aoTraduzirFinal(traducao('sys-3', 'Oi')))
    expect(voz.falas).toHaveLength(0)
  })

  it('tocar numa palavra da lista lê a palavra no idioma dela', () => {
    montar({ falas: conversa })
    const palavra = screen.getByTestId('int-bolhas').querySelector('.int-bolha-fala .int-w')!
    fireEvent.click(palavra)
    expect(voz.falas.at(-1)).toMatchObject({ lang: 'en-US' })
  })
})

describe('ConversaVirtual: corrigir, exportar e sair', () => {
  it('corrige a fala de "Eles" na direção do idioma deles', () => {
    const aoCorrigirFala = vi.fn()
    montar({ falas: conversa, extra: { aoCorrigirFala } })
    const bolha = screen.getByTestId('int-bolhas').querySelector('.int-bolha[data-lado="outro"]')!
    fireEvent.click(bolha.querySelector('.int-bolha-fala .int-ouvir[aria-label="Corrigir o que foi reconhecido"]')!)
    fireEvent.change(screen.getByTestId('int-edicao').querySelector('textarea')!, {
      target: { value: 'Where is the train station?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Corrigir e traduzir' }))
    expect(aoCorrigirFala).toHaveBeenCalledWith('sys-1', 'Where is the train station?', { de: 'en', para: 'pt' })
  })

  it('exporta a conversa em Markdown, chamando o outro de "Eles"', () => {
    montar({ falas: conversa })
    fireEvent.click(screen.getByTestId('exportar-conversa'))
    const [nome, texto] = exportacao.baixarTexto.mock.calls[0]
    expect(nome).toMatch(/\.md$/)
    expect(texto).toContain('**Eles**')
    expect(texto).toContain('Where is the station?')
    expect(texto).toContain('> Onde fica a estação?')
  })

  it('sem falas não há o que exportar', () => {
    montar()
    expect(screen.queryByTestId('exportar-conversa')).toBeNull()
  })

  it('sair avisa a captura', () => {
    const { aoSair } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Sair da conversa virtual' }))
    expect(aoSair).toHaveBeenCalledTimes(1)
  })
})

describe('PaginaDoInterprete: a entrada da conversa virtual', () => {
  const base = {
    idiomas: { meu: 'pt-BR', outro: 'en-US' },
    possivel: true,
    abrindo: false,
    aviso: null,
    aoComecar: vi.fn(),
    aoEscolherIdiomas: vi.fn(),
    aoInverter: vi.fn(),
  }

  it('sem o gancho da captura, a opção não aparece', () => {
    render(<PaginaDoInterprete {...base} />)
    expect(screen.queryByTestId('abrir-conversa-virtual')).toBeNull()
  })

  it('exige o aviso aceito e entrega a escolha do fone', () => {
    const aoComecarVirtual = vi.fn()
    render(<PaginaDoInterprete {...base} aoComecarVirtual={aoComecarVirtual} />)
    fireEvent.click(screen.getByTestId('abrir-conversa-virtual'))
    const comecar = screen.getByTestId('comecar-conversa-virtual') as HTMLButtonElement
    expect(comecar.disabled).toBe(true)
    const [aviso, fone] = Array.from(screen.getByTestId('painel-conversa-virtual').querySelectorAll('input'))
    fireEvent.click(aviso)
    expect(comecar.disabled).toBe(false)
    fireEvent.click(comecar)
    expect(aoComecarVirtual).toHaveBeenLastCalledWith({ comMicrofone: false })
    fireEvent.click(fone)
    fireEvent.click(comecar)
    expect(aoComecarVirtual).toHaveBeenLastCalledWith({ comMicrofone: true })
  })

  it('com os idiomas iguais, não deixa abrir', () => {
    render(<PaginaDoInterprete {...base} possivel={false} aoComecarVirtual={vi.fn()} />)
    expect((screen.getByTestId('abrir-conversa-virtual') as HTMLButtonElement).disabled).toBe(true)
  })
})
