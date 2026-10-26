// @vitest-environment jsdom
/**
 * "PRATICAR A CONVERSA" NO INTÉRPRETE (spec `docs/specs/2026-10-25-assistente-ao-vivo.md`, "Praticar a conversa"). O que
 * se prende é REGRA:
 *   - o botão liga a prática: a metade da pessoa FALA o idioma que ela aprende e segue OUVINDO no dela; a conversa é por
 *     toque (o automático não separa duas pessoas no mesmo idioma);
 *   - a correção é planejada SÓ para a fala da própria pessoa, nunca para a da outra; o lado incerto (palpite do
 *     automático, fala sem metade) nunca vai à correção — a fala de terceiros não chega à `/correcao`;
 *   - o portão: flag + plano pago ou teste + consentimento; no Grátis e no perfil protegido, a nota honesta, sem oferta;
 *   - "Falar esta" abre o microfone na metade da pessoa e compara a fala com a sugestão.
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ flag: true, plano: 'plus', consentiu: true, protegido: false }))
vi.mock('../src/lib/flags', () => ({ useFlag: () => estado.flag }))
vi.mock('../src/lib/entitlements', async (original) => ({
  ...(await original<typeof import('../src/lib/entitlements')>()),
  getEntitlements: () => ({ plan: estado.plano }),
  onPlanChange: () => () => {},
}))
vi.mock('../src/lib/consentimentoDeNuvem', async (original) => ({
  ...(await original<typeof import('../src/lib/consentimentoDeNuvem')>()),
  useConsentimentoDeNuvem: () => ({ consentiu: estado.consentiu, autorizar: vi.fn(async () => true) }),
}))
vi.mock('../src/lib/protecaoDoMenor', () => ({ perfilProtegido: () => estado.protegido }))
const api = vi.hoisted(() => ({
  destacarExpressoes: vi.fn(),
  explicarTermos: vi.fn(),
  comoRespondo: vi.fn(),
  corrigirMinhaFala: vi.fn(),
}))
vi.mock('../src/data/apiDoAssistente', () => api)
vi.mock('../src/lib/tts', async (original) => {
  const real = await original<typeof import('../src/lib/tts')>()
  return {
    ...real,
    nativeTts: {
      speak: (_t: string, opts: { onStart?: () => void }) => opts.onStart?.(),
      cancel: () => {},
      isSpeaking: () => false,
    },
  }
})

import { useAssistenteAoVivo } from '../src/components/views/captura/assistente/useAssistenteAoVivo'
import ModoInterprete, { type FalaDoInterprete } from '../src/components/views/captura/interprete/ModoInterprete'
import PaginaDoInterprete from '../src/components/views/captura/interprete/PaginaDoInterprete'
import type { PraticaNaConversa } from '../src/components/views/captura/interprete/praticaNaConversa'
import { compararComASugestao, correcaoNaPratica, praticaPossivel } from '../src/core/assistente/praticaDaConversa'
import { type FalaDoAssistente, planejarChamadas, recursosDoAssistente } from '../src/core/assistente/telaDoAssistente'
import { AJUSTES_PADRAO } from '../src/core/assistente/telaDoAssistente'
import { ESPERA_DO_ASSISTENTE_MS } from '../src/lib/assistente/agendaDoAssistente'
import { esquecerAjustesDoAssistente } from '../src/lib/assistente/ajustesDoAssistente'
import { contextoDasFalas, falasDoAssistente } from '../src/lib/assistente/falasDoAssistente'
import type { PonteDoInterprete } from '../src/lib/captura/controleDoInterprete'
import { direcaoDoLado, idiomasDaConversa } from '../src/lib/captura/interprete'
import { decidirLadoDaFala, ESTADO_DO_AUTOMATICO } from '../src/lib/captura/interpreteAutomatico'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'
import { estabilizarFalas } from '../src/lib/legendas/estabilizarFalas'
import { estadoDaTela, mudarEstadoDaTela, tomarPedidoDaConversa } from '../src/lib/polimento/interprete'

type Opcoes = Parameters<typeof useAssistenteAoVivo>[0]

beforeEach(() => {
  localStorage.clear()
  esquecerAjustesDoAssistente()
  Object.assign(estado, { flag: true, plano: 'plus', consentiu: true, protegido: false })
  for (const f of Object.values(api)) f.mockReset()
  api.destacarExpressoes.mockResolvedValue({ ok: true, valor: { expressoes: [], restanteHoje: 199 } })
  api.explicarTermos.mockResolvedValue({ ok: true, valor: { termos: [] } })
  api.corrigirMinhaFala.mockResolvedValue({
    ok: true,
    valor: { correcao: { ok: false, corrigida: 'I want to go to the beach.', dica: 'Want pede "to".' } },
  })
  mudarEstadoDaTela({ emCurso: false, trocados: false, folhaVirtual: false, depois: null, praticar: false })
  tomarPedidoDaConversa()
  Element.prototype.animate = function () {
    return { finished: Promise.resolve(), cancel: () => {} } as unknown as Animation
  } as unknown as typeof Element.prototype.animate
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/* ───────────────────────────── as regras puras ───────────────────────────── */

