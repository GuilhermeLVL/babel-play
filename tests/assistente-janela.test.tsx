// @vitest-environment jsdom
/**
 * O ASSISTENTE AO VIVO NA JANELA (Fase C2): o hook (`useAssistenteAoVivo`) com o cliente da API simulado — o orçamento
 * de chamadas de verdade (só linha final, com espera, uma por linha, cache, nada pausado ou fechado), o portão (flag,
 * Grátis, recusa do servidor) e o "Como respondo?" com a espera honesta — e a janela (`LegendasFlutuantes`) pintando o
 * que ele dá: marcas silenciosas, cartão com o sentido, a faixa mínima, Alt+R, a folha com as sugestões e as recusas
 * sem oferta para o perfil protegido.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  flag: true,
  plano: 'plus',
  consentiu: true,
  protegido: false,
}))

vi.mock('../src/lib/flags', () => ({ useFlag: () => estado.flag }))
const plano = vi.hoisted(() => ({ ouvintes: new Set<() => void>() }))
vi.mock('../src/lib/entitlements', () => ({
  getEntitlements: () => ({ plan: estado.plano }),
  onPlanChange: (cb: () => void) => {
    plano.ouvintes.add(cb)
    return () => plano.ouvintes.delete(cb)
  },
}))
vi.mock('../src/lib/consentimentoDeNuvem', () => ({
  useConsentimentoDeNuvem: () => ({ consentiu: estado.consentiu, autorizar: vi.fn(async () => true) }),
}))
vi.mock('../src/lib/protecaoDoMenor', () => ({ perfilProtegido: () => estado.protegido }))
vi.mock('../src/data/api', () => ({
  fetchSettings: vi.fn(async () => null),
  patchUiSettings: vi.fn(async () => {}),
}))

const api = vi.hoisted(() => ({
  destacarExpressoes: vi.fn(),
  explicarTermos: vi.fn(),
  comoRespondo: vi.fn(),
  corrigirMinhaFala: vi.fn(),
}))
vi.mock('../src/data/apiDoAssistente', () => api)
vi.mock('../src/lib/estilosDeLegenda', async (original) => {
  const m = await original<typeof import('../src/lib/estilosDeLegenda')>()
  return { ...m, pedacosDaLegenda: vi.fn(m.pedacosDaLegenda) }
})

import type { AssistenteDaJanela } from '../src/components/views/captura/assistente/useAssistenteAoVivo'
import {
  COMO_RESPONDO_LENTO_MS,
  RECUO_DO_ASSISTENTE_MS,
  useAssistenteAoVivo,
} from '../src/components/views/captura/assistente/useAssistenteAoVivo'
import LegendasFlutuantes, { type LegendaAoVivo } from '../src/components/views/captura/LegendasFlutuantes'
import { ESPERA_DO_ASSISTENTE_MS } from '../src/lib/assistente/agendaDoAssistente'
import { pedacosDaLegenda } from '../src/lib/estilosDeLegenda'
import { estabilizarFalas } from '../src/lib/legendas/estabilizarFalas'

const noop = () => {}
import AbaDoAssistente from '../src/components/views/captura/assistente/AbaDoAssistente'
import { esquecerAjustesDoAssistente, mudarAjustesDoAssistente } from '../src/lib/assistente/ajustesDoAssistente'
import { esquecerAvisoDoIdiomaDispensado } from '../src/lib/assistente/avisoDoIdioma'

const fala = (id: string, original: string, extra: Partial<LegendaAoVivo> = {}): LegendaAoVivo => ({
  id,
  quem: 'Outros',
  original,
  traducao: '',
  lado: 'eles',
  lang: 'en',
  ...extra,
})

const okExpressoes = (trecho: string, sentido: string) => ({
  ok: true,
  valor: { expressoes: [{ trecho, sentido, tipo: 'idiomatica' }], restanteHoje: 199 },
})

/** Deixa a espera da agenda passar e as promessas do cliente resolverem. */
async function passar(ms = ESPERA_DO_ASSISTENTE_MS) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  /* O `import()` do cliente resolve numa volta a mais da fila. */
  await act(async () => {
    await vi.dynamicImportSettled()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  esquecerAjustesDoAssistente()
  esquecerAvisoDoIdiomaDispensado()
  Object.assign(estado, { flag: true, plano: 'plus', consentiu: true, protegido: false })
  for (const f of Object.values(api)) f.mockReset()
  api.destacarExpressoes.mockResolvedValue(okExpressoes('break a leg', 'boa sorte'))
  api.explicarTermos.mockResolvedValue({ ok: true, valor: { termos: [{ termo: 'KPI', explicacao: 'indicador' }] } })
  api.corrigirMinhaFala.mockResolvedValue({
    ok: true,
    valor: { correcao: { ok: false, corrigida: 'I went to the store.', dica: 'Passado de go: went.' } },
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

type Opcoes = Parameters<typeof useAssistenteAoVivo>[0]
const montarHook = (inicial: Partial<Opcoes> = {}) =>
  renderHook((p: Opcoes) => useAssistenteAoVivo(p), {
    initialProps: { aberta: true, pausado: false, falas: [], langDaPessoa: 'pt-BR', ...inicial },
  })

describe('o orçamento de chamadas do hook', () => {
  it('linha final: UMA chamada de expressões depois da espera; parcial não chama', async () => {
    const h = montarHook()
    h.rerender({
      aberta: true,
      pausado: false,
      langDaPessoa: 'pt-BR',
      falas: [fala('1', 'You will do great, break a leg', { parcial: true })],
    })
    await passar(ESPERA_DO_ASSISTENTE_MS * 3)
    expect(api.destacarExpressoes).not.toHaveBeenCalled()

    const final = [fala('1', 'You will do great, break a leg')]
    h.rerender({ aberta: true, pausado: false, langDaPessoa: 'pt-BR', falas: final })
    await passar(ESPERA_DO_ASSISTENTE_MS - 50)
    expect(api.destacarExpressoes).not.toHaveBeenCalled()
    await passar(50)
    expect(api.destacarExpressoes).toHaveBeenCalledTimes(1)
    expect(api.destacarExpressoes).toHaveBeenCalledWith({
      frase: 'You will do great, break a leg',
      lang: 'en',
      langDaPessoa: 'pt-BR',
    })
    /* Sem sigla, a rota de termos nem é chamada. */
    expect(api.explicarTermos).not.toHaveBeenCalled()
    expect(h.result.current.janela.marcas.get('1')?.map((m) => m.tipo)).toContain('expressao')

    /* A mesma linha de novo (re-render, nova lista): nada. */
    h.rerender({ aberta: true, pausado: false, langDaPessoa: 'pt-BR', falas: [...final] })
    await passar(ESPERA_DO_ASSISTENTE_MS * 3)
    expect(api.destacarExpressoes).toHaveBeenCalledTimes(1)
  })

  it('pausada ou fechada: nada sai; ao voltar, a linha que esperava é pedida', async () => {
    const falas = [fala('1', 'Our KPI went up a lot this quarter')]
    const h = montarHook({ pausado: true, falas })
    await passar(ESPERA_DO_ASSISTENTE_MS * 4)
    expect(api.destacarExpressoes).not.toHaveBeenCalled()
    h.rerender({ aberta: false, pausado: false, langDaPessoa: 'pt-BR', falas })
    await passar(ESPERA_DO_ASSISTENTE_MS * 4)
    expect(api.destacarExpressoes).not.toHaveBeenCalled()
    h.rerender({ aberta: true, pausado: false, langDaPessoa: 'pt-BR', falas })
    await passar()
    expect(api.destacarExpressoes).toHaveBeenCalledTimes(1)
    expect(api.explicarTermos).toHaveBeenCalledWith(expect.objectContaining({ termos: ['KPI'] }))
  })

  it('fala no idioma da própria pessoa: nada', async () => {
    montarHook({ falas: [fala('1', 'Hoje a reunião foi muito longa mesmo', { lang: 'pt' })] })
    await passar(ESPERA_DO_ASSISTENTE_MS * 2)
    expect(api.destacarExpressoes).not.toHaveBeenCalled()
  })

  it('flag desligada ou Grátis: nenhuma chamada, nenhum botão; as palavras acima do nível continuam', async () => {
    for (const ctx of [{ flag: false }, { plano: 'free' }]) {
      Object.assign(estado, { flag: true, plano: 'plus' }, ctx)
      const h = montarHook({ falas: [fala('1', 'The answer was ambiguous, so they scrutinize it')] })
      await passar(ESPERA_DO_ASSISTENTE_MS * 2)
      expect(api.destacarExpressoes).not.toHaveBeenCalled()
      expect(h.result.current.recursos.comoRespondo).toBe(false)
      expect(h.result.current.recursos.niveis).toBe(true)
      expect(h.result.current.janela.marcas.get('1')?.every((m) => m.tipo === 'nivel')).toBe(true)
      expect(h.result.current.janela.marcas.get('1')?.length).toBeGreaterThan(0)
      h.unmount()
    }
  })

  it('o servidor diz sem_plano: os recursos pagos somem na sessão (o cache do cliente era velho)', async () => {
    api.destacarExpressoes.mockResolvedValue({ ok: false, motivo: 'sem_plano', status: 402 })
    const h = montarHook({ falas: [fala('1', 'You will do great, break a leg')] })
    expect(h.result.current.recursos.comoRespondo).toBe(true)
    await passar()
    expect(h.result.current.recursos.comoRespondo).toBe(false)
    expect(h.result.current.recursos.expressoes).toBe(false)
  })

  it('cota do dia esgotada: as automáticas param (sem aviso na legenda) e a aba sabe por quê', async () => {
    api.destacarExpressoes.mockResolvedValue({ ok: false, motivo: 'uso_justo', status: 429 })
    const h = montarHook({ falas: [fala('1', 'You will do great, break a leg')] })
    await passar()
    expect(h.result.current.paradoPorCota).toBe('uso_justo')
    h.rerender({
      aberta: true,
      pausado: false,
      langDaPessoa: 'pt-BR',
      falas: [fala('1', 'You will do great, break a leg'), fala('2', 'That was a piece of cake for us')],
    })
    await passar(ESPERA_DO_ASSISTENTE_MS * 2)
    expect(api.destacarExpressoes).toHaveBeenCalledTimes(1)
  })

  it('correção: só da própria fala, só com o opt-in', async () => {
    const minha = [fala('1', 'I goed to the store yesterday', { lado: 'voce', quem: 'Você' })]
    const h = montarHook({ falas: minha })
    await passar()
    expect(api.corrigirMinhaFala).not.toHaveBeenCalled()
    h.unmount()
    api.destacarExpressoes.mockClear()
    act(() => mudarAjustesDoAssistente({ correcao: true }))
    const h2 = montarHook({ falas: minha })
    await passar()
    expect(api.corrigirMinhaFala).toHaveBeenCalledTimes(1)
    expect(api.destacarExpressoes).not.toHaveBeenCalled()
    expect(h2.result.current.janela.correcoes.get('1')?.corrigida).toBe('I went to the store.')
  })
})

describe('no StrictMode (o modo de dev)', () => {
  it('a agenda sobrevive à montagem dupla dos efeitos e chama', async () => {
    renderHook((p: Opcoes) => useAssistenteAoVivo(p), {
      wrapper: React.StrictMode,
      initialProps: {
        aberta: true,
        pausado: false,
        langDaPessoa: 'pt-BR',
        falas: [fala('1', 'You will do great, break a leg')],
      },
    })
    await passar()
    expect(api.destacarExpressoes).toHaveBeenCalledTimes(1)
  })
})

describe('portão e recuo no hook', () => {
  it('consentimento negado: nenhuma chamada automática', async () => {
    estado.consentiu = false
    const h = montarHook({ falas: [fala('1', 'Our KPI went up, break a leg team')] })
    await passar(ESPERA_DO_ASSISTENTE_MS * 3)
    expect(api.destacarExpressoes).not.toHaveBeenCalled()
    expect(api.explicarTermos).not.toHaveBeenCalled()
    expect(h.result.current.recursos.comoRespondo).toBe(true)
  })

  it('o plano muda (evento dos entitlements): os recursos acompanham sem remontar', async () => {
    estado.plano = 'free'
    const h = montarHook()
    expect(h.result.current.recursos.comoRespondo).toBe(false)
    estado.plano = 'plus'
    act(() => plano.ouvintes.forEach((f) => f()))
    expect(h.result.current.recursos.comoRespondo).toBe(true)
  })

  it('sem_conta (401): a sessão fica recusada', async () => {
    api.destacarExpressoes.mockResolvedValue({ ok: false, motivo: 'sem_conta', status: 401 })
    const h = montarHook({ falas: [fala('1', 'You will do great, break a leg')] })
    await passar()
    expect(h.result.current.recursos.nuvem).toBe(false)
    expect(h.result.current.recursos.comoRespondo).toBe(false)
  })

  it('indisponível: as automáticas recuam 60 s e depois voltam', async () => {
    api.destacarExpressoes.mockResolvedValueOnce({ ok: false, motivo: 'indisponivel', status: 502 })
    const h = montarHook({ falas: [fala('1', 'You will do great, break a leg')] })
    await passar()
    expect(api.destacarExpressoes).toHaveBeenCalledTimes(1)
    const duas = [fala('1', 'You will do great, break a leg'), fala('2', 'That was a piece of cake for us')]
    h.rerender({ aberta: true, pausado: false, langDaPessoa: 'pt-BR', falas: duas })
    await passar(ESPERA_DO_ASSISTENTE_MS * 3)
    expect(api.destacarExpressoes).toHaveBeenCalledTimes(1)
    /* Passado o recuo, a linha que esperava é pedida. */
    await passar(RECUO_DO_ASSISTENTE_MS)
    await passar()
    expect(api.destacarExpressoes).toHaveBeenCalledTimes(2)
    expect(api.destacarExpressoes).toHaveBeenLastCalledWith(
      expect.objectContaining({ frase: 'That was a piece of cake for us' }),
    )
  })

  it('ligar um recurso depois NÃO manda a linha velha à nuvem; só a próxima', async () => {
    estado.consentiu = false
    const velha = [fala('1', 'You will do great, break a leg')]
    const h = montarHook({ falas: velha })
    await passar(ESPERA_DO_ASSISTENTE_MS * 2)
    estado.consentiu = true
    h.rerender({ aberta: true, pausado: false, langDaPessoa: 'pt-BR', falas: [...velha] })
    await passar(ESPERA_DO_ASSISTENTE_MS * 3)
    expect(api.destacarExpressoes).not.toHaveBeenCalled()
    h.rerender({
      aberta: true,
      pausado: false,
      langDaPessoa: 'pt-BR',
      falas: [...velha, fala('2', 'That was a piece of cake for us')],
    })
    await passar()
    expect(api.destacarExpressoes).toHaveBeenCalledTimes(1)
  })

  it('as marcas de uma linha que não mudou são O MESMO array quando outra linha cresce', async () => {
    const h = montarHook({
      falas: [fala('1', 'The answer was ambiguous, so they scrutinize it'), fala('2', 'Hel', { parcial: true })],
    })
    const antes = h.result.current.janela.marcas.get('1')
    expect(antes?.length).toBeGreaterThan(0)
    h.rerender({
      aberta: true,
      pausado: false,
      langDaPessoa: 'pt-BR',
      falas: [fala('1', 'The answer was ambiguous, so they scrutinize it'), fala('2', 'Hello wor', { parcial: true })],
    })
    expect(h.result.current.janela.marcas.get('1')).toBe(antes)
  })
})

describe('"Como respondo?" no hook', () => {
  it('responde à última fala do outro lado, com contexto; diz quando demora', async () => {
    let resolver: (v: unknown) => void = () => {}
    api.comoRespondo.mockReturnValue(new Promise((r) => (resolver = r)))
    const falas = [
      fala('1', 'Hi there.'),
      fala('2', 'How was your weekend?'),
      fala('3', 'Pretty good.', { lado: 'voce' }),
    ]
    const h = montarHook({ falas })
    await act(async () => h.result.current.janela.pedirComoRespondo())
    await act(async () => {
      await vi.dynamicImportSettled()
    })
    expect(h.result.current.janela.comoRespondo).toMatchObject({ estado: 'carregando', lento: false, falaId: '2' })
    expect(api.comoRespondo).toHaveBeenCalledWith({
      frase: 'How was your weekend?',
      contexto: ['Hi there.'],
      lang: 'en',
      langDaPessoa: 'pt-BR',
    })
    await act(async () => {
      vi.advanceTimersByTime(COMO_RESPONDO_LENTO_MS)
    })
    expect(h.result.current.janela.comoRespondo).toMatchObject({ estado: 'carregando', lento: true })
    await act(async () => {
      resolver({
        ok: true,
        valor: {
          sugestoes: [
            { texto: 'It was great!', traducao: 'Foi ótimo!', tom: 'informal' },
            { texto: 'Quite relaxing.', traducao: 'Bem tranquilo.', tom: 'neutro' },
          ],
        },
      })
    })
    expect(h.result.current.janela.comoRespondo).toMatchObject({ estado: 'ok' })
  })

  it('perfil protegido: o contexto nem sai do aparelho', async () => {
    estado.protegido = true
    api.comoRespondo.mockResolvedValue({ ok: false, motivo: 'indisponivel', status: 502 })
    const h = montarHook({ falas: [fala('1', 'Hi there.'), fala('2', 'How are you?')] })
    await act(async () => h.result.current.janela.pedirComoRespondo())
    await act(async () => {
      await vi.dynamicImportSettled()
    })
    expect(api.comoRespondo).toHaveBeenCalledWith(expect.objectContaining({ contexto: undefined }))
  })

  it('sem o consentimento: a folha pede o sim antes de qualquer chamada', async () => {
    estado.consentiu = false
    const h = montarHook({ falas: [fala('1', 'How are you?')] })
    act(() => h.result.current.janela.pedirComoRespondo())
    expect(h.result.current.janela.comoRespondo.estado).toBe('consentimento')
    expect(api.comoRespondo).not.toHaveBeenCalled()
  })
})

/* ─────────────────────────────── a janela ─────────────────────────────── */

const vazio = new Map()
function assistente(extra: Partial<AssistenteDaJanela> = {}): AssistenteDaJanela {
  return {
    recursos: {
      nuvem: true,
      niveis: true,
      expressoes: true,
      termos: true,
      comoRespondo: true,
      correcao: true,
      algum: true,
    },
    protegido: false,
    marcas: vazio,
    correcoes: vazio,
    comoRespondo: { estado: 'fechado' },
    pedirComoRespondo: vi.fn(),
    fecharComoRespondo: vi.fn(),
    autorizarEPedir: vi.fn(),
    ...extra,
  }
}

function tamanhoDaJanela(largura: number, altura: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: largura })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: altura })
  act(() => void window.dispatchEvent(new Event('resize')))
}

