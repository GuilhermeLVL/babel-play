-- PLANOS V2 (change `planos-v2`, ADR 0011, decisão do dono de 29/09/2026): Grátis + PREMIUM. O Essencial e o Pro
-- saem da matriz (`src/core/planos.ts`) e viram `premium` no banco; a assinatura passa a dizer o CICLO e o MEIO que
-- cobram, para o anual e o 12x do C5 encontrarem as colunas prontas.
--
-- 1. `subscriptions` ganha `ciclo` (mensal | anual; toda assinatura existente é mensal), `meio` (assinatura |
--    parcelamento | pix_automatico; NULO = concedida pelo admin, sem cobrança) e `provider_installment_id` (o
--    parcelamento do Asaas no 12x). A linha do Asaas com assinatura recorrente recebe `meio = 'assinatura'`.
-- 2. `subscriptions.plan`: `essencial`/`pro` → `premium`.
-- 3. `flags.regras.planos`: `essencial`/`pro` → `premium`, SEM REPETIR (o schema das regras limita a lista ao
--    tamanho de `PLANOS_DA_FLAG`; `["premium","premium",...]` desligaria a flag inteira como "regra inválida").
-- 4. `flags.payload.gatilhos[].planos` (ofertas): o nome antigo SAI da lista, em vez de virar `premium`. Os
--    gatilhos que citavam `essencial` eram de VENDA do Pro ("Com um plano pago você continua…"), e o Premium é o
--    plano de cima: traduzir literalmente mostraria a quem já paga um texto de venda do que ele já tem. Lista que
--    ficaria vazia vira `["premium"]` (o schema exige ao menos um plano). O payload novo é do C8.
--
-- O código NÃO depende desta migração para funcionar: toda fronteira lê o nome antigo como `premium`
-- (`normalizarPlano` em `getPlanForUser`, nas regras de flag, no admin e no cliente). Ela existe para o banco dizer
-- a verdade — e para o `ehPlanoDeAssinatura` estrito deixar de ver linha "desconhecida".
--
-- JSON inválido não é tocado (`json_valid`), e reaplicar é idempotente: cada UPDATE só pega o que ainda tem nome
-- antigo. SQL puro para o dado; os `ALTER` vieram do `drizzle-kit generate`, com o snapshot.
--
-- Expand: só acrescenta colunas; o código anterior ignora `ciclo`/`meio`/`provider_installment_id`. MAS o código
-- anterior não conhece `premium` e trataria o assinante como Grátis (com log `plano_desconhecido`) — por isso a
-- reversão abaixo roda ANTES de pôr a imagem anterior no ar.
-- REVERSÃO: antes de voltar a imagem, `UPDATE subscriptions SET plan = 'essencial' WHERE plan = 'premium'` e
-- `UPDATE flags SET regras = replace(regras, '"premium"', '"essencial"') WHERE regras LIKE '%"premium"%'` — o Pro
-- antigo volta como Essencial (a cobrança do Asaas continua a mesma; o suporte ajusta à mão, se houver algum). Os
-- gatilhos de oferta que perderam o `essencial` ficam como estão (o Essencial só perde a oferta de subir para o Pro).
-- As três colunas novas ficam: o código anterior não as lê.
ALTER TABLE `subscriptions` ADD `ciclo` text DEFAULT 'mensal' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `meio` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `provider_installment_id` text;--> statement-breakpoint
UPDATE subscriptions SET meio = 'assinatura'
WHERE meio IS NULL AND provider = 'asaas' AND provider_subscription_id IS NOT NULL;--> statement-breakpoint
UPDATE subscriptions SET plan = 'premium' WHERE plan IN ('essencial', 'pro');--> statement-breakpoint
UPDATE flags SET regras = json_set(regras, '$.planos', json((
  SELECT json_group_array(DISTINCT CASE WHEN j.value IN ('essencial', 'pro') THEN 'premium' ELSE j.value END)
  FROM json_each(flags.regras, '$.planos') AS j
)))
WHERE CASE WHEN json_valid(regras) THEN EXISTS (
  SELECT 1 FROM json_each(flags.regras, '$.planos') AS j WHERE j.value IN ('essencial', 'pro')
) ELSE 0 END;--> statement-breakpoint
UPDATE flags SET payload = json_set(payload, '$.gatilhos', json((
  SELECT json_group_array(json(
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM json_each(g.value, '$.planos') AS p WHERE p.value IN ('essencial', 'pro'))
        THEN g.value
      WHEN EXISTS (SELECT 1 FROM json_each(g.value, '$.planos') AS p WHERE p.value NOT IN ('essencial', 'pro'))
        THEN json_set(g.value, '$.planos', json((
          SELECT json_group_array(p.value) FROM json_each(g.value, '$.planos') AS p
          WHERE p.value NOT IN ('essencial', 'pro')
        )))
      ELSE json_set(g.value, '$.planos', json('["premium"]'))
    END
  ) ORDER BY g.key)
  FROM json_each(flags.payload, '$.gatilhos') AS g
)))
WHERE CASE WHEN json_valid(payload) THEN EXISTS (
  SELECT 1 FROM json_each(flags.payload, '$.gatilhos') AS g, json_each(g.value, '$.planos') AS p
  WHERE p.value IN ('essencial', 'pro')
) ELSE 0 END;
