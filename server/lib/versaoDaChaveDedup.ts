/**
 * A VERSÃO DA CHAVE DE DUPLICATA que o servidor usa agora (openspec `modelo-do-aluno-e-dados`, fatia 5).
 *
 * Só guarda o número (1 = a de sempre, 2 = por idioma). Quem o mantém em dia com a flag `chave_dedup_v2` é
 * `atualizarVersaoDaChaveDedup` (`atualizarChaveDedup.ts`, num middleware de `/api`); este arquivo fica sem
 * dependência para o repositório de vocabulário poder importá-lo sem ciclo com `lib/flags`.
 *
 * Sem estado por pessoa de propósito: a chave é uma decisão do BANCO (todos os `norm_key` são de uma versão só,
 * depois da reescrita), não do usuário.
 */
import type { VersaoDaChaveDedup } from '../../src/core/texto/palavra'

let versao: VersaoDaChaveDedup = 1

export function versaoDaChaveDedup(): VersaoDaChaveDedup {
  return versao
}

export function definirVersaoDaChaveDedup(v: VersaoDaChaveDedup): void {
  versao = v
}
