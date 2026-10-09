// @vitest-environment jsdom
/**
 * O MODO INTÉRPRETE (E3 da Fase E) na tela do protótipo (`ConversaDoPrototipo`). O que se prende é REGRA:
 *   - tocar "Falar" abre o microfone na direção daquele lado, e o botão vira "Parar";
 *   - a ponte com a captura liga ao montar e desliga ao sair;
 *   - a tradução aparece na metade de quem ouve e é lida em voz alta no idioma dela; "Repetir" a lê de
 *     novo e "Parar voz" cala;
 *   - o automático é do plano: quem o tem começa nele; sem ele, o botão avisa do Premium e não liga nada;
 *   - a lista "Conversa" mostra o histórico inteiro, e "Exportar" baixa o Markdown (nada sai do aparelho);
 *   - no computador, os atalhos 1/2/Esc.
 * A aparência e o movimento da tela ficam em `polimentoInterprete.test.tsx`.
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
import { mudarEstadoDaTela, tomarPedidoDaConversa } from '../src/lib/polimento/interprete'

beforeEach(() => {
  voz.falas.length = 0
  localStorage.clear()
  mudarEstadoDaTela({ emCurso: false, trocados: false, preparoVirtual: false, depois: null })
  tomarPedidoDaConversa()
  Element.prototype.animate = function () {
    return { finished: Promise.resolve(), cancel: () => {} } as unknown as Animation
  } as unknown as typeof Element.prototype.animate
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

const fase = () => screen.getByTestId('modo-interprete').getAttribute('data-fase')
const traduzida = (segId: string, original: string, texto: string, de: string, para: string) => ({
  segId,
  original,
  resultado: 'traduzida' as const,
  traducao: texto,
  de,
  para,
  aproximada: false,
  falada: true,
})

describe('ModoInterprete', () => {
  it('cada metade tem o seu idioma e o seu botão de falar; a faixa diz a voz em uso', () => {
    montar()
    expect(screen.getByRole('button', { name: /Falar em English/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Falar em Português/i })).toBeTruthy()
    expect(screen.getByTestId('voz-em-uso').textContent).toContain('Voz do aparelho')
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

  it('a fala traduzida aparece do outro lado, é lida, Repetir a lê de novo e Parar voz cala', () => {
    const { ponte, fechar, trocarFalas } = montar()
    fireEvent.click(screen.getByRole('button', { name: /Falar em Português/i }))
    act(() => ponte.atual!.aoFimDaFala({ segId: 'a1', source: 'mic', lado: 'meu' }))
    expect(fechar).toHaveBeenCalled()
    trocarFalas([{ id: 'a1', originalText: 'bom dia', translatedText: 'good morning', lado: 'meu' }])
    act(() => ponte.atual!.aoTraduzirFinal(traduzida('a1', 'bom dia', 'good morning', 'pt', 'en')))
    const doOutro = screen.getByTestId('interprete-outro')
    expect(doOutro.querySelector('.int-traducao')?.textContent).toContain('good morning')
    expect(doOutro.textContent).toContain('bom dia')
    expect(voz.falas).toEqual([expect.objectContaining({ texto: 'good morning', lang: 'en-US' })])
    act(() => voz.falas[0].fim?.())
    fireEvent.click(screen.getAllByRole('button', { name: 'Repetir a tradução' })[0])
    expect(voz.falas).toHaveLength(2)
    expect(voz.falas[1]).toMatchObject({ texto: 'good morning', lang: 'en-US' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Parar a voz' })[0])
    expect(fase()).toBe('parado')
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

  it('celular: sem teclado a ouvir, as teclas não abrem o microfone', () => {
    const { abrir } = montar({ layout: 'celular' })
    fireEvent.keyDown(window, { key: '1' })
    expect(abrir).not.toHaveBeenCalled()
  })
})

/* ───────────────────────────── o modo automático (E7) ───────────────────────────── */

