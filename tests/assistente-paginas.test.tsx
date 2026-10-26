// @vitest-environment jsdom
/**
 * O ASSISTENTE AO VIVO NAS TELAS DA PÁGINA (Fase C3): a MESMA instância (`useAssistenteAoVivo`) desenhada na janela
 * flutuante, na legenda da captura (`HistoricoDoPrototipo`) e no Intérprete (`ConversaDoPrototipo`) — uma chamada por
 * linha, não importa quantas vistas a mostrem. As marcas silenciosas da página (só atributos: a árvore não muda quando
 * elas chegam), o toque que abre o sentido, o "Como respondo?" junto da última fala da outra pessoa, e a correção gentil
 * só nas falas da própria pessoa.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ flag: true, plano: 'plus', consentiu: true, protegido: false }))
vi.mock('../src/lib/flags', () => ({ useFlag: () => estado.flag }))
vi.mock('../src/lib/entitlements', () => ({
  getEntitlements: () => ({ plan: estado.plano }),
  onPlanChange: () => () => {},
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
/* Conta quantas vezes um texto é partido em palavras: é o que cada linha faz a cada desenho. */
const partidas = vi.hoisted(() => [] as string[])
vi.mock('../src/lib/captura/trechosTocaveis', async (importar) => {
  const real = await importar<typeof import('../src/lib/captura/trechosTocaveis')>()
  return {
    ...real,
    palavrasDoPedaco: (pedaco: string, lang: string) => {
      partidas.push(pedaco)
      return real.palavrasDoPedaco(pedaco, lang)
    },
  }
})

import { pedacosComPosicao } from '../src/components/views/captura/assistente/TextoComMarcas'
import { useAssistenteAoVivo } from '../src/components/views/captura/assistente/useAssistenteAoVivo'
import ConversaDoPrototipo, {
  type AssistenteNaConversa,
  type BolhaDaConversa,
  type MetadeDaConversa,
} from '../src/components/views/captura/interprete/ConversaDoPrototipo'
import LegendasFlutuantes, { type LegendaAoVivo } from '../src/components/views/captura/LegendasFlutuantes'
import HistoricoDoPrototipo, {
  type AssistenteNaLegenda,
} from '../src/components/views/captura/quest/HistoricoDoPrototipo'
import type { FalaDoAssistente, MarcaNaLinha } from '../src/core/assistente/telaDoAssistente'
import { AJUSTES_PADRAO, planejarChamadas, recursosDoAssistente } from '../src/core/assistente/telaDoAssistente'
import { usePaginaVisivel } from '../src/hooks/usePaginaVisivel'
import { ESPERA_DO_ASSISTENTE_MS } from '../src/lib/assistente/agendaDoAssistente'
import { esquecerAjustesDoAssistente, mudarAjustesDoAssistente } from '../src/lib/assistente/ajustesDoAssistente'
import { contextoDasFalas, falasDoAssistente, paginaMostraOAssistente } from '../src/lib/assistente/falasDoAssistente'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'
import { estabilizarFalas } from '../src/lib/legendas/estabilizarFalas'

const noop = () => {}
type Opcoes = Parameters<typeof useAssistenteAoVivo>[0]

