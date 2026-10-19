-- Portado de SQLite (migrations-sqlite/0032 e 0053) para Postgres. Escrito à mão: o drizzle-kit não gera
-- triggers nem seeds. Uma função PL/pgSQL por família e um CREATE TRIGGER por tabela/evento, com os MESMOS
-- nomes dos triggers do SQLite.
--
-- ATENÇÃO: o migrator do Drizzle divide o arquivo em `--> statement-breakpoint`; nunca ponha o marcador
-- dentro de um corpo `$$ ... $$`.
--
-- `versao_*`: sobem os contadores de `versoes_de_dados` (vocab/atividade) a cada escrita, por usuário.
-- `marca_*`: sobem `marca_bruto` em `estado_dos_agregados` (não criam a linha).
CREATE OR REPLACE FUNCTION versao_subir() RETURNS trigger AS $$
DECLARE
  v bigint := CASE WHEN TG_ARGV[0] IN ('vocab_atividade', 'vocab') THEN 1 ELSE 0 END;
  a bigint := CASE WHEN TG_ARGV[0] IN ('vocab_atividade', 'atividade') THEN 1 ELSE 0 END;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.user_id IS NOT NULL THEN
    INSERT INTO versoes_de_dados (user_id, vocab, atividade) VALUES (NEW.user_id, v, a)
      ON CONFLICT (user_id) DO UPDATE SET vocab = versoes_de_dados.vocab + v, atividade = versoes_de_dados.atividade + a;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.user_id IS NOT NULL THEN
    INSERT INTO versoes_de_dados (user_id, vocab, atividade) VALUES (OLD.user_id, v, a)
      ON CONFLICT (user_id) DO UPDATE SET vocab = versoes_de_dados.vocab + v, atividade = versoes_de_dados.atividade + a;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.user_id IS NOT NULL AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    INSERT INTO versoes_de_dados (user_id, vocab, atividade) VALUES (OLD.user_id, v, a)
      ON CONFLICT (user_id) DO UPDATE SET vocab = versoes_de_dados.vocab + v, atividade = versoes_de_dados.atividade + a;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION marca_subir() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE estado_dos_agregados SET marca_bruto = marca_bruto + 1 WHERE user_id = NEW.user_id;
  END IF;
  IF TG_OP = 'DELETE' THEN
    UPDATE estado_dos_agregados SET marca_bruto = marca_bruto + 1 WHERE user_id = OLD.user_id;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    UPDATE estado_dos_agregados SET marca_bruto = marca_bruto + 1 WHERE user_id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER versao_vocab_cards_ins AFTER INSERT ON vocab_cards FOR EACH ROW EXECUTE FUNCTION versao_subir('vocab_atividade');
