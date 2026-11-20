-- P1-5: o unique de `spend_id` era GLOBAL, então o gasto do usuário A barrava o de B
-- (a busca de idempotência filtra por (spendId,userId), mas a constraint olhava só o id,
-- que é escolhido pelo cliente). Passa a ser por dono.
DROP INDEX `seed_spends_spend_id_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_seed_spends_user_spend` ON `seed_spends` (`user_id`,`spend_id`);--> statement-breakpoint

-- P1-4: DEDUPE antes do unique. `settings.ensure()` era get-then-insert e duplicava linha
-- sob concorrência; um banco que já rodou pode ter duplicatas, e aí o CREATE UNIQUE INDEX
-- abaixo falharia e quebraria a migração. Mantém a linha mais recente por dono.
--
-- O grupo `user_id IS NULL` também é colapsado de propósito: `backfillNullOwner` (boot)
-- carimba essas linhas com o dono local, e duas delas passariam a colidir no índice novo.
DELETE FROM `settings` WHERE rowid NOT IN (
  SELECT t.rowid FROM `settings` t
  WHERE t.updated_at = (SELECT MAX(u.updated_at) FROM `settings` u WHERE u.user_id IS t.user_id)
  GROUP BY t.user_id
);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_settings_user` ON `settings` (`user_id`);
