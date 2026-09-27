/**
 * A RODADA QUE CUMPRE OS PRÉ-REQUISITOS DO COLECIONADOR (`progressoConferivelDoColecionador`).
 *
 * Até 27/09 o Colecionador era a única conquista que o servidor não conferia, e vários testes a
 * usavam como "o jeito legítimo de dar 100 Seeds" sem montar estado. Agora ela é conferida: estes
 * testes gravam antes esta rodada — Duelo com combo 15, perfeita, 15 acertos — e seguem iguais.
 * A rodada rende, ela mesma, 15 Seeds dos acertos e 5 da rodada perfeita.
 */
import { asUserId } from '../../server/lib/authContext'
import type { EphemeralDb } from './ephemeralDb'

export function rodadaDoColecionador(roundId = 'blitz-colecionador') {
  return {
    roundId,
    exerciseKind: 'blitz',
    origem: 'baralho',
    score: 300,
    melhorSequencia: 15,
    itens: Array.from({ length: 15 }, (_, i) => ({ itemRef: `c${i}`, correct: 1, kind: 'drill' })),
  }
}

/** Grava a rodada no Express (banco efêmero do harness) para o usuário `u`. */
export async function cumprirColecionadorNoExpress(h: EphemeralDb, u: string): Promise<void> {
  const { exerciseResultsRepo } = (await h.load('../../server/db/repositories/exerciseResults')) as {
    exerciseResultsRepo: { addRodada: (u: unknown, r: unknown) => Promise<unknown> }
  }
  await exerciseResultsRepo.addRodada(asUserId(u), rodadaDoColecionador(`blitz-colecionador-${u}`))
}