describe('ModoInterprete: automático', () => {
  const botaoDoModo = () => screen.getByRole('button', { name: /Modo automático/ })

  it('com o automático no plano, ele já vem escolhido: "Ouvir a conversa", nenhum "Falar" por lado', () => {
    montar({ automatico: 'disponivel' })
    expect(botaoDoModo().getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('falar-meu').getAttribute('aria-label')).toBe('Ouvir a conversa')
    expect(screen.queryByRole('button', { name: /Falar em/ })).toBeNull()
  })

  it('"Ouvir a conversa" abre o microfone sem lado; o botão vira "Parar de ouvir a conversa"', () => {
    const { abrir, ponte } = montar({ automatico: 'disponivel' })
    fireEvent.click(screen.getByTestId('falar-meu'))
    expect(abrir).toHaveBeenCalledTimes(1)
    expect(ponte.atual!.automatico()).toBe(true)
    expect(ponte.atual!.direcao()).toBeNull()
    expect(screen.getByTestId('falar-meu').getAttribute('aria-label')).toBe('Parar de ouvir a conversa')
  })

  it('a fala do outro (inglês medido) aparece traduzida na MINHA metade, é lida em português, e o microfone reabre', () => {
    const { abrir, ponte, trocarFalas } = montar({ automatico: 'disponivel' })
    fireEvent.click(screen.getByTestId('falar-meu'))
    act(() => ponte.atual!.aoFimDaFala({ segId: 'a1', source: 'mic' }))
    act(() => void ponte.atual!.ladoDaFala('a1', { idiomaDoMotor: 'en', idiomaDoTexto: '', audioMs: 2500 }))
    trocarFalas([{ id: 'a1', originalText: 'good morning', translatedText: 'bom dia', lado: 'outro' }])
    act(() => ponte.atual!.aoTraduzirFinal(traduzida('a1', 'x', 'bom dia', 'en', 'pt')))
    expect(screen.getByTestId('interprete-meu').textContent).toContain('bom dia')
    expect(voz.falas).toEqual([expect.objectContaining({ texto: 'bom dia', lang: 'pt-BR' })])
    act(() => voz.falas[0].fim?.())
    expect(fase()).toBe('ouvindo')
    expect(abrir).toHaveBeenCalledTimes(2)
  })

  it('"Por toque" volta aos dois botões de Falar, e a escolha é lembrada', () => {
    const { unmount } = montar({ automatico: 'disponivel' })
    fireEvent.click(botaoDoModo())
    expect(botaoDoModo().getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: /Falar em English/i })).toBeTruthy()
    unmount()
    montar({ automatico: 'disponivel' })
    expect(botaoDoModo().getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: /Falar em Português/i })).toBeTruthy()
  })

  it('trocar de modo no meio da escuta fecha o microfone', () => {
    const { fechar } = montar({ automatico: 'disponivel' })
    fireEvent.click(screen.getByTestId('falar-meu'))
    fireEvent.click(botaoDoModo())
    expect(fechar).toHaveBeenCalled()
    expect(fase()).toBe('parado')
  })

  it('sem o automático no plano (Grátis): o modo é por toque, e o botão diz que é do Premium sem ligar nada', () => {
    const { abrir, ponte } = montar({ automatico: 'premium' })
    expect(botaoDoModo().getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(botaoDoModo())
    expect(botaoDoModo().getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: /Falar em English/i })).toBeTruthy()
    expect(screen.getByTestId('aviso-do-interprete').textContent).toMatch(/Premium/)
    expect(abrir).not.toHaveBeenCalled()
    expect(ponte.atual!.automatico()).toBe(false)
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
    expect(fase()).toBe('parado')
  })
})

/* ─────────── o histórico, a lista "Conversa" e a exportação (Intérprete v3, Fase 1) ─────────── */

describe('ModoInterprete: histórico e exportação', () => {
  const conversa: FalaDoInterprete[] = [
    { id: 'a', originalText: 'I want rise', translatedText: 'Eu quero subir', lado: 'outro', timestamp: '00:04' },
    { id: 'b', originalText: 'Quanto custa?', translatedText: 'How much?', lado: 'meu', timestamp: '00:09' },
    { id: 'c', originalText: 'Two dollars', translatedText: 'Dois dólares', lado: 'outro', timestamp: '00:12' },
  ]

  it('cada metade mostra a última tradução do outro em destaque, com o original', () => {
    montar({ falas: conversa })
    const minha = screen.getByTestId('interprete-meu')
    expect(minha.querySelector('.int-traducao')?.textContent).toBe('Dois dólares')
    expect(minha.querySelector('.int-original')?.textContent).toBe('Two dollars')
  })

  it('a dica de começo só aparece enquanto ninguém falou', () => {
    const { trocarFalas } = montar()
    expect(screen.getAllByText(/Toque em Falar e fale/).length).toBeGreaterThan(0)
    trocarFalas(conversa)
    expect(screen.getByTestId('interprete-meu').textContent).not.toMatch(/Toque em Falar e fale/)
  })

  it('a lista "Conversa" traz todas as falas, na ordem, com a tradução de cada uma', () => {
    montar({ falas: conversa })
    expect(screen.queryByTestId('interprete-conversa')).toBeNull()
    fireEvent.click(screen.getByTestId('tela-conversa'))
    const bolhas = Array.from(screen.getByTestId('interprete-conversa').querySelectorAll('.int-bolha'))
    expect(bolhas.map((b) => b.querySelector('.int-bolha-fala')?.textContent)).toEqual([
      'I want rise',
      'Quanto custa?',
      'Two dollars',
    ])
    expect(bolhas.map((b) => b.querySelector('.int-bolha-trad')?.textContent)).toEqual([
      'Eu quero subir',
      'How much?',
      'Dois dólares',
    ])
    expect(bolhas.map((b) => b.getAttribute('data-lado'))).toEqual(['outro', 'meu', 'outro'])
  })

  it('o histórico não se perde numa conversa longa: 60 falas, 60 bolhas', () => {
    const muitas: FalaDoInterprete[] = Array.from({ length: 60 }, (_, i) => ({
      id: `f${i}`,
      originalText: `o${i}`,
      translatedText: `t${i}`,
      lado: 'outro' as const,
    }))
    montar({ falas: muitas })
    fireEvent.click(screen.getByTestId('tela-conversa'))
    expect(screen.getByTestId('interprete-conversa').querySelectorAll('.int-bolha')).toHaveLength(60)
  })

  it('"Exportar" na lista baixa o Markdown da conversa', () => {
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
    exportacao.baixarTexto.mockClear()
    montar()
    fireEvent.click(screen.getByTestId('tela-conversa'))
    fireEvent.click(screen.getByTestId('exportar-conversa'))
    expect(exportacao.baixarTexto).not.toHaveBeenCalled()
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
