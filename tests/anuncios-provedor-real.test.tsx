// @vitest-environment jsdom
/**
 * O PROVEDOR REAL DE ANÚNCIOS (Task 4 do estado 3, ruling R32): um `<iframe credentialless>` para a
 * página de anúncios na origem própria (`ANUNCIOS_ORIGEM`). O app nunca carrega script de rede de
 * anúncios: quem carrega o GPT é a página de lá, e só com `consentimento=1`.
 *
 *  - sem consentimento → nenhum iframe e nenhum pedido de rede;
 *  - consentimento + flag → UM iframe `credentialless` com o `src` certo, "Patrocinado" e a porta
 *    "Sem anúncios";
 *  - perfil protegido → nada;
 *  - navegador sem `credentialless` (Firefox) → o provedor se declara indisponível e nada aparece;
 *  - mensagem de outra origem é ignorada; `recompensa` da origem de anúncios chama `aoRecompensar` UMA vez.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DIA = 24 * 60 * 60_000
const ORIGEM = 'https://ads.frasy.com.br'

const mundo = vi.hoisted(() => ({
  flag: false,
  protegido: false,
  consentimento: false,
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
vi.mock('../src/lib/preferencias', () => {
  const prefs = () => ({ consentimentos: { anuncios: mundo.consentimento }, registroDeConsentimentos: [] })
  return { usePreferencias: prefs, lerPreferencias: prefs, mudarConsentimento: vi.fn(async () => true) }
})
vi.mock('../src/components/Toast', () => ({
  toast: { ok: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
const iniciarPremiado = vi.hoisted(() => vi.fn(async () => ({ exibicaoId: 'exib-1' })))
vi.mock('../src/data/rotas/anuncios', () => ({ iniciarPremiado, concluirPremiado: vi.fn(async () => undefined) }))

const { default: EspacoDeAnuncio } = await import('../src/components/anuncios/EspacoDeAnuncio')
const { registrarProvedorDeAnuncios } = await import('../src/lib/anuncios/provedor')
const { criarProvedorPorIframe } = await import('../src/lib/anuncios/provedores/iframe')

let rede: ReturnType<typeof vi.fn>
const proto = HTMLIFrameElement.prototype as unknown as Record<string, unknown>

function quemPodeVer() {
  Object.assign(mundo, { flag: true, consentimento: true, contaCriadaEm: Date.now() - 10 * DIA })
}

const iframes = () => [...document.querySelectorAll('iframe')]

beforeEach(() => {
  Object.assign(mundo, { flag: false, protegido: false, consentimento: false, contaCriadaEm: null })
  proto.credentialless = false // o Chrome expõe a propriedade; o Firefox não
  registrarProvedorDeAnuncios(criarProvedorPorIframe({ origem: ORIGEM, rede: '1234567' }))
  rede = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', rede)
  iniciarPremiado.mockClear()
  document.querySelectorAll('script').forEach((s) => s.remove())
})
afterEach(() => {
  cleanup()
  registrarProvedorDeAnuncios(null)
  delete proto.credentialless
  vi.unstubAllGlobals()
})

describe('o provedor real (iframe credentialless)', () => {
  it('sem consentimento: nenhum iframe, nenhum script e nenhum pedido de rede', async () => {
    quemPodeVer()
    mundo.consentimento = false
    render(<EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(iframes()).toHaveLength(0)
    expect(document.querySelectorAll('script')).toHaveLength(0)
    expect(rede).not.toHaveBeenCalled()
  })

  it('flag desligada (com consentimento): nada', async () => {
    quemPodeVer()
    mundo.flag = false
    const { container } = render(<EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.innerHTML).toBe('')
    expect(rede).not.toHaveBeenCalled()
  })

  it('consentimento + flag: UM iframe credentialless com o src certo, Patrocinado e a porta Sem anúncios', async () => {
    quemPodeVer()
    const sem = vi.fn()
    render(<EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" aoSemAnuncios={sem} />)
    const lista = iframes()
    expect(lista).toHaveLength(1)
    const f = lista[0]
    expect(f.hasAttribute('credentialless')).toBe(true)
    const src = new URL(f.getAttribute('src')!)
    expect(src.origin).toBe(ORIGEM)
    expect(src.pathname).toBe('/anuncios/espaco.html')
    expect(src.searchParams.get('espaco')).toBe('inicio-nativo')
    expect(src.searchParams.get('formato')).toBe('nativo')
    expect(src.searchParams.get('consentimento')).toBe('1')
    expect(src.searchParams.get('app')).toBe(window.location.origin)
    expect(src.searchParams.get('rede')).toBe('1234567')
    expect(src.searchParams.get('tema')).toMatch(/^(claro|escuro)$/)
    expect(src.searchParams.get('idioma')).toBeTruthy()
    expect(screen.getByText('Patrocinado')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sem anúncios' }))
    expect(sem).toHaveBeenCalledTimes(1)
    // o app em si não carrega script nenhum da rede
    expect(document.querySelectorAll('script')).toHaveLength(0)
    expect(rede).not.toHaveBeenCalled()
  })

  it('perfil protegido: nada', async () => {
    quemPodeVer()
    mundo.protegido = true
    const { container } = render(<EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.innerHTML).toBe('')
    expect(rede).not.toHaveBeenCalled()
  })

  it('navegador sem credentialless (Firefox): o provedor fica indisponível e nada aparece', () => {
    quemPodeVer()
    delete proto.credentialless
    const { container } = render(<EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />)
    expect(container.innerHTML).toBe('')
  })

  it('o premiado é escolha: só o botão; o iframe só depois do clique, com a exibição do servidor', async () => {
    quemPodeVer()
    const aoRecompensar = vi.fn()
    render(<EspacoDeAnuncio espaco="fim-premiado" formato="premiado" aoRecompensar={aoRecompensar} />)
    expect(iframes()).toHaveLength(0)
    expect(screen.getByText('Patrocinado')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Ver um anúncio/ }))
    })
    expect(iniciarPremiado).toHaveBeenCalledWith('fim-premiado')
    const [f] = iframes()
    expect(f.hasAttribute('credentialless')).toBe(true)
    expect(new URL(f.src).searchParams.get('exibicao')).toBe('exib-1')
    expect(new URL(f.src).searchParams.get('formato')).toBe('premiado')
  })

  describe('as mensagens da página de anúncios', () => {
    async function abrirPremiado(aoRecompensar: () => void) {
      quemPodeVer()
      render(<EspacoDeAnuncio espaco="fim-premiado" formato="premiado" aoRecompensar={aoRecompensar} />)
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Ver um anúncio/ }))
      })
      return iframes()[0]
    }
    const mandar = (origin: string, data: unknown, source: Window | null) =>
      act(() => {
        window.dispatchEvent(new MessageEvent('message', { origin, data, source }))
      })

    it('de outra origem: ignorada', async () => {
      const aoRecompensar = vi.fn()
      const f = await abrirPremiado(aoRecompensar)
      mandar(
        'https://malicioso.example',
        { tipo: 'frasy:anuncio', evento: 'recompensa', exibicaoId: 'exib-1' },
        f.contentWindow,
      )
      expect(aoRecompensar).not.toHaveBeenCalled()
    })

    it('da origem de anúncios, recompensa: aoRecompensar UMA vez com a exibição', async () => {
      const aoRecompensar = vi.fn()
      const f = await abrirPremiado(aoRecompensar)
      const msg = { tipo: 'frasy:anuncio', evento: 'recompensa', exibicaoId: 'exib-1' }
      mandar(ORIGEM, msg, f.contentWindow)
      mandar(ORIGEM, msg, f.contentWindow)
      expect(aoRecompensar).toHaveBeenCalledTimes(1)
      expect(aoRecompensar).toHaveBeenCalledWith('exib-1')
    })

    it('recompensa de outra exibição: ignorada', async () => {
      const aoRecompensar = vi.fn()
      const f = await abrirPremiado(aoRecompensar)
      mandar(ORIGEM, { tipo: 'frasy:anuncio', evento: 'recompensa', exibicaoId: 'outra' }, f.contentWindow)
      expect(aoRecompensar).not.toHaveBeenCalled()
    })

    it('fechou: o iframe sai e o botão volta', async () => {
      const f = await abrirPremiado(vi.fn())
      mandar(ORIGEM, { tipo: 'frasy:anuncio', evento: 'fechou', exibicaoId: 'exib-1' }, f.contentWindow)
      expect(iframes()).toHaveLength(0)
      expect(screen.getByRole('button', { name: /Ver um anúncio/ })).toBeTruthy()
    })

    it('nativo vazio: o espaço some', () => {
      quemPodeVer()
      const { container } = render(<EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />)
      const [f] = iframes()
      mandar(ORIGEM, { tipo: 'frasy:anuncio', evento: 'vazio' }, f.contentWindow)
      expect(container.innerHTML).toBe('')
    })
  })
})

describe('ligar.ts: o provedor real só existe num build com a origem e a rede', () => {
  it('configDosAnuncios exige origem https (ou localhost) e rede numérica', async () => {
    const { configDosAnuncios } = await import('../src/lib/anuncios/ligar')
    expect(configDosAnuncios({})).toBeNull()
    expect(configDosAnuncios({ VITE_ANUNCIOS_ORIGEM: ORIGEM })).toBeNull()
    expect(
      configDosAnuncios({ VITE_ANUNCIOS_ORIGEM: 'http://ads.frasy.com.br', VITE_ANUNCIOS_REDE_CONTA: '1' }),
    ).toBeNull()
    expect(configDosAnuncios({ VITE_ANUNCIOS_ORIGEM: ORIGEM, VITE_ANUNCIOS_REDE_CONTA: 'abc' })).toBeNull()
    expect(configDosAnuncios({ VITE_ANUNCIOS_ORIGEM: `${ORIGEM}/x/`, VITE_ANUNCIOS_REDE_CONTA: '123' })).toEqual({
      origem: ORIGEM,
      rede: '123',
    })
  })

  it('sem as variáveis no build, nada é registrado', async () => {
    registrarProvedorDeAnuncios(null)
    const { ligarProvedorDeAnuncios } = await import('../src/lib/anuncios/ligar')
    const { provedorDeAnuncios } = await import('../src/lib/anuncios/provedor')
    expect(await ligarProvedorDeAnuncios()).toBe(false)
    expect(provedorDeAnuncios()).toBeNull()
  })
})
