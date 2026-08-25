/**
 * Estado do BOOT (auditoria P2-5).
 *
 * `startServer()` roda migração Leitner→FSRS e backfill de tenancy dentro de try/catch com
 * `console.warn`, e segue subindo. Isso é a escolha certa — derrubar o app por causa de uma
 * migração idempotente seria pior —, mas do jeito que estava NÃO havia sinal externo: linhas
 * com `user_id` NULL continuavam invisíveis ao dono e nenhuma probe percebia.
 *
 * Aqui o passo que falhou fica registrado e o `/api/health` passa a responder `degraded`,
 * que é o que um orquestrador (ou um humano) consegue enxergar.
 */
import { log } from './logger'

export interface FalhaDeBoot {
  /** Identificador curto do passo: 'migracao-fsrs' | 'backfill-tenancy' | 'pragmas'… */
  passo: string
  em: number
}

const falhas: FalhaDeBoot[] = []

/** Marca um passo do boot como falho. A mensagem vai para o LOG, não para o estado exposto. */
export function registrarFalhaDeBoot(passo: string, err: unknown): void {
  falhas.push({ passo, em: Date.now() })
  log('error', { event: 'boot_step_failed', error: `${passo}: ${String(err).slice(0, 120)}` })
}

export function bootStatus(): { ok: boolean; erros: FalhaDeBoot[] } {
  return { ok: falhas.length === 0, erros: [...falhas] }
}

/** Só para os testes: zera o acumulado entre casos. */
export function resetBootStatus(): void {
  falhas.length = 0
}
