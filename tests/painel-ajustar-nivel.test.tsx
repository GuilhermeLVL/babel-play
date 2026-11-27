// @vitest-environment jsdom
/**
 * O PAINEL "AJUSTAR NÍVEL" (openspec `leitura-assistida`, fatia D, tarefa D6): flag desligada não mostra nem chama nada;
 * plano sem a capacidade mostra o motivo; o original fica ao lado do ajustado, com o custo e o nível MEDIDO; Simplificar e
 * Elevar movem um nível; saída barrada mantém o original; o capítulo pede confirmação e é cancelável.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PainelAjustarNivel, {
  abrirAjustarNivel,
  fecharAjustarNivel,
  type TrechoParaAjuste,
} from '../src/components/views/leitor/PainelAjustarNivel'
import type { AjusteDeNivel } from '../src/data/rotas/ajustarNivel'
import { _reiniciarIdentidade, definirIdentidade } from '../src/lib/identidade'

let flag = true
let plano = 'plus'
vi.mock('../src/lib/flags', () => ({ useFlag: () => flag, flagLigada: () => flag }))
vi.mock('../src/lib/entitlements', () => ({
  getEntitlements: () => ({ plan: plano }),
  onPlanChange: () => () => {},
}))
vi.mock('../src/data/rotas/palavrasMarcadas', () => ({
  fetchPalavrasMarcadas: async () => [{ lang: 'en', chave: 'market', estado: 'conhecida', atualizadoEm: 1 }],
}))

const ajustarComCache = vi.fn()
const ajustarCapitulo = vi.fn()
vi.mock('../src/lib/leitor/ajustarNivelDoLeitor', () => ({
  ajustarComCache: (...a: unknown[]) => ajustarComCache(...a),
  ajustarCapitulo: (...a: unknown[]) => ajustarCapitulo(...a),
}))

const TRECHO: TrechoParaAjuste = {
  texto: 'The market is big and the fruit is fresh.',
  frase: 'The market is big and the fruit is fresh.',
  paragrafo: 'The market is big and the fruit is fresh. Lia likes apples.',
  idioma: 'en',
}

const ajuste = (extra: Partial<AjusteDeNivel> = {}): AjusteDeNivel => ({
  ajustado: 'The market is big. The fruit is new.',
  nivelMedido: 'A2',
  confianciaDaMedida: 'alta',
  conhecidasTrocadas: [],
  foraDoNivel: false,
  reescrito: false,
  custo: { tokensEntrada: 600, tokensSaida: 250, usd: 0.00012, chamadas: 1 },
  ...extra,
})

const props = { idiomaDaPessoa: 'pt-BR' }

beforeEach(() => {
  flag = true
  plano = 'plus'
  definirIdentidade('conta')
  ajustarComCache.mockReset()
  ajustarCapitulo.mockReset()
  ajustarComCache.mockResolvedValue({ ok: true, valor: ajuste(), doCache: false })
})
afterEach(() => {
  act(() => fecharAjustarNivel())
  cleanup()
  _reiniciarIdentidade()
})

describe('PainelAjustarNivel', () => {
  it('flag desligada: nenhuma entrada aparece e nenhuma rota é chamada', async () => {
    flag = false
    render(<PainelAjustarNivel {...props} />)
    act(() => abrirAjustarNivel(TRECHO, 'paragrafo'))
    expect(screen.queryByTestId('painel-ajustar-nivel')).toBeNull()
    await Promise.resolve()
    expect(ajustarComCache).not.toHaveBeenCalled()
  })

  it('plano sem a capacidade: mostra o motivo e não chama a rede', async () => {
    plano = 'free'
    render(<PainelAjustarNivel {...props} />)
    act(() => abrirAjustarNivel(TRECHO, 'paragrafo'))
    expect(screen.getByTestId('ajn-motivo').textContent).toMatch(/planos pagos/)
    await Promise.resolve()
    expect(ajustarComCache).not.toHaveBeenCalled()
    for (const botao of screen.getAllByRole('radio')) expect((botao as HTMLButtonElement).disabled).toBe(true)
  })

  it('abre pedindo o nível do balão, com o original ao lado do ajustado, o nível MEDIDO e o custo', async () => {
    render(<PainelAjustarNivel {...props} />)
    act(() => abrirAjustarNivel(TRECHO, 'paragrafo', 'A2'))
    await waitFor(() =>
      expect(screen.getByTestId('ajn-ajustado').textContent).toBe('The market is big. The fruit is new.'),
    )
    expect(ajustarComCache).toHaveBeenCalledTimes(1)
    const pedido = ajustarComCache.mock.calls[0][0]
    expect(pedido).toMatchObject({ escopo: 'paragrafo', nivelAlvo: 'A2', idioma: 'en', idiomaDaPessoa: 'pt-BR' })
    expect(pedido.texto).toBe(TRECHO.paragrafo)
    expect(screen.getByTestId('ajn-original').textContent).toBe(TRECHO.paragrafo)
    /* medido, não prometido */
    expect(screen.getByTestId('ajn-medida').textContent).toMatch(/cerca de A2 \(estimativa\)/)
    expect(screen.getByTestId('ajn-custo').textContent).toMatch(/850 tokens/)
    expect(screen.getByTestId('ajn-custo').textContent).toMatch(/US\$ 0\.00012/)
  })

  it('Simplificar e Elevar pedem um nível abaixo e um acima; nas pontas o botão fica desligado', async () => {
    render(<PainelAjustarNivel {...props} />)
    act(() => abrirAjustarNivel(TRECHO, 'trecho', 'B2'))
    await waitFor(() => expect(ajustarComCache).toHaveBeenCalledTimes(1))
    await act(async () => fireEvent.click(screen.getByTestId('ajn-acao-simplificar')))
    expect(ajustarComCache.mock.calls[1][0].nivelAlvo).toBe('B1')
    await act(async () => fireEvent.click(screen.getByTestId('ajn-acao-elevar')))
    expect(ajustarComCache.mock.calls[2][0].nivelAlvo).toBe('B2')
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'A1' })))
    expect((screen.getByTestId('ajn-acao-simplificar') as HTMLButtonElement).disabled).toBe(true)
  })

  it('a palavra vai com a frase em volta', async () => {
    render(<PainelAjustarNivel {...props} />)
    act(() => abrirAjustarNivel({ ...TRECHO, texto: 'fresh' }, 'palavra', 'A2'))
    await waitFor(() => expect(ajustarComCache).toHaveBeenCalled())
    expect(ajustarComCache.mock.calls[0][0]).toMatchObject({ escopo: 'palavra', texto: 'fresh', frase: TRECHO.frase })
  })

  it('palavra conhecida que o modelo trocou: o painel avisa; fora do nível também', async () => {
    ajustarComCache.mockResolvedValue({
      ok: true,
      valor: ajuste({ conhecidasTrocadas: ['market'], foraDoNivel: true }),
      doCache: false,
    })
    render(<PainelAjustarNivel {...props} />)
    act(() => abrirAjustarNivel(TRECHO, 'paragrafo', 'A2'))
    await waitFor(() => expect(screen.getByTestId('ajn-trocadas').textContent).toMatch(/market/))
    expect(screen.getByText(/Pode ter ficado fora do nível A2/)).toBeTruthy()
  })

  it('nível não medido (idioma sem lista): não afirma nenhum nível', async () => {
    ajustarComCache.mockResolvedValue({
      ok: true,
      valor: ajuste({ nivelMedido: null, confianciaDaMedida: 'baixa' }),
      doCache: false,
    })
    render(<PainelAjustarNivel {...props} />)
    act(() => abrirAjustarNivel({ ...TRECHO, idioma: 'es' }, 'paragrafo', 'A2'))
    await waitFor(() => expect(screen.getByTestId('ajn-medida').textContent).toMatch(/não medido/))
  })

  it('do aparelho: avisa que não custou nada', async () => {
    ajustarComCache.mockResolvedValue({ ok: true, valor: ajuste(), doCache: true })
    render(<PainelAjustarNivel {...props} />)
    act(() => abrirAjustarNivel(TRECHO, 'paragrafo', 'A2'))
    await waitFor(() => expect(screen.getByText(/Guardado neste aparelho/)).toBeTruthy())
    expect(screen.queryByTestId('ajn-custo')).toBeNull()
  })

  it('saída barrada (perfil protegido): diz o motivo, mantém o original e NÃO mostra texto ajustado', async () => {
    ajustarComCache.mockResolvedValue({ ok: false, motivo: 'filtrada', status: 502 })
    render(<PainelAjustarNivel {...props} />)
    act(() => abrirAjustarNivel(TRECHO, 'paragrafo', 'A2'))
    await waitFor(() => expect(screen.getByTestId('ajn-erro').textContent).toMatch(/O original continua aqui/))
    expect(screen.getByTestId('ajn-original').textContent).toBe(TRECHO.paragrafo)
    expect(screen.queryByTestId('ajn-ajustado')).toBeNull()
  })

  it('cota esgotada: diz a janela e desliga os botões (sem nova chamada)', async () => {
    ajustarComCache.mockResolvedValue({ ok: false, motivo: 'cota', status: 429 })
    render(<PainelAjustarNivel {...props} />)
    act(() => abrirAjustarNivel(TRECHO, 'paragrafo', 'A2'))
    await waitFor(() => expect(screen.getByTestId('ajn-motivo').textContent).toMatch(/Você usou as deste mês/))
    expect((screen.getByTestId('ajn-acao-exemplo') as HTMLButtonElement).disabled).toBe(true)
    expect(ajustarComCache).toHaveBeenCalledTimes(1)
  })

  it('"Dar um exemplo", "Explicar a gramática" e "Resumo até aqui" passam a ação e mostram o resultado com o custo', async () => {
    render(<PainelAjustarNivel {...props} textoAteAqui={() => 'Chapter so far.'} />)
    act(() => abrirAjustarNivel(TRECHO, 'trecho', 'B1'))
    await waitFor(() => expect(ajustarComCache).toHaveBeenCalledTimes(1))
    ajustarComCache.mockResolvedValue({ ok: true, valor: ajuste({ ajustado: 'Texto extra.' }), doCache: false })
    await act(async () => fireEvent.click(screen.getByTestId('ajn-acao-gramatica')))
    expect(ajustarComCache.mock.calls[1][0]).toMatchObject({ acao: 'gramatica', idiomaDaPessoa: 'pt-BR' })
    expect(screen.getByTestId('ajn-extra').textContent).toMatch(/Gramática/)
    await act(async () => fireEvent.click(screen.getByTestId('ajn-acao-resumo')))
    expect(ajustarComCache.mock.calls[2][0]).toMatchObject({ acao: 'resumo', texto: 'Chapter so far.' })
    await act(async () => fireEvent.click(screen.getByTestId('ajn-acao-exemplo')))
    expect(ajustarComCache.mock.calls[3][0]).toMatchObject({ acao: 'exemplo' })
  })

  it('no celular o original e o ajustado são abas', async () => {
    render(<PainelAjustarNivel {...props} />)
    act(() => abrirAjustarNivel(TRECHO, 'paragrafo', 'A2'))
    await waitFor(() => expect(screen.getByTestId('ajn-ajustado')).toBeTruthy())
    const abas = screen.getAllByRole('tab')
    expect(abas).toHaveLength(2)
    expect(abas[1].getAttribute('aria-selected')).toBe('true')
    fireEvent.click(abas[0])
    expect(abas[0].getAttribute('aria-selected')).toBe('true')
    expect(document.querySelector('.ajn-colunas')?.getAttribute('data-aba')).toBe('original')
  })
})