describe('as regras da prática', () => {
  it('cabe com o idioma da outra pessoa escolhido e um idioma a aprender diferente do da pessoa', () => {
    expect(praticaPossivel({ meu: 'pt-BR', outro: 'en-US', aprende: 'en-US' })).toBe('ok')
    expect(praticaPossivel({ meu: 'pt-BR', outro: '', aprende: 'en-US' })).toBe('detectar')
    expect(praticaPossivel({ meu: 'pt-BR', outro: 'en-US', aprende: 'pt' })).toBe('sem_idioma')
    expect(praticaPossivel({ meu: 'pt-BR', outro: 'en-US', aprende: '' })).toBe('sem_idioma')
  })

  it('o portão da correção: a nuvem do plano e o consentimento', () => {
    expect(correcaoNaPratica({ nuvem: true }, true)).toBe('ligada')
    expect(correcaoNaPratica({ nuvem: true }, false)).toBe('sem_consentimento')
    expect(correcaoNaPratica({ nuvem: false }, true)).toBe('indisponivel')
  })

  it('a comparação com a sugestão: as palavras que faltaram, sem contar a ordem nem a pontuação', () => {
    expect(compararComASugestao('thanks I really needed that', 'Thanks! I really needed that.')).toEqual({
      igual: true,
      faltaram: [],
    })
    expect(compararComASugestao('thanks I needed it', 'Thanks! I really needed that.')).toEqual({
      igual: false,
      faltaram: ['really', 'that'],
    })
    expect(compararComASugestao('I dont know', "I don't know")).toMatchObject({ faltaram: ["don't"] })
  })

  it('a direção: praticando, a metade da pessoa FALA o idioma que aprende e segue OUVINDO no dela', () => {
    const idiomas = { meu: 'pt-BR', outro: 'en-US', falaDoMeu: 'en-US' }
    expect(direcaoDoLado('meu', idiomas)).toMatchObject({ lado: 'meu', fala: 'en-US', de: 'en', para: 'en' })
    expect(direcaoDoLado('outro', idiomas)).toMatchObject({ lado: 'outro', fala: 'en-US', de: 'en', para: 'pt' })
    /* Com os lados trocados, a metade de cima é a da pessoa. */
    expect(direcaoDoLado('outro', idiomas, true)).toMatchObject({ fala: 'en-US', para: 'en' })
    expect(direcaoDoLado('meu', idiomas, true)).toMatchObject({ fala: 'en-US', para: 'pt' })
    /* Sem a prática, nada muda. */
    expect(direcaoDoLado('meu', { meu: 'pt-BR', outro: 'en-US' })).toMatchObject({ fala: 'pt-BR', para: 'en' })
    /* O motor serve a um idioma só (sem repetir). */
    expect(idiomasDaConversa(idiomas)).toEqual(['en-US'])
  })

  it('o automático com as duas metades no mesmo idioma não tem certeza: é sempre palpite', () => {
    const pistas = { idiomaDoMotor: 'en', idiomaDoTexto: 'en', audioMs: 3000 }
    const a = decidirLadoDaFala(pistas, { meu: 'en', outro: 'en' }, ESTADO_DO_AUTOMATICO)
    expect(a).toMatchObject({ lado: 'meu', palpite: true })
    const b = decidirLadoDaFala(pistas, { meu: 'en', outro: 'en' }, a.estado)
    expect(b).toMatchObject({ lado: 'outro', palpite: true })
    /* Com idiomas diferentes, o idioma medido segue valendo como evidência. */
    expect(decidirLadoDaFala(pistas, { meu: 'pt', outro: 'en' }, ESTADO_DO_AUTOMATICO)).toMatchObject({
      lado: 'outro',
      palpite: false,
    })
  })
})

