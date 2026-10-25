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
import { ESPERA_DO_ASSISTENTE_MS } from '../src/lib/assistente/agendaDoAssistente'
import { esquecerAjustesDoAssistente, mudarAjustesDoAssistente } from '../src/lib/assistente/ajustesDoAssistente'
import { falasDoAssistente } from '../src/lib/assistente/falasDoAssistente'
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
