// @vitest-environment jsdom
/**
 * A TELA DO MODO INTÉRPRETE (E3 da Fase E), a maquete aprovada pelo dono. O que se prende:
 *   - celular: a metade de cima (o outro) virada 180°; computador: duas colunas sem virar;
 *   - cada metade mostra a última frase do OUTRO traduzida, com o original;
 *   - tocar "Falar" abre o microfone e o botão vira "Parar" (com anel);
 *   - a ponte com a captura liga ao montar e desliga ao sair;
 *   - a tradução é lida em voz alta e a metade de quem ouve mostra "Repetir" e "Parar voz";
 *   - o chip diz a voz em uso;
 *   - no computador, os atalhos 1/2/R/P/Esc.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const voz = vi.hoisted(() => ({
  falas: [] as Array<{ texto: string; lang: string; fim?: () => void }>,
}))
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

import ModoInterprete, { type FalaDoInterprete } from '../src/components/views/captura/interprete/ModoInterprete'
import type { PonteDoInterprete } from '../src/lib/captura/controleDoInterprete'

beforeEach(() => {
  voz.falas.length = 0
  localStorage.clear()
})
afterEach(() => cleanup())

function montar(
  o: {
    layout?: 'celular' | 'computador'
    falas?: FalaDoInterprete[]
    automatico?: 'disponivel' | 'premium' | 'oculto'
    extra?: Partial<React.ComponentProps<typeof ModoInterprete>>
  } = {},
) {
  const abrir = vi.fn()
  const fechar = vi.fn()
  const aoSair = vi.fn()
  const ponte: { atual: PonteDoInterprete | null } = { atual: null }
  const registrarPonte = vi.fn((p: PonteDoInterprete | null) => {
    ponte.atual = p
  })
  const props = {
    idiomas: { meu: 'pt-BR', outro: 'en-US' },
    microfone: { abrir, fechar },
    registrarPonte,
    vozNaturalDisponivel: false,
    layout: o.layout ?? ('celular' as const),
    aoSair,
    ...(o.automatico ? { automatico: o.automatico } : {}),
    ...o.extra,
  }
  const r = render(<ModoInterprete {...props} falas={o.falas ?? []} />)
  const trocarFalas = (falas: FalaDoInterprete[]) => r.rerender(<ModoInterprete {...props} falas={falas} />)
  return { abrir, fechar, aoSair, ponte, registrarPonte, trocarFalas, ...r }
}

describe('ModoInterprete', () => {
  it('celular: a metade do outro fica virada; cada uma com o seu idioma', () => {
    montar()
    expect(screen.getByTestId('interprete-outro').hasAttribute('data-virada')).toBe(true)
    expect(screen.getByTestId('interprete-meu').hasAttribute('data-virada')).toBe(false)
    expect(screen.getByRole('button', { name: /Falar em English/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Falar em Português/i })).toBeTruthy()
    expect(screen.getByTestId('voz-em-uso').textContent).toContain('Voz do aparelho')
  })

  it('computador: nenhuma metade virada', () => {
    montar({ layout: 'computador' })
    expect(screen.getByTestId('interprete-outro').hasAttribute('data-virada')).toBe(false)
  })

  it('tocar Falar abre o microfone e o botão vira Parar', () => {
    const { abrir, ponte } = montar()
    expect(ponte.atual).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Falar em Português/i }))
    expect(abrir).toHaveBeenCalledTimes(1)
    const parar = screen.getByRole('button', { name: 'Parar de ouvir' })
    expect(parar.getAttribute('aria-pressed')).toBe('true')
    expect(ponte.atual!.direcao()).toMatchObject({ lado: 'meu', fala: 'pt-BR', para: 'en' })
  })

  it('a fala traduzida aparece do outro lado, é lida, e quem ouve ganha Repetir e Parar voz', () => {
    const { ponte, fechar, trocarFalas } = montar()
    fireEvent.click(screen.getByRole('button', { name: /Falar em Português/i }))
    act(() => ponte.atual!.aoFimDaFala({ segId: 'a1', source: 'mic', lado: 'meu' }))
    expect(fechar).toHaveBeenCalled()
    trocarFalas([{ id: 'a1', originalText: 'bom dia', translatedText: 'good morning', lado: 'meu' }])
    act(() =>
      ponte.atual!.aoTraduzirFinal({
        segId: 'a1',
        original: 'bom dia',
        resultado: 'traduzida',
        traducao: 'good morning',
        de: 'pt',
        para: 'en',
        aproximada: false,
        falada: true,
      }),
    )
    const doOutro = screen.getByTestId('interprete-outro')
    expect(doOutro.textContent).toContain('good morning')
    expect(doOutro.textContent).toContain('bom dia')
    expect(voz.falas).toEqual([expect.objectContaining({ texto: 'good morning', lang: 'en-US' })])
    expect(screen.getByRole('button', { name: 'Repetir a tradução' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Parar a voz' }))
    expect(screen.getByTestId('modo-interprete').getAttribute('data-fase')).toBe('parado')
  })

  it('sair desliga a ponte e avisa a captura', () => {
    const { aoSair, registrarPonte } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Sair do modo intérprete' }))
    expect(aoSair).toHaveBeenCalledTimes(1)
    cleanup()
    expect(registrarPonte).toHaveBeenLastCalledWith(null)
  })

  it('computador: 1 e 2 falam, Esc sai', () => {
    const { abrir, aoSair, ponte } = montar({ layout: 'computador' })
    fireEvent.keyDown(window, { key: '2' })
    expect(abrir).toHaveBeenCalledTimes(1)
    expect(ponte.atual!.direcao()).toMatchObject({ lado: 'outro', fala: 'en-US' })
    fireEvent.keyDown(window, { key: '1' })
    expect(ponte.atual!.direcao()).toMatchObject({ lado: 'meu' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(aoSair).toHaveBeenCalledTimes(1)
  })
})

/* ───────────────────────────── o modo automático (E7) ───────────────────────────── */

