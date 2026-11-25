// @vitest-environment jsdom
/**
 * A TELA DO DIÁRIO (openspec `diario-com-correcao-que-vira-cartao`, tarefas 3.1 a 3.3, 4.1 e 4.2): o portão da flag, o
 * editor (20 a 200 palavras, rascunho só no aparelho), "Conferir sozinho" (sem IA e sem "Ver planos" para o perfil
 * protegido), os dados pessoais, o sinal de risco, o retorno com "Guardar como cartão" e "Isto estava certo", e o
 * histórico local (apagar, exportar). A IA e o servidor são simulados; nenhuma rede.
 */
import 'fake-indexeddb/auto'

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { diarioEmTxt } from '../src/lib/diario/historico'
import { definirEstadoDasFlags } from '../src/lib/flagsCache'

const m = vi.hoisted(() => ({
  acesso: 'retorno' as 'retorno' | 'conferir' | 'restrito',
  protegido: false,
  pedir: vi.fn(),
  bulk: vi.fn(),
  etiquetas: vi.fn(),
  flags: {} as Record<string, { ligada: boolean }>,
}))

vi.mock('../src/lib/flags', async (orig) => ({
  ...(await orig<typeof import('../src/lib/flags')>()),
  carregarFlags: async () => m.flags,
  iniciarAtualizacaoDeFlags: () => () => {},
}))
vi.mock('../src/lib/diario/acesso', () => ({ acessoDoDiario: () => m.acesso }))
vi.mock('../src/lib/protecaoDoMenor', () => ({ perfilProtegido: () => m.protegido }))
vi.mock('../src/lib/langConfig', () => ({
  useLangConfig: () => ({ mine: 'pt-BR', studying: 'en-US', daInterface: 'pt-BR' }),
}))
vi.mock('../src/lib/etiquetas/indiceDeEtiquetas', () => ({
  useSnapshotDasEtiquetas: () => ({ caderno: new Map(), marcadas: new Map(), vistas: new Map() }),
}))
vi.mock('../src/data/apiDoEstudo', () => ({ pedirRetornoDoDiario: (...a: unknown[]) => m.pedir(...a) }))
vi.mock('../src/data/api', () => ({ bulkAddCards: (...a: unknown[]) => m.bulk(...a) }))
vi.mock('../src/data/rotas/historicoDaPalavra', () => ({
  salvarEtiquetasDoCartao: (...a: unknown[]) => m.etiquetas(...a),
}))
vi.mock('../src/lib/irPara', () => ({ irPara: vi.fn() }))

const { default: PortaoDoDiario } = await import('../src/components/views/diario/PortaoDoDiario')
const { default: Diario } = await import('../src/components/views/diario/Diario')
const { apagarODiario, historicoDoDiario } = await import('../src/lib/diario/historico')

const TEXTO =
  'Yesterday I go to the park with my sister. We played football and ate some ice cream. The weather was very nice and the park was full of people.'
const RETORNO = {
  elogio: 'Você contou o dia na ordem certa.',
  pontos: [{ trecho: 'I go', tipo: 'tempoVerbal', dica: 'Pense no passado.', exemplo: 'I went' }],
  resolvidos: [],
}

beforeEach(async () => {
  m.acesso = 'retorno'
  m.protegido = false
  m.pedir.mockReset()
  m.bulk.mockReset()
  m.etiquetas.mockReset()
  localStorage.clear()
  await apagarODiario()
})
afterEach(() => {
  cleanup()
  definirEstadoDasFlags(null)
  m.flags = {}
})

const escrever = (valor: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: 'Seu diário' }), { target: { value: valor } })

describe('o portão da flag diario', () => {
  it('desligada: nada da tela monta e a pessoa vai ao início; ligada: a tela monta', async () => {
    definirEstadoDasFlags({})
    const aoNegar = vi.fn()
    const { unmount } = render(
      <PortaoDoDiario aoNegar={aoNegar}>
        <p>tela do diário</p>
      </PortaoDoDiario>,
    )
    expect(screen.queryByText('tela do diário')).toBeNull()
    await act(async () => {})
    expect(aoNegar).toHaveBeenCalledTimes(1)
    unmount()
    definirEstadoDasFlags({ diario: { ligada: true } })
    render(
      <PortaoDoDiario aoNegar={aoNegar}>
        <p>tela do diário</p>
      </PortaoDoDiario>,
    )
    expect(screen.getByText('tela do diário')).toBeTruthy()
  })
})