/* ───────────────────── as falas e o plano de chamadas ───────────────────── */

const segmento = (id: string, texto: string, extra: Partial<SpeechSegment> = {}): SpeechSegment =>
  ({
    id,
    speakerId: 'user',
    source: 'mic',
    timestamp: '00:01',
    originalText: texto,
    translatedText: '',
    words: [],
    isPartial: false,
    lang: 'en',
    ...extra,
  }) as SpeechSegment

const PRATICANDO = {
  trocados: false,
  idiomaDaPessoa: 'en-US',
  idiomaDoOutro: 'en-US',
  ...contextoDasFalas('mic', true),
}

describe('na prática, a correção é planejada só para a própria fala', () => {
  const recursos = recursosDoAssistente(
    { ...AJUSTES_PADRAO, correcao: true },
    { flagLigada: true, assistenteDiaDoPlano: 200, recusadoNaSessao: false, consentiuNuvem: true },
  )

  it('a fala da pessoa no idioma que aprende tem correção; a da outra pessoa, no mesmo idioma, nunca', () => {
    const [minha, dela] = falasDoAssistente(
      [
        segmento('m', 'I want go to the beach tomorrow', { lado: 'meu' }),
        segmento('o', 'Where do you want to go tomorrow?', { lado: 'outro' }),
      ],
      PRATICANDO,
    )
    expect(minha).toMatchObject({ lado: 'voce', lang: 'en' })
    expect(dela).toMatchObject({ lado: 'eles', lang: 'en' })
    expect(planejarChamadas(minha, recursos, 'pt-BR').correcao).toBe(true)
    expect(planejarChamadas(dela, recursos, 'pt-BR').correcao).toBe(false)
  })

  it('o lado incerto não tem correção: o palpite do automático e a fala que ainda espera a metade', () => {
    const vistos = new Map<string, FalaDoAssistente['lado']>()
    const [palpite, semMetade, delaPorPalpite] = falasDoAssistente(
      [
        segmento('p', 'I want go to the beach tomorrow', { lado: 'meu', ladoPalpite: true }),
        segmento('s', 'Where do you want to go tomorrow?', { lado: undefined }),
        segmento('q', 'Sounds great to me, really', { lado: 'outro', ladoPalpite: true }),
      ],
      { ...PRATICANDO, ladosVistos: vistos },
    )
    expect(palpite).toMatchObject({ lado: 'incerto', parcial: false })
    expect(semMetade).toMatchObject({ lado: 'incerto', parcial: true })
    expect(delaPorPalpite).toMatchObject({ lado: 'eles' })
    for (const f of [palpite, semMetade, delaPorPalpite])
      expect(planejarChamadas(f, recursos, 'pt-BR').correcao).toBe(false)
    /* O palpite nunca fica guardado como certo. */
    expect(vistos.has('p')).toBe(false)
  })
})

/* ───────────────────── a instância do assistente, praticando ───────────────────── */

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

/** A fiação da `LiveCapture` no Intérprete: as falas da sessão → `falasDoAssistente` → a instância. */
function montarAssistente(praticando: boolean) {
  vi.useFakeTimers()
  const vistos = new Map<string, FalaDoAssistente['lado']>()
  const antes = new Map<string, FalaDoAssistente>()
  const props = (segs: SpeechSegment[]): Opcoes => ({
    aberta: false,
    pausado: false,
    falas: estabilizarFalas(antes, falasDoAssistente(segs, { ...PRATICANDO, ladosVistos: vistos })),
    langDaPessoa: 'pt-BR',
    langQueAprende: 'en-US',
    pagina: { aberta: true },
    semente: 0,
    praticando,
  })
  const h = renderHook<ReturnType<typeof useAssistenteAoVivo>, Opcoes>((p) => useAssistenteAoVivo(p), {
    initialProps: props([]),
  })
  return { h, mudar: (segs: SpeechSegment[]) => h.rerender(props(segs)) }
}

const MINHA = segmento('m1', 'I want go to the beach tomorrow', { lado: 'meu' })
const DELA = segmento('o1', 'Where do you want to go tomorrow, my friend?', { lado: 'outro' })