--> statement-breakpoint
CREATE TRIGGER versao_vocab_cards_upd AFTER UPDATE ON vocab_cards FOR EACH ROW EXECUTE FUNCTION versao_subir('vocab_atividade');
--> statement-breakpoint
CREATE TRIGGER versao_vocab_cards_del AFTER DELETE ON vocab_cards FOR EACH ROW EXECUTE FUNCTION versao_subir('vocab_atividade');
--> statement-breakpoint
CREATE TRIGGER versao_vocab_occurrences_ins AFTER INSERT ON vocab_occurrences FOR EACH ROW EXECUTE FUNCTION versao_subir('vocab');
--> statement-breakpoint
CREATE TRIGGER versao_vocab_occurrences_upd AFTER UPDATE ON vocab_occurrences FOR EACH ROW EXECUTE FUNCTION versao_subir('vocab');
--> statement-breakpoint
CREATE TRIGGER versao_vocab_occurrences_del AFTER DELETE ON vocab_occurrences FOR EACH ROW EXECUTE FUNCTION versao_subir('vocab');
--> statement-breakpoint
CREATE TRIGGER versao_sessions_ins AFTER INSERT ON sessions FOR EACH ROW EXECUTE FUNCTION versao_subir('atividade');
--> statement-breakpoint
CREATE TRIGGER versao_sessions_upd AFTER UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION versao_subir('atividade');
--> statement-breakpoint
CREATE TRIGGER versao_sessions_del AFTER DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION versao_subir('atividade');
--> statement-breakpoint
CREATE TRIGGER versao_utterances_ins AFTER INSERT ON utterances FOR EACH ROW EXECUTE FUNCTION versao_subir('atividade');
--> statement-breakpoint
CREATE TRIGGER versao_utterances_upd AFTER UPDATE ON utterances FOR EACH ROW EXECUTE FUNCTION versao_subir('atividade');
--> statement-breakpoint
CREATE TRIGGER versao_utterances_del AFTER DELETE ON utterances FOR EACH ROW EXECUTE FUNCTION versao_subir('atividade');
--> statement-breakpoint
CREATE TRIGGER versao_review_logs_ins AFTER INSERT ON review_logs FOR EACH ROW EXECUTE FUNCTION versao_subir('atividade');
--> statement-breakpoint
CREATE TRIGGER versao_review_logs_upd AFTER UPDATE ON review_logs FOR EACH ROW EXECUTE FUNCTION versao_subir('atividade');
--> statement-breakpoint
CREATE TRIGGER versao_review_logs_del AFTER DELETE ON review_logs FOR EACH ROW EXECUTE FUNCTION versao_subir('atividade');
--> statement-breakpoint
CREATE TRIGGER versao_exercise_results_ins AFTER INSERT ON exercise_results FOR EACH ROW EXECUTE FUNCTION versao_subir('atividade');
--> statement-breakpoint
CREATE TRIGGER versao_exercise_results_upd AFTER UPDATE ON exercise_results FOR EACH ROW EXECUTE FUNCTION versao_subir('atividade');
--> statement-breakpoint
CREATE TRIGGER versao_exercise_results_del AFTER DELETE ON exercise_results FOR EACH ROW EXECUTE FUNCTION versao_subir('atividade');
--> statement-breakpoint
CREATE TRIGGER marca_review_logs_ins AFTER INSERT ON review_logs FOR EACH ROW EXECUTE FUNCTION marca_subir();
--> statement-breakpoint
CREATE TRIGGER marca_review_logs_upd AFTER UPDATE ON review_logs FOR EACH ROW EXECUTE FUNCTION marca_subir();
--> statement-breakpoint
CREATE TRIGGER marca_review_logs_del AFTER DELETE ON review_logs FOR EACH ROW EXECUTE FUNCTION marca_subir();
--> statement-breakpoint
CREATE TRIGGER marca_exercise_results_ins AFTER INSERT ON exercise_results FOR EACH ROW EXECUTE FUNCTION marca_subir();
--> statement-breakpoint
CREATE TRIGGER marca_exercise_results_upd AFTER UPDATE ON exercise_results FOR EACH ROW EXECUTE FUNCTION marca_subir();
--> statement-breakpoint
CREATE TRIGGER marca_exercise_results_del AFTER DELETE ON exercise_results FOR EACH ROW EXECUTE FUNCTION marca_subir();
--> statement-breakpoint
-- O idioma da célula é o do CARTÃO: reetiquetar o idioma de um cartão muda de célula as revisões dele;
-- a marca sobe e a próxima leitura reconta.
CREATE FUNCTION marca_idioma_subir() RETURNS trigger AS $$
BEGIN
  UPDATE estado_dos_agregados SET marca_bruto = marca_bruto + 1 WHERE user_id = NEW.user_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER marca_vocab_cards_idioma AFTER UPDATE OF src_lang ON vocab_cards FOR EACH ROW WHEN (OLD.src_lang IS DISTINCT FROM NEW.src_lang) EXECUTE FUNCTION marca_idioma_subir();
