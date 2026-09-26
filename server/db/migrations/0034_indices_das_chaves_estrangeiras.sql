-- ÍNDICES DO LADO FILHO DAS CHAVES ESTRANGEIRAS (auditoria de performance do backend, 26/09/2026 —
-- `openspec/audits/2026-09-26-performance-backend/relatorio.md`).
--
-- `server/db/db.ts` liga `PRAGMA foreign_keys = ON`. Com isso, cada linha APAGADA numa tabela pai obriga
-- o SQLite a procurar filhos que ainda a referenciem — e, sem índice que comece pela coluna filha, a
-- procura é a tabela filha INTEIRA, por linha apagada. Medido no banco semeado da suíte de carga
-- (453.000 ocorrências, 255.000 resultados de exercício):
--   · DELETE das 100 falas de uma sessão (PUT /api/sessions/:id/utterances, "retomar captura"):
--     15.467 ms com o event loop preso — `vocab_occurrences.utterance_id` sem índice;
--   · apagar sessões na exclusão de conta / limpeza de convidados: varredura de `exercise_results` por
--     sessão — `exercise_results.session_id` sem índice;
--   · apagar cartões na exclusão de conta: varredura de `anki_notes` por cartão (`projected_card_id`);
--   · apagar segredos: varredura de `provider_credentials` (`secret_ref`) — tabela pequena, entra pela regra.
-- E os que só tinham índice começando por `user_id` — o SQLite os usa por SKIP-SCAN (uma busca por
-- usuário distinto), que foi medido e NÃO basta: com só os quatro acima, a exclusão da conta de um
-- usuário pesado (3.000 cartões, 20 sessões) levou 155.214 ms, 154.101 ms deles apagando `vocab_cards`
-- (~51 ms por cartão). Entram `vocab_occurrences(card_id)`, `exercise_results(card_id)`,
-- `vocab_cards(session_id)` e `anki_imports(deck_id)`.
--
-- PARCIAIS (`WHERE <coluna> IS NOT NULL`): a busca da FK é `coluna = ?`, que implica NOT NULL, então o
-- planner usa o índice parcial; e a maioria das linhas tem a coluna nula (ocorrências do Anki não têm
-- fala; exercícios fora de sessão não têm sessão), que assim não ocupam o índice nem custam escrita.
--
-- Só `CREATE INDEX IF NOT EXISTS`: aditiva (expand), compatível com o código anterior, segura no boot.
-- REVERSAO: DROP INDEX IF EXISTS de cada um dos oito: idx_occ_utterance, idx_occ_card,
-- idx_exercise_results_session, idx_exercise_results_card_id, idx_vocab_session_id,
-- idx_anki_notes_projected_card, idx_anki_imports_deck, idx_provider_credentials_secret.
CREATE INDEX IF NOT EXISTS `idx_occ_utterance` ON `vocab_occurrences` (`utterance_id`) WHERE "vocab_occurrences"."utterance_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_exercise_results_session` ON `exercise_results` (`session_id`) WHERE "exercise_results"."session_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_anki_notes_projected_card` ON `anki_notes` (`projected_card_id`) WHERE "anki_notes"."projected_card_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_provider_credentials_secret` ON `provider_credentials` (`secret_ref`) WHERE "provider_credentials"."secret_ref" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_occ_card` ON `vocab_occurrences` (`card_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_exercise_results_card_id` ON `exercise_results` (`card_id`) WHERE "exercise_results"."card_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_vocab_session_id` ON `vocab_cards` (`session_id`) WHERE "vocab_cards"."session_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_anki_imports_deck` ON `anki_imports` (`deck_id`);
