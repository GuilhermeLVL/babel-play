/**
 * FIXTURES POR API, NAO PELA TELA.
 *
 * As suites novas (sessao de jogo, revisao FSRS, Seeds, estatisticas, dois dispositivos) precisam
 * de um baralho que exista ANTES de a tela abrir. Criar as palavras pela interface custaria um
 * fluxo inteiro de captura por teste e amarraria cada suite ao formulario de outra tela; a rota
 * `POST /api/vocab/bulk-add` e a mesma que a importacao usa, e o servidor deduplica por
 * (palavra, idioma) — semear duas vezes (um projeto por viewport) nao duplica nada.
 *
 * `fetch` do Node, e nao `page.request`: o `beforeAll` do Playwright nao tem `page`, e o servidor
 * ja esta de pe quando os testes comecam (ordem do `webServer` + `globalSetup`).
 */

export const BASE = process.env.BASE_URL || 'http://localhost:3100'

/**
 * `E2E_RUNTIME=worker`: a suíte roda contra o Worker (`wrangler dev`). Lá a importação de Anki responde 503
 * `indisponivel_neste_runtime` até a Fase 3, e as suítes/casos que dependem dela pulam com o motivo.
 */
export const NO_WORKER = process.env.E2E_RUNTIME === 'worker'
export const MOTIVO_ANKI_SO_NO_NODE = 'importação de Anki é Node-only até a Fase 3 (503 indisponivel_neste_runtime)'

export interface CartaoSemente {
  word: string
  back: string
}

/**
 * Doze palavras em ingles (o idioma-alvo padrao de uma conta nova e `en-US`, ver
 * `DEFAULT_LANG_CONFIG`), com traducoes distintas entre si. Seis de cinco letras de proposito:
 * o Termo so libera com pelo menos tres palavras do MESMO tamanho (`contarJogaveisMulti`).
 */
export const CARTOES_SEMENTE: CartaoSemente[] = [
  { word: 'apple', back: 'maca' },
  { word: 'house', back: 'casa' },
  { word: 'water', back: 'agua' },
  { word: 'bread', back: 'pao' },
  { word: 'chair', back: 'cadeira' },
  { word: 'table', back: 'mesa' },
  { word: 'garden', back: 'jardim' },
  { word: 'window', back: 'janela' },
  { word: 'flower', back: 'flor' },
  { word: 'yellow', back: 'amarelo' },
  { word: 'kitchen', back: 'cozinha' },
  { word: 'morning', back: 'manha' },
]

export interface CartaoNoServidor {
  id: string
  word: string
  back: string | null
  dueAt: number | null
  reps: number | null
  stability: number | null
  inDeck: number | null
  srcLang: string | null
}

/**
 * O BARALHO INTEIRO como dicionario palavra -> traducao (e o inverso). O baralho pode ter mais do
 * que os cartoes da fixture (outro teste fichou palavras no mesmo banco; ate 29/09 a semente de
 * `server/db/seed.ts` tambem punha tres), entao quem precisa fechar pares ou digitar respostas le
 * a fonte real, nao a lista da fixture.
 */
export async function mapaDoBaralho(): Promise<{ traducaoDe: Map<string, string>; palavraDe: Map<string, string> }> {
  const cartoes = await listarCartoes()
  const traducaoDe = new Map<string, string>()
  const palavraDe = new Map<string, string>()
  for (const c of cartoes) {
    if (!c.back) continue
    traducaoDe.set(c.word.trim(), c.back.trim())
    palavraDe.set(c.back.trim().toLowerCase(), c.word.trim())
  }
  return { traducaoDe, palavraDe }
}

export async function listarCartoes(): Promise<CartaoNoServidor[]> {
  const r = await fetch(`${BASE}/api/vocab`)
  if (!r.ok) throw new Error(`GET /api/vocab devolveu ${r.status}`)
  return (await r.json()) as CartaoNoServidor[]
}

