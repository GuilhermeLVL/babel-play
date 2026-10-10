// @vitest-environment jsdom
/**
 * O ESPAÇO DE ANÚNCIO (change `planos-v3-e-rota-inteligente`, spec `anuncios-no-gratis`).
 *
 *  - ESTADO DE FÁBRICA: sem provedor registrado o componente não renderiza nada e não pede rede, com a
 *    flag ligada ou desligada. Não existe provedor de produção nesta etapa;
 *  - com um provedor, quem decide é a política: a flag, o consentimento e a idade da conta precisam
 *    estar lá, e assinante, perfil protegido, headset e tela ocupada nunca veem;
 *  - a DEMONSTRAÇÃO (só em desenvolvimento, pela chave local) desenha "Patrocinado · exemplo" com as
 *    classes do protótipo, sem rede, e continua negando para assinante, protegido, headset e tela ocupada;
 *  - o premiado é escolha: a folha diz antes o que se ganha, recusar não muda nada, e a recompensa da
 *    demonstração é simulada (nenhum pedido ao servidor).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EspacoDeAnuncio as Espaco, FormatoDeAnuncio } from '../src/core/anuncios/politicaDeAnuncio'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

const DIA = 24 * 60 * 60_000

const mundo = vi.hoisted(() => ({
  flag: false,
  semAnuncios: false,
  teste: null as { terminaEm: number } | null,
  contaCriadaEm: null as number | null,
  protegido: false,
  headset: false,
  estatica: false,
  captura: false,
  consentimento: false,
}))

vi.mock('../src/lib/flags', () => ({ useFlag: () => mundo.flag }))
vi.mock('../src/lib/flagsCache', () => ({ flagLigada: (chave: string) => chave === 'anuncios' && mundo.flag }))
vi.mock('../src/lib/entitlements', () => ({
  getEntitlements: () => ({
    plan: mundo.semAnuncios ? 'premium' : 'free',
    semAnuncios: mundo.semAnuncios,
    teste: mundo.teste,
    contaCriadaEm: mundo.contaCriadaEm,
  }),
  onPlanChange: () => () => undefined,
}))
vi.mock('../src/lib/protecaoDoMenor', () => ({
  perfilProtegido: () => mundo.protegido,
  aoMudarProtecao: () => () => undefined,
}))
vi.mock('../src/lib/dispositivo/telaNovaDoQuest', () => ({ noHeadset: () => mundo.headset }))
vi.mock('../src/lib/edicaoEstatica', () => ({ edicaoEstatica: () => mundo.estatica }))
vi.mock('../src/lib/sessaoDeCaptura', () => ({ capturaAtiva: () => mundo.captura }))
vi.mock('../src/lib/preferencias', () => ({
  usePreferencias: () => ({ consentimentos: { anuncios: mundo.consentimento } }),
  lerPreferencias: () => ({ consentimentos: { anuncios: mundo.consentimento } }),
}))
vi.mock('../src/components/Toast', () => ({
  toast: { ok: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { default: EspacoDeAnuncio } = await import('../src/components/anuncios/EspacoDeAnuncio')
const { registrarProvedorDeAnuncios, provedorDeAnuncios } = await import('../src/lib/anuncios/provedor')
const { ligarDemonstracaoDeAnuncios } = await import('../src/components/anuncios/demonstracao/ligar')
const { toast } = await import('../src/components/Toast')

const CHAVE = 'babel.px.anunciosDeProva'
let rede: ReturnType<typeof vi.fn>

/** Um provedor qualquer (não o de demonstração): prova que, com provedor, quem manda é a política. */
const PROVEDOR_DE_TESTE = {
  id: 'teste',
  Espaco: ({ espaco, formato }: { espaco: Espaco; formato: FormatoDeAnuncio }) => (
    <div data-testid="anuncio-de-teste" data-espaco={espaco} data-formato={formato} />
  ),
}

/** O Grátis adulto que a política deixa ver: flag, consentimento e conta de dez dias. */
function quemPodeVer() {
  Object.assign(mundo, { flag: true, consentimento: true, contaCriadaEm: Date.now() - 10 * DIA })
}

async function comDemonstracao() {
  localStorage.setItem(CHAVE, '1')
  await act(async () => {
    expect(await ligarDemonstracaoDeAnuncios()).toBe(true)
  })
}

