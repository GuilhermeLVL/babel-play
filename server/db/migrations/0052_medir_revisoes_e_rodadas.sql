-- MEDIR SEM MUDAR COMPORTAMENTO (change `modelo-do-aluno-e-dados`, fatia 1; levantamento em
-- `docs/auditoria/2026-10-10-dados-metricas-e-selecao.md`, seções 4.2 e 5.6).
--
-- `review_logs` guardava a nota e a estabilidade, mas não DE ONDE a nota veio (a Revisão ou qual jogo),
-- em que formato o cartão foi mostrado, quanto tempo a pessoa levou, com que meta de retenção o cartão
-- foi agendado nem que retenção o FSRS previa naquele instante. Sem isso não dá para medir a calibração
-- por origem, nem separar a nota de recordar da nota de reconhecer.
--
--   origem             'revisao' ou 'jogo:<id do jogo>' (ex.: 'jogo:blitz')
--   formato            como o cartão foi mostrado: 'lembrar' | 'digitar' | 'escolha' na Revisão; nos jogos,
--                      o id do jogo
--   resposta_ms        do cartão na tela até a nota, com teto de 60 s (abandono não é lentidão)
--   meta_retencao      a meta usada para agendar ESTA revisão (0,80 a 0,97; 0,90 quando não veio)
--   retencao_prevista  a retenção que o FSRS previa no momento da resposta, calculada do estado ANTERIOR
--                      do cartão; nula na primeira revisão (não havia estabilidade)
--
-- `exercise_results` não guardava o NÍVEL em que a rodada foi jogada (Fácil, Médio, Difícil) nem a fonte
-- separada do identificador dela (`origem` junta os dois num texto: 'sessao:<id>').
--
--   nivel      'facil' | 'medio' | 'dificil'
--   fonte      'baralho' | 'sessao' | 'trilha' | 'dificeis' | 'estudo'
--   fonte_ref  o id da sessão ou o nível da trilha; nulo nas outras fontes
--
-- TUDO NULO PARA O PASSADO: `ADD COLUMN` sem default não reescreve linha nenhuma. Nada aqui entra no
-- agendamento; são colunas só de registro.
--
-- Aditiva (expand): o código anterior ignora as colunas. REVERSÃO: não é preciso desfazer para voltar a
-- imagem anterior (colunas nulas a mais não atrapalham). Para remover de fato:
--   ALTER TABLE review_logs DROP COLUMN origem;            (idem formato, resposta_ms, meta_retencao,
--   retencao_prevista) e ALTER TABLE exercise_results DROP COLUMN nivel; (idem fonte, fonte_ref).
ALTER TABLE review_logs ADD COLUMN origem text;
--> statement-breakpoint
ALTER TABLE review_logs ADD COLUMN formato text;
--> statement-breakpoint
ALTER TABLE review_logs ADD COLUMN resposta_ms integer;
--> statement-breakpoint
ALTER TABLE review_logs ADD COLUMN meta_retencao real;
--> statement-breakpoint
ALTER TABLE review_logs ADD COLUMN retencao_prevista real;
--> statement-breakpoint
ALTER TABLE exercise_results ADD COLUMN nivel text;
--> statement-breakpoint
ALTER TABLE exercise_results ADD COLUMN fonte text;
--> statement-breakpoint
ALTER TABLE exercise_results ADD COLUMN fonte_ref text;