/** Semeia os doze cartoes (idempotente) e devolve os que existem no servidor com essas palavras. */
export async function semearCartoes(): Promise<CartaoNoServidor[]> {
  const r = await fetch(`${BASE}/api/vocab/bulk-add`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      cards: CARTOES_SEMENTE.map((c) => ({ ...c, srcLang: 'en', tgtLang: 'pt-BR' })),
    }),
  })
  if (!r.ok) throw new Error(`POST /api/vocab/bulk-add devolveu ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const palavras = new Set(CARTOES_SEMENTE.map((c) => c.word))
  const todos = await listarCartoes()
  const meus = todos.filter((c) => palavras.has(c.word))
  if (meus.length < CARTOES_SEMENTE.length) {
    throw new Error(`esperava ${CARTOES_SEMENTE.length} cartoes semeados, o servidor tem ${meus.length}`)
  }
  return meus
}

/**
 * UMA GRAVACAO PARA A REVISAO. `/revisar` e uma aba da tela de sessao (`Analysis` remapeia
 * `study` para `practice` e monta `Study` com a gravacao aberta), e `Study` so lista os cartoes
 * cuja `sourceSessionId` e a dessa gravacao. Sem gravacao a tela fica em "Abrindo a sessão" e a
 * revisao nao existe — por isso a fixture cria a sessao e amarra cartoes proprios a ela.
 * Palavras DIFERENTES das de `CARTOES_SEMENTE`: o servidor deduplica por (palavra, idioma), e um
 * cartao ja existente sem sessao nao seria religado a esta.
 */
export const CARTOES_DA_SESSAO: CartaoSemente[] = [
  { word: 'river', back: 'rio' },
  { word: 'stone', back: 'pedra' },
  { word: 'cloud', back: 'nuvem' },
  { word: 'forest', back: 'floresta' },
  { word: 'bridge', back: 'ponte' },
  { word: 'candle', back: 'vela' },
]

export async function semearSessaoComCartoes(): Promise<{ sessionId: string; cartoes: CartaoNoServidor[] }> {
  const lista = await fetch(`${BASE}/api/sessions`)
  if (!lista.ok) throw new Error(`GET /api/sessions devolveu ${lista.status}`)
  const existentes = (await lista.json()) as Array<{ id: string; title?: string | null }>
  let sessionId = existentes.find((s) => s.title === 'Sessao e2e de revisao')?.id
  if (!sessionId) {
    const r = await fetch(`${BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Sessao e2e de revisao',
        kind: 'mic',
        sourceLang: 'en',
        targetLang: 'pt-BR',
        status: 'done',
        durationMs: 60_000,
        utterances: CARTOES_DA_SESSAO.map((c, idx) => ({
          idx,
          source: 'mic',
          sourceLang: 'en',
          targetLang: 'pt-BR',
          sourceText: `The ${c.word} is here.`,
          translatedText: `O ${c.back} esta aqui.`,
          tStartMs: idx * 5000,
          tEndMs: idx * 5000 + 4000,
        })),
      }),
    })
    if (!r.ok) throw new Error(`POST /api/sessions devolveu ${r.status}: ${(await r.text()).slice(0, 200)}`)
    sessionId = ((await r.json()) as { id: string }).id
  }
  const add = await fetch(`${BASE}/api/vocab/bulk-add`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      cards: CARTOES_DA_SESSAO.map((c) => ({ ...c, srcLang: 'en', tgtLang: 'pt-BR', sessionId })),
    }),
  })
  if (!add.ok) throw new Error(`POST /api/vocab/bulk-add devolveu ${add.status}: ${(await add.text()).slice(0, 200)}`)
  const palavras = new Set(CARTOES_DA_SESSAO.map((c) => c.word))
  const cartoes = (await listarCartoes()).filter((c) => palavras.has(c.word))
  if (cartoes.length < CARTOES_DA_SESSAO.length) {
    throw new Error(`esperava ${CARTOES_DA_SESSAO.length} cartoes da sessao, o servidor tem ${cartoes.length}`)
  }
  return { sessionId, cartoes }
}