describe('ModoInterprete: automático', () => {
  const traducao = (segId: string, texto: string, de: string, para: string) => ({
    segId,
    original: 'x',
    resultado: 'traduzida' as const,
    traducao: texto,
    de,
    para,
    aproximada: false,
    falada: true,
  })

  it('com o automático no plano, ele já vem escolhido: um botão "Ouvir a conversa", nenhum "Falar" por lado', () => {
    montar({ automatico: 'disponivel' })
    expect(screen.getByTestId('modo-interprete').getAttribute('data-modo')).toBe('automatico')
    expect(screen.getByRole('button', { name: 'Ouvir a conversa' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Falar em/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Modo automático/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('"Ouvir a conversa" abre o microfone sem lado; o botão vira "Parar de ouvir a conversa"', () => {
    const { abrir, ponte } = montar({ automatico: 'disponivel' })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir a conversa' }))
    expect(abrir).toHaveBeenCalledTimes(1)
    expect(ponte.atual!.automatico()).toBe(true)
    expect(ponte.atual!.direcao()).toBeNull()
    expect(screen.getByRole('button', { name: 'Parar de ouvir a conversa' })).toBeTruthy()
  })

  it('a fala do outro (inglês medido) aparece traduzida na MINHA metade, é lida em português, e o microfone reabre', () => {
    const { abrir, ponte, trocarFalas } = montar({ automatico: 'disponivel' })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir a conversa' }))
    act(() => ponte.atual!.aoFimDaFala({ segId: 'a1', source: 'mic' }))
    act(() => void ponte.atual!.ladoDaFala('a1', { idiomaDoMotor: 'en', idiomaDoTexto: '', audioMs: 2500 }))
    trocarFalas([{ id: 'a1', originalText: 'good morning', translatedText: 'bom dia', lado: 'outro' }])
    act(() => ponte.atual!.aoTraduzirFinal(traducao('a1', 'bom dia', 'en', 'pt')))
    expect(screen.getByTestId('interprete-meu').textContent).toContain('bom dia')
    expect(voz.falas).toEqual([expect.objectContaining({ texto: 'bom dia', lang: 'pt-BR' })])
    act(() => voz.falas[0].fim?.())
    expect(screen.getByTestId('modo-interprete').getAttribute('data-fase')).toBe('ouvindo')
    expect(abrir).toHaveBeenCalledTimes(2)
  })

  it('"Por toque" volta aos dois botões de Falar, e a escolha é lembrada', () => {
    const { unmount } = montar({ automatico: 'disponivel' })
    fireEvent.click(screen.getByRole('button', { name: /Modo automático/ }))
    expect(screen.getByTestId('modo-interprete').getAttribute('data-modo')).toBe('toque')
    expect(screen.getByRole('button', { name: /Falar em English/i })).toBeTruthy()
    unmount()
    montar({ automatico: 'disponivel' })
    expect(screen.getByTestId('modo-interprete').getAttribute('data-modo')).toBe('toque')
  })

  it('trocar de modo no meio da escuta fecha o microfone', () => {
    const { fechar } = montar({ automatico: 'disponivel' })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir a conversa' }))
    fireEvent.click(screen.getByRole('button', { name: /Modo automático/ }))
    expect(fechar).toHaveBeenCalled()
    expect(screen.getByTestId('modo-interprete').getAttribute('data-fase')).toBe('parado')
  })

  it('sem o automático no plano (Grátis): o modo é por toque, e o botão diz que é do Premium sem ligar nada', () => {
    const { abrir } = montar({ automatico: 'premium' })
    expect(screen.getByTestId('modo-interprete').getAttribute('data-modo')).toBe('toque')
    fireEvent.click(screen.getByRole('button', { name: /Modo automático/ }))
    expect(screen.getByTestId('modo-interprete').getAttribute('data-modo')).toBe('toque')
    expect(screen.getByTestId('aviso-do-interprete').textContent).toMatch(/Premium/)
    expect(abrir).not.toHaveBeenCalled()
  })

  it('no site sem servidor (oculto) o botão do automático nem aparece', () => {
    montar({ automatico: 'oculto' })
    expect(screen.queryByRole('button', { name: /Modo automático/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Falar em English/i })).toBeTruthy()
  })

  it('computador: a tecla 1 liga e desliga a escuta', () => {
    const { abrir, fechar } = montar({ layout: 'computador', automatico: 'disponivel' })
    fireEvent.keyDown(window, { key: '1' })
    expect(abrir).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: '1' })
    expect(fechar).toHaveBeenCalled()
    expect(screen.getByTestId('modo-interprete').getAttribute('data-fase')).toBe('parado')
  })
})

/* ───────────────────── histórico, toque para ouvir e a tela "Conversa" (Intérprete v3, Fase 1) ───────────────────── */

describe('ModoInterprete: histórico e toque', () => {
  const conversa: FalaDoInterprete[] = [
    { id: 'a', originalText: 'I want rice', translatedText: 'Eu quero arroz', lado: 'outro' },
    { id: 'b', originalText: 'Quanto custa?', translatedText: 'How much?', lado: 'meu' },
    { id: 'c', originalText: 'Two dollars', translatedText: 'Dois dólares', lado: 'outro' },
  ]

  it('cada metade mostra as falas anteriores e a última do outro em destaque', () => {
    montar({ falas: conversa })
    const minha = screen.getByTestId('interprete-meu')
    expect(minha.textContent).toContain('Eu quero arroz')
    expect(minha.textContent).toContain('Quanto custa?')
    expect(minha.textContent).toContain('Dois dólares')
    expect(minha.querySelector('.int-traducao')?.textContent).toContain('Dois dólares')
    expect(minha.querySelectorAll('.int-hist-texto')).toHaveLength(2)
    const dele = screen.getByTestId('interprete-outro')
    expect(dele.textContent).toContain('How much?')
    expect(dele.textContent).toContain('I want rice')
  })

  it('a dica de começo só aparece enquanto ninguém falou', () => {
    const { trocarFalas } = montar()
    expect(screen.getAllByText(/Toque em Falar e fale/).length).toBeGreaterThan(0)
    trocarFalas(conversa)
    expect(screen.queryByText(/Toque em Falar e fale/)).toBeNull()
  })

  it('tocar numa palavra lê a palavra no idioma da metade', () => {
    montar({ falas: conversa })
    const minha = screen.getByTestId('interprete-meu')
    fireEvent.click(Array.from(minha.querySelectorAll('.int-traducao .int-w')).find((b) => b.textContent === 'arroz') ?? minha.querySelector('.int-w')!)
    expect(voz.falas.at(-1)).toMatchObject({ lang: 'pt-BR' })
  })

  it('o botão da frase lê a frase inteira; o do caracol lê devagar', () => {
    montar({ falas: [conversa[2]] })
    const minha = screen.getByTestId('interprete-meu')
    fireEvent.click(minha.querySelector('.int-traducao .int-ouvir')!)
    expect(voz.falas.at(-1)).toMatchObject({ texto: 'Dois dólares', lang: 'pt-BR' })
    const botoes = minha.querySelectorAll('.int-traducao .int-ouvir')
    fireEvent.click(botoes[1])
    expect(voz.falas).toHaveLength(2)
  })

  it('com o microfone aberto, o toque não lê nada e a tela explica', () => {
    montar({ falas: conversa })
    fireEvent.click(screen.getByRole('button', { name: /Falar em Português/i }))
    fireEvent.click(screen.getByTestId('interprete-meu').querySelector('.int-traducao .int-ouvir')!)
    expect(voz.falas).toHaveLength(0)
    expect(screen.getByTestId('aviso-do-interprete').textContent).toMatch(/Espere a escuta terminar/)
  })

  it('"ver mais" aparece com mais de 50 falas e sobe a janela', () => {
    const muitas: FalaDoInterprete[] = Array.from({ length: 60 }, (_, i) => ({
      id: `f${i}`,
      originalText: `o${i}`,
      translatedText: `t${i}`,
      lado: 'outro' as const,
    }))
    montar({ falas: muitas })
    const minha = screen.getByTestId('interprete-meu')
    expect(minha.querySelectorAll('.int-item')).toHaveLength(50)
    fireEvent.click(minha.querySelector('.int-vermais')!)
    expect(minha.querySelectorAll('.int-item')).toHaveLength(60)
  })

  it('a tela "Conversa" troca para bolhas, mantém os botões de falar e a escolha é lembrada', () => {
    const { unmount } = montar({ falas: conversa })
    expect(screen.getByTestId('modo-interprete').getAttribute('data-tela')).toBe('frente')
    fireEvent.click(screen.getByTestId('tela-conversa'))
    expect(screen.getByTestId('modo-interprete').getAttribute('data-tela')).toBe('conversa')
    const bolhas = screen.getByTestId('int-bolhas')
    expect(bolhas.querySelectorAll('.int-bolha')).toHaveLength(3)
    expect(bolhas.textContent).toContain('Eu quero arroz')
    expect(bolhas.textContent).toContain('How much?')
    expect(screen.getByRole('button', { name: /Falar em Português/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Falar em English/i })).toBeTruthy()
    unmount()
    montar({ falas: conversa })
    expect(screen.getByTestId('modo-interprete').getAttribute('data-tela')).toBe('conversa')
  })

  it('o Repetir continua lendo a tradução depois de um toque', () => {
    const { ponte, trocarFalas } = montar()
    fireEvent.click(screen.getByRole('button', { name: /Falar em Português/i }))
    act(() => ponte.atual!.aoFimDaFala({ segId: 'a1', source: 'mic', lado: 'meu' }))
    trocarFalas([{ id: 'a1', originalText: 'bom dia', translatedText: 'good morning', lado: 'meu' }])
    act(() =>
      ponte.atual!.aoTraduzirFinal({
        segId: 'a1',
        original: 'bom dia',
        resultado: 'traduzida',
        traducao: 'good morning',
        de: 'pt',
        para: 'en',
        aproximada: false,
        falada: true,
      }),
    )
    act(() => voz.falas[0].fim?.())
    fireEvent.click(screen.getByTestId('interprete-outro').querySelector('.int-traducao .int-ouvir')!)
    expect(voz.falas.at(-1)?.texto).toBe('good morning')
    act(() => voz.falas.at(-1)?.fim?.())
    fireEvent.click(screen.getByRole('button', { name: 'Repetir a tradução' }))
    expect(voz.falas.at(-1)?.texto).toBe('good morning')
  })
})

describe('ModoInterprete: corrigir, guardar e exportar', () => {
  const conversa: FalaDoInterprete[] = [
    { id: 'a', originalText: 'I want rise', translatedText: 'Eu quero subir', lado: 'outro', timestamp: '00:04' },
    { id: 'b', originalText: 'Quanto custa?', translatedText: 'How much?', lado: 'meu', timestamp: '00:09' },
  ]

  it('sem os ganchos da captura, a tela não oferece lápis nem estrela', () => {
    montar({ falas: conversa })
    expect(screen.queryByRole('button', { name: 'Corrigir o que foi reconhecido' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Guardar para estudar' })).toBeNull()
  })

  it('o lápis do original do outro abre a folha, e confirmar refaz a tradução na direção de quem falou', () => {
    const aoCorrigirFala = vi.fn()
    montar({ falas: conversa, extra: { aoCorrigirFala } })
    const minha = screen.getByTestId('interprete-meu')
    /* a fala do outro (inglês) tem o original na linha pequena, abaixo da tradução em destaque */
    fireEvent.click(minha.querySelector('.int-original .int-ouvir[aria-label="Corrigir o que foi reconhecido"]')!)
    const folha = screen.getByTestId('int-edicao')
    const campo = folha.querySelector('textarea')!
    expect(campo.value).toBe('I want rise')
    fireEvent.change(campo, { target: { value: 'I want rice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Corrigir e traduzir' }))
    expect(aoCorrigirFala).toHaveBeenCalledWith('a', 'I want rice', { de: 'en', para: 'pt' })
    expect(screen.queryByTestId('int-edicao')).toBeNull()
  })

  it('cancelar, ou confirmar sem mudar o texto, não pede nada', () => {
    const aoCorrigirFala = vi.fn()
    montar({ falas: conversa, extra: { aoCorrigirFala } })
    const minha = screen.getByTestId('interprete-meu')
    fireEvent.click(minha.querySelector('.int-original .int-ouvir[aria-label="Corrigir o que foi reconhecido"]')!)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByTestId('int-edicao')).toBeNull()
    fireEvent.click(minha.querySelector('.int-original .int-ouvir[aria-label="Corrigir o que foi reconhecido"]')!)
    fireEvent.click(screen.getByRole('button', { name: 'Corrigir e traduzir' }))
    expect(aoCorrigirFala).not.toHaveBeenCalled()
  })

  it('a minha fala também se corrige, na direção do meu lado', () => {
    const aoCorrigirFala = vi.fn()
    montar({ falas: conversa, extra: { aoCorrigirFala } })
    const minha = screen.getByTestId('interprete-meu')
    fireEvent.click(minha.querySelector('.int-hist-texto .int-ouvir[aria-label="Corrigir o que foi reconhecido"]')!)
    fireEvent.change(screen.getByTestId('int-edicao').querySelector('textarea')!, { target: { value: 'Quanto é?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Corrigir e traduzir' }))
    expect(aoCorrigirFala).toHaveBeenCalledWith('b', 'Quanto é?', { de: 'pt', para: 'en' })
  })

  it('tocar e segurar no original abre a folha (e o clique depois não lê a palavra)', () => {
    vi.useFakeTimers()
    try {
      montar({ falas: conversa, extra: { aoCorrigirFala: vi.fn() } })
      const minha = screen.getByTestId('interprete-meu')
      const original = minha.querySelector('.int-original')!
      const palavra = original.querySelector('.int-w')!
      fireEvent.pointerDown(palavra)
      act(() => {
        vi.advanceTimersByTime(600)
      })
      expect(screen.getByTestId('int-edicao')).toBeTruthy()
      fireEvent.pointerUp(palavra)
      fireEvent.click(palavra)
      expect(voz.falas).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a estrela guarda a frase com o idioma dela e o da tradução', () => {
    const aoGuardar = vi.fn()
    montar({ falas: conversa, extra: { aoGuardar } })
    const minha = screen.getByTestId('interprete-meu')
    fireEvent.click(minha.querySelector('.int-original .int-ouvir[aria-label="Guardar para estudar"]')!)
    expect(aoGuardar).toHaveBeenCalledWith({
      id: 'a',
      texto: 'I want rise',
      traducao: 'Eu quero subir',
      lang: 'en-US',
      langDaTraducao: 'pt-BR',
    })
  })

  it('"Exportar" na tela Conversa baixa o Markdown da conversa', () => {
    exportacao.baixarTexto.mockClear()
    montar({ falas: conversa })
    expect(screen.queryByTestId('exportar-conversa')).toBeNull()
    fireEvent.click(screen.getByTestId('tela-conversa'))
    fireEvent.click(screen.getByTestId('exportar-conversa'))
    expect(exportacao.baixarTexto).toHaveBeenCalledTimes(1)
    const [nome, texto] = exportacao.baixarTexto.mock.calls[0]
    expect(nome).toMatch(/\.md$/)
    expect(texto).toContain('I want rise')
    expect(texto).toContain('> Eu quero subir')
    expect(texto).toContain('Quanto custa?')
  })

  it('sem falas, não há o que exportar', () => {
    montar()
    fireEvent.click(screen.getByTestId('tela-conversa'))
    expect(screen.queryByTestId('exportar-conversa')).toBeNull()
  })
})

describe('ModoInterprete: medidor da conversa', () => {
  it('ao sair, guarda o resumo do tempo até a voz para o /diagnostico (só números)', async () => {
    const { tempoAteAVoz, lerUltimoDoInterprete } = await import('../src/lib/voz/tempoAteAVoz')
    localStorage.clear()
    const { unmount } = montar()
    tempoAteAVoz.registrar(1400, 'voz-do-aparelho')
    unmount()
    expect(lerUltimoDoInterprete()).toMatchObject({ amostras: 1, p50: 1400 })
  })

  it('sem nenhuma fala lida, não guarda nada', async () => {
    const { lerUltimoDoInterprete } = await import('../src/lib/voz/tempoAteAVoz')
    localStorage.clear()
    const { unmount } = montar()
    unmount()
    expect(lerUltimoDoInterprete()).toBeNull()
  })
})