const LINHA = 'Break a leg at the KPI review.'
const MARCAS = new Map([
  [
    '1',
    [
      { inicio: 0, fim: 11, tipo: 'expressao' as const, texto: 'Break a leg', sentido: 'boa sorte' },
      { inicio: 19, fim: 22, tipo: 'termo' as const, texto: 'KPI', sentido: 'indicador de desempenho' },
      { inicio: 23, fim: 29, tipo: 'nivel' as const, texto: 'review', nivel: 'B2' as const, escala: 'cefr' as const },
    ],
  ],
])

const montarJanela = (a: AssistenteDaJanela, formato: 'faixa' | 'legenda' | 'conversa' | 'estudo' = 'legenda') => {
  const tam = { faixa: [720, 110], legenda: [600, 170], conversa: [400, 460], estudo: [440, 380] }[formato]
  tamanhoDaJanela(tam[0], tam[1])
  return render(
    <LegendasFlutuantes
      naJanela
      formatoInicial={formato}
      falas={[fala('1', LINHA)]}
      aoFechar={vi.fn()}
      aoConsultarPalavra={vi.fn(async () => ({ traducao: 'revisão' }))}
      aoSalvarPalavra={vi.fn(async () => 'Salva no vocabulário')}
      aoOuvir={vi.fn()}
      assistente={a}
    />,
  )
}