--> statement-breakpoint
-- Seeds de `flags` (0031, 0036, 0040, 0046, 0048, 0051 do SQLite). Idempotentes.
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'modo_convidado',
  'Fase 7: usar o app sem conta como convidado (fluxo novo de entrada).',
  false, '{}', NULL, 1790320000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'nuvem_convidado',
  'Fase 7: convidado pode usar a IA de nuvem (com o teto anônimo do servidor).',
  false, '{"planos":["convidado"]}', NULL, 1790320000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'oferta_planos',
  'Fase 8: banners, modais e paywall de planos. O payload define gatilhos, textos e frequência.',
  false, '{}',
  '{"gatilhos":[{"id":"cota_acabou","momento":"fim_de_cota","componente":"modal","titulo":{"pt":"Sua cota do mês acabou","en":"You have used this month''s quota","es":"Se acabó tu cuota del mes"},"texto":{"pt":"Com um plano pago você continua usando a nuvem sem esperar o mês virar.","en":"With a paid plan you keep using the cloud without waiting for next month.","es":"Con un plan de pago sigues usando la nube sin esperar al próximo mes."},"cta":{"pt":"Ver planos","en":"See plans","es":"Ver planes"},"maxPorDia":1,"maxPorSemana":3,"intervaloMinHoras":12,"planos":["free","essencial"]},{"id":"cota_perto","momento":"cota_proxima","componente":"aviso_cota","titulo":{"pt":"Sua cota está quase no fim","en":"Your quota is almost used up","es":"Tu cuota está por acabarse"},"texto":{"pt":"Você já usou a maior parte da cota deste mês.","en":"You have used most of this month''s quota.","es":"Ya usaste la mayor parte de la cuota de este mes."},"cta":{"pt":"Ver planos","en":"See plans","es":"Ver planes"},"maxPorDia":1,"maxPorSemana":2,"intervaloMinHoras":24,"planos":["free","essencial"]},{"id":"premium","momento":"modelo_premium","componente":"comparacao","titulo":{"pt":"Modelos maiores estão no Pro","en":"Larger models are in Pro","es":"Los modelos más grandes están en Pro"},"texto":{"pt":"Compare o que cada plano inclui.","en":"Compare what each plan includes.","es":"Compara lo que incluye cada plan."},"cta":{"pt":"Comparar planos","en":"Compare plans","es":"Comparar planes"},"maxPorDia":2,"maxPorSemana":5,"intervaloMinHoras":2,"planos":["free","essencial"]},{"id":"criar_conta","momento":"convidado_para_conta","componente":"banner","titulo":{"pt":"Guarde seu progresso","en":"Keep your progress","es":"Guarda tu progreso"},"texto":{"pt":"Crie uma conta para levar seus cartões e sessões para outros aparelhos.","en":"Create an account to take your cards and sessions to other devices.","es":"Crea una cuenta para llevar tus tarjetas y sesiones a otros dispositivos."},"cta":{"pt":"Criar conta","en":"Create account","es":"Crear cuenta"},"maxPorDia":1,"maxPorSemana":3,"intervaloMinHoras":24,"planos":["convidado"]}]}',
  1790320000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'vender_planos',
  'Mostrar a venda de planos. Forçada para desligada enquanto CHECKOUT_ENABLED=0 (porta de emergência).',
  true, '{}', NULL, 1790320000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'recompensas_v2',
  'Recompensas v2: baú por desempenho, reembolso do corte do catálogo e as telas novas. Sai quando a onda 6 fechar.',
  false, '{}', NULL, 1790370000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'nuvem_gratuita_alivio',
  'A10: nuvem grátis de 3 h/mês para aparelho fraco (conta Grátis). O limite é por conta no servidor; sai quando a Fase C absorver o alívio na matriz v2.',
  false, '{"planos":["free"]}', NULL, 1790730000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'voz_natural',
  'E4: voz natural da nuvem no modo intérprete (Premium). Liga só com a retenção do provedor registrada na LGPD; sai quando a voz for o padrão do Premium.',
  false, '{"planos":["premium","selfhost"]}', NULL, 1790790000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'venda_planos_v3',
  'Planos v3: abre a venda do Essencial e do Ao Vivo em /api/billing/assinar. Ligar é ato do dono; sai quando os quatro planos estiverem à venda para todos.',
  false, '{}', NULL, 1790810000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'stt_ao_vivo',
  'Planos v3: a nuvem ao vivo (texto durante a fala). Com venda_planos_v3, abre a venda do Ao Vivo. Sem regra de plano: quem compra ainda é Grátis. Sai quando o ao vivo for o padrão do plano.',
  false, '{}', NULL, 1790810000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'anuncios',
  'Anúncios no Grátis: libera os espaços de anúncio para quem a política permite. Sem provedor de produção nesta etapa: ligada, ainda não mostra nada. Ligar é ato do dono (domínio, rede, CSP e consulta jurídica). Sai quando os anúncios forem parte fixa do Grátis, ou se a ideia for abandonada.',
  false, '{}', NULL, 1790840000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
