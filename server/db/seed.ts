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
 * `tests/integration/semente-sem-conquista.test.ts`.
 */
import { LOCAL_OWNER } from '../lib/authContext'
import { sessionsRepo } from './repositories/sessions'

export async function seedIfEmpty(): Promise<void> {
  // Seed de demonstração pertence ao dono local (Marco 1). Idempotente: se ele já tem sessões, sai.
  const existing = await sessionsRepo.list(LOCAL_OWNER)
  if (existing.length > 0) return

  await sessionsRepo.createWithUtterances(
    LOCAL_OWNER,
    {
      title: 'Reunião de Alinhamento (Q3) — demo',
      kind: 'audio',
      sourceLang: 'en',
      targetLang: 'pt',
      status: 'done',
      durationMs: 323_000,
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
    ]
  )

  console.log('[db] seed de demonstração inserido (1 sessão, sem cartões)')
}
