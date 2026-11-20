-- VERSÕES DOS DADOS POR USUÁRIO (fix/rotas-caras — auditoria de prontidão, Fase 2, §2.1).
--
-- `GET /api/vocab` (133 ms de CPU), `GET /api/metrics/profile` (77 ms) e `POST /api/metrics/seeds/gastar`
-- (154 ms) materializavam milhares de linhas a CADA chamada, mesmo quando nada tinha mudado desde a
-- anterior — e o driver libsql prende o event loop durante a leitura inteira. Para responder "mudou
-- desde a última vez?" sem ler as linhas, cada usuário ganha dois contadores:
--
--   vocab      sobe a cada escrita em vocab_cards e vocab_occurrences (o que `GET /api/vocab` devolve);
--   atividade  sobe a cada escrita em sessions, utterances, vocab_cards, review_logs e exercise_results
--              (as cinco tabelas que `computeProfile` varre).
--
-- POR QUE GATILHOS, e não um contador incrementado nos repositórios: há escritas nessas tabelas em
-- repositórios diferentes, em SQL cru, na manutenção de boot e em outros processos (migração, scripts).
-- Um contador na aplicação precisaria que TODOS lembrassem de incrementá-lo, e o primeiro que esquecesse
-- serviria um baralho velho com 304. O gatilho roda dentro da própria escrita, na mesma transação, e não
-- tem como ser esquecido. Custo: um UPSERT numa tabela de uma linha por usuário a cada linha escrita.
--
-- A tabela é CONTABILIDADE INTERNA (um número que só cresce), fora do `schema.ts` como
-- `__drizzle_migrations`: não é dado do titular a exportar. A exclusão de conta apaga a linha
-- explicitamente (`contaRepo.excluir`), depois das tabelas que disparam os gatilhos.
--
-- Aditiva (expand): o código anterior ignora a tabela e os gatilhos. REVERSÃO: os DROP TRIGGER abaixo
-- (versao_*) e `DROP TABLE versoes_de_dados`.
CREATE TABLE IF NOT EXISTS versoes_de_dados (
  user_id TEXT PRIMARY KEY NOT NULL,
  vocab INTEGER NOT NULL DEFAULT 0,
  atividade INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_vocab_cards_ins AFTER INSERT ON vocab_cards FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, vocab, atividade) SELECT NEW.user_id, 1, 1 WHERE NEW.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET vocab = vocab + 1, atividade = atividade + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_vocab_cards_upd AFTER UPDATE ON vocab_cards FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, vocab, atividade) SELECT NEW.user_id, 1, 1 WHERE NEW.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET vocab = vocab + 1, atividade = atividade + 1;
  INSERT INTO versoes_de_dados (user_id, vocab, atividade) SELECT OLD.user_id, 1, 1 WHERE OLD.user_id IS NOT NULL AND OLD.user_id IS NOT NEW.user_id
    ON CONFLICT (user_id) DO UPDATE SET vocab = vocab + 1, atividade = atividade + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_vocab_cards_del AFTER DELETE ON vocab_cards FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, vocab, atividade) SELECT OLD.user_id, 1, 1 WHERE OLD.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET vocab = vocab + 1, atividade = atividade + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_vocab_occurrences_ins AFTER INSERT ON vocab_occurrences FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, vocab) SELECT NEW.user_id, 1 WHERE NEW.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET vocab = vocab + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_vocab_occurrences_upd AFTER UPDATE ON vocab_occurrences FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, vocab) SELECT NEW.user_id, 1 WHERE NEW.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET vocab = vocab + 1;
  INSERT INTO versoes_de_dados (user_id, vocab) SELECT OLD.user_id, 1 WHERE OLD.user_id IS NOT NULL AND OLD.user_id IS NOT NEW.user_id
    ON CONFLICT (user_id) DO UPDATE SET vocab = vocab + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_vocab_occurrences_del AFTER DELETE ON vocab_occurrences FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, vocab) SELECT OLD.user_id, 1 WHERE OLD.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET vocab = vocab + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_sessions_ins AFTER INSERT ON sessions FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, atividade) SELECT NEW.user_id, 1 WHERE NEW.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET atividade = atividade + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_sessions_upd AFTER UPDATE ON sessions FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, atividade) SELECT NEW.user_id, 1 WHERE NEW.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET atividade = atividade + 1;
  INSERT INTO versoes_de_dados (user_id, atividade) SELECT OLD.user_id, 1 WHERE OLD.user_id IS NOT NULL AND OLD.user_id IS NOT NEW.user_id
    ON CONFLICT (user_id) DO UPDATE SET atividade = atividade + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_sessions_del AFTER DELETE ON sessions FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, atividade) SELECT OLD.user_id, 1 WHERE OLD.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET atividade = atividade + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_utterances_ins AFTER INSERT ON utterances FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, atividade) SELECT NEW.user_id, 1 WHERE NEW.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET atividade = atividade + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_utterances_upd AFTER UPDATE ON utterances FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, atividade) SELECT NEW.user_id, 1 WHERE NEW.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET atividade = atividade + 1;
  INSERT INTO versoes_de_dados (user_id, atividade) SELECT OLD.user_id, 1 WHERE OLD.user_id IS NOT NULL AND OLD.user_id IS NOT NEW.user_id
    ON CONFLICT (user_id) DO UPDATE SET atividade = atividade + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_utterances_del AFTER DELETE ON utterances FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, atividade) SELECT OLD.user_id, 1 WHERE OLD.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET atividade = atividade + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_review_logs_ins AFTER INSERT ON review_logs FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, atividade) SELECT NEW.user_id, 1 WHERE NEW.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET atividade = atividade + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_review_logs_upd AFTER UPDATE ON review_logs FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, atividade) SELECT NEW.user_id, 1 WHERE NEW.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET atividade = atividade + 1;
  INSERT INTO versoes_de_dados (user_id, atividade) SELECT OLD.user_id, 1 WHERE OLD.user_id IS NOT NULL AND OLD.user_id IS NOT NEW.user_id
    ON CONFLICT (user_id) DO UPDATE SET atividade = atividade + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_review_logs_del AFTER DELETE ON review_logs FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, atividade) SELECT OLD.user_id, 1 WHERE OLD.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET atividade = atividade + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_exercise_results_ins AFTER INSERT ON exercise_results FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, atividade) SELECT NEW.user_id, 1 WHERE NEW.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET atividade = atividade + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_exercise_results_upd AFTER UPDATE ON exercise_results FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, atividade) SELECT NEW.user_id, 1 WHERE NEW.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET atividade = atividade + 1;
  INSERT INTO versoes_de_dados (user_id, atividade) SELECT OLD.user_id, 1 WHERE OLD.user_id IS NOT NULL AND OLD.user_id IS NOT NEW.user_id
    ON CONFLICT (user_id) DO UPDATE SET atividade = atividade + 1;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS versao_exercise_results_del AFTER DELETE ON exercise_results FOR EACH ROW BEGIN
  INSERT INTO versoes_de_dados (user_id, atividade) SELECT OLD.user_id, 1 WHERE OLD.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET atividade = atividade + 1;
END;
