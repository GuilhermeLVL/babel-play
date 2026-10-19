-- AGREGADOS DIÁRIOS E ESTADO POR ITEM (change `modelo-do-aluno-e-dados`, fatia 2; levantamento em
-- `docs/auditoria/2026-10-10-dados-metricas-e-selecao.md`, seção 6).
--
-- As métricas eram recontadas do zero a cada pedido, lendo a vida inteira do usuário. Aqui nascem três
-- tabelas DERIVADAS do bruto (`review_logs` e `exercise_results`), mantidas na escrita e reconstruíveis
-- a qualquer hora por `agregadosRepo.reconstruir` (`server/db/repositories/agregados.ts`):
--
--   agregados_diarios       uma linha por (usuário, idioma, dia). O DIA é o dia local no fuso GRAVADO do
--                           usuário (`estado_da_conta.fuso`, padrão America/Sao_Paulo), o mesmo da
--                           ofensiva e das missões (`diaNumeroNoFuso`, em `src/core/learning/economia.ts`).
--                           O idioma é a base do `src_lang` do cartão ('en'); '' quando o item não tem
--                           cartão.
--   estado_dos_agregados    uma linha por usuário: em que fuso os dias foram contados e duas marcas que
--                           dizem se os agregados acompanham o bruto (ver abaixo).
--   estado_por_item         uma linha por (usuário, cartão, jogo): acertos, erros e o último resultado.
--
-- COMO SE SABE QUE OS AGREGADOS ESTÃO EM DIA. Os gatilhos abaixo somam 1 em `marca_bruto` a cada linha
-- escrita em `review_logs` ou `exercise_results`, por qualquer caminho (repositório, SQL cru, script,
-- limpeza). O repositório, quando atualiza os agregados na MESMA transação da escrita, soma em
-- `marca_vista` quantas linhas escreveu. Marcas iguais = agregados em dia. Marcas diferentes (alguém
-- escreveu por fora) ou fuso diferente do gravado = quem lê reconstrói do bruto antes de ler. O gatilho
-- não cria a linha: usuário sem linha em `estado_dos_agregados` é "nunca contado", e a primeira leitura
-- (ou o passo de arranque do servidor) conta o passado dele.
--
-- `revisoes_purgadas` e `acertos_purgados` guardam as revisões que a limpeza diária apagou fisicamente
-- (`server/lib/limpezaDiaria.ts`): o evento aconteceu e continua valendo para XP e dias de prática do
-- perfil, mas a linha bruta não existe mais. É a única parte que a reconstrução preserva em vez de
-- recontar.
--
-- CONTABILIDADE INTERNA, fora do `schema.ts`, como `versoes_de_dados` (migração 0032): não é dado novo do
-- titular, é soma do que já está em `review_logs` e `exercise_results`. A exclusão de conta apaga as três
-- explicitamente (`contaRepo.excluir`).
--
-- NADA É PREENCHIDO AQUI. O passado entra pelo passo de arranque (`preencherAgregadosPendentes`) ou na
-- primeira leitura de cada usuário, porque o dia depende do fuso e isso é conta de JavaScript.
--
-- Aditiva (expand): o código anterior ignora as tabelas e os gatilhos (custo: um UPDATE por chave
-- primária a cada linha escrita). REVERSÃO: DROP TRIGGER dos sete `marca_*` abaixo e DROP TABLE das três
-- tabelas; nenhum dado bruto depende delas.
CREATE TABLE IF NOT EXISTS agregados_diarios (
  user_id TEXT NOT NULL,
  idioma TEXT NOT NULL DEFAULT '',
  dia INTEGER NOT NULL,
  revisoes INTEGER NOT NULL DEFAULT 0,
  acertos INTEGER NOT NULL DEFAULT 0,
  revisoes_vivas INTEGER NOT NULL DEFAULT 0,
  nota1 INTEGER NOT NULL DEFAULT 0,
  nota2 INTEGER NOT NULL DEFAULT 0,
  nota3 INTEGER NOT NULL DEFAULT 0,
  nota4 INTEGER NOT NULL DEFAULT 0,
  novas INTEGER NOT NULL DEFAULT 0,
  tempo_revisao_ms INTEGER NOT NULL DEFAULT 0,
  com_previsao INTEGER NOT NULL DEFAULT 0,
  soma_prevista REAL NOT NULL DEFAULT 0,
  lembradas_com_previsao INTEGER NOT NULL DEFAULT 0,
  itens_de_jogo INTEGER NOT NULL DEFAULT 0,
  itens_certos INTEGER NOT NULL DEFAULT 0,
  itens_drill INTEGER NOT NULL DEFAULT 0,
  itens_drill_certos INTEGER NOT NULL DEFAULT 0,
  tempo_jogo_ms INTEGER NOT NULL DEFAULT 0,
  rodadas INTEGER NOT NULL DEFAULT 0,
  revisoes_purgadas INTEGER NOT NULL DEFAULT 0,
  acertos_purgados INTEGER NOT NULL DEFAULT 0,
  atualizado_em INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, idioma, dia)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS estado_dos_agregados (
  user_id TEXT PRIMARY KEY NOT NULL,
  fuso TEXT NOT NULL,
  marca_bruto INTEGER NOT NULL DEFAULT 0,
  marca_vista INTEGER NOT NULL DEFAULT 0,
  reconstruido_em INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS estado_por_item (
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  jogo TEXT NOT NULL,
  acertos INTEGER NOT NULL DEFAULT 0,
  erros INTEGER NOT NULL DEFAULT 0,
  ultimo_resultado INTEGER,
  ultimo_em INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, card_id, jogo)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS marca_review_logs_ins AFTER INSERT ON review_logs FOR EACH ROW BEGIN
  UPDATE estado_dos_agregados SET marca_bruto = marca_bruto + 1 WHERE user_id = NEW.user_id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS marca_review_logs_upd AFTER UPDATE ON review_logs FOR EACH ROW BEGIN
  UPDATE estado_dos_agregados SET marca_bruto = marca_bruto + 1 WHERE user_id = NEW.user_id;
  UPDATE estado_dos_agregados SET marca_bruto = marca_bruto + 1 WHERE user_id = OLD.user_id AND OLD.user_id IS NOT NEW.user_id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS marca_review_logs_del AFTER DELETE ON review_logs FOR EACH ROW BEGIN
  UPDATE estado_dos_agregados SET marca_bruto = marca_bruto + 1 WHERE user_id = OLD.user_id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS marca_exercise_results_ins AFTER INSERT ON exercise_results FOR EACH ROW BEGIN
  UPDATE estado_dos_agregados SET marca_bruto = marca_bruto + 1 WHERE user_id = NEW.user_id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS marca_exercise_results_upd AFTER UPDATE ON exercise_results FOR EACH ROW BEGIN
  UPDATE estado_dos_agregados SET marca_bruto = marca_bruto + 1 WHERE user_id = NEW.user_id;
  UPDATE estado_dos_agregados SET marca_bruto = marca_bruto + 1 WHERE user_id = OLD.user_id AND OLD.user_id IS NOT NEW.user_id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS marca_exercise_results_del AFTER DELETE ON exercise_results FOR EACH ROW BEGIN
  UPDATE estado_dos_agregados SET marca_bruto = marca_bruto + 1 WHERE user_id = OLD.user_id;
END;
--> statement-breakpoint
-- O idioma da célula é o do CARTÃO. Reetiquetar o idioma de um cartão muda de célula as revisões dele,
-- e ninguém soma isso na escrita: a marca sobe e a próxima leitura reconta.
CREATE TRIGGER IF NOT EXISTS marca_vocab_cards_idioma AFTER UPDATE OF src_lang ON vocab_cards FOR EACH ROW
WHEN OLD.src_lang IS NOT NEW.src_lang BEGIN
  UPDATE estado_dos_agregados SET marca_bruto = marca_bruto + 1 WHERE user_id = NEW.user_id;
END;
--> statement-breakpoint
-- A LIMPEZA DIÁRIA (`server/lib/limpezaDiaria.ts`) procura o que foi apagado há mais de N dias. Sem
-- índice, isso é varrer as cinco tabelas inteiras todo dia. Parciais: só as linhas apagadas entram, que
-- são poucas e saem do índice quando a limpeza as apaga de vez. REVERSÃO: DROP INDEX dos cinco.
CREATE INDEX IF NOT EXISTS idx_sessions_apagadas ON sessions (deleted_at) WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_utt_apagadas ON utterances (deleted_at) WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_vocab_apagadas ON vocab_cards (deleted_at) WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_occ_apagadas ON vocab_occurrences (deleted_at) WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_review_apagadas ON review_logs (deleted_at) WHERE deleted_at IS NOT NULL;