describe('o editor', () => {
  it('12 palavras: o botão fica desativado com "20 palavras ou mais para pedir retorno"', () => {
    render(<Diario />)
    escrever('Yesterday I went to the park with my little sister today.')
    expect((screen.getByTestId('pedir-retorno-do-diario') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('limite-do-diario').textContent).toBe('20 palavras ou mais para pedir retorno')
  })

  it('acima de 200 palavras: "Máximo de 200 palavras"', () => {
    render(<Diario />)
    escrever('word '.repeat(205))
    expect(screen.getByTestId('limite-do-diario').textContent).toBe('Máximo de 200 palavras')
  })

  it('o rascunho volta ao reabrir, e nenhuma requisição leva o texto ao servidor', async () => {
    vi.useFakeTimers()
    const fetchEspiao = vi.spyOn(globalThis, 'fetch')
    const { unmount } = render(<Diario />)
    escrever(TEXTO)
    await act(async () => {
      vi.advanceTimersByTime(1100)
    })
    unmount()
    render(<Diario />)
    expect((screen.getByRole('textbox', { name: 'Seu diário' }) as HTMLTextAreaElement).value).toBe(TEXTO)
    expect(m.pedir).not.toHaveBeenCalled()
    expect(fetchEspiao).not.toHaveBeenCalled()
    fetchEspiao.mockRestore()
    vi.useRealTimers()
  })

  it('dado pessoal: sublinha, avisa e o botão fica desativado (nada é enviado)', () => {
    render(<Diario />)
    escrever(`${TEXTO} Call me at (11) 98765-4321.`)
    expect(screen.getByTestId('dado-pessoal')).toBeTruthy()
    expect((screen.getByTestId('pedir-retorno-do-diario') as HTMLButtonElement).disabled).toBe(true)
    expect(m.pedir).not.toHaveBeenCalled()
  })

  it('sinal de risco: a IA não é chamada, a mensagem fixa aparece (CVV 188) e nada é guardado', async () => {
    render(<Diario />)
    escrever(`${TEXTO} Sometimes I think I want to die because everything is hard.`)
    await act(async () => {
      fireEvent.click(screen.getByTestId('pedir-retorno-do-diario'))
    })
    const apoio = screen.getByTestId('apoio-do-diario')
    expect(apoio.textContent).toContain('CVV atende no 188, 24 horas')
    expect(m.pedir).not.toHaveBeenCalled()
    expect(await historicoDoDiario().listar()).toEqual([])
  })
})

describe('conferir sozinho (sem IA)', () => {
  it('perfil protegido: só "Conferir sozinho", sem "Ver planos" e sem chamada de IA', async () => {
    m.acesso = 'restrito'
    m.protegido = true
    render(<Diario />)
    escrever(TEXTO)
    expect(screen.queryByTestId('pedir-retorno-do-diario')).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByTestId('conferir-sozinho-do-diario'))
    })
    const conferido = screen.getByTestId('diario-conferido')
    expect(conferido.textContent).toContain('palavras')
    expect(screen.queryByTestId('linha-dos-planos')).toBeNull()
    expect(screen.queryByText('Ver planos')).toBeNull()
    expect(m.pedir).not.toHaveBeenCalled()
  })

  it('Grátis adulto: "Conferir sozinho" e a linha neutra sobre os planos', async () => {
    m.acesso = 'conferir'
    render(<Diario />)
    escrever(TEXTO)
    expect(screen.getByTestId('linha-dos-planos')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByTestId('conferir-sozinho-do-diario'))
    })
    expect(screen.getByTestId('diario-conferido')).toBeTruthy()
    expect(m.pedir).not.toHaveBeenCalled()
  })

  it('"Guardar no diário" põe a entrada no histórico local', async () => {
    m.acesso = 'restrito'
    render(<Diario />)
    escrever(TEXTO)
    await act(async () => {
      fireEvent.click(screen.getByTestId('conferir-sozinho-do-diario'))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Guardar no diário'))
    })
    await waitFor(async () => expect((await historicoDoDiario().listar()).length).toBe(1))
    expect(screen.getByTestId('historico-do-diario').textContent).toContain('Yesterday I go')
  })
})

