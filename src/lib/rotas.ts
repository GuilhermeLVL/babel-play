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

export type ViewDeRota = 'hub' | 'capture' | 'play' | 'library' | 'analysis' | 'metrics' | 'settings' | 'profile' | 'sobre'

export interface EstadoDeRota {
  view: ViewDeRota
  /** Só para `analysis`: qual gravação. */
  sessionId?: string
  /** Só para `analysis`: qual aba. */
  subTab?: 'transcript' | 'reading' | 'practice' | 'overview' | 'study'
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
  const seg = SEGMENTO[e.view]
  return seg ? `/${seg}` : '/'
}

export function urlParaEstado(caminho: string): EstadoDeRota {
  const partes = String(caminho || '')
    .split('?')[0]
    .split('#')[0]
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

  const view = VIEW_DE_SEGMENTO[partes[0]]
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
  if (window.location.pathname === alvo) return
  // `replaceState` na restauração inicial: entrar no app não deve criar uma entrada de histórico
  // para trás que devolveria o usuário para fora.
  window.history[push ? 'pushState' : 'replaceState']({}, '', alvo)
}

export function lerUrlAtual(): EstadoDeRota {
  if (typeof window === 'undefined') return { view: 'hub' }
  return urlParaEstado(window.location.pathname)
}
