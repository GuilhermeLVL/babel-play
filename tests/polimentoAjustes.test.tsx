// @vitest-environment jsdom
/**
 * AJUSTES, PERFIL E ESTATÍSTICAS NO DESENHO NOVO — o que a camada de movimento acrescenta a estas telas.
 *
 * A igualdade de medidas e de movimento com o protótipo é provada pelo comparador
 * (`scripts/polimento/roteiros/ajustes*.json`, `estatisticas*.json`, `perfil*.json`). Aqui fica o que o
 * comparador não vê: de onde vem o texto do cartão do plano, onde ele NÃO aparece, para onde o botão
 * leva, e as duas condições que deixam a entrada da tela acontecer (`lib/polimento/telas.ts`, `chegou`).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()
  return { ...real, useQuestNovo: () => true }
})

const ents = vi.hoisted(() => ({ plan: 'free' as string, teste: null as { terminaEm: number } | null }))
vi.mock('../src/lib/entitlements', async (original) => {
  const real = await original<typeof import('../src/lib/entitlements')>()
  return { ...real, getEntitlements: () => ({ ...real.getEntitlements(), plan: ents.plan, teste: ents.teste }) }
})

const estatica = vi.hoisted(() => ({ ligada: false }))
vi.mock('../src/lib/edicaoEstatica', async (original) => ({
  ...(await original<typeof import('../src/lib/edicaoEstatica')>()),
  edicaoEstatica: () => estatica.ligada,
}))

const rota = vi.hoisted(() => ({ irPara: vi.fn() }))
vi.mock('../src/lib/irPara', () => rota)

const api = vi.hoisted(() => ({
  fetchSettings: vi.fn(),
  saveSettings: vi.fn(),
  patchUiSettings: vi.fn(),
  fetchDeck: vi.fn(),
  fetchAllUtterances: vi.fn(),
  fetchExerciseResults: vi.fn(),
}))
vi.mock('../src/data/api', async (original) => ({
  ...(await original<typeof import('../src/data/api')>()),
  ...api,
}))
const nuance = vi.hoisted(() => ({ listarGlossario: vi.fn(), apagarDoGlossario: vi.fn() }))
vi.mock('../src/data/apiDaNuance', () => nuance)
vi.mock('../src/lib/usePerfil', () => ({ usePerfil: () => ({ perfil: null, buscando: false }) }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))

import PainelDaNuance from '../src/components/views/ajustes/PainelDaNuance'
import Estatisticas from '../src/components/views/Estatisticas'
import Settings from '../src/components/views/Settings'
import { fraseDoPlanoNaConta, tituloDoPlanoNaConta, useAbasAVista } from '../src/lib/polimento/ajustes'

function montarAjustes(aba: string | null = null) {
  return render(
    <Settings
      theme={'babel' as never}
      darkMode={false}
      abaInicial={aba}
      menuPosition={'left' as never}
      fontScale="md"
      soundEnabled
      animationsEnabled
      performanceMode={false}
      setDarkMode={vi.fn()}
      onOpenStudio={vi.fn()}
      onReplayTour={vi.fn()}
      setAgeProfile={vi.fn()}
      setMenuPosition={vi.fn()}
      setFontScale={vi.fn()}
      toggleSound={vi.fn()}
      toggleAnimations={vi.fn()}
      togglePerformanceMode={vi.fn()}
      onChangeView={vi.fn()}
    />,
  )
}

beforeEach(() => {
  ents.plan = 'free'
  ents.teste = null
  estatica.ligada = false
  rota.irPara.mockReset()
  for (const f of Object.values(api)) f.mockReset()
  api.fetchSettings.mockResolvedValue(null)
  api.fetchDeck.mockResolvedValue([])
  api.fetchExerciseResults.mockResolvedValue([])
  api.fetchAllUtterances.mockResolvedValue([])
  nuance.listarGlossario.mockReset()
  nuance.listarGlossario.mockReturnValue(new Promise(() => {}))
})
afterEach(cleanup)

describe('o texto do cartão do plano (`telas2.js:142`)', () => {
  it('Grátis e sem conta leem "Seu plano: Grátis"', () => {
    expect(tituloDoPlanoNaConta()).toBe('Seu plano: Grátis')
    ents.plan = 'anonimo'
    expect(tituloDoPlanoNaConta()).toBe('Seu plano: Grátis')
  })

  it('o Premium em teste diz que é teste; quem já assina lê só "Premium"', () => {
    ents.plan = 'premium'
    ents.teste = { terminaEm: Date.now() + 86_400_000 }
    expect(tituloDoPlanoNaConta()).toBe('Seu plano: Premium, em teste')
    ents.teste = null
    expect(tituloDoPlanoNaConta()).toBe('Seu plano: Premium')
  })

  it('a frase é a do protótipo', () => {
    expect(fraseDoPlanoNaConta()).toBe('Veja o que cada plano inclui, o seu consumo e a sua assinatura.')
  })
})

describe('Ajustes → Conta: o cartão do plano (`telas2.js:140-143`)', () => {
  it('fica logo depois das abas, antes do painel, com a marcação do protótipo', () => {
    const { container } = montarAjustes('conta')
    const cartao = container.querySelector('.q-aviso.px-plano-na-conta')
    expect(cartao).not.toBeNull()
    expect(cartao?.previousElementSibling?.matches('.q-abas[role="tablist"]')).toBe(true)
    expect(cartao?.nextElementSibling?.matches('[role="tabpanel"]#painel-conta')).toBe(true)
    /* `<span><b>título</b><br>frase</span><button class="q-ctl">Ver planos</button>` */
    const [texto, botao] = [...(cartao?.children ?? [])]
    expect(texto.tagName).toBe('SPAN')
    expect([...texto.children].map((f) => f.tagName)).toEqual(['B', 'BR'])
    expect(texto.querySelector('b')?.textContent).toBe('Seu plano: Grátis')
    expect(texto.textContent).toBe('Seu plano: GrátisVeja o que cada plano inclui, o seu consumo e a sua assinatura.')
    expect(botao.matches('button.q-ctl')).toBe(true)
    expect(botao.textContent).toBe('Ver planos')
  })

  it('"Ver planos" leva à tela de Planos', () => {
    montarAjustes('conta')
    fireEvent.click(within(screen.getByTestId('plano-na-conta')).getByRole('button', { name: 'Ver planos' }))
    expect(rota.irPara).toHaveBeenCalledWith({ view: 'planos' })
  })

  it('só existe na aba Conta', () => {
    const { container } = montarAjustes('idiomas')
    expect(container.querySelector('.px-plano-na-conta')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Conta' }))
    expect(container.querySelector('.px-plano-na-conta')).not.toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Privacidade' }))
    expect(container.querySelector('.px-plano-na-conta')).toBeNull()
  })

  it('no site sem servidor não há plano a assinar, e o cartão não aparece', () => {
    estatica.ligada = true
    const { container } = montarAjustes('conta')
    expect(container.querySelector('.px-plano-na-conta')).toBeNull()
  })

  it('acompanha o plano quando ele muda com a tela aberta', () => {
    montarAjustes('conta')
    expect(screen.getByTestId('plano-na-conta').querySelector('b')?.textContent).toBe('Seu plano: Grátis')
    ents.plan = 'premium'
    ents.teste = { terminaEm: Date.now() + 86_400_000 }
    /* `babel_plan_changed`: o evento que `onPlanChange` escuta (`entitlements.ts`). */
    fireEvent(window, new Event('babel_plan_changed'))
    expect(screen.getByTestId('plano-na-conta').querySelector('b')?.textContent).toBe('Seu plano: Premium, em teste')
  })
})

