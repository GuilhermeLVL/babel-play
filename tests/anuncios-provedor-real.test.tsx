// @vitest-environment jsdom
/**
 * O PROVEDOR REAL DE ANÚNCIOS (Task 4 do estado 3, rulings R32 e R35): um `<iframe credentialless sandbox>`
 * para a página de anúncios no Worker próprio (`VITE_ANUNCIOS_ORIGEM`, nunca a origem do app). O app nunca
 * carrega script de rede de anúncios: quem carrega o GPT é a página de lá, e só com `consentimento=1`.
 *
 *  - sem consentimento → nenhum iframe e nenhum pedido de rede;
 *  - consentimento + flag → UM iframe `credentialless` com o `src` certo, "Patrocinado" e a porta
 *    "Sem anúncios";
 *  - perfil protegido → nada;
 *  - navegador sem `credentialless` (Firefox) → o provedor se declara indisponível e nada aparece;
 *  - mensagem de outra origem é ignorada; `recompensa` da origem de anúncios credita UMA vez
 *    (`concluirPremiado`, o aperto de mão da Task 5) e mostra o resultado; a recusa mostra o motivo;
 *  - a CSP do app recusou o quadro (`securitypolicyviolation` em `frame-src`) → o espaço some;
 *  - flag desligada → o módulo do provedor nem é pedido (`ligarProvedorDeAnuncios` não roda).
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
type Resposta = { ok: true; exibicaoId: string } | { ok: false; status: number; error: string; code?: string }
const iniciarPremiado = vi.hoisted(() =>
  vi.fn(async (_e: string): Promise<Resposta> => ({ ok: true, exibicaoId: 'exib-1' })),
)
const concluirPremiado = vi.hoisted(() =>
  vi.fn(
    async (_id: string): Promise<Record<string, unknown>> => ({
      ok: true,
      tipo: 'seeds',
      seeds: 10,
      jaCreditado: false,
      espaco: 'fim-premiado',
    }),
  ),
)
vi.mock('../src/data/rotas/anuncios', () => ({ iniciarPremiado, concluirPremiado }))
const ligarSpy = vi.hoisted(() => vi.fn(async () => false))
vi.mock('../src/lib/anuncios/ligar', async (original) => ({
  ...(await original<typeof import('../src/lib/anuncios/ligar')>()),
  ligarProvedorDeAnuncios: ligarSpy,
}))

const { default: EspacoDeAnuncio } = await import('../src/components/anuncios/EspacoDeAnuncio')
const { registrarProvedorDeAnuncios } = await import('../src/lib/anuncios/provedor')
const { criarProvedorPorIframe } = await import('../src/lib/anuncios/provedores/iframe')

let rede: ReturnType<typeof vi.fn>
const proto = HTMLIFrameElement.prototype as unknown as Record<string, unknown>

function quemPodeVer() {
  Object.assign(mundo, { flag: true, consentimento: true, contaCriadaEm: Date.now() - 10 * DIA })
}

const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'
const iframes = () => [...document.querySelectorAll('iframe')]

beforeEach(() => {
  Object.assign(mundo, { flag: false, protegido: false, consentimento: false, contaCriadaEm: null })
  proto.credentialless = false // o Chrome expõe a propriedade; o Firefox não
  registrarProvedorDeAnuncios(criarProvedorPorIframe({ origem: ORIGEM }))
  rede = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', rede)
  iniciarPremiado.mockClear()
  concluirPremiado.mockClear()
  ligarSpy.mockClear()
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
    expect(f.getAttribute('sandbox')).toBe(SANDBOX)
    expect(f.getAttribute('sandbox')).not.toMatch(/top-navigation|allow-forms/)
    const src = new URL(f.getAttribute('src')!)
    expect(src.origin).toBe(ORIGEM)
    expect(src.pathname).toBe('/espaco.html')
    expect(src.searchParams.get('espaco')).toBe('inicio-nativo')
    expect(src.searchParams.get('formato')).toBe('nativo')
    expect(src.searchParams.get('consentimento')).toBe('1')
    // a rede e a origem do app são do build da página (R35), não da query
    expect(src.searchParams.has('app')).toBe(false)
    expect(src.searchParams.has('rede')).toBe(false)
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

  it('flag desligada: o módulo do provedor real nem é pedido (sem chunk nem CSS)', async () => {
    registrarProvedorDeAnuncios(null)
    render(<EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(ligarSpy).not.toHaveBeenCalled()
    mundo.flag = true
    cleanup()
    render(<EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(ligarSpy).toHaveBeenCalled()
  })

  it('a CSP do app recusou o quadro (frame-src): o espaço some', () => {
    quemPodeVer()
    const { container } = render(<EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />)
    expect(iframes()).toHaveLength(1)
    const e = new Event('securitypolicyviolation') as Event & Record<string, string>
    Object.assign(e, { violatedDirective: 'frame-src', blockedURI: `${ORIGEM}/espaco.html` })
    act(() => {
      document.dispatchEvent(e)
    })
    expect(container.innerHTML).toBe('')
  })

  it('violação de outra diretiva não esconde o espaço', () => {
    quemPodeVer()
    render(<EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" />)
    const e = new Event('securitypolicyviolation') as Event & Record<string, string>
    Object.assign(e, { violatedDirective: 'img-src', blockedURI: 'https://x.example/a.png' })
    act(() => {
      document.dispatchEvent(e)
    })
    expect(iframes()).toHaveLength(1)
  })

  it('o servidor recusa abrir a exibição: nenhum iframe e a tela diz o motivo', async () => {
    quemPodeVer()
    iniciarPremiado.mockResolvedValueOnce({ ok: false, status: 429, error: 'teto', code: 'teto_do_dia' })
    render(<EspacoDeAnuncio espaco="fim-premiado" formato="premiado" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Ver um anúncio/ }))
    })
    expect(iframes()).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toMatch(/recompensas de anúncio de hoje/)
  })

  it('o premiado é escolha: só o botão; o iframe só depois do clique, com a exibição do servidor', async () => {
    quemPodeVer()
    render(<EspacoDeAnuncio espaco="fim-premiado" formato="premiado" />)
    expect(iframes()).toHaveLength(0)
    expect(screen.getByText('Patrocinado')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Ver um anúncio/ }))
    })
    expect(iniciarPremiado).toHaveBeenCalledWith('fim-premiado')
    const [f] = iframes()
    expect(f.hasAttribute('credentialless')).toBe(true)
    expect(f.getAttribute('sandbox')).toBe(SANDBOX)
    expect(new URL(f.src).searchParams.get('exibicao')).toBe('exib-1')
    expect(new URL(f.src).searchParams.get('formato')).toBe('premiado')
  })

  describe('as mensagens da página de anúncios', () => {
    async function abrirPremiado() {
      quemPodeVer()
      render(<EspacoDeAnuncio espaco="fim-premiado" formato="premiado" />)
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
      const f = await abrirPremiado()
      mandar(
        'https://malicioso.example',
        { tipo: 'frasy:anuncio', evento: 'recompensa', exibicaoId: 'exib-1' },
        f.contentWindow,
      )
      expect(concluirPremiado).not.toHaveBeenCalled()
    })

    const recompensa = (f: HTMLIFrameElement) =>
      act(async () => {
        window.dispatchEvent(
          new MessageEvent('message', {
            origin: ORIGEM,
            data: { tipo: 'frasy:anuncio', evento: 'recompensa', exibicaoId: 'exib-1' },
            source: f.contentWindow,
          }),
        )
      })

    it('da origem de anúncios, recompensa: o servidor credita UMA vez com a exibição, e a tela diz', async () => {
      const f = await abrirPremiado()
      await recompensa(f)
      await recompensa(f)
      expect(concluirPremiado).toHaveBeenCalledTimes(1)
      expect(concluirPremiado).toHaveBeenCalledWith('exib-1')
      expect(screen.getByRole('status').textContent).toBe('Recompensa registrada.')
    })

    it('recusa do servidor (teto do dia): a tela diz o motivo', async () => {
      concluirPremiado.mockResolvedValueOnce({ ok: false, status: 429, error: 'teto', code: 'teto_do_dia' })
      const f = await abrirPremiado()
      await recompensa(f)
      expect(screen.getByRole('status').textContent).toMatch(/recompensas de anúncio de hoje/)
    })

    it('recusa do servidor (cedo demais): a tela diz o motivo', async () => {
      concluirPremiado.mockResolvedValueOnce({ ok: false, status: 409, error: 'cedo', code: 'cedo_demais' })
      const f = await abrirPremiado()
      await recompensa(f)
      expect(screen.getByRole('status').textContent).toMatch(/tempo mínimo/)
    })

    it('recompensa de outra exibição: ignorada', async () => {
      const f = await abrirPremiado()
      mandar(ORIGEM, { tipo: 'frasy:anuncio', evento: 'recompensa', exibicaoId: 'outra' }, f.contentWindow)
      expect(concluirPremiado).not.toHaveBeenCalled()
    })

    it('fechou: o iframe sai e o botão volta', async () => {
      const f = await abrirPremiado()
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

describe('ligar.ts: o provedor real só existe num build com a origem de anúncios, e nunca a do app', () => {
  it('configDosAnuncios exige origem https (ou localhost) e recusa a origem do próprio app (R35)', async () => {
    const { configDosAnuncios } = await import('../src/lib/anuncios/ligar')
    const app = 'https://frasy.com.br'
    expect(configDosAnuncios({}, app)).toBeNull()
    expect(configDosAnuncios({ VITE_ANUNCIOS_ORIGEM: 'http://ads.frasy.com.br' }, app)).toBeNull()
    expect(configDosAnuncios({ VITE_ANUNCIOS_ORIGEM: `${ORIGEM}/x/` }, app)).toEqual({ origem: ORIGEM })
    expect(configDosAnuncios({ VITE_ANUNCIOS_ORIGEM: 'https://frasy.com.br/anuncios/' }, app)).toBeNull()
    // o padrão compara com a origem da página em que o app está
    expect(configDosAnuncios({ VITE_ANUNCIOS_ORIGEM: window.location.origin })).toBeNull()
  })

  it('sem a variável no build, nada é registrado', async () => {
    registrarProvedorDeAnuncios(null)
    const { ligarProvedorDeAnuncios } =
      await vi.importActual<typeof import('../src/lib/anuncios/ligar')>('../src/lib/anuncios/ligar')
    const { provedorDeAnuncios } = await import('../src/lib/anuncios/provedor')
    expect(await ligarProvedorDeAnuncios()).toBe(false)
    expect(provedorDeAnuncios()).toBeNull()
  })
})