beforeAll(prepararDialogoNoJsdom)
beforeEach(() => {
  Object.assign(mundo, {
    flag: false,
    semAnuncios: false,
    teste: null,
    contaCriadaEm: null,
    protegido: false,
    headset: false,
    estatica: false,
    captura: false,
    consentimento: false,
  })
  localStorage.clear()
  registrarProvedorDeAnuncios(null)
  document.body.removeAttribute('data-jogo-ativo')
  window.history.replaceState({}, '', '/')
  rede = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', rede)
  vi.stubGlobal('XMLHttpRequest', vi.fn())
  vi.mocked(toast.ok).mockClear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('estado de fábrica: sem provedor', () => {
  it('não existe provedor registrado', () => {
    expect(provedorDeAnuncios()).toBeNull()
  })

  it.each([
    ['flag desligada', false],
    ['flag LIGADA, consentimento dado e conta antiga', true],
  ])('%s: não renderiza nada e não pede rede', async (_nome, ligada) => {
    if (ligada) quemPodeVer()
    const { container } = render(
      <>
        <EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />
        <EspacoDeAnuncio espaco="bib-infeed" formato="nativo" />
        <EspacoDeAnuncio espaco="fim-premiado" formato="premiado" />
        <EspacoDeAnuncio espaco="fim-bloco" formato="nativo" />
        <EspacoDeAnuncio espaco="loja-seeds" formato="premiado" />
      </>,
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.innerHTML).toBe('')
    expect(rede).not.toHaveBeenCalled()
    expect(XMLHttpRequest).not.toHaveBeenCalled()
    expect(document.querySelector('script[src], iframe, img')).toBeNull()
    expect(provedorDeAnuncios()).toBeNull()
  })

  it('sem a chave local, a demonstração não liga (e não carrega o provedor)', async () => {
    expect(await ligarDemonstracaoDeAnuncios()).toBe(false)
    expect(provedorDeAnuncios()).toBeNull()
  })

  it('a chave com outro valor não liga', async () => {
    localStorage.setItem(CHAVE, 'sim')
    expect(await ligarDemonstracaoDeAnuncios()).toBe(false)
    expect(provedorDeAnuncios()).toBeNull()
  })
})

describe('com um provedor, quem decide é a política', () => {
  beforeEach(() => registrarProvedorDeAnuncios(PROVEDOR_DE_TESTE))
  const montar = () => render(<EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />)

  it('Grátis adulto, flag ligada, consentimento e conta antiga: o provedor desenha', () => {
    quemPodeVer()
    montar()
    expect(screen.getByTestId('anuncio-de-teste').dataset).toMatchObject({ espaco: 'inicio-nativo', formato: 'nativo' })
  })

  it.each([
    ['flag desligada', () => Object.assign(mundo, { flag: false })],
    ['sem consentimento', () => Object.assign(mundo, { consentimento: false })],
    ['conta de dois dias', () => Object.assign(mundo, { contaCriadaEm: Date.now() - 2 * DIA })],
    ['conta sem data', () => Object.assign(mundo, { contaCriadaEm: null })],
    ['assinante (`semAnuncios`)', () => Object.assign(mundo, { semAnuncios: true })],
    ['teste de 14 dias', () => Object.assign(mundo, { teste: { terminaEm: Date.now() + DIA } })],
    ['perfil protegido', () => Object.assign(mundo, { protegido: true })],
    ['headset', () => Object.assign(mundo, { headset: true })],
    ['edição estática', () => Object.assign(mundo, { estatica: true })],
    ['captura ativa', () => Object.assign(mundo, { captura: true })],
    ['rodada em andamento', () => document.body.setAttribute('data-jogo-ativo', '1')],
    ['intérprete aberto', () => window.history.replaceState({}, '', '/interprete')],
  ])('%s: nada', (_nome, mudar) => {
    quemPodeVer()
    mudar()
    const { container } = montar()
    expect(container.innerHTML).toBe('')
  })

  it('formato que não é o do espaço: nada', () => {
    quemPodeVer()
    const { container } = render(<EspacoDeAnuncio espaco="inicio-nativo" formato="intersticial" />)
    expect(container.innerHTML).toBe('')
  })

  it('o espaço do fim de rodada aparece quando a rodada fecha (`babel:rodada-fechou`)', () => {
    quemPodeVer()
    document.body.setAttribute('data-jogo-ativo', '1')
    const { container } = render(<EspacoDeAnuncio espaco="fim-bloco" formato="nativo" />)
    expect(container.innerHTML).toBe('')
    act(() => {
      document.body.removeAttribute('data-jogo-ativo')
      window.dispatchEvent(new Event('babel:rodada-fechou'))
    })
    expect(screen.getByTestId('anuncio-de-teste')).toBeTruthy()
  })

  it('tirar o provedor apaga o que estava desenhado', () => {
    quemPodeVer()
    const { container } = montar()
    expect(container.innerHTML).not.toBe('')
    act(() => registrarProvedorDeAnuncios(null))
    expect(container.innerHTML).toBe('')
  })
})

describe('a demonstração (só em desenvolvimento, pela chave local)', () => {
  it('desenha o cartão "Patrocinado · exemplo" com as classes do protótipo, sem flag nem consentimento', async () => {
    await comDemonstracao()
    expect(provedorDeAnuncios()?.id).toBe('demonstracao')
    const { container } = render(<EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />)
    const cartao = container.querySelector('article.q-tile.ad.ad-nativo[data-ad="inicio-nativo"]')
    expect(cartao).not.toBeNull()
    expect(cartao?.querySelector('.ad-rotulo')?.textContent).toBe('Patrocinado · exemplo')
    expect(cartao?.querySelector('button.ad-sem')?.textContent).toBe('Sem anúncios no Essencial')
    expect(cartao?.querySelector('button.ad-cta')).not.toBeNull()
  })

  it.each([
    ['bib-infeed', 'nativo', '.q-linha.ad.ad-infeed'],
    ['fim-bloco', 'nativo', 'aside.ad-fim-bloco'],
    ['fim-premiado', 'premiado', '.ad-fim-premio'],
    ['loja-seeds', 'premiado', '.q-aviso.ad.ad-aviso'],
  ] as const)('%s: desenha `%s` como `%s`, rotulado', async (espaco, formato, seletor) => {
    await comDemonstracao()
    const { container } = render(<EspacoDeAnuncio espaco={espaco} formato={formato} />)
    const el = container.querySelector(`${seletor}[data-ad="${espaco}"]`)
    expect(el, seletor).not.toBeNull()
    /* Identificado: "Patrocinado"/"Anúncio" no rótulo, ou, no bônus do fim, na própria oferta. */
    expect(el?.textContent).toMatch(/Patrocinado · exemplo|Anúncio premiado · exemplo|Ver anúncio/)
  })

  it('espaço que não está encaixado no app não tem desenho', async () => {
    await comDemonstracao()
    const { container } = render(<EspacoDeAnuncio espaco="ancora" formato="nativo" />)
    expect(container.innerHTML).toBe('')
  })

  it('não pede rede e não põe script, quadro nem imagem na página', async () => {
    await comDemonstracao()
    render(
      <>
        <EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />
        <EspacoDeAnuncio espaco="bib-infeed" formato="nativo" />
        <EspacoDeAnuncio espaco="fim-premiado" formato="premiado" />
        <EspacoDeAnuncio espaco="fim-bloco" formato="nativo" />
        <EspacoDeAnuncio espaco="loja-seeds" formato="premiado" />
      </>,
    )
    expect(document.querySelectorAll('[data-ad]')).toHaveLength(5)
    expect(rede).not.toHaveBeenCalled()
    expect(document.querySelector('script[src], iframe, img, link[href^="http"]')).toBeNull()
  })

  it.each([
    ['assinante (`semAnuncios`)', () => Object.assign(mundo, { semAnuncios: true })],
    ['teste de 14 dias', () => Object.assign(mundo, { teste: { terminaEm: Date.now() + DIA } })],
    ['perfil protegido', () => Object.assign(mundo, { protegido: true })],
    ['headset', () => Object.assign(mundo, { headset: true })],
    ['edição estática', () => Object.assign(mundo, { estatica: true })],
    ['captura ativa', () => Object.assign(mundo, { captura: true })],
    ['rodada em andamento', () => document.body.setAttribute('data-jogo-ativo', '1')],
    ['intérprete aberto', () => window.history.replaceState({}, '', '/interprete')],
  ])('%s: nunca vê, nem na demonstração, nem o premiado', async (_nome, mudar) => {
    await comDemonstracao()
    mudar()
    const { container } = render(
      <>
        <EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />
        <EspacoDeAnuncio espaco="fim-premiado" formato="premiado" />
        <EspacoDeAnuncio espaco="loja-seeds" formato="premiado" />
      </>,
    )
    expect(container.innerHTML).toBe('')
  })

  it('a porta "Sem anúncios" chama quem a tela passou', async () => {
    await comDemonstracao()
    const aoSemAnuncios = vi.fn()
    render(<EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" aoSemAnuncios={aoSemAnuncios} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sem anúncios no Essencial' }))
    expect(aoSemAnuncios).toHaveBeenCalledTimes(1)
  })

  it('sem `aoSemAnuncios`, a porta leva a Planos', async () => {
    await comDemonstracao()
    render(<EspacoDeAnuncio espaco="fim-bloco" formato="nativo" />)
    fireEvent.click(screen.getByRole('button', { name: 'Sem anúncios no Essencial' }))
    expect(window.location.pathname).toBe('/plano')
  })
})

describe('o premiado é sempre escolha (demonstração)', () => {
  const abrir = async () => {
    await comDemonstracao()
    const r = render(<EspacoDeAnuncio espaco="fim-premiado" formato="premiado" />)
    fireEvent.click(screen.getByRole('button', { name: /Ver anúncio/ }))
    return r
  }
  const folha = () => document.querySelector<HTMLDialogElement>('dialog[data-ad-folha="confirmar"]')
  const anuncio = () => document.querySelector<HTMLDialogElement>('dialog[data-ad-folha="anuncio"]')

  it('nada começa sozinho: sem o toque não há folha nem anúncio', async () => {
    await comDemonstracao()
    render(<EspacoDeAnuncio espaco="fim-premiado" formato="premiado" />)
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('a folha diz ANTES o que se ganha e quanto dura', async () => {
    await abrir()
    expect(folha()?.open).toBe(true)
    expect(folha()?.textContent).toMatch(/Ver um anúncio e ganhar \+10 Seeds\?/)
    expect(folha()?.textContent).toMatch(/até 30 s/)
    expect(anuncio()).toBeNull()
  })

  it('"Agora não" fecha e não muda nada', async () => {
    const { container } = await abrir()
    const antes = container.querySelector('.ad-fim-premio')?.outerHTML
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(document.querySelector('dialog')).toBeNull()
    expect(container.querySelector('.ad-fim-premio')?.outerHTML).toBe(antes)
    expect(toast.ok).not.toHaveBeenCalled()
  })

  it('pular antes do fim: sem recompensa', async () => {
    vi.useFakeTimers()
    const { container } = await abrir()
    fireEvent.click(folha()!.querySelector('[data-ad-f="ver"]')!)
    expect(anuncio()?.open).toBe(true)
    const pular = anuncio()!.querySelector<HTMLButtonElement>('.ad-pular')!
    expect(pular.disabled).toBe(true)
    act(() => {
      vi.advanceTimersByTime(5_200)
    })
    expect(pular.disabled).toBe(false)
    fireEvent.click(pular)
    expect(document.querySelector('dialog')).toBeNull()
    expect(container.querySelector('.ad-fim-premio.feito')).toBeNull()
    expect(toast.ok).not.toHaveBeenCalled()
  })

  it('até o fim: a recompensa é SIMULADA, dita como tal, e nada vai ao servidor', async () => {
    vi.useFakeTimers()
    const { container } = await abrir()
    fireEvent.click(folha()!.querySelector('[data-ad-f="ver"]')!)
    expect(anuncio()?.textContent).toMatch(/Anúncio de exemplo · marca fictícia/)
    expect(anuncio()?.textContent).toMatch(/Recompensa quando terminar: \+10 Seeds/)
    act(() => {
      vi.advanceTimersByTime(10_300)
    })
    expect(document.querySelector('dialog')).toBeNull()
    expect(container.querySelector('.ad-fim-premio.feito')?.textContent).toMatch(/Simulado: nada foi creditado/)
    expect(toast.ok).toHaveBeenCalledWith(expect.stringMatching(/Demonstração: \+10 Seeds simuladas/))
    expect(rede).not.toHaveBeenCalled()
  })
})