describe('a entrada da tela não fica presa numa espera', () => {
  /* `chegou()` (`lib/polimento/telas.ts`) guarda a entrada enquanto houver `.q-esqueleto` na tela e só a
     solta quando um palco NOVO monta. Uma espera de um pedaço da tela não pode usar essa classe. */
  it('Ajustes: a espera do glossário não usa `.q-esqueleto`', () => {
    const { container } = render(<PainelDaNuance />)
    expect(screen.getByRole('status', { name: 'Carregando o glossário…' })).toBeTruthy()
    expect(container.querySelector('.q-esqueleto')).toBeNull()
    expect(container.querySelector('.q-aju-espera')).not.toBeNull()
  })

  it('Ajustes: a tela inteira monta sem nenhum `.q-esqueleto`', () => {
    const { container } = montarAjustes('idiomas')
    expect(container.querySelector('.q-palco.q-aju')).not.toBeNull()
    expect(container.querySelector('.q-esqueleto')).toBeNull()
  })

  it('Estatísticas: quando os dados chegam, o palco é OUTRO elemento (é o que solta a entrada)', async () => {
    let entregar: (v: never[]) => void = () => {}
    api.fetchExerciseResults.mockReturnValue(new Promise<never[]>((ok) => (entregar = ok)))
    const { container } = render(<Estatisticas onChangeView={vi.fn()} metrics={null} />)
    const espera = container.querySelector('.q-palco.qe')
    expect(espera).not.toBeNull()
    expect(espera?.querySelector('.q-esqueleto')).not.toBeNull()
    entregar([])
    await screen.findByRole('tablist', { name: 'Gráficos' })
    const pronto = container.querySelector('.q-palco.qe')
    expect(pronto).not.toBeNull()
    expect(pronto).not.toBe(espera)
    expect(pronto?.querySelector('.q-esqueleto')).toBeNull()
  })
})

