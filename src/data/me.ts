import { apiFetch } from './api'

/**
 * O PERFIL DO USUÁRIO, do lado do cliente.
 *
 * Arquivo próprio, e não mais uma função em `api.ts` (que já passa de 900 linhas e cobre sessões,
 * vocabulário, exercícios, métricas, importação e configurações). Perfil é um assunto novo; começar
 * separado é mais barato que separar depois.
 */

export interface Perfil {
  id: string
  role: string
  status: string
  /** Do banco. Costuma ser `null` — o servidor não retém o e-mail do JWT (ver `server/routes/me.ts`). */
  email: string | null
  displayName: string | null
  locale: string | null
  bio: string | null
  goal: string | null
  onboardedAt: number | null
  interests: string[]
}

export interface PatchDePerfil {
  displayName?: string | null
  locale?: string | null
  bio?: string | null
  goal?: string | null
  interests?: string[]
}

export async function fetchPerfil(): Promise<Perfil | null> {
  try {
    const res = await apiFetch('/api/me')
    if (!res.ok) return null
    return await res.json() as Perfil
  } catch {
    return null
  }
}

/**
 * Grava e devolve o perfil COMO O SERVIDOR FICOU — não o que foi enviado.
 *
 * O servidor apara, corta e sanea (nome de 60, bio de 280, o teto de interesses, o vocabulário
 * fechado). Ecoar o pedido em vez da resposta faria a tela exibir um valor que o banco não tem —
 * a mesma classe de mentira silenciosa que a tela de Ajustes já teve de corrigir com `targetLanguage`.
 *
 * Devolve `null` quando falha, e quem chama decide o que dizer. Nunca lança.
 */
export async function patchPerfil(patch: PatchDePerfil): Promise<Perfil | null> {
  try {
    const res = await apiFetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) return null
    return await res.json() as Perfil
  } catch {
    return null
  }
}

/** Um ponto da curva de XP. Espelha `PontoDeXp` do servidor. */
interface PontoDeXp {
  em: number
  xpNoPeriodo: number
  xpAcumulado: number
  nivel: number
}

export interface HistoricoDeXp {
  pontos: PontoDeXp[]
  /** "Saiu do 1 para o 2 em tal dia." */
  marcos: Array<{ em: number; nivel: number }>
  xpTotal: number
}

/**
 * A curva de XP no tempo.
 *
 * Rota própria (`/api/metrics/xp`) e não um campo de `/profile`: aquele endpoint varre cinco tabelas
 * inteiras e roda a cada mudança da lista de gravações. Quem paga por este cálculo é a tela que
 * desenha o gráfico.
 */
export async function fetchHistoricoDeXp(balde: 'dia' | 'semana' = 'dia'): Promise<HistoricoDeXp | null> {
  try {
    const res = await apiFetch(`/api/metrics/xp?balde=${balde}`)
    if (!res.ok) return null
    return await res.json() as HistoricoDeXp
  } catch {
    return null
  }
}
