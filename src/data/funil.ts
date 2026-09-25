/**
 * O FUNIL da camada de dados do cliente — a FOLHA por onde tudo sai (ou não sai) para a rede.
 *
 * ─── POR QUE ISTO É UM ARQUIVO SEPARADO DE `api.ts` ───
 *
 * 1) O CICLO. `api.ts` é a fachada: ele reexporta `./rotas/<domínio>.ts`. Enquanto o `apiFetch`
 *    morava lá, cada módulo de rota tinha de importá-lo DE VOLTA de `api.ts` — dez ciclos de
 *    importação (`api.ts → rotas/x.ts → api.ts`), e `npm run morto:ciclos` (madge) é portão de CI.
 *    Um ciclo só se quebra tirando o alvo do importe-de-volta do módulo que reexporta. Por isso o
 *    funil é uma FOLHA: `funil.ts` não importa nenhum `rotas/*`, e ninguém o reexporta de volta
 *    para dentro dele. Os `rotas/*` importam daqui; `api.ts` reexporta daqui e dos `rotas/*`.
 *
 * 2) A REGRA QUE CITA O CAMINHO. `audit/rules/ast-grep/fetch-fora-do-funil.yml` proíbe
 *    `fetch('/api/…')` em todo o `src/` e libera UM caminho literal — este arquivo, porque é onde
 *    a única chamada real de `fetch` vive. Mover o `fetch` daqui sem mexer no `ignores` da regra
 *    a transformaria numa regra que nunca dispara, que é pior do que não ter regra: o CI segue
 *    verde e ninguém sabe que a guarda caiu. Se a chamada mudar de arquivo, mude o `ignores`
 *    (e a `message`) no mesmo commit.
 *
 * O que fica aqui é só isso: `apiFetch` (o único ponto que decide entre a rede e o servidor em
 * memória do modo sem conta) e `lerErro` (o envelope de erro do servidor, deste lado).
 */
import { authHeaders } from '../lib/authHeaders'
import { ehRotaDeNuvemDoConvidado, garantirSessaoDeConvidado, nuvemDoConvidadoLigada, ofertaPelaResposta } from '../lib/convidado'
import { aguardarIdentidade } from '../lib/identidade'
import { aguardarProtecao, rotaLiberadaNaRestricao } from '../lib/protecaoDoMenor'
import { cabecalhoDaSessaoDeCaptura } from '../lib/sessaoDeCaptura'
import { authRequired,supabase } from '../lib/supabase'
import { CABECALHO_DA_VERSAO, conferirVersaoDoServidor } from '../lib/versao'
import { servidorEfemero } from './efemero/servidor'

// ───────────────────────────── fetch com teto de tempo (A-05) ─────────────────────────────
// Toda a camada de dados usava `fetch` SEM timeout: uma resposta que nunca chega deixava a UI presa
// em "carregando…" para sempre, sem caminho de recuperação a não ser recarregar. `apiFetch` injeta um
// AbortSignal.timeout; rotas longas (import/upload) passam `timeoutMs` maior no próprio init.
const DEFAULT_TIMEOUT_MS = 30_000
/** yt-dlp (300s no servidor), anki até 200MB, uploads grandes — teto folgado para não cortar import. */
export const IMPORT_TIMEOUT_MS = 600_000
type ApiInit = RequestInit & { timeoutMs?: number }

/**
 * QUANTAS ESCRITAS JÁ SAÍRAM POR AQUI (fix/rotas-caras). Sobe no INÍCIO de toda chamada que não
 * seja GET/HEAD.
 *
 * Serve a quem compartilha uma leitura em voo entre várias telas (`fetchDeck`, `fetchSettings`):
 * uma leitura que começou ANTES de uma escrita pode não enxergá-la, então quem pede depois da
 * escrita não pode pegar carona nela. Comparar a geração no começo das duas é o que separa "a
 * mesma pergunta, ao mesmo tempo" de "a pergunta de novo, depois de mudar a resposta".
 */
let escritas = 0
export function geracaoDeEscritas(): number {
  return escritas
}