describe('o retorno e o cartão', () => {
  async function pedirRetorno() {
    m.pedir.mockResolvedValue({ ok: true, valor: RETORNO })
    render(<Diario />)
    escrever(TEXTO)
    await act(async () => {
      fireEvent.click(screen.getByTestId('pedir-retorno-do-diario'))
    })
    return screen.getByTestId('diario-retorno')
  }

  it('manda idioma, nível e texto; mostra o elogio e o ponto; a entrada vai ao histórico local', async () => {
    const tela = await pedirRetorno()
    expect(m.pedir).toHaveBeenCalledWith({ idioma: 'en', nivel: 'A2', escrita: TEXTO })
    expect(tela.textContent).toContain('Você contou o dia na ordem certa.')
    expect(within(tela).getAllByTestId('ponto-do-diario')).toHaveLength(1)
    await waitFor(async () => expect((await historicoDoDiario().listar())[0]?.retorno?.pontos).toHaveLength(1))
  })

  it('"Guardar como cartão": a frase vem corrigida, a lacuna não entrega a resposta, etiqueta "do diário", sem IA', async () => {
    m.bulk.mockResolvedValue({ cards: [{ id: 'c1' }], skipped: [] })
    await pedirRetorno()
    await act(async () => {
      fireEvent.click(screen.getByTestId('guardar-como-cartao'))
    })
    expect(m.bulk).toHaveBeenCalledTimes(1)
    const [lote] = m.bulk.mock.calls[0]
    expect(lote).toHaveLength(1)
    expect(lote[0]).toMatchObject({
      word: 'I went',
      sentence: 'Yesterday I went to the park with my sister.',
      srcLang: 'en',
      tgtLang: 'pt',
      clozePrompt: 'Yesterday _____ to the park with my sister.',
      clozeAnswer: 'I went',
    })
    expect(lote[0].back).toBe('I went — Pense no passado.')
    expect(m.etiquetas).toHaveBeenCalledWith('c1', ['do-diário'])
    expect(screen.getByTestId('ponto-guardado')).toBeTruthy()
    expect(m.pedir).toHaveBeenCalledTimes(1) // só o retorno; o cartão não chamou IA
  })

  it('cartão repetido: o servidor recusa e a tela diz o motivo, sem erro', async () => {
    m.bulk.mockResolvedValue({ cards: [], skipped: [{ word: 'I went', motivo: 'duplicada' }] })
    await pedirRetorno()
    await act(async () => {
      fireEvent.click(screen.getByTestId('guardar-como-cartao'))
    })
    expect(screen.getByTestId('ponto-recusado').textContent).toBe('já está no seu baralho')
    expect(m.etiquetas).not.toHaveBeenCalled()
  })

  it('"Isto estava certo": o ponto some, nenhum cartão é criado e fica registrado no histórico', async () => {
    await pedirRetorno()
    await act(async () => {
      fireEvent.click(screen.getByTestId('estava-certo'))
    })
    expect(screen.queryByTestId('guardar-como-cartao')).toBeNull()
    expect(m.bulk).not.toHaveBeenCalled()
    await waitFor(async () => expect((await historicoDoDiario().listar())[0]?.descartados).toEqual(['I go']))
  })

  it('cota esgotada: mostra a data e deixa a conferência no aparelho', async () => {
    m.pedir.mockResolvedValue({ ok: false, motivo: 'cota_esgotada', limite: 30, voltam: 'em 1 de dezembro' })
    render(<Diario />)
    escrever(TEXTO)
    await act(async () => {
      fireEvent.click(screen.getByTestId('pedir-retorno-do-diario'))
    })
    expect(screen.getByTestId('cota-do-diario').textContent).toBe(
      'Você usou os 30 retornos deste mês. Eles voltam em 1 de dezembro.',
    )
    expect(screen.getByTestId('conferir-sozinho-do-diario')).toBeTruthy()
  })
})

describe('apagar o diário e exportar', () => {
  it('"Apagar o diário" pede confirmação, esvazia o histórico e o rascunho, e os cartões continuam', async () => {
    m.acesso = 'restrito'
    render(<Diario />)
    escrever(TEXTO)
    await act(async () => {
      fireEvent.click(screen.getByTestId('conferir-sozinho-do-diario'))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Guardar no diário'))
    })
    await waitFor(() => expect(screen.getByTestId('apagar-diario')).toBeTruthy())
    fireEvent.click(screen.getByTestId('apagar-diario'))
    expect(screen.getByText('Os cartões que você já guardou continuam no seu baralho.')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirmar-apagar'))
    })
    expect(await historicoDoDiario().listar()).toEqual([])
    expect(localStorage.getItem('frasy.diario.rascunho')).toBeNull()
    expect(m.bulk).not.toHaveBeenCalled()
  })

  it('o .txt é montado no navegador, em ordem, com as correções que a pessoa não descartou', () => {
    const txt = diarioEmTxt(
      [
        {
          id: 'b',
          em: 2,
          idioma: 'en',
          texto: 'Second day.',
          retorno: {
            elogio: 'ok',
            resolvidos: [],
            pontos: [
              { trecho: 'a', tipo: 'outro', dica: 'dica a', exemplo: 'A' },
              { trecho: 'b', tipo: 'outro', dica: 'dica b', exemplo: 'B' },
            ],
          },
          cartoes: [],
          descartados: ['b'],
        },
        { id: 'a', em: 1, idioma: 'en', texto: 'First day.', retorno: null, cartoes: [], descartados: [] },
      ],
      (ms) => `dia ${ms}`,
    )
    expect(txt).toBe('dia 1\n\nFirst day.\n\n----\n\ndia 2\n\nSecond day.\n\n- a -> A: dica a\n')
  })
})