async function passar(ms = ESPERA_DO_ASSISTENTE_MS) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  await act(async () => {
    await vi.dynamicImportSettled()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  esquecerAjustesDoAssistente()
  partidas.length = 0
  Object.assign(estado, { flag: true, plano: 'plus', consentiu: true, protegido: false })
  for (const f of Object.values(api)) f.mockReset()
  api.destacarExpressoes.mockResolvedValue({
    ok: true,
    valor: { expressoes: [{ trecho: 'break a leg', sentido: 'boa sorte', tipo: 'idiomatica' }], restanteHoje: 199 },
  })
  api.explicarTermos.mockResolvedValue({ ok: true, valor: { termos: [] } })
  api.corrigirMinhaFala.mockResolvedValue({
    ok: true,
    valor: { correcao: { ok: false, corrigida: 'I went to the store.', dica: 'Passado de go: went.' } },
  })
  api.comoRespondo.mockResolvedValue({
    ok: true,
    valor: { sugestoes: [{ texto: 'Thanks!', traducao: 'Valeu!', tom: 'informal' }], restanteHoje: 198 },
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/* ───────────────────────────── os dados ───────────────────────────── */

const segmento = (id: string, texto: string, extra: Partial<SpeechSegment> = {}): SpeechSegment =>
  ({
    id,
    speakerId: 'system',
    source: 'system',
    timestamp: '00:01',
    originalText: texto,
    translatedText: `(${texto})`,
    words: [],
    isPartial: false,
    lang: 'en',
    ...extra,
  }) as SpeechSegment

const legenda = (s: SpeechSegment): LegendaAoVivo => ({
  id: s.id,
  quem: 'Outros',
  original: s.originalText,
  traducao: s.translatedText,
  lado: s.source === 'system' ? 'eles' : 'voce',
  lang: s.lang,
  parcial: !!s.isPartial,
})

const metade = (lado: 'meu' | 'outro', extra: Partial<MetadeDaConversa> = {}): MetadeDaConversa => ({
  lado,
  dono: lado,
  lang: lado === 'meu' ? 'pt-BR' : 'en-US',
  nome: lado === 'meu' ? 'Português' : 'English',
  frase: { tipo: 'dica', texto: '' },
  status: '',
  rotulo: 'Falar',
  rotuloParaLeitor: 'Falar',
  ouvindo: false,
  aoFalar: noop,
  semVoz: true,
  ...extra,
})

const conversa = (bolhas: BolhaDaConversa[], assistente: AssistenteNaConversa | undefined, extra = {}) => (
  <ConversaDoPrototipo
    cima={metade('outro')}
    baixo={metade('meu')}
    lista={{ aberta: true, bolhas, aoAlternar: noop, aoExportar: noop }}
    voz={{ rotulo: 'Voz do aparelho', natural: false, muda: false }}
    aviso=""
    aoTrocarLados={noop}
    aoSair={noop}
    assistente={assistente}
    {...extra}
  />
)

/* ───────────────────── a instância dividida: uma chamada por linha ───────────────────── */

describe('uma instância para a captura, a janela e o Intérprete', () => {
  /**
   * As TRÊS vistas da mesma instância, como a `LiveCapture` as monta: a janela flutuante (a vista `janela`), a legenda
   * da página e o Intérprete (a vista `pagina`).
   */
  function TresVistas({ segs }: { segs: SpeechSegment[] }) {
    const anteriores = React.useRef(new Map<string, FalaDoAssistente>())
    const falas = React.useMemo(
      () =>
        estabilizarFalas(
          anteriores.current,
          falasDoAssistente(segs, { trocados: false, idiomaDaPessoa: 'pt-BR', idiomaDoOutro: 'en' }),
        ),
      [segs],
    )
    const a = useAssistenteAoVivo({
      aberta: true,
      pausado: false,
      falas,
      langDaPessoa: 'pt-BR',
      pagina: { aberta: true },
    })
    const naLegenda: AssistenteNaLegenda = { marcas: a.pagina.marcas, correcoes: a.pagina.correcoes }
    const bolhas = segs
      .filter((s) => !s.isPartial)
      .map((s) => ({ id: s.id, dono: 'outro' as const, fala: s.originalText, traducao: s.translatedText, lang: 'en' }))
    return (
      <>
        <div data-testid="janela">
          <LegendasFlutuantes falas={segs.map(legenda)} aoFechar={noop} assistente={a.janela} />
        </div>
        <div data-testid="captura">
          <HistoricoDoPrototipo falas={segs} escala={1} idiomaPadrao="en" aoTocar={noop} assistente={naLegenda} />
        </div>
        <div data-testid="interprete">
          {conversa(bolhas, {
            marcas: a.pagina.marcas,
            correcoes: a.pagina.correcoes,
            responderA: bolhas.at(-1)?.id,
            aoComoRespondo: a.pagina.pedirComoRespondo,
          })}
        </div>
      </>
    )
  }

  it('três vistas, UMA chamada por linha final; a parcial crescendo não chama; as três pintam a mesma marca', async () => {
    const LINHA = 'You will be great tonight, break a leg'
    const r = render(<TresVistas segs={[segmento('1', 'You will', { isPartial: true })]} />)
    r.rerender(<TresVistas segs={[segmento('1', 'You will be great tonight', { isPartial: true })]} />)
    await passar(ESPERA_DO_ASSISTENTE_MS * 3)
    expect(api.destacarExpressoes).not.toHaveBeenCalled()

    r.rerender(<TresVistas segs={[segmento('1', LINHA)]} />)
    await passar()
    expect(api.destacarExpressoes).toHaveBeenCalledTimes(1)

    for (const vista of ['janela', 'captura', 'interprete']) {
      const marca = within(screen.getByTestId(vista)).getAllByTitle('break a leg: boa sorte')
      expect(marca.length, vista).toBeGreaterThan(0)
    }
    /* Mais desenhos (outra fala chegando) não pedem a linha velha de novo. */
    r.rerender(<TresVistas segs={[segmento('1', LINHA), segmento('2', 'And then', { isPartial: true })]} />)
    r.rerender(<TresVistas segs={[segmento('1', LINHA), segmento('2', 'And then we', { isPartial: true })]} />)
    await passar(ESPERA_DO_ASSISTENTE_MS * 3)
    expect(api.destacarExpressoes).toHaveBeenCalledTimes(1)
  })

  it('a página sozinha (janela fechada) também chama, uma vez; nenhuma vista à vista, nada sai', async () => {
    const falas = [{ id: '1', original: 'You will be great tonight, break a leg', lado: 'eles' as const, lang: 'en' }]
    const h = renderHook<ReturnType<typeof useAssistenteAoVivo>, Opcoes>((p) => useAssistenteAoVivo(p), {
      initialProps: { aberta: false, pausado: false, falas: [], langDaPessoa: 'pt-BR', pagina: { aberta: false } },
    })
    h.rerender({ aberta: false, pausado: false, falas, langDaPessoa: 'pt-BR', pagina: { aberta: false } })
    await passar(ESPERA_DO_ASSISTENTE_MS * 3)
    expect(api.destacarExpressoes).not.toHaveBeenCalled()
    expect(h.result.current.pagina.marcas.size).toBe(0)

    const outra = [
      ...falas,
      { id: '2', original: 'Keep calm and break a leg out there', lado: 'eles' as const, lang: 'en' },
    ]
    h.rerender({ aberta: false, pausado: false, falas: outra, langDaPessoa: 'pt-BR', pagina: { aberta: true } })
    await passar()
    expect(api.destacarExpressoes).toHaveBeenCalledTimes(1)
    expect(h.result.current.pagina.marcas.get('2')?.[0]).toMatchObject({ tipo: 'expressao', texto: 'break a leg' })
  })

  it('o "Como respondo?" pedido na página abre só na página; fechar a janela não fecha a folha da página', async () => {
    const falas = [{ id: '1', original: 'How was your weekend?', lado: 'eles' as const, lang: 'en' }]
    const h = renderHook<ReturnType<typeof useAssistenteAoVivo>, Opcoes>((p) => useAssistenteAoVivo(p), {
      initialProps: { aberta: true, pausado: false, falas, langDaPessoa: 'pt-BR', pagina: { aberta: true } },
    })
    act(() => h.result.current.pagina.pedirComoRespondo('1'))
    expect(h.result.current.pagina.comoRespondo).toMatchObject({ estado: 'carregando', falaId: '1' })
    expect(h.result.current.janela.comoRespondo.estado).toBe('fechado')
    h.rerender({ aberta: false, pausado: false, falas, langDaPessoa: 'pt-BR', pagina: { aberta: true } })
    await passar(0)
    expect(h.result.current.pagina.comoRespondo).toMatchObject({ estado: 'ok', falaId: '1' })
    expect(api.comoRespondo).toHaveBeenCalledTimes(1)
  })

  it('com o PiP de vídeo (só leitura), a página à vista ainda tem o "Como respondo?" e a correção', async () => {
    mudarAjustesDoAssistente({ correcao: true })
    const falas = [{ id: '1', original: 'I goed to the store yesterday', lado: 'voce' as const, lang: 'en' }]
    const h = renderHook<ReturnType<typeof useAssistenteAoVivo>, Opcoes>((p) => useAssistenteAoVivo(p), {
      initialProps: {
        aberta: true,
        pausado: false,
        falas: [],
        langDaPessoa: 'pt-BR',
        soLeitura: true,
        pagina: { aberta: true },
      },
    })
    expect(h.result.current.janela.recursos.comoRespondo).toBe(false)
    expect(h.result.current.pagina.recursos.comoRespondo).toBe(true)
    h.rerender({
      aberta: true,
      pausado: false,
      falas,
      langDaPessoa: 'pt-BR',
      soLeitura: true,
      pagina: { aberta: true },
    })
    await passar()
    expect(api.corrigirMinhaFala).toHaveBeenCalledTimes(1)
  })
})

/* ───────────────────── a correção: só nas falas da própria pessoa ───────────────────── */

describe('a correção gentil só cai nas falas da própria pessoa', () => {
  it('no Intérprete, a metade da pessoa é "você" (os lados trocados contam); a fala sem idioma leva o do lado', () => {
    const segs = [
      segmento('a', 'bom dia', { lado: 'meu', lang: undefined, source: 'mic' }),
      segmento('b', 'good morning', { lado: 'outro', lang: undefined, source: 'mic' }),
    ]
    expect(falasDoAssistente(segs, { trocados: false, idiomaDaPessoa: 'pt-BR', idiomaDoOutro: 'en' })).toMatchObject([
      { id: 'a', lado: 'voce', lang: 'pt-BR' },
      { id: 'b', lado: 'eles', lang: 'en' },
    ])
    expect(falasDoAssistente(segs, { trocados: true, idiomaDaPessoa: 'pt-BR', idiomaDoOutro: 'en' })).toMatchObject([
      { id: 'a', lado: 'eles', lang: 'en' },
      { id: 'b', lado: 'voce', lang: 'pt-BR' },
    ])
    /* Na captura: o computador é "eles", o microfone é "você". */
    expect(
      falasDoAssistente([segmento('c', 'hi'), segmento('d', 'hey', { source: 'mic' })], {
        trocados: false,
        idiomaDaPessoa: 'pt-BR',
        idiomaDoOutro: 'en',
      }).map((f) => f.lado),
    ).toEqual(['eles', 'voce'])
  })

  it('correção ligada: a chamada sai só para a fala da pessoa, nunca para a da outra', async () => {
    mudarAjustesDoAssistente({ correcao: true })
    const h = renderHook<ReturnType<typeof useAssistenteAoVivo>, Opcoes>((p) => useAssistenteAoVivo(p), {
      initialProps: { aberta: false, pausado: false, falas: [], langDaPessoa: 'pt-BR', pagina: { aberta: true } },
    })
    const dela = { id: 'o', original: 'I really enjoyed the trip to the coast', lado: 'eles' as const, lang: 'en' }
    h.rerender({ aberta: false, pausado: false, falas: [dela], langDaPessoa: 'pt-BR', pagina: { aberta: true } })
    await passar()
    expect(api.corrigirMinhaFala).not.toHaveBeenCalled()
    const minha = { id: 'm', original: 'I goed to the store yesterday', lado: 'voce' as const, lang: 'en' }
    h.rerender({ aberta: false, pausado: false, falas: [dela, minha], langDaPessoa: 'pt-BR', pagina: { aberta: true } })
    await passar()
    expect(api.corrigirMinhaFala).toHaveBeenCalledTimes(1)
    expect(api.corrigirMinhaFala.mock.calls[0][0]).toMatchObject({ minhaFala: 'I goed to the store yesterday' })
    expect([...h.result.current.pagina.correcoes.keys()]).toEqual(['m'])
  })

  it('na conversa em lista, a correção aparece só embaixo da bolha da pessoa', () => {
    const correcao = { ok: false, corrigida: 'I went to the store.', dica: 'Passado de go: went.' }
    /* Mesmo que a correção chegasse com o id de uma fala da outra pessoa, a bolha dela não a mostra. */
    const correcoes = new Map([
      ['m', correcao],
      ['o', correcao],
    ])
    render(
      conversa(
        [
          { id: 'o', dono: 'outro', fala: 'How was it?', traducao: 'Como foi?' },
          { id: 'm', dono: 'meu', fala: 'I goed to the store', traducao: 'Eu fui à loja' },
        ],
        { marcas: new Map(), correcoes },
      ),
    )
    const notas = screen.getAllByTestId('correcao-da-fala')
    expect(notas).toHaveLength(1)
    expect(notas[0].closest('[data-bolha]')?.getAttribute('data-bolha')).toBe('m')
    expect(notas[0].textContent).toContain('Mais natural: I went to the store.')
    /* Fora dos anúncios: quem navega lê, mas ela não interrompe. */
    expect(notas[0].getAttribute('aria-live')).toBe('off')
  })
})

/* ───────────────────── as marcas na legenda da captura ───────────────────── */

const LINHA = 'Break a leg at the KPI review.'
const MARCAS: MarcaNaLinha[] = [
  { inicio: 0, fim: 11, tipo: 'expressao', texto: 'Break a leg', sentido: 'boa sorte' },
  { inicio: 19, fim: 22, tipo: 'termo', texto: 'KPI', sentido: 'indicador de desempenho' },
  { inicio: 23, fim: 29, tipo: 'nivel', texto: 'review', nivel: 'B2', escala: 'cefr' },
]

describe('as marcas na legenda da captura (HistoricoDoPrototipo)', () => {
  const montar = (marcas: ReadonlyMap<string, MarcaNaLinha[]>, extra: Partial<AssistenteNaLegenda> = {}) => {
    const aoTocar = vi.fn()
    const aoTocarMarca = vi.fn()
    const props = {
      falas: [segmento('1', LINHA, { translatedText: 'Arrasa na revisão de KPI.' })],
      escala: 1,
      idiomaPadrao: 'en',
      aoTocar,
    }
    const r = render(
      <HistoricoDoPrototipo {...props} assistente={{ marcas, correcoes: new Map(), aoTocarMarca, ...extra }} />,
    )
    const remontar = (m: ReadonlyMap<string, MarcaNaLinha[]>) =>
      r.rerender(
        <HistoricoDoPrototipo {...props} assistente={{ marcas: m, correcoes: new Map(), aoTocarMarca, ...extra }} />,
      )
    return { ...r, aoTocar, aoTocarMarca, remontar }
  }

  it('sublinhado silencioso: expressão (só a primeira parte do trecho é a marca), termo e nível, com o sentido no title', () => {
    const { container } = montar(new Map([['1', MARCAS]]))
    const o = container.querySelector('.q-o')!
    const expressao = [...o.querySelectorAll('.asst-marca[data-marca="expressao"]')]
    expect(expressao.map((e) => e.textContent).join('')).toBe('Break a leg')
    expect(expressao[0].getAttribute('title')).toBe('Break a leg: boa sorte')
    expect(o.querySelector('[data-marca="termo"]')?.textContent).toBe('KPI')
    expect(o.querySelector('[data-marca="nivel"]')?.textContent).toBe('review')
    /* O ponto final fica fora do fio. */
    expect(o.querySelector('[data-marca="nivel"]')?.nextElementSibling?.textContent).toBe('.')
    /* Dentro do botão da linha, nada focável a mais (botão dentro de botão não vale), e nenhum anúncio próprio. */
    expect(o.querySelectorAll('[tabindex], [role]')).toHaveLength(0)
    expect(o.querySelector('[aria-live]')).toBeNull()
    expect(o.textContent).toBe(LINHA)
  })

  it('as marcas chegam sem trocar a árvore: os mesmos nós de texto, só atributos (nada novo para a região aria-live)', () => {
    const r = montar(new Map())
    const o = r.container.querySelector('.q-o')!
    const antes = [...o.childNodes]
    expect(o.querySelectorAll('.asst-marca')).toHaveLength(0)
    r.remontar(new Map([['1', MARCAS]]))
    const depois = [...o.childNodes]
    expect(depois).toHaveLength(antes.length)
    depois.forEach((n, i) => expect(n).toBe(antes[i]))
    expect(o.querySelectorAll('.asst-marca').length).toBeGreaterThan(0)
  })

  it('tocar na palavra marcada abre o cartão dela; tocar fora abre a folha da frase', () => {
    const { container, aoTocar, aoTocarMarca } = montar(new Map([['1', MARCAS]]))
    fireEvent.click(container.querySelector('.q-o [data-marca="termo"]')!)
    expect(aoTocarMarca).toHaveBeenCalledTimes(1)
    expect(aoTocarMarca.mock.calls[0][1]).toMatchObject({ tipo: 'termo', texto: 'KPI' })
    expect(aoTocar).not.toHaveBeenCalled()
    fireEvent.click(container.querySelector('.q-t')!)
    expect(aoTocar).toHaveBeenCalledTimes(1)
  })

  it('a fala ainda só no original (sem tradução) também ganha as marcas, nas palavras dela', () => {
    const r = render(
      <HistoricoDoPrototipo
        falas={[segmento('1', LINHA, { translatedText: '' })]}
        escala={1}
        idiomaPadrao="en"
        aoTocar={noop}
        assistente={{ marcas: new Map([['1', MARCAS]]), correcoes: new Map() }}
      />,
    )
    const t = r.container.querySelector('.q-t')!
    expect(t.querySelector('[data-marca="termo"]')?.textContent?.trim()).toBe('KPI')
    expect(t.querySelectorAll('[data-marca="expressao"]')).toHaveLength(3)
  })

  it('a correção da própria fala aparece embaixo dela, fora dos anúncios', () => {
    const correcao = { ok: false, corrigida: 'I went to the store.', dica: '' }
    const r = render(
      <HistoricoDoPrototipo
        falas={[segmento('m', 'I goed to the store', { source: 'mic' })]}
        escala={1}
        idiomaPadrao="en"
        aoTocar={noop}
        assistente={{ marcas: new Map(), correcoes: new Map([['m', correcao]]) }}
      />,
    )
    const nota = within(r.container).getByTestId('correcao-da-fala')
    expect(nota.textContent).toContain('Mais natural: I went to the store.')
    expect(nota.getAttribute('aria-live')).toBe('off')
  })

  it('a linha com marcas não é repintada enquanto a parcial de outra cresce (o mesmo array segura o memo)', () => {
    const marcas = new Map([['1', MARCAS]])
    const base = segmento('1', LINHA, { translatedText: 'Arrasa.' })
    const desenhar = (parcial: string) => (
      <HistoricoDoPrototipo
        falas={[base, segmento('2', parcial, { isPartial: true, translatedText: '' })]}
        escala={1}
        idiomaPadrao="en"
        aoTocar={noop}
        /* Um objeto NOVO a cada desenho (como na captura), com o MESMO array de marcas da linha. */
        assistente={{ marcas: new Map(marcas), correcoes: new Map() }}
      />
    )
    const r = render(desenhar('Hel'))
    const vezes = () => partidas.filter((p) => p === 'KPI').length
    const antes = vezes()
    r.rerender(desenhar('Hello wor'))
    r.rerender(desenhar('Hello world, how'))
    expect(vezes()).toBe(antes)
  })
})

/* ───────────────────── o Intérprete ───────────────────── */

describe('as marcas e o "Como respondo?" no Intérprete (ConversaDoPrototipo)', () => {
  const bolhas: BolhaDaConversa[] = [
    { id: 'o1', dono: 'outro', fala: 'Break a leg at the KPI review.', traducao: 'Arrasa.', lang: 'en' },
    { id: 'm1', dono: 'meu', fala: 'Obrigado', traducao: 'Thanks', lang: 'pt-BR' },
    { id: 'o2', dono: 'outro', fala: 'How was your weekend?', traducao: 'Como foi o fim de semana?', lang: 'en' },
  ]

  it('marcas na fala da outra pessoa, alcançáveis pelo teclado (roving), com o sentido no cartão', () => {
    render(conversa(bolhas, { marcas: new Map([['o1', MARCAS]]), correcoes: new Map() }))
    const bolha = document.querySelector('[data-bolha="o1"]')!
    const focaveis = [...bolha.querySelectorAll<HTMLElement>('[data-marca-foco]')]
    expect(focaveis.map((f) => f.getAttribute('aria-label'))).toEqual([
      'Break a leg, Expressão',
      'KPI, Termo',
      'review, Acima do seu nível · B2',
    ])
    expect(focaveis.map((f) => f.tabIndex)).toEqual([0, -1, -1])
    focaveis[0].focus()
    fireEvent.keyDown(focaveis[0], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(focaveis[1])
    fireEvent.keyDown(focaveis[1], { key: 'Enter' })
    const cartao = screen.getByRole('dialog', { name: 'Palavra: KPI' })
    expect(cartao.textContent).toContain('Termo')
    expect(cartao.textContent).toContain('indicador de desempenho')
    fireEvent.keyDown(cartao, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Palavra: KPI' })).toBeNull()
    expect(document.activeElement).toBe(focaveis[1])
  })

  it('"Como respondo?" fica junto da ÚLTIMA fala da outra pessoa, e pede para ela', () => {
    const aoComoRespondo = vi.fn()
    render(
      conversa(bolhas, { marcas: new Map(), correcoes: new Map(), responderA: 'o2', aoComoRespondo, comAtalho: true }),
    )
    const botoes = screen.getAllByRole('button', { name: /Como respondo\?/ })
    expect(botoes).toHaveLength(1)
    expect(botoes[0].previousElementSibling?.getAttribute('data-bolha')).toBe('o2')
    expect(botoes[0].getAttribute('aria-keyshortcuts')).toBe('Alt+R')
    fireEvent.click(botoes[0])
    expect(aoComoRespondo).toHaveBeenCalledWith('o2')
  })

  it('frente a frente: o botão fica na metade da pessoa, embaixo da tradução, FORA da região anunciada', () => {
    render(
      conversa(
        [],
        { marcas: new Map([['o2', MARCAS]]), correcoes: new Map(), responderA: 'o2', aoComoRespondo: noop },
        {
          lista: { aberta: false, bolhas: [], aoAlternar: noop, aoExportar: noop },
          baixo: metade('meu', {
            frase: {
              tipo: 'traducao',
              id: 'o2',
              traducao: 'Arrasa na revisão de KPI.',
              original: LINHA,
              lang: 'pt-BR',
              langDoOriginal: 'en',
            },
          }),
        },
      ),
    )
    const minha = screen.getByTestId('interprete-meu')
    const botao = within(minha).getByRole('button', { name: /Como respondo\?/ })
    expect(botao.closest('[aria-live]')).toBeNull()
    /* As marcas no original da outra pessoa, dentro da região anunciada, são só atributos. */
    const original = minha.querySelector('.int-original')!
    expect(original.querySelector('[data-marca="termo"]')?.textContent).toBe('KPI')
    expect(within(screen.getByTestId('interprete-outro')).queryByRole('button', { name: /Como respondo\?/ })).toBeNull()
  })

  it('sem o recurso (flag desligada, Grátis): nenhum botão; sem o assistente, o texto de sempre', () => {
    render(conversa(bolhas, { marcas: new Map(), correcoes: new Map() }))
    expect(screen.queryByRole('button', { name: /Como respondo\?/ })).toBeNull()
    cleanup()
    render(conversa(bolhas, undefined))
    expect(document.querySelector('[data-bolha="o1"] .int-bolha-fala')?.innerHTML).toBe(
      'Break a leg at the KPI review.',
    )
  })
})

describe('os pedaços estáveis', () => {
  it('cortam espaços e a pontuação das pontas, com a posição exata', () => {
    expect(pedacosComPosicao('Hi, KPI review.', 'en').map((p) => [p.texto, p.inicio, p.fim])).toEqual([
      ['Hi', 0, 2],
      [',', 2, 3],
      [' ', 3, 4],
      ['KPI', 4, 7],
      [' ', 7, 8],
      ['review', 8, 14],
      ['.', 14, 15],
    ])
  })
})

/* ───────────────────── a revisão da C3: a fiação de verdade ───────────────────── */

const ESTA_PAGINA = { trocados: false, idiomaDaPessoa: 'pt-BR', idiomaDoOutro: 'en' }
type Seg = Parameters<typeof falasDoAssistente>[0]
const velha = (id: string) => ({
  id,
  original: `Break a leg on the old line number ${id}`,
  lado: 'eles' as const,
  lang: 'en',
})

describe('só com o microfone (fora do Intérprete), a fala de terceiros nunca vai à correção', () => {
  it('a fala do microfone tem lado incerto, e o plano não tem correção mesmo com o opt-in', () => {
    const [f] = falasDoAssistente([segmento('tv', 'I goed to the store yesterday', { source: 'mic' })], {
      ...ESTA_PAGINA,
      soMicrofone: true,
    })
    expect(f.lado).toBe('incerto')
    const r = recursosDoAssistente(
      { ...AJUSTES_PADRAO, correcao: true },
      { flagLigada: true, assistenteDiaDoPlano: 200, recusadoNaSessao: false, consentiuNuvem: true },
    )
    expect(planejarChamadas(f, r, 'pt-BR').correcao).toBe(false)
  })

  it('com a correção ligada, a fala do microfone (a TV) não sai como "minha fala" — nem no perfil protegido', async () => {
    mudarAjustesDoAssistente({ correcao: true })
    for (const protegido of [false, true]) {
      estado.protegido = protegido
      api.corrigirMinhaFala.mockClear()
      api.destacarExpressoes.mockClear()
      const h = renderHook<ReturnType<typeof useAssistenteAoVivo>, Opcoes>((p) => useAssistenteAoVivo(p), {
        initialProps: { aberta: false, pausado: false, falas: [], langDaPessoa: 'pt-BR', pagina: { aberta: true } },
      })
      const falas = falasDoAssistente(
        [segmento(`tv${protegido}`, 'I goed to the store yesterday and break a leg', { source: 'mic' })],
        { ...ESTA_PAGINA, soMicrofone: true },
      )
      h.rerender({ aberta: false, pausado: false, falas, langDaPessoa: 'pt-BR', pagina: { aberta: true } })
      await passar()
      expect(api.corrigirMinhaFala).not.toHaveBeenCalled()
      /* Ela ainda é ajudada como a fala de qualquer outra pessoa. */
      expect(api.destacarExpressoes).toHaveBeenCalledTimes(1)
      h.unmount()
    }
  })

  it('trocar os lados depois não reescreve o passado (o lado é guardado quando a fala chega)', () => {
    const vistos = new Map<string, FalaDoAssistente['lado']>()
    const antes: Seg = [segmento('a', 'bom dia', { lado: 'meu', source: 'mic' })]
    expect(falasDoAssistente(antes, { ...ESTA_PAGINA, ladosVistos: vistos })[0].lado).toBe('voce')
    const depois: Seg = [...antes, segmento('b', 'oi de novo', { lado: 'meu', source: 'mic' })]
    const r = falasDoAssistente(depois, { ...ESTA_PAGINA, trocados: true, ladosVistos: vistos })
    expect(r.map((f) => f.lado)).toEqual(['voce', 'eles'])
  })

  it('o texto vem sem os espaços das pontas (as marcas casam com o que a legenda desenha)', () => {
    expect(falasDoAssistente([segmento('a', '  Break a leg  ')], ESTA_PAGINA)[0].original).toBe('Break a leg')
  })
})

describe('a sessão retomada não manda as linhas velhas à nuvem', () => {
  it('as falas que já existem ao montar e as que chegam de uma vez na retomada contam como vistas', async () => {
    const pagina = { aberta: true }
    const h = renderHook<ReturnType<typeof useAssistenteAoVivo>, Opcoes>((p) => useAssistenteAoVivo(p), {
      initialProps: { aberta: false, pausado: false, falas: [velha('1')], langDaPessoa: 'pt-BR', pagina, semente: 0 },
    })
    await passar(ESPERA_DO_ASSISTENTE_MS * 3)
    expect(api.destacarExpressoes).not.toHaveBeenCalled()

    /* A retomada troca as falas e muda a semente no mesmo desenho. */
    const retomadas = [velha('r1'), velha('r2'), velha('r3')]
    h.rerender({ aberta: false, pausado: false, falas: retomadas, langDaPessoa: 'pt-BR', pagina, semente: 1 })
    await passar(ESPERA_DO_ASSISTENTE_MS * 3)
    expect(api.destacarExpressoes).not.toHaveBeenCalled()

    /* A fala nova, ao vivo, é pedida. */
    const comNova = [...retomadas, velha('nova')]
    h.rerender({ aberta: false, pausado: false, falas: comNova, langDaPessoa: 'pt-BR', pagina, semente: 1 })
    await passar()
    expect(api.destacarExpressoes).toHaveBeenCalledTimes(1)
    expect(api.destacarExpressoes.mock.calls[0][0].frase).toContain('number nova')
  })
})

describe('a página só conta quando mostra o assistente', () => {
  const base = {
    visivel: true,
    entrada: 'captura' as const,
    interpreteAberto: false,
    virtualAberta: false,
    focoCheio: false,
    comLegenda: true,
  }

  it('aba escondida, conversa virtual, foco cheio, captura sem legenda e a tela pronta do Intérprete: não', () => {
    expect(paginaMostraOAssistente(base)).toBe(true)
    expect(paginaMostraOAssistente({ ...base, visivel: false })).toBe(false)
    expect(paginaMostraOAssistente({ ...base, comLegenda: false })).toBe(false)
    expect(paginaMostraOAssistente({ ...base, focoCheio: true })).toBe(false)
    expect(paginaMostraOAssistente({ ...base, interpreteAberto: true, virtualAberta: true })).toBe(false)
    expect(paginaMostraOAssistente({ ...base, entrada: 'interprete' })).toBe(false)
    expect(paginaMostraOAssistente({ ...base, entrada: 'interprete', interpreteAberto: true })).toBe(true)
  })

  it('com a conversa virtual aberta (e a janela fechada), nenhuma chamada automática sai', async () => {
    const pagina = { aberta: paginaMostraOAssistente({ ...base, interpreteAberto: true, virtualAberta: true }) }
    const h = renderHook<ReturnType<typeof useAssistenteAoVivo>, Opcoes>((p) => useAssistenteAoVivo(p), {
      initialProps: { aberta: false, pausado: false, falas: [], langDaPessoa: 'pt-BR', pagina, semente: 0 },
    })
    h.rerender({ aberta: false, pausado: false, falas: [velha('v')], langDaPessoa: 'pt-BR', pagina, semente: 0 })
    await passar(ESPERA_DO_ASSISTENTE_MS * 3)
    expect(api.destacarExpressoes).not.toHaveBeenCalled()
  })

  it('usePaginaVisivel acompanha o document.hidden', () => {
    const vis = { estado: 'visible' as DocumentVisibilityState }
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis.estado })
    try {
      const h = renderHook(() => usePaginaVisivel())
      expect(h.result.current).toBe(true)
      act(() => {
        vis.estado = 'hidden'
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(h.result.current).toBe(false)
      act(() => {
        vis.estado = 'visible'
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(h.result.current).toBe(true)
    } finally {
      delete (document as unknown as { visibilityState?: unknown }).visibilityState
    }
  })
})

/* ───────────── o Intérprete automático: a fala do microfone chega ANTES da metade ───────────── */

describe('no Intérprete, a fala sem metade espera: a da outra pessoa nunca vai à correção', () => {
  const NO_INTERPRETE = { ...ESTA_PAGINA, ...contextoDasFalas('conversa', true) }
  /** A fiação da `LiveCapture`: as falas da sessão → `falasDoAssistente` (com o registro de lados) → a instância. */
  function montarInterprete() {
    const vistos = new Map<string, FalaDoAssistente['lado']>()
    const antes = new Map<string, FalaDoAssistente>()
    const derivar = (segs: SpeechSegment[]) =>
      estabilizarFalas(antes, falasDoAssistente(segs, { ...NO_INTERPRETE, ladosVistos: vistos }))
    const props = (segs: SpeechSegment[]): Opcoes => ({
      aberta: false,
      pausado: false,
      falas: derivar(segs),
      langDaPessoa: 'pt-BR',
      pagina: { aberta: true },
      semente: 0,
    })
    const h = renderHook<ReturnType<typeof useAssistenteAoVivo>, Opcoes>((p) => useAssistenteAoVivo(p), {
      initialProps: props([]),
    })
    return { h, vistos, mudar: (segs: SpeechSegment[]) => h.rerender(props(segs)) }
  }
  const FRASE = 'I goed to the store yesterday, break a leg'
  const doMicrofone = (extra: Partial<SpeechSegment> = {}) =>
    segmento('x', FRASE, { source: 'mic', speakerId: 'user', lado: undefined, ...extra })

  beforeEach(() => mudarAjustesDoAssistente({ correcao: true }))

  it('o contexto da captura: só com o microfone fora do Intérprete é incerto; no Intérprete, a fala espera a metade', () => {
    expect(contextoDasFalas('mic', false)).toEqual({ soMicrofone: true, noInterprete: false })
    expect(contextoDasFalas('mic', true)).toEqual({ soMicrofone: false, noInterprete: true })
    expect(contextoDasFalas('conversa', false)).toEqual({ soMicrofone: false, noInterprete: false })
    const vistos = new Map<string, FalaDoAssistente['lado']>()
    const [f] = falasDoAssistente([doMicrofone()], { ...NO_INTERPRETE, ladosVistos: vistos })
    expect(f).toMatchObject({ lado: 'incerto', parcial: true })
    /* O incerto nunca fica guardado. */
    expect(vistos.size).toBe(0)
  })

  it('chega sem metade e depois vira da OUTRA pessoa: nenhuma correção (e uma chamada de expressões)', async () => {
    const { mudar, vistos } = montarInterprete()
    mudar([doMicrofone()])
    await passar(ESPERA_DO_ASSISTENTE_MS * 3)
    expect(api.destacarExpressoes).not.toHaveBeenCalled()
    expect(api.corrigirMinhaFala).not.toHaveBeenCalled()

    mudar([doMicrofone({ lado: 'outro' })])
    await passar()
    expect(api.corrigirMinhaFala).not.toHaveBeenCalled()
    expect(api.destacarExpressoes).toHaveBeenCalledTimes(1)
    expect(vistos.get('x')).toBe('eles')
  })

  it('chega sem metade e depois vira da PESSOA: no máximo UMA correção, mesmo com mais desenhos', async () => {
    const { mudar } = montarInterprete()
    mudar([doMicrofone()])
    await passar(ESPERA_DO_ASSISTENTE_MS * 3)
    mudar([doMicrofone({ lado: 'meu' })])
    await passar()
    expect(api.corrigirMinhaFala).toHaveBeenCalledTimes(1)
    /* Mais desenhos, uma parcial nova e até a metade mudando: nada sai de novo para a mesma fala. */
    const parcial = segmento('y', 'and then', { source: 'mic', isPartial: true, lado: undefined })
    mudar([doMicrofone({ lado: 'meu' }), parcial])
    mudar([doMicrofone({ lado: 'outro' }), parcial])
    await passar(ESPERA_DO_ASSISTENTE_MS * 3)
    expect(api.corrigirMinhaFala).toHaveBeenCalledTimes(1)
    expect(api.destacarExpressoes).not.toHaveBeenCalled()
  })

  it('sem envio duplo: a fala já oferecida não é pedida de novo quando volta a ser a última', async () => {
    const { mudar } = montarInterprete()
    const a = segmento('a', 'Break a leg out there tonight, my friend', { lado: 'outro', source: 'mic' })
    const b = segmento('b', 'Break a leg once again, everyone here', { lado: 'outro', source: 'mic' })
    mudar([a])
    await passar()
    mudar([a, b])
    await passar()
    expect(api.destacarExpressoes).toHaveBeenCalledTimes(2)
    /* A fala B sai (corrigida, apagada): A volta a ser a última, e não é pedida de novo. */
    mudar([a])
    await passar(ESPERA_DO_ASSISTENTE_MS * 3)
    expect(api.destacarExpressoes).toHaveBeenCalledTimes(2)
  })
})