export async function apiFetch(input: string, init?: ApiInit): Promise<Response> {
  const { timeoutMs, ...rest } = init ?? {}
  const metodo = (rest.method ?? 'GET').toUpperCase()
  if (metodo !== 'GET' && metodo !== 'HEAD') escritas++
  // Sem conta, NADA sai para a rede: o servidor em memória responde (ver data/efemero). Este é o
  // único ponto de corte — toda a camada de dados passa por aqui.
  const identidade = await aguardarIdentidade()
  /* MODO CONVIDADO (Fase 7): sem conta, a IA de nuvem só sai para a rede com as flags
     `modo_convidado` + `nuvem_convidado` ligadas — e aí com a sessão ANÔNIMA do Supabase, criada
     aqui mesmo, no primeiro uso (`lib/convidado`). Todo o resto continua no servidor em memória. */
  const nuvemDoConvidado =
    identidade === 'anonimo' &&
    ehRotaDeNuvemDoConvidado(input, rest.method) &&
    nuvemDoConvidadoLigada() &&
    (await garantirSessaoDeConvidado())
  if (identidade === 'anonimo' && !nuvemDoConvidado) {
    const local = await servidorEfemero(input, rest)
    void ofertaPelaResposta(local, input)
    return local
  }
  /* CONTA DE MENOR SEM O RESPONSÁVEL (Fase 4 — ECA Digital art. 24): até o vínculo ser aceito, os
     dados ficam no aparelho, pelo MESMO servidor em memória do modo sem conta. A conta, o convite e
     a cobrança seguem para a rede. O servidor também recusa (403 `responsavel_pendente`) — aqui é a
     experiência, lá é a garantia. */
  if (identidade === 'conta' && !rotaLiberadaNaRestricao(input)) {
    const protecao = await aguardarProtecao()
    if (protecao?.restrita) return servidorEfemero(input, rest)
  }
  const signal = rest.signal ?? AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const send = async (): Promise<Response> => {
    // Marco 1: injeta o Authorization quando há sessão (no-op no uso local sem login).
    const auth = await authHeaders()
    // A sessão de captura agrupa as chamadas de IA de uma aula no Langfuse (ver `lib/sessaoDeCaptura`).
    return fetch(input, { ...rest, headers: { ...auth, ...cabecalhoDaSessaoDeCaptura(input), ...(rest.headers ?? {}) }, signal })
  }
  let res = await send()
  // Sessão expirada (modo público): 1 refresh + retry; persistindo, encerra a sessão (→ tela de login).
  if (res.status === 401 && authRequired && supabase) {
    const { data } = await supabase.auth.refreshSession()
    if (data?.session) res = await send()
    if (res.status === 401) await supabase.auth.signOut()
  }
  // P0-7b: o servidor diz a versão em toda resposta `/api`; diferente da do bundle, avisa (uma vez).
  conferirVersaoDoServidor(res.headers?.get?.(CABECALHO_DA_VERSAO) ?? null)
  // O convidado bateu num teto de nuvem (cota, limite por IP, exige conta): avisa a camada de ofertas.
  if (nuvemDoConvidado) void ofertaPelaResposta(res, input)
  return res
}

/**
 * O ENVELOPE DE ERRO DO SERVIDOR, do lado de cá (auditoria de 2026-09-07, achado A30).
 *
 * O servidor responde `{ error, code?, detalhes? }`. Antes, cada rota inventava a sua forma e o
 * cliente respondia a todas com `return null`: "saldo insuficiente, faltam 12 Seeds" e "preço
 * divergente do catálogo" viravam a mesma tela muda. O dado existia e não atravessava.
 */
export interface ErroDaApi {
  status: number
  error: string
  code?: string
  detalhes?: Record<string, unknown>
}

/** Lê o envelope de uma resposta que já se sabe ser de erro. Nunca lança. */
export async function lerErro(res: Response): Promise<ErroDaApi> {
  try {
    const corpo = await res.json() as Partial<ErroDaApi> & { error?: unknown }
    const texto = typeof corpo?.error === 'string' ? corpo.error : `o servidor respondeu ${res.status}`
    return { status: res.status, error: texto, code: corpo?.code, detalhes: corpo?.detalhes }
  } catch {
    return { status: res.status, error: `o servidor respondeu ${res.status}` }
  }
}