describe('a instância praticando: a fala de terceiros nunca chega à correção', () => {
  it('a prática liga a correção (sem o ajuste): só a fala da pessoa sai, nunca a da outra', async () => {
    const { h, mudar } = montarAssistente(true)
    mudar([DELA])
    await passar()
    mudar([DELA, MINHA])
    await passar()
    expect(api.corrigirMinhaFala).toHaveBeenCalledTimes(1)
    expect(api.corrigirMinhaFala.mock.calls[0][0]).toEqual({
      minhaFala: 'I want go to the beach tomorrow',
      lang: 'en',
      langDaPessoa: 'pt-BR',
    })
    expect([...h.result.current.pagina.correcoes.keys()]).toEqual(['m1'])
    /* O ajuste guardado não muda: a prática é da vez. */
    expect(h.result.current.ajustes.correcao).toBe(false)
  })

  it('sem a prática (e com o ajuste desligado), nenhuma correção', async () => {
    const { mudar } = montarAssistente(false)
    mudar([MINHA])
    await passar()
    expect(api.corrigirMinhaFala).not.toHaveBeenCalled()
  })

  it('o palpite do automático e a fala sem metade nunca vão à correção, mesmo praticando', async () => {
    const { mudar } = montarAssistente(true)
    const palpite = segmento('p1', 'I want go to the beach tomorrow', { lado: 'meu', ladoPalpite: true })
    const semMetade = segmento('s1', 'I goed to the store yesterday', { lado: undefined })
    mudar([palpite])
    await passar()
    mudar([palpite, semMetade])
    await passar(ESPERA_DO_ASSISTENTE_MS * 3)
    /* A fala sem metade vira da OUTRA pessoa: ainda nada. */
    mudar([palpite, { ...semMetade, lado: 'outro' }])
    await passar()
    expect(api.corrigirMinhaFala).not.toHaveBeenCalled()
  })

  it.each([
    ['Grátis', { plano: 'free' }],
    ['flag desligada', { flag: false }],
    ['sem o consentimento de nuvem', { consentiu: false }],
  ])('%s: nada vai à correção', async (_n, mudanca) => {
    Object.assign(estado, mudanca)
    const { mudar } = montarAssistente(true)
    mudar([MINHA])
    await passar()
    expect(api.corrigirMinhaFala).not.toHaveBeenCalled()
  })

  it('perfil protegido num plano pago: a prática corrige (a mesma frase da própria pessoa)', async () => {
    estado.protegido = true
    const { mudar } = montarAssistente(true)
    mudar([MINHA])
    await passar()
    expect(api.corrigirMinhaFala).toHaveBeenCalledTimes(1)
  })
})

/* ───────────────────────────── as telas ───────────────────────────── */

const pratica = (extra: Partial<PraticaNaConversa> = {}): PraticaNaConversa => ({
  idioma: 'en-US',
  ligada: false,
  possivel: 'ok',
  correcao: 'ligada',
  aoMudar: vi.fn(),
  aoAutorizar: vi.fn(),
  ...extra,
})

function montarConversa(o: { pratica?: PraticaNaConversa; falas?: FalaDoInterprete[]; assistente?: object } = {}) {
  const abrir = vi.fn()
  const fechar = vi.fn()
  const ponte: { atual: PonteDoInterprete | null } = { atual: null }
  const props = {
    idiomas: { meu: 'pt-BR', outro: 'en-US' },
    microfone: { abrir, fechar },
    registrarPonte: (p: PonteDoInterprete | null) => {
      ponte.atual = p
    },
    vozNaturalDisponivel: false,
    layout: 'celular' as const,
    automatico: 'disponivel' as const,
    aoSair: vi.fn(),
    ...(o.pratica ? { pratica: o.pratica } : {}),
    ...(o.assistente ? { assistente: o.assistente as React.ComponentProps<typeof ModoInterprete>['assistente'] } : {}),
  }
  const r = render(<ModoInterprete {...props} falas={o.falas ?? []} />)
  const trocar = (extra: { pratica?: PraticaNaConversa; falas?: FalaDoInterprete[] }) =>
    r.rerender(<ModoInterprete {...props} {...extra} falas={extra.falas ?? o.falas ?? []} />)
  return { abrir, ponte, trocar, ...r }
}

const aviso = () => screen.getByTestId('aviso-do-interprete').textContent

