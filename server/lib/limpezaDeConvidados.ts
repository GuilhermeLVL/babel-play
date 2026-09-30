/**
 * EXPIRAÇÃO DOS CONVIDADOS (Fase 7 — modo convidado).
 *
 * O convidado com nuvem deixa três rastros no servidor: a linha em `convidados`, os contadores de
 * cota em `usage_counters` e o usuário anônimo no Supabase (`auth.users`). O Supabase NÃO limpa
 * anônimos sozinho (a doc manda apagar por SQL), e um convidado que nunca volta é dado pessoal
 * pseudonimizado guardado sem finalidade — LGPD art. 15/16: terminado o uso, elimina-se.
 *
 * A REGRA: convidado sem uso de nuvem há 30 dias (`visto_em`) é removido, em lotes.
 *
 *   - Com a Admin API do Supabase (`SUPABASE_SERVICE_ROLE_KEY`, a mesma de `aal.ts`): consulta o
 *     usuário. Ainda anônimo → apaga o usuário no Supabase, os contadores e a linha. Já virou conta
 *     (a conversão mantém o id) → apaga só a linha de convidado; os contadores são da conta agora.
 *     Sumiu do Supabase (404) → apaga contadores e linha.
 *   - Sem a Admin API: não há como saber se o id virou conta. Apaga a linha e só os contadores de
 *     meses ANTERIORES (o mês corrente pode já ser da conta). Os anônimos ficam no Supabase até o
 *     dono rodar o SQL da doc (pendência registrada em `fase7-convidado.md`).
 *
 * Também poda os contadores DIÁRIOS (por IP pseudonimizado e o pool do dia) de mais de 2 dias.
 *
 * Mesmo padrão da retenção de áudio (`retencaoDeAudio.ts`): roda no processo que prepara os dados
 * (o primário), temporizador com `unref()`, primeira passada minutos depois do boot. Cada chamada à
 * Admin API tem timeout, e a passada tem teto de lotes — um Supabase lento não prende o processo.
 */
import { convidadosRepo } from '../db/repositories/convidados'
import { adminDoSupabase } from './config'
import { CHAVE_POOL, PREFIXO_IP } from './convidado'
import { log } from './logger'
import { CHAVE_POOL_DO_ALIVIO } from './nuvemDeAlivio'

const DIA_MS = 86_400_000

export interface ResultadoDaLimpezaDeConvidados {
  /** Convidados ainda anônimos (ou já sumidos do Supabase) removidos com contadores. */
  removidos: number
  /** Usuários anônimos apagados no Supabase. */
  usuariosApagados: number
  /** Ids que viraram conta: só a linha de convidado saiu. */
  convertidos: number
  /** Sem Admin API: linha e contadores antigos saíram, o usuário anônimo ficou no Supabase. */
  semAdmin: number
  /** Falhas na Admin API (ficam para a próxima passada). */
  falhas: number
}

type EstadoNoSupabase = 'anonimo' | 'conta' | 'ausente'

interface Opcoes {
  dias?: number
  agora?: number
  lote?: number
  maxLotes?: number
  timeoutMs?: number
  /** Injetável (testes). */
  fetch?: typeof fetch
}