describe('a linha que não mudou não é repintada (o memo segura)', () => {
  it('a parcial de outra linha crescendo não repinta a linha com marcas', async () => {
    const pintadas = vi.mocked(pedacosDaLegenda)
    const LINHA1 = 'The answer was ambiguous, so they scrutinize it'
    /* A fala que não mudou é o MESMO objeto (`estabilizarFalas`, como na captura). */
    const anteriores = new Map<string, LegendaAoVivo>()
    function Janela({ parcial }: { parcial: string }) {
      const falas = React.useMemo(
        () => estabilizarFalas(anteriores, [fala('1', LINHA1), fala('2', parcial, { parcial: true })]),
        [parcial],
      )
      const { janela } = useAssistenteAoVivo({ aberta: true, pausado: false, falas, langDaPessoa: 'pt-BR' })
      return <LegendasFlutuantes falas={falas} aoFechar={noop} assistente={janela} />
    }
    const r = render(<Janela parcial="Hel" />)
    await passar(5000)
    expect(document.querySelector('.leg-marca')).toBeTruthy()
    const vezes = () => pintadas.mock.calls.filter((c) => c[0] === LINHA1).length
    const antes = vezes()
    r.rerender(<Janela parcial="Hello wor" />)
    r.rerender(<Janela parcial="Hello world, how" />)
    expect(vezes()).toBe(antes)
  })
})