/**
 * DOIS CARTOES NOVOS NA SESSAO DA REVISAO, com palavras que nenhuma outra passada criou. As suites rodam
 * tres vezes no MESMO banco (um viewport depois do outro), e as rodadas de jogo e de revisao vao tirando
 * os cartoes da fila do dia: na terceira passada "Hoje" ja estava "tudo em dia" e os testes que precisam
 * de algo para estudar caiam (medido em 11/10/2026: passam na 1a e na 2a, caem na 3a). Cartao novo entra
 * na fila de hoje; com dois por passada sempre ha o que estudar, em "Tudo" e na sessao.
 */
export async function semearCartoesNovosNaSessao(sessionId: string): Promise<void> {
  /* So letras: a chave de uma palavra descarta digitos e pontuacao. */
  const letras = (n: number) => [...n.toString(26)].map((d) => String.fromCharCode(97 + parseInt(d, 26))).join('')
  const marca = letras(Date.now())
  const r = await fetch(`${BASE}/api/vocab/bulk-add`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      cards: ['a', 'b'].map((x) => ({
        word: `nova${marca}${x}`,
        back: `novo ${marca} ${x}`,
        srcLang: 'en',
        tgtLang: 'pt-BR',
        sessionId,
      })),
    }),
  })
  if (!r.ok) throw new Error(`POST /api/vocab/bulk-add devolveu ${r.status}: ${(await r.text()).slice(0, 200)}`)
}

export interface PerfilDeMetricas {
  deckSize: number
  reviews: number
  correctReviews: number
  drillItems: number
  drillCorrect: number
  seedsGastas: number
  sequencias7?: number
  palavrasSalvasPremiadas?: number
  rodadasPerfeitas?: number
  seedsCreditadas?: number
  itensComprados?: string[]
}

export async function perfil(): Promise<PerfilDeMetricas> {
  const r = await fetch(`${BASE}/api/metrics/profile`)
  if (!r.ok) throw new Error(`GET /api/metrics/profile devolveu ${r.status}`)
  return (await r.json()) as PerfilDeMetricas
}

/**
 * O SALDO COMO A TELA O CALCULA. `deriveProgress` faz ganhas − gastas, e "ganhas" e a soma de
 * `seedsGanhasDeEventos` (`src/core/learning/xp.ts`): 1 por cartao, 2 por revisao certa, 1 por
 * item de jogo certo, 5 por rodada perfeita, 1 por palavra salva da captura (teto diario ja aplicado),
 * 25 por sequencia de 7, mais os creditos avulsos. Presenca e minutos de captura sairam nas
 * recompensas v2 (27/09). Reescrito aqui em vez de importado do core
 * para que a suite nao dependa de o core transpilar dentro do Playwright — e para que uma
 * mudanca de peso apareca como falha de teste, que e o que uma mudanca de economia merece.
 */
export function saldoEsperado(p: PerfilDeMetricas): number {
  const ganhas =
    (p.deckSize ?? 0) * 1 +
    (p.correctReviews ?? 0) * 2 +
    (p.drillCorrect ?? 0) * 1 +
    (p.rodadasPerfeitas ?? 0) * 5 +
    (p.palavrasSalvasPremiadas ?? 0) * 1 +
    (p.sequencias7 ?? 0) * 25 +
    (p.seedsCreditadas ?? 0)
  return Math.max(0, ganhas - (p.seedsGastas ?? 0))
}