async function estadoNoSupabase(
  admin: { base: string; chave: string },
  userId: string,
  f: typeof fetch,
  timeoutMs: number,
): Promise<EstadoNoSupabase> {
  const r = await f(`${admin.base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: { apikey: admin.chave, authorization: `Bearer ${admin.chave}` },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (r.status === 404) return 'ausente'
  if (!r.ok) throw new Error(`admin users ${r.status}`)
  const corpo = (await r.json()) as { is_anonymous?: boolean; user?: { is_anonymous?: boolean } }
  const anonimo = corpo.is_anonymous ?? corpo.user?.is_anonymous
  return anonimo === true ? 'anonimo' : 'conta'
}

async function apagarNoSupabase(
  admin: { base: string; chave: string },
  userId: string,
  f: typeof fetch,
  timeoutMs: number,
): Promise<void> {
  const r = await f(`${admin.base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { apikey: admin.chave, authorization: `Bearer ${admin.chave}` },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!r.ok && r.status !== 404) throw new Error(`admin delete ${r.status}`)
}

/** Uma passada de limpeza. Exportada para o teste (com relógio e `fetch` falsos) e para a CLI. */
export async function limparConvidadosInativos(o: Opcoes = {}): Promise<ResultadoDaLimpezaDeConvidados> {
  const agora = o.agora ?? Date.now()
  const dias = o.dias ?? 30
  const lote = o.lote ?? 100
  const maxLotes = o.maxLotes ?? 20
  const timeoutMs = o.timeoutMs ?? 5_000
  const f = o.fetch ?? fetch
  const admin = adminDoSupabase()
  const antesDe = agora - dias * DIA_MS
  const mesCorrente = new Date(agora).toISOString().slice(0, 7)
  const r: ResultadoDaLimpezaDeConvidados = {
    removidos: 0,
    usuariosApagados: 0,
    convertidos: 0,
    semAdmin: 0,
    falhas: 0,
  }

  for (let i = 0; i < maxLotes; i++) {
    const linhas = await convidadosRepo.inativos(antesDe, lote)
    if (linhas.length === 0) break
    const ids = linhas.map((l) => l.userId)

    if (!admin) {
      await convidadosRepo.apagarComContadores(ids, { janelaMenorQue: mesCorrente })
      r.semAdmin += ids.length
    } else {
      const remover: string[] = []
      const convertidos: string[] = []
      for (const id of ids) {
        try {
          const estado = await estadoNoSupabase(admin, id, f, timeoutMs)
          if (estado === 'conta') {
            convertidos.push(id)
            continue
          }
          if (estado === 'anonimo') {
            await apagarNoSupabase(admin, id, f, timeoutMs)
            r.usuariosApagados++
          }
          remover.push(id)
        } catch (err) {
          r.falhas++
          log('warn', {
            event: 'convidado_limpeza_admin_falhou',
            error: String((err as Error)?.message ?? err).slice(0, 120),
          })
        }
      }
      await convidadosRepo.apagarComContadores(remover)
      await convidadosRepo.apagarRegistro(convertidos)
      r.removidos += remover.length
      r.convertidos += convertidos.length
      // Lote sem progresso (Admin API fora): para aqui, senão o laço releria as mesmas linhas.
      if (remover.length + convertidos.length === 0) break
    }
    if (linhas.length < lote) break
  }

  const doisDiasAtras = new Date(agora - 2 * DIA_MS).toISOString().slice(0, 10)
  /* O pool diário da nuvem de alívio (A10) é contador do mesmo tipo: um por dia, sem dono. */
  await convidadosRepo.podarContadoresDiarios([PREFIXO_IP, CHAVE_POOL, CHAVE_POOL_DO_ALIVIO], doisDiasAtras)

  if (r.removidos + r.convertidos + r.semAdmin + r.falhas > 0) {
    log('info', {
      event: 'convidados_limpeza',
      total: r.removidos + r.convertidos + r.semAdmin,
      error: `removidos=${r.removidos} usuarios=${r.usuariosApagados} convertidos=${r.convertidos} semAdmin=${r.semAdmin} falhas=${r.falhas}`,
    })
  }
  return r
}

/** Liga a limpeza diária. Devolve como desligar. */
export function agendarLimpezaDeConvidados(o: { atrasoInicialMs?: number; intervaloMs?: number } = {}): () => void {
  let relogio: NodeJS.Timeout | undefined
  const rodar = async () => {
    try {
      await limparConvidadosInativos()
    } catch (err) {
      log('error', { event: 'convidados_limpeza_erro', error: String((err as Error)?.message ?? err).slice(0, 300) })
    }
  }
  const armar = (ms: number) => {
    relogio = setTimeout(() => {
      void rodar().finally(() => armar(o.intervaloMs ?? DIA_MS))
    }, ms)
    relogio.unref?.()
  }
  armar(o.atrasoInicialMs ?? 7 * 60_000)
  return () => {
    if (relogio) clearTimeout(relogio)
  }
}