describe('ModoInterprete: o botão "Praticar"', () => {
  it('desligado de fábrica; o toque pede para ligar', () => {
    const p = pratica()
    montarConversa({ pratica: p })
    const botao = screen.getByRole('button', { name: 'Praticar falando em inglês' })
    expect(botao.getAttribute('aria-pressed')).toBe('false')
    /* Quem tem o automático começa nele. */
    expect(screen.getByTestId('escuta-automatica')).toBeTruthy()
    fireEvent.click(botao)
    expect(p.aoMudar).toHaveBeenCalledWith(true)
  })

  it('ligado: a metade da pessoa fala English, a conversa é por toque, e o microfone abre nesse idioma', () => {
    const { ponte, abrir } = montarConversa({ pratica: pratica({ ligada: true }) })
    expect(screen.getByRole('button', { name: 'Praticar falando em inglês' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByTestId('escuta-automatica')).toBeNull()
    const minha = screen.getByTestId('interprete-meu')
    expect(minha.textContent).toContain('Toque em Falar e responda em inglês.')
    fireEvent.click(screen.getByTestId('falar-meu'))
    expect(abrir).toHaveBeenCalledTimes(1)
    expect(ponte.atual!.direcao()).toMatchObject({ lado: 'meu', fala: 'en-US', para: 'en' })
    expect(aviso()).toContain('Praticando em inglês: a sua fala ganha uma dica')
    /* "Automático" praticando: não liga, e a faixa diz por quê. */
    fireEvent.click(screen.getByTestId('modo-automatico'))
    expect(screen.queryByTestId('escuta-automatica')).toBeNull()
    expect(aviso()).toContain('cada um toca em Falar na sua vez')
  })

  it('a fala da pessoa no mesmo idioma da outra (sem tradução, antes do fim da fala) não prende em "Traduzindo"', () => {
    const { ponte } = montarConversa({ pratica: pratica({ ligada: true }) })
    fireEvent.click(screen.getByTestId('falar-meu'))
    act(() =>
      ponte.atual!.aoTraduzirFinal({
        segId: 'm1',
        original: 'I want go to the beach',
        resultado: 'sem-traducao',
        traducao: '',
        de: 'en',
        para: 'en',
        aproximada: false,
        falada: true,
      }),
    )
    act(() => ponte.atual!.aoFimDaFala({ segId: 'm1', source: 'mic', lado: 'meu' }))
    expect(screen.getByTestId('modo-interprete').getAttribute('data-fase')).toBe('parado')
  })

  it('a fala da outra pessoa segue chegando traduzida para o idioma da pessoa', () => {
    const { ponte } = montarConversa({ pratica: pratica({ ligada: true }) })
    fireEvent.click(screen.getByTestId('falar-outro'))
    expect(ponte.atual!.direcao()).toMatchObject({ lado: 'outro', fala: 'en-US', para: 'pt' })
  })

  it('Grátis: a nota honesta, sem oferta de plano; sem consentimento: o botão de autorizar', () => {
    const r = montarConversa({ pratica: pratica({ ligada: true, correcao: 'indisponivel' }) })
    expect(aviso()).toContain('não está disponível nesta conta; a tradução segue funcionando')
    expect(screen.queryByText(/Premium|plano/i)).toBeNull()
    expect(screen.queryByTestId('acao-do-aviso')).toBeNull()
    r.unmount()
    const p = pratica({ ligada: true, correcao: 'sem_consentimento' })
    montarConversa({ pratica: p })
    expect(aviso()).toContain('que você ainda não autorizou')
    fireEvent.click(screen.getByTestId('acao-do-aviso'))
    expect(p.aoAutorizar).toHaveBeenCalledTimes(1)
  })

  it('no "Detectar" a prática não liga: a faixa pede o idioma da outra pessoa', () => {
    const p = pratica({ possivel: 'detectar' })
    montarConversa({ pratica: p })
    fireEvent.click(screen.getByRole('button', { name: 'Praticar falando em inglês' }))
    expect(p.aoMudar).not.toHaveBeenCalled()
    expect(aviso()).toBe('Para praticar, escolha o idioma da outra pessoa.')
  })

  it('sem a prática (flag desligada), o botão nem aparece', () => {
    montarConversa()
    expect(screen.queryByRole('button', { name: /Praticar/ })).toBeNull()
  })
})

describe('ModoInterprete: "Falar esta" e a correção na metade da pessoa', () => {
  const doOutro: FalaDoInterprete = {
    id: 'o1',
    originalText: 'How was your weekend?',
    translatedText: 'Como foi o seu fim de semana?',
    isPartial: false,
    lado: 'outro',
    lang: 'en',
  }
  const assistente = (extra: Record<string, unknown> = {}) => ({
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
    marcas: new Map(),
    correcoes: new Map(),
    comoRespondo: {
      estado: 'ok' as const,
      falaId: 'o1',
      frase: doOutro.originalText,
      lang: 'en',
      onde: 'pagina' as const,
      sugestoes: [{ texto: 'It was really great!', traducao: 'Foi ótimo mesmo!', tom: 'informal' as const }],
    },
    pedirComoRespondo: vi.fn(),
    fecharComoRespondo: vi.fn(),
    autorizarEPedir: vi.fn(),
    ...extra,
  })

  it('só praticando a sugestão tem "Falar esta"', () => {
    montarConversa({ falas: [doOutro], assistente: assistente() })
    expect(screen.queryByTestId('falar-esta')).toBeNull()
  })

  it('"Falar esta" fecha a folha, abre o microfone na metade da pessoa e compara a próxima fala dela', () => {
    const a = assistente()
    const p = pratica({ ligada: true })
    const { abrir, ponte, trocar } = montarConversa({ pratica: p, falas: [doOutro], assistente: a })
    fireEvent.click(screen.getByRole('button', { name: 'Falar esta: It was really great!' }))
    expect(a.fecharComoRespondo).toHaveBeenCalled()
    expect(abrir).toHaveBeenCalledTimes(1)
    expect(ponte.atual!.direcao()).toMatchObject({ lado: 'meu', fala: 'en-US' })
    expect(screen.getByTestId('sugestao-para-ler').textContent).toContain('It was really great!')

    const minha: FalaDoInterprete = {
      id: 'm1',
      originalText: 'It was great',
      translatedText: '',
      isPartial: false,
      lado: 'meu',
      lang: 'en',
    }
    trocar({ pratica: p, falas: [doOutro, minha] })
    expect(screen.queryByTestId('sugestao-para-ler')).toBeNull()
    const metade = screen.getByTestId('interprete-meu')
    expect(metade.querySelector('[data-testid="comparacao-com-a-sugestao"]')?.textContent).toContain(
      'Da sugestão, faltou: really',
    )
  })

  it('a correção da própria fala aparece na metade dela, discreta, e nunca na da outra pessoa', () => {
    const minha: FalaDoInterprete = {
      id: 'm1',
      originalText: 'I want go to the beach',
      translatedText: '',
      isPartial: false,
      lado: 'meu',
      lang: 'en',
    }
    const a = assistente({
      comoRespondo: { estado: 'fechado' },
      correcoes: new Map([['m1', { ok: false, corrigida: 'I want to go to the beach.', dica: 'Want pede "to".' }]]),
    })
    montarConversa({ pratica: pratica({ ligada: true }), falas: [doOutro, minha], assistente: a })
    const correcao = screen.getByTestId('correcao-da-fala')
    expect(screen.getByTestId('interprete-meu').contains(correcao)).toBe(true)
    expect(correcao.getAttribute('aria-live')).toBe('off')
    expect(correcao.textContent).toContain('Mais natural:')
    expect(correcao.textContent).toContain('Want pede "to".')
    expect(screen.getByTestId('interprete-outro').querySelector('[data-testid="correcao-da-fala"]')).toBeNull()
  })
})

describe('PaginaDoInterprete: o botão "Praticar" na tela pronta', () => {
  const montar = (p: PraticaNaConversa) =>
    render(
      <PaginaDoInterprete
        idiomas={{ meu: 'pt-BR', outro: 'en-US' }}
        possivel
        aviso={null}
        automatico="disponivel"
        aoComecar={vi.fn()}
        aoEscolherIdiomas={vi.fn()}
        pratica={p}
      />,
    )

  it('desligado de fábrica; ligado, a metade da pessoa fala English e a dica diz para responder nele', () => {
    const p = pratica()
    const r = montar(p)
    const botao = screen.getByRole('button', { name: 'Praticar falando em inglês' })
    expect(botao.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(botao)
    expect(p.aoMudar).toHaveBeenCalledWith(true)
    r.unmount()
    montar(pratica({ ligada: true }))
    const minha = screen.getByTestId('interprete-meu')
    expect(minha.textContent).toContain('English')
    expect(minha.textContent).toContain('Toque em Falar e responda em inglês.')
    /* Por toque: o botão de falar de cada metade, e não a escuta do automático. */
    expect(screen.queryByTestId('escuta-automatica')).toBeNull()
  })

  it('sair da tela pronta desliga a prática (a próxima visita começa desligada)', () => {
    const r = montar(pratica())
    mudarEstadoDaTela({ praticar: true })
    r.unmount()
    expect(estadoDaTela().praticar).toBe(false)
  })
})
