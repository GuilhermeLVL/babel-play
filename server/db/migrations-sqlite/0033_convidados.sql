-- CONVIDADOS COM NUVEM (Fase 7 — modo convidado). Desenho em
-- `openspec/audits/2026-09-25-prontidao/fase7-convidado.md`.
--
-- Uma linha por usuário ANÔNIMO do Supabase que usou a IA de nuvem. Serve ao limite de criação de
-- convidados por IP/dia, à expiração (inativos há 30 dias) e ao rastreio da conversão.
--
-- `ip_hash` é pseudônimo (HMAC do IP + dia com a chave do servidor): não volta ao IP e não liga
-- dias diferentes. `user_id` é dado do titular: a tabela está em `TABELAS_DO_TITULAR`.
--
-- Aditiva (expand): nenhum código anterior a lê. REVERSAO: `DROP TABLE convidados` — só o modo
-- convidado a usa; sem ela a nuvem do convidado falha fechada (503), e o app segue local.
CREATE TABLE IF NOT EXISTS convidados (
  user_id TEXT PRIMARY KEY NOT NULL,
  ip_hash TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  visto_em INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_convidados_ip_criado ON convidados (ip_hash, criado_em);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_convidados_visto ON convidados (visto_em);
