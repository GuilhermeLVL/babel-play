-- ÍNDICES DE ESCALA (auditoria de prontidão, Fase 2 — `openspec/audits/2026-09-25-prontidao/fase2-escala.md`).
--
-- Três consultas quentes sem índice que começasse pelas colunas do filtro:
--   1. histórico de exercícios do usuário ordenado por data (`exerciseResults.ts:185-272`) — o único índice
--      com `user_id` era (user_id, card_id, created_at), que não serve a `ORDER BY created_at` sem `card_id`;
--   2. poda dos baldes de rate limit por métrica e janela (`usageCounters.prune`) — o único índice começa em
--      `user_id`, então a poda varria a tabela, que recebe escrita em todo request;
--   3. retenção de áudio por data de criação (`sessions.comAudioCriadasAntesDe`).
--
-- Só `CREATE INDEX IF NOT EXISTS`: aditiva, compatível com o código anterior (expand), segura para rodar
-- no boot. REVERSÃO: os três `DROP INDEX`.
CREATE INDEX IF NOT EXISTS idx_exercise_results_user_created ON exercise_results (user_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_usage_counters_metric_window ON usage_counters (metric, window);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions (created_at);
