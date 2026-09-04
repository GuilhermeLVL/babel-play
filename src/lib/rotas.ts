/**
 * A URL COMO ESPELHO DO ESTADO.
 *
 * O app inteiro vivia em `/`. A navegação era `useState<ViewType>` (App.tsx:44) e mais nada, e
 * a auditoria mediu o preço disso: recarregar devolvia ao Hub e perdia a sessão aberta e a aba;
 * o botão "voltar" do navegador SAÍA do app; nenhuma tela era compartilhável; e `Study` — o
 * motor de revisão espaçada, o que o produto existe para fazer — não tinha porta na navegação.
 *
 * A ABORDAGEM É ADITIVA. A máquina de estados continua sendo a implementação; a URL vira o
 * reflexo dela. Não há router, não há re-arquitetura, e desligar isto é remover duas chamadas.
 * Por isso o contrato mora aqui como funções PURAS: dá para travar o comportamento inteiro sem
 * montar o app, e a ida-e-volta (estado → URL → estado) é verificável.
 *
 * Decisões que valem registro:
 *  · `/revisar` existe para dar a `Study` a porta que ela não tinha. É a única rota que não
 *    espelha um `ViewType` — `study` é uma pseudo-view que o App remapeia para `analysis`.
 *  · a aba entra no CAMINHO, não em query. `/sessao/<id>/metricas` põe o escopo na barra de
 *    endereço, o que reforça a separação que a aba de métricas embaralhava.
 *  · caminho desconhecido cai no Hub. Uma URL digitada errado não pode produzir tela em branco.
 */

export type ViewDeRota = 'hub' | 'capture' | 'play' | 'library' | 'analysis' | 'metrics' | 'settings' | 'profile' | 'sobre' | 'loja' | 'planos'

export interface EstadoDeRota {
  view: ViewDeRota
  /** Só para `analysis`: qual gravação. */
  sessionId?: string
  /** Só para `analysis`: qual aba. */
  subTab?: 'transcript' | 'reading' | 'practice' | 'overview' | 'study'
  /** Só para `loja` (Personalizar): qual das 4 áreas. Sem ela, a tela abre na padrão. */
  lojaTab?: 'passe' | 'personalizar' | 'loja' | 'conquistas'
  /**
   * Só para `play`: o filtro facetado serializado como query string (sem o `?`).
   * OPACO de propósito: quem sabe ler/escrever o formato é `lib/filtroDaPratica` — aqui a rota só
   * transporta. É a única rota com query porque o filtro é a única escolha combinatória do app;
   * tudo o mais continua no caminho (decisão do docblock acima).
   */
  jogarQuery?: string
}

/** View de topo → segmento. `analysis` é tratada à parte porque carrega id e aba. */
const SEGMENTO: Record<Exclude<ViewDeRota, 'analysis'>, string> = {
  hub: '',
  capture: 'capturar',
  play: 'jogar',
  library: 'biblioteca',
  metrics: 'vocabulario',
  settings: 'ajustes',
  profile: 'perfil',
  sobre: 'sobre',
  loja: 'loja',
  planos: 'plano',
}

/**
 * ALIASES DE ENTRADA — segmentos que LEEM para uma view, sem serem o endereço canônico dela.
 *
 * `/planos` (plural) caía no Hub em silêncio, e plural é o que qualquer pessoa digita: o singular
 * é a escolha de quem escreveu o mapa, não a de quem digita a URL. `/creditos` é o endereço que
 * `ComprarCreditos` nunca teve — a tela vivia dentro de uma aba que a DESMONTA quando inativa, e
 * não havia link que levasse a ela.
 *
 * Só de leitura: `estadoParaUrl` continua publicando o canônico, senão a mesma tela teria dois
 * endereços na barra e o histórico ficaria ambíguo.
 */