describe('estabilizarFalas', () => {
  it('a fala igual continua o mesmo objeto; a que mudou é nova', () => {
    const m = new Map<string, LegendaAoVivo>()
    const [a1, b1] = estabilizarFalas(m, [fala('1', 'A'), fala('2', 'B', { parcial: true })])
    const [a2, b2] = estabilizarFalas(m, [fala('1', 'A'), fala('2', 'Bc', { parcial: true })])
    expect(a2).toBe(a1)
    expect(b2).not.toBe(b1)
  })
})

describe('a janela avisa quando para (oculto, recolhido)', () => {
  it('recolher e esconder chegam em aoMudarPausa', () => {
    const aoMudarPausa = vi.fn()
    tamanhoDaJanela(600, 170)
    render(
      <LegendasFlutuantes
        naJanela
        formatoInicial="legenda"
        falas={[fala('1', LINHA)]}
        aoFechar={vi.fn()}
        assistente={assistente()}
        aoMudarPausa={aoMudarPausa}
      />,
    )
    expect(aoMudarPausa).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: 'Recolher' }))
    expect(aoMudarPausa).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: 'Expandir' }))
    expect(aoMudarPausa).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Esconder a legenda' }))
    expect(aoMudarPausa).toHaveBeenLastCalledWith(true)
  })
})

