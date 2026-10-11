// @vitest-environment jsdom
/**
 * OS ESPAÇOS DE ANÚNCIO ENCAIXADOS NAS TELAS (change `planos-v3-e-rota-inteligente`, tarefa 11.5).
 *
 * Um teste por espaço, com a mesma prova: no ESTADO DE FÁBRICA (flag `anuncios` desligada, nenhum
 * provedor) a tela renderiza O MESMO que renderizava antes de o espaço existir, e pede à rede as mesmas
 * coisas. "Antes" é a mesma tela com `EspacoDeAnuncio` trocado por nada; "depois" é a tela com o
 * componente de verdade. O HTML das duas tem de ser idêntico, caractere por caractere.
 *
 * Para a prova não ser vazia (um espaço que nunca foi encaixado também "não muda nada"), cada tela é
 * renderizada uma terceira vez com a DEMONSTRAÇÃO ligada: aí o espaço tem de aparecer, no lugar certo.
 */
import { act, cleanup, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

const chave = vi.hoisted(() => ({ comEspaco: true, celular: false }))

/* O Início lê o conteúdo escolhido do app, que confere a conta UMA vez por página (com memória): aqui a
   conta não responde, para as duas fotos de cada tela pedirem à rede a mesma coisa. */
vi.mock('../src/data/rotas/settings', async (original) => ({
  ...(await original<typeof import('../src/data/rotas/settings')>()),
  fetchSettings: async () => null,
}))

/* `EspacoDeAnuncio` de verdade, com um interruptor só do teste: desligado, é a tela de ANTES. */
vi.mock('../src/components/anuncios/EspacoDeAnuncio', async (original) => {
  const real = await original<typeof import('../src/components/anuncios/EspacoDeAnuncio')>()
  return {
    default: (props: Parameters<typeof real.default>[0]) =>
      chave.comEspaco ? createElement(real.default, props) : null,
  }
})
vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (original) => ({
  ...(await original<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  noCelular: () => chave.celular,
  noHeadset: () => false,
}))
/* A festa do fim de rodada (som, confete) não é o assunto e não roda no jsdom. */
vi.mock('../src/lib/comemoracao', () => ({ celebrar: vi.fn(), tocarPreviaDoEfeito: vi.fn() }))

const { default: InicioDoQuest } = await import('../src/components/views/quest/InicioDoQuest')
const { default: BibliotecaDoQuest } = await import('../src/components/views/biblioteca/quest/BibliotecaDoQuest')
const { default: FimDaRodada } = await import('../src/components/minigames/casca/FimDaRodada')
const { default: LojaDoPrototipo } = await import('../src/components/views/personalizar/polimento/LojaDoPrototipo')
const { registrarProvedorDeAnuncios, provedorDeAnuncios } = await import('../src/lib/anuncios/provedor')
const { ligarDemonstracaoDeAnuncios } = await import('../src/components/anuncios/demonstracao/ligar')

type Progresso = Parameters<typeof InicioDoQuest>[0]['progress']
type Gravacao = Parameters<typeof BibliotecaDoQuest>[0]['gravacoes'][number]
type Relatorio = Parameters<typeof FimDaRodada>[0]['report']

const PROGRESSO = {
  available: true,
  level: 3,
  xp: 420,
  xpIntoLevel: 20,
  xpForLevel: 200,
  levelPct: 10,
  seeds: 37,
  streakDays: 2,
  practicedToday: false,
} as unknown as Progresso

const gravacao = (n: number): Gravacao =>
  ({
    id: `g${n}`,
    title: `Gravação ${n}`,
    type: 'audio',
    date: '01/10/2026',
    durationStr: '12:00',
    wordCount: 100 * n,
    status: 'Processado',
    idioma: 'en',
  }) as unknown as Gravacao
const GRAVACOES = [1, 2, 3, 4].map(gravacao)

const RELATORIO = {
  gameId: 'memory',
  score: 300,
  durationMs: 65_000,
  items: [
    { id: 'a', correct: true, attempts: 1, ms: 900 },
    { id: 'b', correct: true, attempts: 1, ms: 900 },
    { id: 'c', correct: false, attempts: 2, ms: 900 },
  ],
} as unknown as Relatorio

const nada = () => undefined
const TELAS: Array<{ nome: string; espacos: string[]; tela: () => ReactElement; onde: (raiz: HTMLElement) => void }> = [
  {
    nome: 'Início: cartão nativo',
    espacos: ['inicio-nativo'],
    tela: () => (
      <InicioDoQuest onChangeView={nada} recordings={GRAVACOES} progress={PROGRESSO} metrics={null} missoes={null} />
    ),
    /* No fim da tela: depois das três ações, do progresso e das sessões recentes. */
    onde: (raiz) => {
      const palco = raiz.querySelector('.q-palco')!
      expect(palco.lastElementChild?.querySelector('[data-ad="inicio-nativo"]')).not.toBeNull()
      const ad = raiz.querySelector('[data-ad="inicio-nativo"]')!
      const acoes = raiz.querySelector('.q-grade.q-cresce')!
      expect(acoes.compareDocumentPosition(ad) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(acoes.contains(ad)).toBe(false)
    },
  },
  {
    nome: 'Biblioteca: linha patrocinada',
    espacos: ['bib-infeed'],
    tela: () => (
      <BibliotecaDoQuest
        gravacoes={GRAVACOES}
        ordem="recentes"
        aoTrocarOrdem={nada}
        aoAbrir={nada}
        aoJogar={nada}
        aoRevisar={nada}
        aoCapturar={nada}
      />
    ),
    /* Entre a 2ª e a 3ª gravação, dentro da lista. */
    onde: (raiz) => {
      const linhas = [...raiz.querySelectorAll('.q-lista > *')]
      expect(linhas.map((l) => l.getAttribute('data-px-grav') ?? l.getAttribute('data-ad'))).toEqual([
        'g1',
        'g2',
        'bib-infeed',
        'g3',
        'g4',
      ])
    },
  },
  {
    nome: 'Fim de rodada: premiado e bloco nativo',
    espacos: ['fim-premiado', 'fim-bloco'],
    tela: () => (
      <FimDaRodada
        report={RELATORIO}
        total={3}
        progress={PROGRESSO}
        proximo={null}
        aoProximo={nada}
        aoJogarDeNovo={nada}
        aoVoltar={nada}
      />
    ),
    /* O premiado logo ACIMA dos botões (abaixo do XP); o bloco nativo ABAIXO deles, nunca dentro. */
    onde: (raiz) => {
      const acoes = raiz.querySelector('.pj-fim-acoes')!
      expect(acoes.previousElementSibling?.getAttribute('data-ad')).toBe('fim-premiado')
      expect(acoes.nextElementSibling?.getAttribute('data-ad')).toBe('fim-bloco')
      expect(acoes.querySelector('[data-ad]')).toBeNull()
      expect(raiz.querySelector('.xp-fim')?.nextElementSibling?.getAttribute('data-ad')).toBe('fim-premiado')
    },
  },
  {
    nome: 'Loja: premiado de Seeds',
    espacos: ['loja-seeds'],
    tela: () => (
      <LojaDoPrototipo
        nivel={3}
        saldo={37}
        mostrado={37}
        versao={0}
        aoMudar={nada}
        aoContarSeeds={nada}
        aoProvarTema={nada}
        aoUsar={nada}
        aoGanhar={nada}
      />
    ),
    /* Logo abaixo da carteira de Seeds, antes das categorias. */
    onde: (raiz) => {
      const carteira = raiz.querySelector('.px-carteira')!
      expect(carteira.nextElementSibling?.getAttribute('data-ad')).toBe('loja-seeds')
      expect(raiz.querySelector('.px-loja [data-ad]')).toBeNull()
    },
  },
]

let pedidos: string[]

/** Renderiza a tela e devolve o HTML e o que ela pediu à rede. */
async function fotografar(tela: () => ReactElement, comEspaco: boolean) {
  chave.comEspaco = comEspaco
  pedidos = []
  const r = render(tela())
  /* Deixa os efeitos e as promessas da montagem assentarem (os dois lados esperam o mesmo). */
  await act(async () => {
    await new Promise((ok) => setTimeout(ok, 30))
  })
  const foto = { html: r.container.innerHTML, pedidos: [...pedidos].sort(), raiz: r.container }
  return { ...foto, desmontar: r.unmount }
}

beforeAll(prepararDialogoNoJsdom)
beforeEach(() => {
  chave.comEspaco = true
  chave.celular = false
  localStorage.clear()
  sessionStorage.clear()
  registrarProvedorDeAnuncios(null)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      pedidos.push(String(url instanceof Request ? url.url : url))
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe.each(TELAS)('$nome', ({ tela, espacos, onde }) => {
  it('estado de fábrica: a tela renderiza o MESMO que antes, e pede à rede as mesmas coisas', async () => {
    const antes = await fotografar(tela, false)
    antes.desmontar()
    const depois = await fotografar(tela, true)

    expect(provedorDeAnuncios()).toBeNull()
    expect(depois.html).toBe(antes.html)
    expect(depois.html.length).toBeGreaterThan(200)
    expect(depois.pedidos).toEqual(antes.pedidos)
    expect(depois.raiz.querySelector('[data-ad], .ad, .ad-rotulo, .ad-sem, .ad-cta, dialog')).toBeNull()
  })

  it('estado de fábrica com a flag LIGADA no cache: continua igual (não há provedor)', async () => {
    const antes = await fotografar(tela, false)
    antes.desmontar()
    localStorage.setItem('babel.flags', JSON.stringify({ anuncios: { ligada: true } }))
    const depois = await fotografar(tela, true)
    expect(depois.html).toBe(antes.html)
  })

  it('contraprova: com a demonstração, o espaço aparece no lugar do protótipo', async () => {
    localStorage.setItem('babel.px.anunciosDeProva', '1')
    localStorage.setItem('babel.px.planoDeProva', 'free')
    await act(async () => {
      expect(await ligarDemonstracaoDeAnuncios()).toBe(true)
    })
    const { raiz } = await fotografar(tela, true)
    for (const e of espacos) expect(raiz.querySelector(`[data-ad="${e}"]`), e).not.toBeNull()
    expect(raiz.querySelectorAll('[data-ad]')).toHaveLength(espacos.length)
    onde(raiz)
  })
})

describe('Biblioteca: onde a linha patrocinada não entra', () => {
  const comDemonstracao = async () => {
    localStorage.setItem('babel.px.anunciosDeProva', '1')
    localStorage.setItem('babel.px.planoDeProva', 'free')
    await act(async () => {
      await ligarDemonstracaoDeAnuncios()
    })
  }
  const biblioteca = (gravacoes: Gravacao[]) => () => (
    <BibliotecaDoQuest
      gravacoes={gravacoes}
      ordem="recentes"
      aoTrocarOrdem={nada}
      aoAbrir={nada}
      aoJogar={nada}
      aoRevisar={nada}
      aoCapturar={nada}
    />
  )

  it('no celular, com a folha da gravação aberta (o botão "Abrir" preso ao pé), a linha não aparece', async () => {
    await comDemonstracao()
    chave.celular = true
    const { raiz } = await fotografar(biblioteca(GRAVACOES), true)
    expect(raiz.querySelector('.q-bib-det')).not.toBeNull()
    expect(raiz.querySelector('[data-ad]')).toBeNull()
  })

  it('página com uma gravação só: a linha não aparece', async () => {
    await comDemonstracao()
    const { raiz } = await fotografar(biblioteca([gravacao(1)]), true)
    expect(raiz.querySelector('[data-ad]')).toBeNull()
  })

  it('a linha nunca fica dentro do cartão da gravação selecionada, onde está o "Abrir"', async () => {
    await comDemonstracao()
    const { raiz } = await fotografar(biblioteca(GRAVACOES), true)
    expect(raiz.querySelector('[data-ad="bib-infeed"]')).not.toBeNull()
    expect(raiz.querySelector('.q-bib-det [data-ad]')).toBeNull()
  })
})