const ALIAS_DE_SEGMENTO: Record<string, { view: ViewDeRota; lojaTab?: EstadoDeRota['lojaTab'] }> = {
  planos: { view: 'planos' },
  creditos: { view: 'loja', lojaTab: 'loja' },
}
const VIEW_DE_SEGMENTO = Object.fromEntries(
  Object.entries(SEGMENTO).filter(([, seg]) => seg).map(([v, seg]) => [seg, v as ViewDeRota]),
) as Record<string, ViewDeRota>

/** Aba da sessão → segmento. `study` não entra: tem rota própria (`/revisar`). */
const ABA: Record<string, string> = {
  transcript: 'transcricao',
  reading: 'leitura',
  practice: 'jogos',
  overview: 'metricas',
}
const ABA_DE_SEGMENTO = Object.fromEntries(Object.entries(ABA).map(([k, v]) => [v, k]))

/**
 * Área de Personalizar → segmento (ux-v2 §1.6: sem isto, recarregar e deep-link caíam sempre na
 * aba padrão). O segmento fala a língua do RÓTULO ("meu-visual", "desafios"), não a do id
 * interno — a URL é interface.
 */
const ABA_DA_LOJA: Record<NonNullable<EstadoDeRota['lojaTab']>, string> = {
  passe: 'passe',
  personalizar: 'meu-visual',
  loja: 'itens',
  conquistas: 'desafios',
}
const ABA_DA_LOJA_DE_SEGMENTO = Object.fromEntries(
  Object.entries(ABA_DA_LOJA).map(([k, v]) => [v, k]),
) as Record<string, NonNullable<EstadoDeRota['lojaTab']>>

export function estadoParaUrl(e: EstadoDeRota): string {
  if (e.view === 'analysis') {
    // `/revisar` primeiro: é a porta da revisão espaçada, e ela vence a aba genérica.
    if (e.subTab === 'study') return e.sessionId ? `/revisar/${e.sessionId}` : '/revisar'
    // Sem gravação escolhida a aba ainda importa: perdê-la aqui fazia `/sessao/x/metricas`
    // virar `/sessao` no primeiro render, antes de a gravação resolver.
    if (!e.sessionId) return e.subTab && ABA[e.subTab] ? `/sessao/-/${ABA[e.subTab]}` : '/sessao'
    const aba = e.subTab ? ABA[e.subTab] : ''
    return aba ? `/sessao/${e.sessionId}/${aba}` : `/sessao/${e.sessionId}`
  }
  if (e.view === 'loja' && e.lojaTab) return `/loja/${ABA_DA_LOJA[e.lojaTab]}`
  if (e.view === 'play' && e.jogarQuery) return `/jogar?${e.jogarQuery}`
  const seg = SEGMENTO[e.view]
  return seg ? `/${seg}` : '/'
}

export function urlParaEstado(caminho: string): EstadoDeRota {
  const bruto = String(caminho || '').split('#')[0]
  // A query era DESCARTADA aqui (auditoria do seletor, defeito de persistência): um link com
  // filtro abria a tela certa e jogava o filtro fora. Ela sobrevive apenas em `/jogar` — é a
  // única rota que a publica — e sem o `.toLowerCase()` do caminho, porque ids de baralho e
  // códigos de idioma são sensíveis a caixa.
  const query = bruto.split('?')[1] ?? ''
  const partes = bruto
    .split('?')[0]
    .toLowerCase()
    .split('/')
    .filter(Boolean)

  if (partes.length === 0) return { view: 'hub' }
  // O callback do Supabase tem dono (`lib/authCallback`) e não é rota de tela.
  if (partes[0] === 'auth') return { view: 'hub' }

  if (partes[0] === 'revisar') {
    return partes[1]
      ? { view: 'analysis', sessionId: partes[1], subTab: 'study' }
      : { view: 'analysis', subTab: 'study' }
  }

  if (partes[0] === 'sessao') {
    if (!partes[1]) return { view: 'analysis' }
    if (partes[1] === '-') {
      const abaSemId = partes[2] ? ABA_DE_SEGMENTO[partes[2]] : undefined
      return abaSemId ? { view: 'analysis', subTab: abaSemId as EstadoDeRota['subTab'] } : { view: 'analysis' }
    }
    const aba = partes[2] ? ABA_DE_SEGMENTO[partes[2]] : undefined
    return aba
      ? { view: 'analysis', sessionId: partes[1], subTab: aba as EstadoDeRota['subTab'] }
      : { view: 'analysis', sessionId: partes[1] }
  }

  if (partes[0] === 'loja' && partes[1]) {
    const aba = ABA_DA_LOJA_DE_SEGMENTO[partes[1]]
    // Sub-aba desconhecida degrada para a tela, nunca para o Hub: o usuário pediu Personalizar.
    return aba ? { view: 'loja', lojaTab: aba } : { view: 'loja' }
  }

  const alias = ALIAS_DE_SEGMENTO[partes[0]]
  if (alias) return alias.lojaTab ? { view: alias.view, lojaTab: alias.lojaTab } : { view: alias.view }

  const view = VIEW_DE_SEGMENTO[partes[0]]
  if (view === 'play' && query) return { view, jogarQuery: query }
  // Caminho desconhecido cai no Hub: uma URL errada não pode virar tela em branco.
  return view ? { view } : { view: 'hub' }
}

