/**
 * Cliente Supabase do browser (Marco 1 — identidade). Defensivo por desenho: quando as variáveis
 * VITE_SUPABASE_* NÃO estão configuradas (o caso local/self-host padrão), o cliente é `null` e
 * `getAccessToken` devolve null — nenhum header de auth é enviado e o app roda sem login, como hoje.
 *
 * CARGA SOB DEMANDA (F0-08). O `@supabase/supabase-js` entrava aqui por import ESTÁTICO, e este
 * arquivo está no grafo de arranque (`src/data/api.ts` o importa, e toda tela usa a camada de
 * dados) — o `index.html` do build trazia `vendor-supabase` como `modulepreload`. Medido no
 * /jogar: 218,42 kB minificados baixados, compilados e AVALIADOS em toda visita, com o
 * `unused-javascript` do Lighthouse apontando 54.597 dos 56.688 bytes transferidos — 96% — como
 * NUNCA executados. É o esperado: com `VITE_SUPABASE_ANON_KEY` vazia (self-host, e o build da
 * medição) o cliente é `null` e nada daquele código tem uso. E o custo é execução, não análise
 * sintática: o `mainthread-work-breakdown` da mesma medição dá 1594 ms de *Script Evaluation*
 * contra 7 ms de *Script Parsing & Compilation*, então só tirar do arranque resolve.
 *
 * Quem está configurado não perde nada: o download dispara já na avaliação deste módulo, em
 * paralelo com o resto do arranque, e todo caminho que precisa do cliente espera por ele —
 * `getAccessToken` abaixo (por onde passa TODO `apiFetch`, via `authHeaders`) e o efeito de sessão
 * do `App`. A tela "Carregando…" que o App já pintava enquanto o `getSession()` ia e voltava é a
 * mesma; ela só passou a cobrir também o download do pacote, que é a parte rápida da espera.
 */
import { EDICAO_LEVE } from './edicao'
import type { SupabaseClient } from '@supabase/supabase-js'

// O tsconfig raiz não carrega os tipos do Vite (vite/client); `import.meta.env` existe em runtime.
const env: Record<string, string | undefined> = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
const url = env.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY

/** Há projeto Supabase compilado neste build? É exatamente o que antes se lia como `!!supabase`. */
const configurado = !!url && !!anonKey

/**
 * Cliente Supabase, ou null quando não configurado (uso local sem login).
 *
 * `let` porque agora ele CHEGA depois. Não é mudança de contrato para quem importa: os
 * consumidores já liam esta ligação no momento da chamada, atrás de um `if (!supabase)`, e a
 * ligação de módulo ES é viva — eles passam a ver o cliente assim que ele existe. E ninguém o lê
 * cedo demais: as telas que dependem dele (`Login`, `SecurityPanel`, `lib/auth`) só montam sob
 * `authRequired`, depois de o `App` ter esperado a carga; e todo `apiFetch` passa por
 * `authHeaders() → getAccessToken()`, que espera a carga ANTES de a requisição sair — então o
 * tratamento de 401 em `data/api.ts` nunca chega a ver este valor pela metade.
 */
export let supabase: SupabaseClient | null = null

let carga: Promise<SupabaseClient | null> | null = null

/**
 * Garante o cliente, baixando o pacote na primeira chamada. Devolve `null` quando não há projeto
 * configurado — o mesmo contrato defensivo de antes, agora sem custo nenhum de download.
 */
export function carregarSupabase(): Promise<SupabaseClient | null> {
  if (!configurado) return Promise.resolve(null)
  carga ??= import('@supabase/supabase-js').then(({ createClient }) => {
    supabase = createClient(url, anonKey, {
      // Intenção explícita (todos já são default do supabase-js) — trava o comportamento de sessão.
      // `flowType` fica no default até habilitarmos o login social (evita mexer no fluxo de recuperação).
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
    return supabase
  })
  return carga
}

// Dispara já: onde há projeto configurado o pacote É necessário, e adiar o download até o primeiro
// `await` só atrasaria o login. O que muda é que ele deixou de BLOQUEAR o arranque de todo mundo.
if (configurado) void carregarSupabase()

/** Auth exigida no cliente? Espelha o AUTH_REQUIRED do servidor. Só é `true` se houver projeto. */
export const authRequired: boolean = !EDICAO_LEVE && env.VITE_AUTH_REQUIRED === '1' && configurado

/** Token de acesso da sessão atual, ou null (sem login / não configurado). */
export async function getAccessToken(): Promise<string | null> {
  const sb = await carregarSupabase()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session?.access_token ?? null
}
