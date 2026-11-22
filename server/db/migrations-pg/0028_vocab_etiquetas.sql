-- AS ETIQUETAS DO USUÁRIO NO CARTÃO (openspec `vocab-forca-e-etiquetas`), só EXPAND:
--   `vocab_cards.etiquetas`: rótulos livres da pessoa (`filme`, `viagem`), normalizados em minúsculas, até 10 por
--   cartão e 32 caracteres cada (a validação é do servidor, `PUT /api/vocab/:id/etiquetas`). Default `{}` e NOT NULL:
--   o código anterior não a lê nem a escreve, e a linha antiga já nasce sem etiquetas. Dado do titular: a tabela já
--   está em `TABELAS_DO_TITULAR`, e a coluna sai na exportação e na exclusão de conta com o cartão.
-- REVERSÃO: `ALTER TABLE "vocab_cards" DROP COLUMN "etiquetas"` — só depois de voltar o código sem a rota
-- `/api/vocab/:id/etiquetas` (as etiquetas escritas se perdem).
ALTER TABLE "vocab_cards" ADD COLUMN "etiquetas" text[] DEFAULT '{}'::text[] NOT NULL;
