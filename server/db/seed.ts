/**
 * Seed de DEMONSTRAÇÃO (dev): se o banco não tiver sessões, insere uma sessão de
 * exemplo, para o app não abrir vazio antes de o usuário gravar a primeira sessão real.
 * Idempotente (só roda com o banco vazio). Honesto: são dados de demonstração
 * explícitos, não mock disfarçado de real.
 *
 * SEM CARTÕES (achado 7 do funil, 29/09): a semente punha três palavras no caderno, e a
 * conquista "Primeira palavra" (+10 Seeds, +15 XP) aparecia logo depois do onboarding, sem a
 * pessoa ter fichado nada — a condição (`deckSize >= 1`) já nascia cumprida. As palavras da
 * sessão de exemplo continuam lá para a pessoa fichar ela mesma; aí a conquista é dela.
 *
 * MARCADA COMO DEMONSTRAÇÃO (pendência de 30/09): a sessão em si fazia o mesmo com a "Primeira
 * captura" (`sessions >= 1`). Ela nasce com `origem_local_id = ORIGEM_DA_DEMONSTRACAO`, e as
 * métricas da conta (`computeProfile`) a deixam fora do que a pessoa capturou.
 * `tests/integration/semente-sem-conquista.test.ts`.
 */
import { and, eq } from 'drizzle-orm'

import { LOCAL_OWNER } from '../lib/authContext'
import { log } from '../lib/logger'
import { db } from './db'
import { ORIGEM_DA_DEMONSTRACAO, type Session, sessionsRepo } from './repositories/sessions'
import { sessions } from './schema'

const TITULO_DA_DEMONSTRACAO = 'Reunião de Alinhamento (Q3) — demo'

export async function seedIfEmpty(): Promise<void> {
  // Seed de demonstração pertence ao dono local (Marco 1). Idempotente: se ele já tem sessões, sai.
  const existing = await sessionsRepo.list(LOCAL_OWNER)
  if (existing.length > 0) {
    await reconhecerDemonstracaoAntiga(existing)
    return
  }

  await sessionsRepo.createWithUtterances(
    LOCAL_OWNER,
    {
      title: TITULO_DA_DEMONSTRACAO,
      kind: 'audio',
      sourceLang: 'en',
      targetLang: 'pt',
      status: 'done',
      durationMs: 323_000,
      origemLocalId: ORIGEM_DA_DEMONSTRACAO,
    },
    [
      {
        idx: 0,
        source: 'tab',
        speakerName: 'Sarah',
        sourceLang: 'en',
        sourceText: 'We must leverage our onboarding flow to improve retention.',
        targetLang: 'pt',
        translatedText: 'Precisamos alavancar nosso fluxo de integração para melhorar a retenção.',
      },
      {
        idx: 1,
        source: 'mic',
        speakerName: 'Você',
        sourceLang: 'en',
        sourceText: 'Agreed. The July cohort exceeded expectations.',
        targetLang: 'pt',
        translatedText: 'Concordo. A safra de julho superou as expectativas.',
      },
    ],
  )

  console.log('[db] seed de demonstração inserido (1 sessão, sem cartões)')
}

/**
 * O BANCO SEMEADO ANTES DA MARCA. A semente antiga gravava a demonstração sem origem, e ela seguia
 * contando como captura da pessoa. Como a semente só roda com o banco vazio, ela é a sessão MAIS
 * ANTIGA com o título da demonstração e sem origem — e só é reconhecida se nenhuma outra já tiver
 * a marca (a coluna é única por dono). A conquista já creditada não volta: isto conserta a conta
 * daqui para a frente ("Ouvinte", "Poliglota"), não reescreve o histórico.
 *
 * Nunca derruba a subida do servidor: é conserto de dado de demonstração, não pré-condição.
 */
async function reconhecerDemonstracaoAntiga(existentes: Session[]): Promise<void> {
  if (existentes.some((s) => s.origemLocalId === ORIGEM_DA_DEMONSTRACAO)) return
  const antiga = existentes
    .filter((s) => s.title === TITULO_DA_DEMONSTRACAO && !s.origemLocalId)
    .sort((a, b) => a.createdAt - b.createdAt)[0]
  if (!antiga) return
  try {
    await db
      .update(sessions)
      .set({ origemLocalId: ORIGEM_DA_DEMONSTRACAO })
      .where(and(eq(sessions.id, antiga.id), eq(sessions.userId, LOCAL_OWNER)))
  } catch (err) {
    log('warn', { event: 'semente.demonstracao_antiga_sem_marca', error: String((err as Error)?.message ?? err) })
  }
}
