-- PLANOS v4, ETAPA 1 (Task 2): duas colunas nulas, só EXPAND.
--   - `subscriptions.plano_da_cobranca`: o plano que a cobrança REGISTRADA na linha (assinatura ou parcelamento do
--     Asaas) cobra, gravado por `/api/billing/assinar` junto com o id. Não concede nada: desempata a parcela de valor
--     ambíguo do 12x (R$ 12,49 é a última do Plus e a padrão do Premium) — `aplicarParcela` só a usa quando o
--     parcelamento pago é o registrado. Nula = linha de antes desta migração (vale o `plan` gravado).
--   - `testes_premium.plano`: o plano do teste de 14 dias, avaliado no início (`planoDoTeste`) e gravado. Nulo =
--     teste de antes desta migração (Premium).
-- REVERSÃO: `ALTER TABLE "subscriptions" DROP COLUMN "plano_da_cobranca"` e `ALTER TABLE "testes_premium" DROP COLUMN
-- "plano"` — só depois de voltar o código que as lê (quem estiver no teste do Plus passa a ver o Premium até o fim).
ALTER TABLE "subscriptions" ADD COLUMN "plano_da_cobranca" text;--> statement-breakpoint
ALTER TABLE "testes_premium" ADD COLUMN "plano" text;