/** Grava uma rodada 100% certa via API — o mesmo `POST /api/exercises/rodada` que os jogos usam. */
export async function rodadaPerfeitaViaApi(cartoes: CartaoNoServidor[], jogo = 'memory'): Promise<void> {
  const roundId = `e2e-${jogo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const r = await fetch(`${BASE}/api/exercises/rodada`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      roundId,
      exerciseKind: jogo,
      origem: 'baralho',
      score: 100,
      itens: cartoes.map((c) => ({
        cardId: c.id,
        itemRef: c.word,
        correct: 1,
        attempts: 1,
        ms: 900,
        hinted: 0,
        kind: 'drill',
      })),
    }),
  })
  if (!r.ok) throw new Error(`POST /api/exercises/rodada devolveu ${r.status}: ${(await r.text()).slice(0, 200)}`)
}

/** Tenta gastar Seeds; devolve status e corpo sem lancar — o teste decide o que e aceitavel. */
export async function gastarSeedsViaApi(input: { spendId: string; amount: number; reason: string }) {
  const r = await fetch(`${BASE}/api/metrics/seeds/gastar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const corpo: unknown = await r.json().catch(() => null)
  return { status: r.status, corpo }
}

/** Le `settings.ui` ja desserializado. */
export async function uiDoServidor(): Promise<Record<string, unknown>> {
  const r = await fetch(`${BASE}/api/settings`)
  if (!r.ok) throw new Error(`GET /api/settings devolveu ${r.status}`)
  const s = (await r.json()) as { ui?: string | null }
  try {
    return s.ui ? (JSON.parse(s.ui) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * DEVOLVE O CONTEUDO ESCOLHIDO A "TUDO", no servidor. A escolha de conteudo (a ficha de Cartoes, Jogar e
 * Biblioteca) mora na CONTA (`settings.ui.conteudo`), e a conta e uma so para todas as suites e para os
 * tres viewports: o baralho ou a sessao que um teste escolheu viria junto para o seguinte, e "Hoje"
 * passaria a contar so aquele conteudo. Quem precisa partir do padrao chama isto antes de abrir a tela.
 */
export async function conteudoPadraoNoServidor(): Promise<void> {
  const ui = await uiDoServidor()
  if (!('conteudo' in ui)) return
  delete ui.conteudo
  const r = await fetch(`${BASE}/api/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ui }),
  })
  if (!r.ok) throw new Error(`PUT /api/settings devolveu ${r.status}`)
}

export interface BaralhoNoServidor {
  id: string
  nome: string
  total: number
  ativas: number
}

/**
 * UM BARALHO DO ANKI NO SERVIDOR, para as suites que dependem de haver um (`baralhos`, `facetas`).
 *
 * Num banco novo — o da CI e o do servidor proprio desta suite — nao ha baralho nenhum, e os casos
 * "condicionais a haver baralho" pulavam SEMPRE: cobertura que se acreditava ter e nunca rodava.
 * Aqui entra o `.apkg` de exemplo do repositorio (`tests/fixtures/baralho-moderno.apkg`, quatro notas
 * em ingles) pela MESMA rota que a tela de importacao usa (`POST /api/import/anki`, corpo cru, nome no
 * cabecalho). A rota ja ativa as notas. Idempotente: se o servidor ja tem baralho, devolve o que ha.
 */
export async function semearBaralhoAnki(): Promise<BaralhoNoServidor[]> {
  const listar = async () => {
    const r = await fetch(`${BASE}/api/anki/decks`)
    if (!r.ok) throw new Error(`GET /api/anki/decks devolveu ${r.status}`)
    return (await r.json()) as BaralhoNoServidor[]
  }
  const antes = await listar()
  if (antes.some((b) => b.ativas > 0)) return antes
  const { readFile } = await import('node:fs/promises')
  const arquivo = await readFile('tests/fixtures/baralho-moderno.apkg')
  const r = await fetch(`${BASE}/api/import/anki`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-filename': 'baralho-moderno.apkg',
      'x-src-lang': 'en',
    },
    body: new Uint8Array(arquivo),
  })
  if (!r.ok) throw new Error(`POST /api/import/anki devolveu ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const depois = await listar()
  if (!depois.some((b) => b.ativas > 0)) throw new Error('o baralho de exemplo entrou sem nenhuma nota ativada')
  return depois
}
