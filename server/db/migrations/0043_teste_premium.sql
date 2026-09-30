-- O TESTE DE 14 DIAS DO PREMIUM, SEM CARTÃO (C6 da change `planos-v2`, decisão do dono: começa com um
-- toque, nunca cobra sozinho). Duas tabelas, e nenhuma delas é `subscriptions`: o `trialing` continua
-- querendo dizer "checkout iniciado, não pago" (GAP-001).
--
-- 1. `testes_premium` — uma linha por conta que testou (`user_id`, início, fim). É DADO DO TITULAR: entra em
--    `TABELAS_DO_TITULAR` (sai com a exclusão da conta, vai na exportação).
-- 2. `marcas_de_teste` — o HMAC-SHA256 do e-mail normalizado, com a chave de hash do servidor, e a data. SEM
--    `user_id` e sem o e-mail: sobrevive à exclusão da conta para que apagar e recriar não renove o teste.
--    Dado pseudonimizado, legítimo interesse (prevenir abuso do benefício gratuito), retenção de 730 dias com
--    poda diária (`server/lib/testePremium.ts`); documentado em `docs/lgpd/ropa.csv` (T12) e na política.
--
-- NÚMERO 0043 porque a 0042 é da Fase D, em outra branch. No merge, o `when` da 0042 no journal precisa ficar
-- MENOR que o desta (o migrador do drizzle pula a migration com `when` anterior à última aplicada).
--
-- Aditiva (expand) e reaplicável (IF NOT EXISTS): o código anterior não lê nenhuma das duas; sem elas o
-- servidor novo apenas não inicia o teste (a leitura falha e o plano cai para o de sempre).
-- REVERSAO: `DROP TABLE testes_premium; DROP TABLE marcas_de_teste` — quem estava testando volta ao Grátis na
-- hora (nada foi cobrado de ninguém), e a marca some com a tabela.
CREATE TABLE IF NOT EXISTS `marcas_de_teste` (
	`marca` text PRIMARY KEY NOT NULL,
	`criado_em` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_marcas_de_teste_criado` ON `marcas_de_teste` (`criado_em`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `testes_premium` (
	`user_id` text PRIMARY KEY NOT NULL,
	`iniciado_em` integer NOT NULL,
	`termina_em` integer NOT NULL
);