describe('a aba escolhida vai para o meio da barra que rola (`sentidos.js:292-305`)', () => {
  function Barras({ aba }: { aba: number }) {
    const tela = React.useRef<HTMLDivElement>(null)
    useAbasAVista(tela, aba)
    return (
      <div ref={tela}>
        <div className="q-abas" data-testid="barra">
          {[0, 1, 2].map((i) => (
            <button key={i} type="button" className="q-aba" aria-selected={aba === i} />
          ))}
        </div>
      </div>
    )
  }
  /* O jsdom não mede: a barra tem 300 px à vista e 900 de conteúdo, cada aba com 300. */
  const medidas = (barra: HTMLElement) => {
    Object.defineProperty(barra, 'clientWidth', { value: 300, configurable: true })
    Object.defineProperty(barra, 'scrollWidth', { value: 900, configurable: true })
    ;[...barra.children].forEach((a, i) => {
      Object.defineProperty(a, 'offsetLeft', { value: i * 300, configurable: true })
      Object.defineProperty(a, 'offsetWidth', { value: 200, configurable: true })
    })
  }
  const quadro = () => new Promise((ok) => requestAnimationFrame(() => ok(null)))

  beforeEach(() => {
    document.documentElement.dataset.px = 'on'
  })
  afterEach(() => {
    delete document.documentElement.dataset.px
  })

  it('um quadro depois de cada troca: scrollLeft = offsetLeft − (largura à vista − largura da aba) / 2', async () => {
    const tela = render(<Barras aba={0} />)
    const barra = screen.getByTestId('barra')
    medidas(barra)
    tela.rerender(<Barras aba={2} />)
    await quadro()
    expect(barra.scrollLeft).toBe(600 - (300 - 200) / 2)
    tela.rerender(<Barras aba={1} />)
    await quadro()
    expect(barra.scrollLeft).toBe(300 - (300 - 200) / 2)
  })

  it('com a camada desligada, a barra fica onde está', async () => {
    document.documentElement.dataset.px = 'off'
    const tela = render(<Barras aba={0} />)
    const barra = screen.getByTestId('barra')
    medidas(barra)
    tela.rerender(<Barras aba={2} />)
    await quadro()
    expect(barra.scrollLeft).toBe(0)
  })
})