describe('a janela pinta o assistente', () => {
  it('fechar a folha devolve o foco ao botão "Como respondo?"', () => {
    tamanhoDaJanela(600, 170)
    const props = {
      naJanela: true,
      formatoInicial: 'legenda' as const,
      falas: [fala('1', LINHA)],
      aoFechar: vi.fn(),
    }
    const r = render(
      <LegendasFlutuantes
        {...props}
        assistente={assistente({ comoRespondo: { estado: 'erro', falaId: '1', frase: LINHA, motivo: 'indisponivel' } })}
      />,
    )
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Fechar as sugestões')
    r.rerender(<LegendasFlutuantes {...props} assistente={assistente()} />)
    expect(document.activeElement?.classList.contains('leg-responder')).toBe(true)
  })

  it('marcas silenciosas: sublinhado com o sentido no title, alcançáveis pelo teclado, fora do anúncio', () => {
    montarJanela(assistente({ marcas: MARCAS }))
    const marcas = [...document.querySelectorAll<HTMLElement>('.leg-marca')]
    expect(marcas.map((m) => [m.dataset.marca, m.textContent])).toEqual([
      ['expressao', 'Break a leg'],
      ['termo', 'KPI'],
      ['nivel', 'review'],
    ])
    expect(marcas[0].title).toBe('Break a leg: boa sorte')
    /* Roving: só a primeira marca entra no Tab; as setas andam entre elas. */
    expect(marcas.map((m) => m.tabIndex)).toEqual([0, -1, -1])
    marcas[0].focus()
    fireEvent.keyDown(marcas[0], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(marcas[1])
    fireEvent.keyDown(marcas[1], { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(marcas[0])
    /* As palavras continuam tocáveis por dentro da marca. */
    expect(marcas[0].querySelectorAll('[data-palavra]')).toHaveLength(3)
    /* O anúncio ao leitor de tela é só o texto da fala, sem os destaques. */
    expect(document.querySelector('.leg-anuncio')?.textContent).not.toMatch(/boa sorte|indicador/)
    expect(document.querySelectorAll('[aria-live]').length).toBeLessThanOrEqual(2)
  })

  it('tocar (ou Enter) numa expressão abre o cartão com o sentido, sem consultar o dicionário', () => {
    const consultar = vi.fn(async () => ({ traducao: 'x' }))
    tamanhoDaJanela(600, 170)
    render(
      <LegendasFlutuantes
        naJanela
        formatoInicial="legenda"
        falas={[fala('1', LINHA)]}
        aoFechar={vi.fn()}
        aoConsultarPalavra={consultar}
        assistente={assistente({ marcas: MARCAS })}
      />,
    )
    const marca = document.querySelector<HTMLElement>('.leg-marca[data-marca="expressao"]')!
    fireEvent.keyDown(marca, { key: 'Enter' })
    const cartao = screen.getByRole('dialog', { name: 'Palavra: Break a leg' })
    expect(cartao.textContent).toContain('boa sorte')
    expect(cartao.textContent).toContain('Expressão')
    expect(consultar).not.toHaveBeenCalled()
  })

  it('a palavra acima do nível abre o cartão com o nível e a glosa do dicionário', () => {
    montarJanela(assistente({ marcas: MARCAS }))
    fireEvent.click(document.querySelector('.leg-marca[data-marca="nivel"]')!)
    const cartao = screen.getByRole('dialog', { name: 'Palavra: review' })
    expect(cartao.textContent).toContain('Acima do seu nível · B2')
  })

  it('FAIXA mínima: só as marcas (sutis, sem as de nível), sem botão "Como respondo?" e sem correção', () => {
    const correcoes = new Map([['1', { ok: false, corrigida: 'Fixed.', dica: 'dica' }]])
    const a = assistente({ marcas: MARCAS, correcoes })
    montarJanela(a, 'faixa')
    expect(document.getElementById('leg-flut')?.dataset.layout).toBe('faixa')
    expect(document.querySelector('.leg-fala.marcas-sutis')).toBeTruthy()
    expect([...document.querySelectorAll<HTMLElement>('.leg-marca')].map((m) => m.dataset.marca)).toEqual([
      'expressao',
      'termo',
    ])
    expect(screen.queryByRole('button', { name: /Como respondo/ })).toBeNull()
    expect(document.querySelector('.leg-correcao')).toBeNull()
    fireEvent.keyDown(document, { key: 'r', code: 'KeyR', altKey: true })
    expect(a.pedirComoRespondo).not.toHaveBeenCalled()
  })

  it('legenda: o botão "Como respondo?" e o Alt+R pedem as sugestões', () => {
    const a = assistente()
    montarJanela(a, 'legenda')
    fireEvent.click(screen.getByRole('button', { name: /Como respondo/ }))
    expect(a.pedirComoRespondo).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: '®', code: 'KeyR', altKey: true })
    expect(a.pedirComoRespondo).toHaveBeenCalledTimes(2)
  })

  it('sem o recurso (flag desligada, Grátis): nem botão nem atalho', () => {
    const a = assistente({ recursos: { ...assistente().recursos, nuvem: false, comoRespondo: false } })
    montarJanela(a, 'conversa')
    expect(screen.queryByRole('button', { name: /Como respondo/ })).toBeNull()
    fireEvent.keyDown(document, { key: 'r', code: 'KeyR', altKey: true })
    expect(a.pedirComoRespondo).not.toHaveBeenCalled()
  })

  it('a correção aparece embaixo da própria fala na conversa, gentil (sem "erro")', () => {
    const correcoes = new Map([['1', { ok: false, corrigida: 'I went there.', dica: 'Passado de go.' }]])
    montarJanela(assistente({ correcoes }), 'conversa')
    const c = document.querySelector('.leg-correcao')!
    expect(c.textContent).toContain('Mais natural:')
    expect(c.textContent).toContain('I went there.')
    expect(c.textContent).not.toMatch(/erro/i)
  })

  it('a folha: 2–3 sugestões com tradução, Copiar e Ouvir', () => {
    const ouvir = vi.fn()
    tamanhoDaJanela(400, 460)
    render(
      <LegendasFlutuantes
        naJanela
        formatoInicial="conversa"
        falas={[fala('1', LINHA)]}
        aoFechar={vi.fn()}
        aoOuvir={ouvir}
        assistente={assistente({
          comoRespondo: {
            estado: 'ok',
            falaId: '1',
            frase: LINHA,
            lang: 'en',
            sugestoes: [
              { texto: 'Thanks, I will!', traducao: 'Obrigado, vou fazer!', tom: 'informal' },
              { texto: 'I appreciate it.', traducao: 'Agradeço.', tom: 'formal' },
            ],
          },
        })}
      />,
    )
    const folha = screen.getByRole('dialog', { name: 'Como respondo?' })
    expect(folha.textContent).toContain('Sugestões para você responder com as suas palavras')
    expect(folha.querySelectorAll('.leg-sugestao')).toHaveLength(2)
    expect(folha.textContent).toContain('Obrigado, vou fazer!')
    expect(within(folha).getAllByRole('button', { name: /Copiar/ })).toHaveLength(2)
    fireEvent.click(within(folha).getAllByRole('button', { name: /Ouvir/ })[1])
    expect(ouvir).toHaveBeenCalledWith('I appreciate it.', 'en', false)
    expect(folha.textContent).not.toMatch(/oculto|ningu[eé]m v[eê]|entrevista/i)
  })

  it('carregando devagar: diz que demora e deixa cancelar', () => {
    const a = assistente({ comoRespondo: { estado: 'carregando', falaId: '1', frase: LINHA, lento: true } })
    montarJanela(a, 'legenda')
    expect(document.querySelector('.leg-folha-status')?.textContent).toBe('Está demorando um pouco mais que o normal…')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(a.fecharComoRespondo).toHaveBeenCalled()
  })

  it('recusa de cota: a frase honesta, sem plano nem preço — e nada de oferta ao perfil protegido', () => {
    for (const protegido of [false, true]) {
      cleanup()
      montarJanela(
        assistente({ protegido, comoRespondo: { estado: 'erro', falaId: '1', frase: LINHA, motivo: 'uso_justo' } }),
        'legenda',
      )
      const status = document.querySelector('.leg-folha-status')!.textContent!
      expect(status).toBe('Você chegou ao limite de hoje do assistente. Ele volta amanhã; a legenda segue funcionando.')
      const folha = screen.getByRole('dialog', { name: 'Como respondo?' })
      expect(folha.textContent).not.toMatch(/plano|R\$|assin/i)
    }
    cleanup()
    montarJanela(
      assistente({ protegido: true, comoRespondo: { estado: 'erro', falaId: '1', frase: LINHA, motivo: 'sem_plano' } }),
      'legenda',
    )
    expect(document.querySelector('.leg-folha')!.textContent).not.toMatch(/plano|R\$|assin|conhecer/i)
  })
})

describe('a conversa no idioma da própria pessoa (relato do dono, 26/10/2026)', () => {
  const AVISO = { aprende: 'en', fala: 'pt' }
  const TEXTO_DO_AVISO = 'O assistente ajuda nas falas em inglês. Esta conversa está em português.'
  const FALAS_PT = [
    fala('1', 'Boa noite, estas são as notícias de hoje', { lang: 'pt' }),
    fala('2', 'O tempo segue firme em todo o país', { lang: 'pt' }),
  ]
  const aviso = () => screen.queryByTestId('aviso-do-idioma')

  it('o hook dá o aviso quando as falas recentes estão no idioma da pessoa e o assistente existe', () => {
    const h = montarHook({ falas: FALAS_PT, langQueAprende: 'en' })
    expect(h.result.current.janela.avisoDoIdioma).toEqual(AVISO)
    expect(h.result.current.pagina.avisoDoIdioma).toEqual(AVISO)
    const antes = h.result.current.janela.avisoDoIdioma
    h.rerender({
      aberta: true,
      pausado: false,
      langDaPessoa: 'pt-BR',
      langQueAprende: 'en',
      falas: [...FALAS_PT, fala('3', 'E agora os esportes', { lang: 'pt' })],
    })
    expect(h.result.current.janela.avisoDoIdioma).toBe(antes) // o mesmo objeto: a janela não repinta à toa
    h.rerender({
      aberta: true,
      pausado: false,
      langDaPessoa: 'pt-BR',
      langQueAprende: 'en',
      falas: [...FALAS_PT, fala('3', 'Good evening and welcome', { lang: 'en' })],
    })
    expect(h.result.current.janela.avisoDoIdioma).toBeNull()
  })

  it('sem o assistente (flag desligada ou Grátis) o hook não avisa', () => {
    for (const ctx of [{ flag: false }, { plano: 'free' }]) {
      Object.assign(estado, { flag: true, plano: 'plus' }, ctx)
      const h = montarHook({ falas: FALAS_PT, langQueAprende: 'en' })
      expect(h.result.current.janela.avisoDoIdioma).toBeNull()
      h.unmount()
    }
  })

  it('uma linha discreta na legenda, na conversa e no estudo — nunca na faixa, nunca anunciada', () => {
    for (const formato of ['legenda', 'conversa', 'estudo'] as const) {
      const r = montarJanela(assistente({ avisoDoIdioma: AVISO, langDaPessoa: 'pt-BR' }), formato)
      expect(aviso()?.textContent).toBe(TEXTO_DO_AVISO)
      expect(aviso()?.closest('[aria-live],[role="status"],[role="alert"]')).toBeNull()
      expect(document.querySelector('[aria-live]')?.textContent).not.toContain('assistente ajuda')
      r.unmount()
    }
    montarJanela(assistente({ avisoDoIdioma: AVISO, langDaPessoa: 'pt-BR' }), 'faixa')
    expect(aviso()).toBeNull()
  })

  it('sem aviso do hook, nada aparece', () => {
    montarJanela(assistente({ avisoDoIdioma: null, langDaPessoa: 'pt-BR' }), 'conversa')
    expect(aviso()).toBeNull()
  })

  it('dispensar esconde o aviso pelo resto da sessão (também ao reabrir a janela)', () => {
    const r = montarJanela(assistente({ avisoDoIdioma: AVISO, langDaPessoa: 'pt-BR' }), 'legenda')
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar o aviso' }))
    expect(aviso()).toBeNull()
    r.unmount()
    montarJanela(assistente({ avisoDoIdioma: AVISO, langDaPessoa: 'pt-BR' }), 'conversa')
    expect(aviso()).toBeNull()
    expect(sessionStorage.getItem('babel.assistente.avisoDoIdioma.dispensado')).toBe('1')
  })

  it('a aba Assistente vazia explica por que nada aparece', () => {
    const recursos = assistente().recursos
    const r = render(<AbaDoAssistente itens={[]} recursos={recursos} paradoPorCota={null} aviso={AVISO} />)
    expect(screen.getByTestId('aba-assistente').textContent).toContain(TEXTO_DO_AVISO)
    r.unmount()
    render(<AbaDoAssistente itens={[]} recursos={recursos} paradoPorCota={null} aviso={null} />)
    expect(screen.getByTestId('aba-assistente').textContent).not.toContain('Esta conversa está em')
  })

  it('na conversa, "Como respondo?" fica sempre à vista num canto (não só com os controles); na legenda, não', () => {
    const r = montarJanela(assistente({ langDaPessoa: 'pt-BR' }), 'conversa')
    const botao = screen.getByRole('button', { name: /Como respondo/ })
    expect(botao.classList.contains('leg-responder-fixo')).toBe(true)
    expect(document.getElementById('leg-flut')?.classList.contains('com-responder-fixo')).toBe(true)
    expect(document.getElementById('leg-flut')?.classList.contains('com-controles')).toBe(false)
    expect(botao.getAttribute('aria-disabled')).toBeNull()
    r.unmount()
    montarJanela(assistente({ langDaPessoa: 'pt-BR' }), 'legenda')
    expect(screen.getByRole('button', { name: /Como respondo/ }).classList.contains('leg-responder-fixo')).toBe(false)
    expect(document.getElementById('leg-flut')?.classList.contains('com-responder-fixo')).toBe(false)
  })

  it('a última fala no idioma da pessoa: o botão fica desligado, com o motivo, e nem o clique nem o Alt+R pedem', () => {
    const a = assistente({ langDaPessoa: 'pt-BR' })
    tamanhoDaJanela(400, 460)
    render(<LegendasFlutuantes naJanela formatoInicial="conversa" falas={FALAS_PT} aoFechar={vi.fn()} assistente={a} />)
    const botao = screen.getByRole('button', { name: /Como respondo/ })
    expect(botao.getAttribute('aria-disabled')).toBe('true')
    expect(botao.title).toBe(
      'A última fala está em português, o seu idioma. O “Como respondo?” ajuda nas falas do idioma que você aprende.',
    )
    fireEvent.click(botao)
    fireEvent.keyDown(document, { key: 'r', code: 'KeyR', altKey: true })
    expect(a.pedirComoRespondo).not.toHaveBeenCalled()
  })
})
