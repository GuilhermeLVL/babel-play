-- "POLIR A SESSÃO" (D5 da Fase D, 30/09/2026) — `server/ai/polimento.ts`, `POST /api/ai/mt/polir`.
--
-- A legenda ao vivo traduz frase a frase; polir reescreve a tradução da sessão inteira em blocos de até 40 linhas,
-- com contexto, no nível `polimento` da Tradução Nuance. A tradução polida mora AO LADO da original:
-- `translated_text` NUNCA é sobrescrita, e a pessoa alterna entre as duas na Análise.
--
-- 1. `traducao_polida` — a tradução reescrita. NULO = ainda não polida: é o que torna o polimento idempotente por
--    bloco (o servidor só manda ao modelo as linhas sem polida, e retomar não cobra de novo o que já foi polido).
-- 2. `polimento_modelo`, `polimento_versao`, `polido_em` — o modelo que DE FATO respondeu, a versão do prompt
--    (hash do texto fixo) e quando. Procedência, como o `engine` da transcrição.
--
-- É DADO DO TITULAR pela tabela que já é: `utterances` está em `TABELAS_DO_TITULAR` e a exportação lê a linha
-- inteira, então a polida sai na exportação e some na exclusão da conta sem mudar nada em `conta.ts`.
--
-- Número 0044 porque a 0043 é da Fase C (teste de 14 dias). No merge, o `when` desta no journal fica DEPOIS do da
-- 0043 (o migrador do drizzle pula migration com `when` anterior à última aplicada); a 0045 é de outra frente.
--
-- Aditiva (expand): só acrescenta colunas NULAS, sem DEFAULT nem índice; o código anterior não as lê.
-- REVERSAO: nenhuma para o rollback da imagem (a anterior ignora as quatro colunas). Para desfazer de vez, depois
-- que nenhum código ler: `ALTER TABLE utterances DROP COLUMN traducao_polida` (e as outras três) — as traduções
-- polidas se perdem, as originais ficam intactas.
ALTER TABLE `utterances` ADD `traducao_polida` text;--> statement-breakpoint
ALTER TABLE `utterances` ADD `polimento_modelo` text;--> statement-breakpoint
ALTER TABLE `utterances` ADD `polimento_versao` text;--> statement-breakpoint
ALTER TABLE `utterances` ADD `polido_em` integer;
