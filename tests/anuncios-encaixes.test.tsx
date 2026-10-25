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

const chave = vi.hoisted(() => ({ comEspaco: true, celular: false, protegido: false }))

/* O perfil protegido (menor, sem idade, sem conta): a política nega antes de tudo, inclusive na demonstração. */
vi.mock('../src/lib/protecaoDoMenor', async (original) => ({
  ...(await original<typeof import('../src/lib/protecaoDoMenor')>()),
  perfilProtegido: () => chave.protegido,
}))

/* O Início lê o conteúdo escolhido do app, que confere a conta UMA vez por página (com memória): aqui a
   conta não responde, para as duas fotos de cada tela pedirem à rede a mesma coisa. */
vi.mock('../src/data/rotas/settings', async (original) => ({
  ...(await original<typeof import('../src/data/rotas/settings')>()),
  fetchSettings: async () => null,
}))

/* As Estatísticas leem os resultados e o caderno: aqui, vazios (a tela fica pronta, sem estudo). */
vi.mock('../src/data/api', async (original) => ({
  ...(await original<typeof import('../src/data/api')>()),
  fetchExerciseResults: async () => [],
  fetchDeck: async () => [],
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
const { default: Estatisticas } = await import('../src/components/views/Estatisticas')
const { default: LobbyDoQuest } = await import('../src/components/views/play/quest/LobbyDoQuest')
const { default: PainelTrilha } = await import('../src/components/views/PainelTrilha')
const { default: NuvemPremiadaNaCaptura } = await import('../src/components/views/captura/NuvemPremiadaNaCaptura')
const { default: EspacoDeAnuncio } = await import('../src/components/anuncios/EspacoDeAnuncio')
const { JOGOS } = await import('../src/components/views/play/jogos')
const { marcarAjudaEsgotada, rodadaComAjudas } = await import('../src/lib/jogos/ajudaEsgotada')
const { registrarProvedorDeAnuncios, provedorDeAnuncios } = await import('../src/lib/anuncios/provedor')
const { ligarDemonstracaoDeAnuncios } = await import('../src/components/anuncios/demonstracao/ligar')
const { FORMATO_DO_ESPACO, INTERVALO_DO_INTERSTICIAL_MS } = await import('../src/core/anuncios/politicaDeAnuncio')
const { ESPACOS_PREMIADOS } = await import('../src/core/anuncios/premiado')
type EspacoDeAnuncioDaPolitica = import('../src/core/anuncios/politicaDeAnuncio').EspacoDeAnuncio

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

/* O Jogar: nove jogos que abrem num computador com voz, para a grade ter a segunda fileira inteira. */
type JogoDoLobby = Parameters<typeof LobbyDoQuest>[0]['jogos'][number]
const JOGOS_QUE_ABREM = JOGOS.slice(0, 9).map(
  (j) =>
    ({
      ...j,
      estado: { id: j.id, ok: true, disponiveis: 8, faltam: 0, fonte: 'baralho', tamanhoDaRodada: 8 },
    }) as unknown as JogoDoLobby,
)
const COM_TUDO = { vozDeLeitura: true, reconhecimentoDoNavegador: true, tecladoFisico: true }
const COM_VOZ = { haAlgumaVoz: () => true, haVozPara: () => true }
const lobby = () => (
  <LobbyDoQuest
    jogos={JOGOS_QUE_ABREM}
    ageProfile="pro"
    naTrilha={false}
    notaDoBloqueio={() => ''}
    aoJogar={nada}
    aoVerTelaCompleta={nada}
    recursos={COM_TUDO}
    voz={COM_VOZ}
    miniatura={<EspacoDeAnuncio espaco="jogar-miniatura" formato="nativo" />}
  />
)

const TRILHA = {
  lang: 'en',
  fonte: 'teste',
  versao: '0',
  niveis: {
    A1: [
      ['house', 'casa'],
      ['water', 'água'],
      ['bread', 'pão'],
    ],
  },
} as unknown as Parameters<typeof PainelTrilha>[0]['dado']

const fimDaRodada = (aoJogarDeNovo: () => void = nada) => (
  <FimDaRodada
    report={RELATORIO}
    total={3}
    progress={PROGRESSO}
    proximo={null}
    aoProximo={nada}
    aoJogarDeNovo={aoJogarDeNovo}
    aoVoltar={nada}
  />
)
const loja = () => (
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
)

const TELAS: Array<{
  nome: string
  espacos: string[]
  tela: () => ReactElement
  onde: (raiz: HTMLElement) => void
  /** Antes de cada foto (o aparelho, a rodada que acabou). */
  preparar?: () => void
}> = [
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
    nome: 'Loja: premiado de Seeds e tema patrocinado',
    espacos: ['loja-seeds', 'loja-tema'],
    tela: loja,
    /* O premiado logo abaixo da carteira de Seeds, antes das categorias; o tema patrocinado como o TERCEIRO item
       da prateleira ("Tudo"), com o mesmo desenho dos outros. */
    onde: (raiz) => {
      const carteira = raiz.querySelector('.px-carteira')!
      expect(carteira.nextElementSibling?.getAttribute('data-ad')).toBe('loja-seeds')
      const prateleira = [...raiz.querySelectorAll('.px-loja > *')]
      expect(prateleira.length).toBeGreaterThan(3)
      expect(prateleira[2].getAttribute('data-ad')).toBe('loja-tema')
      expect(prateleira.filter((x) => x.hasAttribute('data-ad'))).toHaveLength(1)
    },
  },
  {
    nome: 'Fim de rodada com uma ajuda que acabou: "+1 ajuda"',
    espacos: ['fim-premiado', 'ajuda-premiada', 'fim-bloco'],
    preparar: () => marcarAjudaEsgotada('memory'),
    tela: () => fimDaRodada(),
    /* Acima dos botões, depois do bônus de Seeds; nunca dentro da fileira de ações. */
    onde: (raiz) => {
      const acoes = raiz.querySelector('.pj-fim-acoes')!
      expect(acoes.previousElementSibling?.getAttribute('data-ad')).toBe('ajuda-premiada')
      expect(acoes.querySelector('[data-ad]')).toBeNull()
    },
  },
  {
    nome: 'Jogar: miniatura patrocinada',
    espacos: ['jogar-miniatura'],
    tela: lobby,
    /* No 8º lugar da grade (o fim da segunda fileira), nunca na primeira fileira. */
    onde: (raiz) => {
      const grade = [...raiz.querySelectorAll('#grade-de-jogos > .q-grade.g4 > *')]
      expect(grade).toHaveLength(10)
      expect(grade.findIndex((c) => c.querySelector('[data-ad="jogar-miniatura"]'))).toBe(7)
    },
  },
  {
    nome: 'Jogar › trilha: selo "Oferecida por"',
    espacos: ['trilha-oferecida'],
    tela: () => (
      <PainelTrilha
        dado={TRILHA}
        deck={[]}
        ageProfile="pro"
        nivel="A1"
        onEscolherNivel={nada}
        nativo="pt"
        paresDeGlosa={['pt']}
      />
    ),
    /* Logo abaixo da linha da trilha, fora do botão dela (um botão não cabe dentro de outro). */
    onde: (raiz) => {
      const linha = raiz.querySelector('.qj-trilha > button.q-linha')!
      expect(linha.querySelector('[data-ad]')).toBeNull()
      expect(linha.nextElementSibling?.querySelector('[data-ad="trilha-oferecida"]')).not.toBeNull()
    },
  },
  {
    nome: 'Estatísticas: linha patrocinada no fim',
    espacos: ['estat-faixa'],
    tela: () => <Estatisticas metrics={null} onChangeView={nada} />,
    /* Sempre o ÚLTIMO elemento da tela, depois de todos os gráficos. */
    onde: (raiz) => {
      const palco = raiz.querySelector('.q-palco.qe')!
      expect(palco.lastElementChild?.getAttribute('data-ad')).toBe('estat-faixa')
    },
  },
  {
    nome: 'Estatísticas no celular: linha e faixa âncora',
    espacos: ['estat-faixa', 'ancora'],
    preparar: () => {
      chave.celular = true
    },
    tela: () => <Estatisticas metrics={null} onChangeView={nada} />,
    /* A âncora no fim da tela, com o respiro do tamanho dela antes (nunca cobre a última linha). */
    onde: (raiz) => {
      const ancora = raiz.querySelector('[data-ad="ancora"]')!
      expect(ancora.previousElementSibling?.classList.contains('ad-ancora-espaco')).toBe(true)
      expect(ancora.getAttribute('aria-label')).toBe('Anúncio')
      expect(ancora.querySelector('button.ad-sem')?.textContent).toBe('Sem anúncios no Essencial')
    },
  },
  {
    nome: 'Biblioteca no celular, sem o "Abrir" preso ao pé: faixa âncora',
    espacos: ['ancora'],
    preparar: () => {
      chave.celular = true
    },
    tela: () => (
      <BibliotecaDoQuest
        gravacoes={[]}
        total={GRAVACOES}
        ordem="recentes"
        aoTrocarOrdem={nada}
        aoAbrir={nada}
        aoJogar={nada}
        aoRevisar={nada}
        aoCapturar={nada}
        busca="nada com este titulo"
        aoBuscar={nada}
      />
    ),
    onde: (raiz) => {
      expect(raiz.querySelector('.q-bib-det')).toBeNull()
      expect(raiz.querySelector('[data-testid="busca-sem-resultado"]')).not.toBeNull()
    },
  },
  {
    nome: 'Captura parada: "Ganhe 30 min de nuvem"',
    espacos: ['nuvem-30'],
    /* Os avisos da captura parada, com um recado de antes: o cartão entra depois dele. */
    tela: () => (
      <div className="avisos-da-captura">
        <p className="aviso-info">
          {'O uso justo do dia está perto do fim, e a legenda segue no aparelho. '.repeat(3)}
        </p>
        <NuvemPremiadaNaCaptura />
      </div>
    ),
    onde: (raiz) => {
      expect(raiz.querySelector('[data-ad="nuvem-30"]')?.textContent).toMatch(/30 min de nuvem/)
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
  chave.protegido = false
  rodadaComAjudas()
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

describe.each(TELAS)('$nome', ({ tela, espacos, onde, preparar }) => {
  beforeEach(() => preparar?.())

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

/* ── OS ESPAÇOS NOVOS, UM A UM: provedor falso, perfil protegido e o intersticial ───────────────────────── */

/** Pede o que a política lê (flag, idade da conta, consentimento) pela demonstração, sem carregar o provedor dela. */
const pedirDemonstracao = () => {
  localStorage.setItem('babel.px.anunciosDeProva', '1')
  localStorage.setItem('babel.px.planoDeProva', 'free')
}
const ligarDemonstracao = async () => {
  pedirDemonstracao()
  await act(async () => {
    expect(await ligarDemonstracaoDeAnuncios()).toBe(true)
  })
}
/**
 * Um provedor de teste: desenha só uma marca com o nome do espaço. Leva o id da demonstração porque as trocas do
 * pedido (flag, consentimento, idade da conta) só valem com ela registrada; o desenho é o do teste.
 */
const PROVEDOR_FALSO = {
  id: 'demonstracao',
  Espaco: ({ espaco }: { espaco: string }) => <i data-ad-falso={espaco} />,
}

const clicar = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy()
  await act(async () => {
    ;(el as HTMLElement).click()
    await new Promise((ok) => setTimeout(ok, 0))
  })
}
const jogarDeNovo = (raiz: ParentNode) => raiz.querySelector<HTMLButtonElement>('[data-acao="recomecar"]')
const estatisticas = () => <Estatisticas metrics={null} onChangeView={nada} />

/** Cada espaço novo: a tela, o que preparar antes e o que fazer para ele aparecer. */
const NOVOS: Array<{
  espaco: string
  tela: () => ReactElement
  preparar?: () => void
  agir?: (raiz: HTMLElement) => Promise<void>
}> = [
  { espaco: 'intersticial', tela: () => fimDaRodada(), agir: (raiz) => clicar(jogarDeNovo(raiz)) },
  { espaco: 'ancora', tela: estatisticas, preparar: () => void (chave.celular = true) },
  { espaco: 'estat-faixa', tela: estatisticas },
  { espaco: 'loja-tema', tela: loja },
  {
    espaco: 'tema-24h',
    tela: loja,
    /* Provar um tema da Loja ("Ver prévia" de uma peça da categoria Temas) é o que abre a oferta. */
    agir: async (raiz) => {
      await clicar(raiz.querySelector('[data-px-cat="Temas"]'))
      await clicar(raiz.querySelector('.px-loja [data-px-previa]'))
    },
  },
  { espaco: 'trilha-oferecida', tela: TELAS.find((x) => x.espacos[0] === 'trilha-oferecida')!.tela },
  { espaco: 'jogar-miniatura', tela: lobby },
  { espaco: 'nuvem-30', tela: () => <NuvemPremiadaNaCaptura /> },
  { espaco: 'ajuda-premiada', tela: () => fimDaRodada(), preparar: () => marcarAjudaEsgotada('memory') },
]

describe.each(NOVOS)('espaço $espaco', ({ espaco, tela, preparar, agir }) => {
  beforeEach(() => preparar?.())

  it('com um provedor (falso) e a política deixando, o espaço aparece', async () => {
    pedirDemonstracao()
    registrarProvedorDeAnuncios(PROVEDOR_FALSO)
    const { raiz } = await fotografar(tela, true)
    await agir?.(raiz)
    expect(document.querySelector(`[data-ad-falso="${espaco}"]`), espaco).not.toBeNull()
  })

  /* Decisão do dono (25/10/2026): o perfil protegido vê o anúncio COMUM e nunca o premiado. Antes este par de
     testes exigia "nada" em todo espaço; agora exige o comum presente e nenhum premiado (nem a folha por ele). */
  const ehPremiado = (e: string) => FORMATO_DO_ESPACO[e as EspacoDeAnuncioDaPolitica] === 'premiado'
  const seletorDosPremiados = (atributo: string) => ESPACOS_PREMIADOS.map((e) => `[${atributo}="${e}"]`).join(', ')

  it('perfil protegido, com a demonstração ligada: o comum aparece; premiado, nunca (nem a folha)', async () => {
    await ligarDemonstracao()
    chave.protegido = true
    const { raiz } = await fotografar(tela, true)
    await agir?.(raiz)
    expect(document.querySelector(seletorDosPremiados('data-ad'))).toBeNull()
    expect(document.querySelector('.consentimento-de-anuncios')).toBeNull()
    if (!ehPremiado(espaco)) expect(document.querySelector(`[data-ad="${espaco}"]`), espaco).not.toBeNull()
  })

  it('perfil protegido, com um provedor que pede consentimento: o comum aparece; premiado, nunca', async () => {
    pedirDemonstracao()
    registrarProvedorDeAnuncios({ ...PROVEDOR_FALSO, pedeConsentimento: true })
    chave.protegido = true
    const { raiz } = await fotografar(tela, true)
    await agir?.(raiz)
    expect(document.querySelector(seletorDosPremiados('data-ad-falso'))).toBeNull()
    expect(document.querySelector('.consentimento-de-anuncios')).toBeNull()
    if (!ehPremiado(espaco)) expect(document.querySelector(`[data-ad-falso="${espaco}"]`), espaco).not.toBeNull()
  })
})

describe('o intersticial entre rodadas', () => {
  const CHAVE = 'babel.anuncios.ultimoIntersticial'

  it('abre entre as rodadas, segura a próxima até a pessoa fechar e grava a hora em que apareceu', async () => {
    await ligarDemonstracao()
    const aoJogarDeNovo = vi.fn()
    const antes = Date.now()
    const { raiz } = await fotografar(() => fimDaRodada(aoJogarDeNovo), true)
    await clicar(jogarDeNovo(raiz))
    const anuncio = document.querySelector('dialog [data-ad="intersticial"]')
    expect(anuncio).not.toBeNull()
    expect(anuncio?.textContent).toMatch(/Anúncio/)
    expect(anuncio?.querySelector('.ad-sem')?.textContent).toBe('Sem anúncios no Essencial')
    expect(aoJogarDeNovo).not.toHaveBeenCalled()
    expect(Number(localStorage.getItem(CHAVE))).toBeGreaterThanOrEqual(antes)

    await clicar(anuncio?.querySelector('[data-ad-f="fechar"]'))
    expect(aoJogarDeNovo).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-ad="intersticial"]')).toBeNull()
  })

  it('respeita o intervalo de 5 min: dentro dele a próxima rodada vem direto; passado, ele volta', async () => {
    await ligarDemonstracao()
    localStorage.setItem(CHAVE, String(Date.now() - INTERVALO_DO_INTERSTICIAL_MS + 60_000))
    const aoJogarDeNovo = vi.fn()
    const { raiz } = await fotografar(() => fimDaRodada(aoJogarDeNovo), true)
    await clicar(jogarDeNovo(raiz))
    expect(aoJogarDeNovo).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-ad="intersticial"]')).toBeNull()

    localStorage.setItem(CHAVE, String(Date.now() - INTERVALO_DO_INTERSTICIAL_MS - 1))
    await clicar(jogarDeNovo(raiz))
    expect(aoJogarDeNovo).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-ad="intersticial"]')).not.toBeNull()
  })

  it('nunca com uma rodada em andamento (a política nega a tela ocupada, como na captura e no intérprete)', async () => {
    await ligarDemonstracao()
    const aoJogarDeNovo = vi.fn()
    const { raiz } = await fotografar(() => fimDaRodada(aoJogarDeNovo), true)
    document.body.setAttribute('data-jogo-ativo', '1')
    try {
      await clicar(jogarDeNovo(raiz))
    } finally {
      document.body.removeAttribute('data-jogo-ativo')
    }
    expect(aoJogarDeNovo).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-ad="intersticial"]')).toBeNull()
    expect(localStorage.getItem(CHAVE)).toBeNull()
  })

  it('estado de fábrica (sem provedor): a próxima rodada vem direto e nada é gravado', async () => {
    const aoJogarDeNovo = vi.fn()
    const { raiz } = await fotografar(() => fimDaRodada(aoJogarDeNovo), true)
    await clicar(jogarDeNovo(raiz))
    expect(aoJogarDeNovo).toHaveBeenCalledTimes(1)
    expect(document.querySelector('dialog')).toBeNull()
    expect(localStorage.getItem(CHAVE)).toBeNull()
  })

  it('provedor que não desenha nada: a pessoa não fica presa, a rodada segue', async () => {
    pedirDemonstracao()
    registrarProvedorDeAnuncios({ id: 'demonstracao', Espaco: () => null })
    const aoJogarDeNovo = vi.fn()
    const { raiz } = await fotografar(() => fimDaRodada(aoJogarDeNovo), true)
    await clicar(jogarDeNovo(raiz))
    expect(aoJogarDeNovo).toHaveBeenCalledTimes(1)
  })
})

describe('a faixa âncora', () => {
  it('só no celular', async () => {
    await ligarDemonstracao()
    const { raiz } = await fotografar(estatisticas, true)
    expect(raiz.querySelector('[data-ad="estat-faixa"]')).not.toBeNull()
    expect(raiz.querySelector('[data-ad="ancora"]')).toBeNull()
  })

  it('fechada pelo "×", não volta nesta sessão', async () => {
    await ligarDemonstracao()
    chave.celular = true
    const primeira = await fotografar(estatisticas, true)
    await clicar(primeira.raiz.querySelector('[data-ad="ancora"] .ad-ancora-x'))
    expect(primeira.raiz.querySelector('[data-ad="ancora"], .ad-ancora-espaco')).toBeNull()
    primeira.desmontar()
    const segunda = await fotografar(estatisticas, true)
    expect(segunda.raiz.querySelector('[data-ad="ancora"]')).toBeNull()
    expect(segunda.raiz.querySelector('[data-ad="estat-faixa"]')).not.toBeNull()
  })
})