/* ── Ligação com o navegador ──────────────────────────────────────────────
   Isolada aqui para o resto do app não falar com `history` diretamente, e para os testes
   acima poderem exercitar o contrato sem tocar em `window`. */

/** Escreve o estado na barra de endereço. `push` quando a navegação foi uma ação do usuário. */
export function publicarUrl(e: EstadoDeRota, push = true): void {
  if (typeof window === 'undefined') return
  const alvo = estadoParaUrl(e)
  // Alvo COM query compara com caminho+query; alvo SEM query compara só o caminho — assim uma
  // publicação de view que não conhece o filtro (App trocando de aba) não apaga a query que o
  // dono dela (Play) acabou de escrever.
  const atual = alvo.includes('?') ? window.location.pathname + window.location.search : window.location.pathname
  if (atual === alvo) return
  // `replaceState` na restauração inicial: entrar no app não deve criar uma entrada de histórico
  // para trás que devolveria o usuário para fora.
  window.history[push ? 'pushState' : 'replaceState']({}, '', alvo)
}

/**
 * Escreve (ou limpa, com '') a query do filtro — SÓ quando a tela de jogar está na barra, e
 * sempre com `replaceState`: cada ajuste de faceta não é uma página nova, e "voltar" deve sair
 * da tela, não desfazer chips um a um. Fora de `/jogar` é não-op: o filtro não manda na rota.
 */
export function publicarQueryDoJogar(query: string): void {
  if (typeof window === 'undefined') return
  if (window.location.pathname !== `/${SEGMENTO.play}`) return
  const alvo = query ? `?${query}` : ''
  if (window.location.search === alvo) return
  window.history.replaceState({}, '', window.location.pathname + alvo)
}

export function lerUrlAtual(): EstadoDeRota {
  if (typeof window === 'undefined') return { view: 'hub' }
  return urlParaEstado(window.location.pathname + window.location.search)
}

/**
 * A QUERY DO /jogar COMO ELA CHEGOU, capturada na avaliação deste módulo — antes de o React
 * escrever qualquer coisa na barra. A dança de boot do App (o efeito "navegação → URL" roda uma
 * vez com a view antiga antes de a restauração aplicar) reescreve a URL no meio do caminho: o
 * CAMINHO volta na passada seguinte, a query não. Consumo ÚNICO: um link vale para a abertura
 * que ele causou, não para toda visita futura à tela.
 */
let queryDoBoot = typeof window === 'undefined'
  ? ''
  : (urlParaEstado(window.location.pathname + window.location.search).jogarQuery ?? '')

export function consumirQueryDoBoot(): string {
  const q = queryDoBoot
  queryDoBoot = ''
  return q
}
