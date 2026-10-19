-- F3-04 (dado). Roda DEPOIS de 0011, que criou `secrets.user_id` e `vocab_occurrences.deleted_at`.

-- 1. Dono do segredo, deduzido da credencial que aponta para ele. Sem isto `secrets` continuaria
--    fora de toda operação por titular, mesmo já tendo a coluna.
UPDATE `secrets` SET `user_id` = (
  SELECT `pc`.`user_id` FROM `provider_credentials` `pc`
  WHERE `pc`.`secret_ref` = `secrets`.`ref` AND `pc`.`user_id` IS NOT NULL
  LIMIT 1
) WHERE `user_id` IS NULL;
--> statement-breakpoint
-- 2. Filhos VIVOS de pai soft-deletado (8 linhas medidas: 4 utterances, 4 review_logs).
--    Toda leitura de domínio filtra por `deleted_at IS NULL`, então estas linhas continuavam
--    entrando nas métricas de uma sessão/cartão que o usuário já removeu. Propagar o soft delete
--    é o que torna "apagado" a mesma coisa nos dois níveis; o dado permanece no banco (soft), e a
--    exclusão de conta continua sendo DELETE físico.
UPDATE `utterances` SET `deleted_at` = (SELECT `p`.`deleted_at` FROM `sessions` `p` WHERE `p`.`id` = `utterances`.`session_id`), `updated_at` = `updated_at`
WHERE `deleted_at` IS NULL
  AND EXISTS (SELECT 1 FROM `sessions` `p` WHERE `p`.`id` = `utterances`.`session_id` AND `p`.`deleted_at` IS NOT NULL);
--> statement-breakpoint
UPDATE `review_logs` SET `deleted_at` = (SELECT `p`.`deleted_at` FROM `vocab_cards` `p` WHERE `p`.`id` = `review_logs`.`card_id`), `updated_at` = `updated_at`
WHERE `deleted_at` IS NULL
  AND EXISTS (SELECT 1 FROM `vocab_cards` `p` WHERE `p`.`id` = `review_logs`.`card_id` AND `p`.`deleted_at` IS NOT NULL);
--> statement-breakpoint
-- 3. Mesma regra para as ocorrências, que só agora TÊM `deleted_at`.
UPDATE `vocab_occurrences` SET `deleted_at` = (SELECT `p`.`deleted_at` FROM `vocab_cards` `p` WHERE `p`.`id` = `vocab_occurrences`.`card_id`), `updated_at` = `updated_at`
WHERE `deleted_at` IS NULL
  AND EXISTS (SELECT 1 FROM `vocab_cards` `p` WHERE `p`.`id` = `vocab_occurrences`.`card_id` AND `p`.`deleted_at` IS NOT NULL);