describe('PainelAjustarNivel: capítulo', () => {
  const paragrafos = ['One paragraph here.', 'Another paragraph there.', 'A third paragraph too.']

  it('não pede nada ao abrir: mostra a estimativa e espera a confirmação', async () => {
    render(<PainelAjustarNivel {...props} paragrafosDoCapitulo={() => paragrafos} />)
    act(() => abrirAjustarNivel(TRECHO, 'capitulo', 'B1'))
    expect(screen.getByTestId('ajn-confirma')).toBeTruthy()
    expect(screen.getByTestId('ajn-estimativa').textContent).toMatch(/Estimativa: de US\$/)
    expect(screen.getByText(/ajustar 3 parágrafos para o nível B1/)).toBeTruthy()
    expect(ajustarCapitulo).not.toHaveBeenCalled()
    expect(ajustarComCache).not.toHaveBeenCalled()
  })

  it('confirmar ajusta o capítulo, com o custo real somado', async () => {
    ajustarCapitulo.mockResolvedValue({
      ajustados: paragrafos.map((p) => ajuste({ ajustado: `ajustado ${p}` })),
      situacao: 'completo',
      custo: { tokensEntrada: 1800, tokensSaida: 750, usd: 0.00036, chamadas: 3 },
      doCache: 0,
    })
    render(<PainelAjustarNivel {...props} paragrafosDoCapitulo={() => paragrafos} />)
    act(() => abrirAjustarNivel(TRECHO, 'capitulo', 'B1'))
    await act(async () => fireEvent.click(screen.getByText('Ajustar o capítulo')))
    await waitFor(() => expect(screen.getByText(/Pronto: 3 parágrafos ajustados/)).toBeTruthy())
    expect(ajustarCapitulo.mock.calls[0][0]).toMatchObject({ alvo: 'B1', idioma: 'en' })
    expect(screen.getByTestId('ajn-custo').textContent).toMatch(/2550 tokens/)
  })

  it('cancelar no meio: os feitos ficam e o painel diz quantos', async () => {
    ajustarCapitulo.mockImplementation(
      async (p: { sinal: AbortSignal; aoProgresso: (a: unknown, b: unknown) => void }) => {
        p.aoProgresso({ feitos: 1, total: 3 }, [ajuste(), null, null])
        return {
          ajustados: [ajuste(), null, null],
          situacao: 'cancelado',
          custo: { tokensEntrada: 600, tokensSaida: 250, usd: 0.00012, chamadas: 1 },
          doCache: 0,
        }
      },
    )
    render(<PainelAjustarNivel {...props} paragrafosDoCapitulo={() => paragrafos} />)
    act(() => abrirAjustarNivel(TRECHO, 'capitulo', 'B1'))
    await act(async () => fireEvent.click(screen.getByText('Ajustar o capítulo')))
    await waitFor(() => expect(screen.getByText(/Cancelado\. Os 1 parágrafos já feitos ficam aqui/)).toBeTruthy())
  })

  it('cota do capítulo esgotada: diz o motivo do capítulo', async () => {
    ajustarCapitulo.mockResolvedValue({
      ajustados: [null, null, null],
      situacao: 'erro',
      motivo: 'cota',
      custo: { tokensEntrada: 0, tokensSaida: 0, usd: 0, chamadas: 0 },
      doCache: 0,
    })
    render(<PainelAjustarNivel {...props} paragrafosDoCapitulo={() => paragrafos} />)
    act(() => abrirAjustarNivel(TRECHO, 'capitulo', 'B1'))
    await act(async () => fireEvent.click(screen.getByText('Ajustar o capítulo')))
    await waitFor(() => expect(screen.getByTestId('ajn-erro').textContent).toMatch(/ajustes de capítulo/))
  })
})
