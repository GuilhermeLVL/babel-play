/**
 * Estado do BOOT (auditoria P2-5, corrigido pela auditoria de 2026-09-07, achado A34).
 *
 * `startServer()` roda migração Leitner→FSRS e backfill de tenancy dentro de try/catch com
 * `console.warn`, e segue subindo. Isso é a escolha certa — derrubar o app por causa de uma
 * migração idempotente seria pior —, mas do jeito que estava NÃO havia sinal externo: linhas
 * com `user_id` NULL continuavam invisíveis ao dono e nenhuma probe percebia.
 *
 * ONDE O ESTADO MORA, E POR QUE MUDOU. Era um array de módulo, ou seja, por PROCESSO. Em cluster
 * só o primário prepara os dados (`prepararDados: false` nos workers), então uma falha ficava
 * registrada nele e invisível nos outros: `/api/health` respondia `degraded` ou `ok` conforme o
 * processo que o balanceador sorteasse. Saúde que alterna não é sinal, é ruído — e o orquestrador
 * decide reiniciar (ou não) com base nela.
 *
 * Agora o registro é uma linha em `boot_falhas`, que é o mesmo banco que todas as instâncias já
 * compartilham. A memória continua existindo como resposta imediata e como rede de segurança para
 * quando é o próprio banco que está fora — nesse caso o health já responde `db: down` de qualquer
 * jeito, e o que importa é não perder o motivo.
 *
 * O PASSO QUE VOLTA A DAR CERTO APAGA A LINHA. Sem isso, uma falha transitória de um boot deixaria
 * a instância degradada para sempre, e o operador aprenderia a ignorar a probe.
 */
import { sql } from 'drizzle-orm'

import { db } from '../db/db'
import { bootFalhas } from '../db/schema'
import { log } from './logger'

export interface FalhaDeBoot {
  /** Identificador curto do passo: 'migracao-fsrs' | 'backfill-tenancy' | 'pragmas'… */
  passo: string
  em: number
}

/** Espelho local: resposta imediata e último recurso quando o banco não responde. */
const falhas = new Map<string, FalhaDeBoot>()

/**
 * Gravações em voo em `boot_falhas`. As escritas são disparadas sem espera (quem registra está num `catch`
 * no meio do boot), então só quem quer um estado determinístico, os testes, espera por elas — sem isto, um
 * `DELETE` de reset podia chegar ao banco ANTES do `INSERT` que ainda estava em voo, e a linha sobrava.
 */
const emVoo = new Set<Promise<unknown>>()
function rastrear(escrita: Promise<unknown>): void {
  emVoo.add(escrita)
  void escrita.finally(() => emVoo.delete(escrita))
}

/** Só para os testes: espera as gravações em `boot_falhas` já disparadas chegarem ao banco. */
export async function aguardarGravacoesDeBoot(): Promise<void> {
  await Promise.allSettled([...emVoo])
}

function instancia(): string {
  // `hostname` sem importar `node:os` no topo: este módulo é carregado no caminho quente do health.
  return `${process.env.HOSTNAME || 'local'}:${process.pid}`
}

/**
 * Marca um passo do boot como falho. A mensagem vai para o LOG, não para o estado exposto.
 *
 * Continua SÍNCRONA de propósito: quem chama está dentro de um `catch` no meio do boot e não tem
 * o que fazer com uma promessa. A escrita no banco é disparada e observada só pelo log — se ela
 * falhar, o espelho local ainda responde, e o health já vai acusar o banco.
 */
export function registrarFalhaDeBoot(passo: string, err: unknown): void {
  const em = Date.now()
  falhas.set(passo, { passo, em })
  log('error', { event: 'boot_step_failed', error: `${passo}: ${String(err).slice(0, 120)}` })
  /* No Worker o portão roda FORA de `comExecutor`, e o `db` lança de forma síncrona (`BancoIndisponivel`):
     sem este `try`, registrar a falha derrubaria o próprio boot. O espelho acima já vale para este isolate. */
  try {
    rastrear(
      db
        .insert(bootFalhas)
        .values({ passo, em, instancia: instancia() })
        .onConflictDoUpdate({ target: bootFalhas.passo, set: { em, instancia: instancia() } })
        .catch((e) => log('warn', { event: 'boot_status_persist_failed', error: String(e).slice(0, 120) })),
    )
  } catch (e) {
    log('warn', { event: 'boot_status_persist_failed', error: String(e).slice(0, 120) })
  }
}

function tabelaAindaNaoExiste(e: unknown): boolean {
  const causa = (e as { cause?: { code?: string } } | undefined)?.cause
  return causa?.code === '42P01' || /relation "boot_falhas" does not exist/i.test(String(e))
}

/**
 * Marca um passo como bem-sucedido, apagando a falha anterior se houver.
 *
 * É o que fecha o ciclo: sem isto, o primeiro boot que falhasse deixaria `/api/health` em 503 para
 * sempre, inclusive depois de o problema ser resolvido.
 */
export function registrarSucessoDeBoot(passo: string): void {
  falhas.delete(passo)
  /* Mesmo `try` de `registrarFalhaDeBoot`: no portão do Worker o `db` lança de forma síncrona. */
  try {
    rastrear(
      db
        .delete(bootFalhas)
        .where(sql`${bootFalhas.passo} = ${passo}`)
        .catch((e) => {
          /* `configuracao` é conferida ANTES das migrations (server.ts): num banco novo a tabela ainda não
             existe (42P01) e não há linha antiga a apagar — silêncio, não aviso a cada boot. */
          if (tabelaAindaNaoExiste(e)) return
          log('warn', { event: 'boot_status_clear_failed', error: String(e).slice(0, 120) })
        }),
    )
  } catch (e) {
    log('warn', { event: 'boot_status_clear_failed', error: String(e).slice(0, 120) })
  }
}

/**
 * O estado do boot como qualquer instância o vê.
 *
 * Assíncrona porque agora consulta o banco. Falha de leitura cai no espelho local em vez de
 * derrubar o health: um health que explode é pior que um health incompleto.
 */
export async function bootStatus(): Promise<{ ok: boolean; erros: FalhaDeBoot[] }> {
  try {
    const linhas = await db.select({ passo: bootFalhas.passo, em: bootFalhas.em }).from(bootFalhas)
    const juntas = new Map(falhas)
    for (const l of linhas) juntas.set(l.passo, { passo: l.passo, em: Number(l.em) })
    const erros = [...juntas.values()].sort((a, b) => a.em - b.em)
    return { ok: erros.length === 0, erros }
  } catch {
    const erros = [...falhas.values()]
    return { ok: erros.length === 0, erros }
  }
}

/**
 * Só para os testes: esquece o espelho de memória SEM tocar no banco.
 *
 * É como se simula "outro processo": um worker que sobe depois do primário tem a memória vazia e
 * só enxerga o que está no banco. Sem isto, o teste do estado compartilhado passaria pelo motivo
 * errado — leria o próprio espelho local e nunca provaria que a linha atravessa o processo.
 */
export function esquecerEmMemoria(): void {
  falhas.clear()
}

/** Só para os testes: zera o acumulado (memória e banco) entre casos. */
export async function resetBootStatus(): Promise<void> {
  /* Primeiro as gravações em voo pousam; só então o `DELETE` do reset (ordem garantida, sem sono fixo). */
  await aguardarGravacoesDeBoot()
  falhas.clear()
  try {
    await db.delete(bootFalhas)
  } catch {
    /* banco pode nem existir no teste */
  }
}
