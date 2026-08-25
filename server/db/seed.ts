/**
 * Seed de DEMONSTRAÇÃO (dev): se o banco não tiver sessões, insere uma sessão de
 * exemplo + alguns cards, para o app não abrir vazio antes de o usuário gravar a
 * primeira sessão real. Idempotente (só roda com o banco vazio). Honesto: são
 * dados de demonstração explícitos, não mock disfarçado de real.
 */
import { sessionsRepo } from './repositories/sessions'
import { vocabRepo } from './repositories/vocab'
import { LOCAL_OWNER } from '../lib/authContext'

export async function seedIfEmpty(): Promise<void> {
  // Seed de demonstração pertence ao dono local (Marco 1). Idempotente: se ele já tem sessões, sai.
  const existing = await sessionsRepo.list(LOCAL_OWNER)
  if (existing.length > 0) return

  const session = await sessionsRepo.createWithUtterances(
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

  await vocabRepo.bulkAdd(LOCAL_OWNER, [
    { word: 'leverage', back: 'alavancar', sentence: 'We must leverage our onboarding flow.', srcLang: 'en', tgtLang: 'pt', sessionId: session.id },
    { word: 'retention', back: 'retenção', sentence: 'improve retention', srcLang: 'en', tgtLang: 'pt', sessionId: session.id },
    { word: 'cohort', back: 'safra / coorte', sentence: 'The July cohort exceeded expectations.', srcLang: 'en', tgtLang: 'pt', sessionId: session.id },
  ])

  console.log('[db] seed de demonstração inserido (1 sessão + 3 cards)')
}
