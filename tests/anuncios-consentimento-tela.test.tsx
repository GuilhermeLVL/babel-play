// @vitest-environment jsdom
/**
 * A TELA DE CONSENTIMENTO DE ANÚNCIOS (Task 4 do estado 3; spec `anuncios-no-gratis`).
 *
 *  - uma folha só: o que é mostrado, "sem anúncio personalizado", o que é coletado, "Aceitar" e "Agora não";
 *  - grava `consentimentos.anuncios` (com data, por `mudarConsentimento`) e avisa os espaços pelo evento
 *    `babel:consentimento-anuncios`;
 *  - NUNCA aparece para o perfil protegido;
 *  - abre a partir de Ajustes → Privacidade (só com a flag ligada) e no PRIMEIRO espaço elegível, uma vez:
 *    quem já respondeu (sim ou "agora não") não é perguntado de novo pelo espaço.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DIA = 24 * 60 * 60_000

const mundo = vi.hoisted(() => ({
  flag: false,
  protegido: false,
  consentimento: false,
  respondeu: false,
  contaCriadaEm: null as number | null,
}))

vi.mock('../src/lib/flags', () => ({ useFlag: () => mundo.flag }))
vi.mock('../src/lib/flagsCache', () => ({ flagLigada: (chave: string) => chave === 'anuncios' && mundo.flag }))
vi.mock('../src/lib/entitlements', () => ({
  getEntitlements: () => ({ plan: 'free', semAnuncios: false, teste: null, contaCriadaEm: mundo.contaCriadaEm }),
  onPlanChange: () => () => undefined,
}))
vi.mock('../src/lib/protecaoDoMenor', () => ({
  perfilProtegido: () => mundo.protegido,
  aoMudarProtecao: () => () => undefined,
}))
vi.mock('../src/lib/dispositivo/telaNovaDoQuest', () => ({ noHeadset: () => false }))
vi.mock('../src/lib/edicaoEstatica', () => ({ edicaoEstatica: () => false }))
vi.mock('../src/lib/sessaoDeCaptura', () => ({ capturaAtiva: () => false }))
const mudarConsentimento = vi.hoisted(() => vi.fn(async (_k: string, _v: boolean) => true))
vi.mock('../src/lib/preferencias', () => {
  const prefs = () => ({
    consentimentos: { anuncios: mundo.consentimento },
    registroDeConsentimentos: mundo.respondeu ? [{ chave: 'anuncios', valor: false, em: 1 }] : [],
  })
  return { usePreferencias: prefs, lerPreferencias: prefs, mudarConsentimento }
})
vi.mock('../src/components/Toast', () => ({
  toast: { ok: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
const navegarPara = vi.hoisted(() => vi.fn())
vi.mock('../src/lib/rotas', async (original) => ({
  ...(await original<typeof import('../src/lib/rotas')>()),
  navegarPara,
}))
vi.mock('../src/data/rotas/anuncios', () => ({ iniciarPremiado: vi.fn(), concluirPremiado: vi.fn() }))

const { default: ConsentimentoDeAnuncios } = await import('../src/components/anuncios/ConsentimentoDeAnuncios')
const { default: AnunciosNosAjustes } = await import('../src/components/anuncios/AnunciosNosAjustes')
const { default: EspacoDeAnuncio } = await import('../src/components/anuncios/EspacoDeAnuncio')
const { registrarProvedorDeAnuncios } = await import('../src/lib/anuncios/provedor')
const { criarProvedorPorIframe } = await import('../src/lib/anuncios/provedores/iframe')

const proto = HTMLIFrameElement.prototype as unknown as Record<string, unknown>

beforeEach(() => {
  Object.assign(mundo, { flag: false, protegido: false, consentimento: false, respondeu: false, contaCriadaEm: null })
  mudarConsentimento.mockClear()
  navegarPara.mockClear()
  proto.credentialless = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}')),
  )
})
afterEach(() => {
  cleanup()
  registrarProvedorDeAnuncios(null)
  delete proto.credentialless
  vi.unstubAllGlobals()
})

describe('a folha de consentimento', () => {
  it('diz o que é mostrado, que não é personalizado e o que é coletado, com Aceitar e Agora não', () => {
    render(<ConsentimentoDeAnuncios />)
    const folha = screen.getByRole('region', { name: 'Anúncios no plano Grátis' })
    expect(folha.textContent).toMatch(/Patrocinado/)
    expect(folha.textContent).toMatch(/não são personalizados/)
    expect(folha.textContent).toMatch(/O que é coletado/)
    expect(screen.getByRole('button', { name: 'Aceitar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Agora não' })).toBeTruthy()
  })

  it('Aceitar grava o consentimento e avisa os espaços', async () => {
    const ouvinte = vi.fn()
    window.addEventListener('babel:consentimento-anuncios', ouvinte)
    const aoResponder = vi.fn()
    render(<ConsentimentoDeAnuncios aoResponder={aoResponder} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    })
    expect(mudarConsentimento).toHaveBeenCalledWith('anuncios', true)
    expect(ouvinte).toHaveBeenCalledTimes(1)
    expect((ouvinte.mock.calls[0][0] as CustomEvent).detail).toEqual({ aceito: true })
    expect(aoResponder).toHaveBeenCalledWith(true)
    window.removeEventListener('babel:consentimento-anuncios', ouvinte)
  })

  it('Agora não grava "não" (fica registrado como resposta)', async () => {
    render(<ConsentimentoDeAnuncios />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    })
    expect(mudarConsentimento).toHaveBeenCalledWith('anuncios', false)
  })

  it('perfil protegido: nunca aparece', () => {
    mundo.protegido = true
    const { container } = render(<ConsentimentoDeAnuncios />)
    expect(container.innerHTML).toBe('')
  })
})

describe('no primeiro espaço elegível', () => {
  function elegivelSemConsentimento() {
    Object.assign(mundo, { flag: true, consentimento: false, contaCriadaEm: Date.now() - 10 * DIA })
    registrarProvedorDeAnuncios(criarProvedorPorIframe({ origem: 'https://ads.frasy.com.br', rede: '1' }))
  }

  it('com o provedor real e a flag: o convite aparece em UM espaço só, sem iframe', async () => {
    elegivelSemConsentimento()
    render(
      <>
        <EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />
        <EspacoDeAnuncio espaco="bib-infeed" formato="nativo" />
      </>,
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getAllByRole('region', { name: 'Anúncios no plano Grátis' })).toHaveLength(1)
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })

  it('quem já respondeu não é perguntado de novo', async () => {
    elegivelSemConsentimento()
    mundo.respondeu = true
    const { container } = render(<EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.innerHTML).toBe('')
  })

  it('flag desligada: nenhum convite', async () => {
    elegivelSemConsentimento()
    mundo.flag = false
    const { container } = render(<EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.innerHTML).toBe('')
  })

  it('perfil protegido: nenhum convite', async () => {
    elegivelSemConsentimento()
    mundo.protegido = true
    const { container } = render(<EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.innerHTML).toBe('')
  })
})

describe('Ajustes → Privacidade → Anúncios', () => {
  it('flag desligada: a entrada não existe', () => {
    const { container } = render(<AnunciosNosAjustes />)
    expect(container.innerHTML).toBe('')
  })

  it('perfil protegido: a entrada não existe', () => {
    Object.assign(mundo, { flag: true, protegido: true })
    const { container } = render(<AnunciosNosAjustes />)
    expect(container.innerHTML).toBe('')
  })

  it('flag ligada: mostra o estado, abre a folha e tem a porta "Sem anúncios"', () => {
    mundo.flag = true
    render(<AnunciosNosAjustes />)
    expect(screen.getByText('Você não aceitou anúncios.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rever' }))
    expect(screen.getByRole('region', { name: 'Anúncios no plano Grátis' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sem anúncios' }))
    expect(navegarPara).toHaveBeenCalledWith({ view: 'planos' })
  })

  it('com o consentimento dado, diz que aceitou', () => {
    Object.assign(mundo, { flag: true, consentimento: true })
    render(<AnunciosNosAjustes />)
    expect(screen.getByText('Você aceitou ver anúncios no plano Grátis.')).toBeTruthy()
  })
})
