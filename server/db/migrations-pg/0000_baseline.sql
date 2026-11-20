CREATE TABLE "agregados_diarios" (
	"user_id" text NOT NULL,
	"idioma" text DEFAULT '' NOT NULL,
	"dia" bigint NOT NULL,
	"revisoes" bigint DEFAULT 0 NOT NULL,
	"acertos" bigint DEFAULT 0 NOT NULL,
	"revisoes_vivas" bigint DEFAULT 0 NOT NULL,
	"nota1" bigint DEFAULT 0 NOT NULL,
	"nota2" bigint DEFAULT 0 NOT NULL,
	"nota3" bigint DEFAULT 0 NOT NULL,
	"nota4" bigint DEFAULT 0 NOT NULL,
	"novas" bigint DEFAULT 0 NOT NULL,
	"tempo_revisao_ms" bigint DEFAULT 0 NOT NULL,
	"com_previsao" bigint DEFAULT 0 NOT NULL,
	"soma_prevista" double precision DEFAULT 0 NOT NULL,
	"lembradas_com_previsao" bigint DEFAULT 0 NOT NULL,
	"itens_de_jogo" bigint DEFAULT 0 NOT NULL,
	"itens_certos" bigint DEFAULT 0 NOT NULL,
	"itens_drill" bigint DEFAULT 0 NOT NULL,
	"itens_drill_certos" bigint DEFAULT 0 NOT NULL,
	"tempo_jogo_ms" bigint DEFAULT 0 NOT NULL,
	"rodadas" bigint DEFAULT 0 NOT NULL,
	"revisoes_purgadas" bigint DEFAULT 0 NOT NULL,
	"acertos_purgados" bigint DEFAULT 0 NOT NULL,
	"atualizado_em" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "agregados_diarios_user_id_idioma_dia_pk" PRIMARY KEY("user_id","idioma","dia")
);
--> statement-breakpoint
CREATE TABLE "anki_decks" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"nome" text NOT NULL,
	"nome_no_arquivo" text,
	"arquivo_origem" text NOT NULL,
	"estado" text DEFAULT 'ativo' NOT NULL,
	"idioma_origem" text,
	"idioma_alvo" text
);
--> statement-breakpoint
CREATE TABLE "anki_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"deck_id" text NOT NULL,
	"arquivo" text,
	"bytes" bigint,
	"hash_do_arquivo" text,
	"estado" text DEFAULT 'lendo' NOT NULL,
	"notas_lidas" bigint DEFAULT 0 NOT NULL,
	"notas_novas" bigint DEFAULT 0 NOT NULL,
	"notas_atualizadas" bigint DEFAULT 0 NOT NULL,
	"notas_descartadas" bigint DEFAULT 0 NOT NULL,
	"por_motivo" text,
	"erro" text
);
--> statement-breakpoint
CREATE TABLE "anki_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"deck_id" text NOT NULL,
	"guid" text NOT NULL,
	"notetype" text,
	"estrutura_hash" text,
	"campos_brutos" text,
	"frente" text,
	"verso" text,
	"exemplo" text,
	"tags" text,
	"estado" text DEFAULT 'arquivada' NOT NULL,
	"projected_card_id" text,
	"motivo_da_baixa" text,
	"motivo_descarte" text,
	"import_id" text
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"provider" text NOT NULL,
	"event" text NOT NULL,
	"user_id" text,
	"provider_ref" text,
	"estado" text DEFAULT 'aplicado' NOT NULL,
	"motivo" text,
	"payload" text
);
--> statement-breakpoint
CREATE TABLE "boot_falhas" (
	"passo" text PRIMARY KEY NOT NULL,
	"em" bigint NOT NULL,
	"instancia" text
);
--> statement-breakpoint
CREATE TABLE "cache_de_traducao" (
	"chave" text PRIMARY KEY NOT NULL,
	"origem" text NOT NULL,
	"destino" text NOT NULL,
	"modelo" text NOT NULL,
	"versao_prompt" text NOT NULL,
	"traducao" text NOT NULL,
	"criado_em" bigint NOT NULL,
	"usado_em" bigint NOT NULL,
	"acertos" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "convidados" (
	"user_id" text PRIMARY KEY NOT NULL,
	"ip_hash" text NOT NULL,
	"criado_em" bigint NOT NULL,
	"visto_em" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"sku" text NOT NULL,
	"creditos" bigint NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"provider" text DEFAULT 'asaas' NOT NULL,
	"provider_payment_id" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"paid_at" bigint
);
--> statement-breakpoint
CREATE TABLE "credit_spends" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"spend_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"reason" text NOT NULL,
	"ref" text
);
--> statement-breakpoint
CREATE TABLE "estado_da_conta" (
	"user_id" text PRIMARY KEY NOT NULL,
	"fuso" text,
	"fuso_desde" bigint,
	"aviso_reembolso_em" bigint,
	"atualizado_em" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estado_dos_agregados" (
	"user_id" text PRIMARY KEY NOT NULL,
	"fuso" text NOT NULL,
	"marca_bruto" bigint DEFAULT 0 NOT NULL,
	"marca_vista" bigint DEFAULT 0 NOT NULL,
	"reconstruido_em" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estado_por_item" (
	"user_id" text NOT NULL,
	"card_id" text NOT NULL,
	"jogo" text NOT NULL,
	"acertos" bigint DEFAULT 0 NOT NULL,
	"erros" bigint DEFAULT 0 NOT NULL,
	"ultimo_resultado" bigint,
	"ultimo_em" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "estado_por_item_user_id_card_id_jogo_pk" PRIMARY KEY("user_id","card_id","jogo")
);
--> statement-breakpoint
CREATE TABLE "exercise_results" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"session_id" text,
	"kind" text,
	"correct" bigint,
	"score" double precision,
	"exercise_kind" text,
	"round_id" text,
	"combo" bigint,
	"item_ref" text,
	"attempts" bigint,
	"ms" bigint,
	"hinted" bigint,
	"origem" text,
	"card_id" text,
	"nivel" text,
	"fonte" text,
	"fonte_ref" text
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"chave" text PRIMARY KEY NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"habilitada" boolean DEFAULT false NOT NULL,
	"regras" text DEFAULT '{}' NOT NULL,
	"payload" text,
	"atualizado_em" bigint NOT NULL,
	"atualizado_por" text
);
--> statement-breakpoint
CREATE TABLE "gasto_de_ia" (
	"mes" text PRIMARY KEY NOT NULL,
	"micro_usd" bigint DEFAULT 0 NOT NULL,
	"chamadas" bigint DEFAULT 0 NOT NULL,
	"alerta_80_em" bigint,
	"esgotado_em" bigint,
	"atualizado_em" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "glossario" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"origem" text NOT NULL,
	"destino" text NOT NULL,
	"termo" text NOT NULL,
	"termo_norm" text NOT NULL,
	"traducao" text NOT NULL,
	"criado_em" bigint NOT NULL,
	"atualizado_em" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idades_declaradas" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"nascimento" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marcas_de_teste" (
	"marca" text PRIMARY KEY NOT NULL,
	"criado_em" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presencas" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"dia" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"label" text,
	"kind" text,
	"base_url" text,
	"default_model" text,
	"secret_ref" text
);
--> statement-breakpoint
CREATE TABLE "rank" (
	"id" text PRIMARY KEY NOT NULL,
	"criado_em" bigint NOT NULL,
	"jogo" text NOT NULL,
	"apelido" text NOT NULL,
	"pontos" bigint NOT NULL,
	"combo" bigint DEFAULT 0 NOT NULL,
	"ip_hash" text
);
--> statement-breakpoint
CREATE TABLE "review_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"card_id" text NOT NULL,
	"reviewed_at" bigint,
	"grade" bigint,
	"prev_stability" double precision,
	"new_stability" double precision,
	"prev_due" bigint,
	"new_due" bigint,
	"elapsed_days" double precision,
	"origem" text,
	"formato" text,
	"resposta_ms" bigint,
	"meta_retencao" double precision,
	"retencao_prevista" double precision
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"ref" text PRIMARY KEY NOT NULL,
	"value_encrypted" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE TABLE "seed_credits" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"credito_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"xp" bigint DEFAULT 0 NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seed_spends" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"spend_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"reason" text NOT NULL,
	"ref" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"title" text,
	"kind" text,
	"started_at" bigint,
	"ended_at" bigint,
	"source_lang" text,
	"target_lang" text,
	"duration_ms" bigint,
	"word_count" bigint,
	"status" text,
	"meta" text,
	"origem_local_id" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"active_profile_id" text,
	"target_language" text,
	"ui" text
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_end" bigint,
	"cancel_at_period_end" bigint,
	"provider" text,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"ciclo" text DEFAULT 'mensal' NOT NULL,
	"meio" text,
	"provider_installment_id" text,
	"troca_para" text,
	"troca_a_partir_de" text,
	CONSTRAINT "uq_subscriptions_user" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "testes_premium" (
	"user_id" text PRIMARY KEY NOT NULL,
	"iniciado_em" bigint NOT NULL,
	"termina_em" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"metric" text NOT NULL,
	"window" text NOT NULL,
	"count" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "uq_usage_user_metric_window" UNIQUE("user_id","metric","window")
);
--> statement-breakpoint
CREATE TABLE "user_interests" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"slug" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"email" text,
	"role" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"display_name" text,
	"locale" text,
	"bio" text,
	"goal" text,
	"onboarded_at" bigint
);
--> statement-breakpoint
CREATE TABLE "utterances" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"session_id" text NOT NULL,
	"idx" bigint,
	"t_start_ms" bigint,
	"t_end_ms" bigint,
	"speaker_id" text,
	"speaker_name" text,
	"source" text,
	"source_lang" text,
	"source_text" text,
	"target_lang" text,
	"translated_text" text,
	"status" text,
	"engine" text,
	"confidence" double precision,
	"traducao_polida" text,
	"polimento_modelo" text,
	"polimento_versao" text,
	"polido_em" bigint
);
--> statement-breakpoint
CREATE TABLE "versoes_de_dados" (
	"user_id" text PRIMARY KEY NOT NULL,
	"vocab" bigint DEFAULT 0 NOT NULL,
	"atividade" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vinculos_de_responsavel" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"email_do_responsavel" text NOT NULL,
	"token_hash" text NOT NULL,
	"expira_em" bigint NOT NULL,
	"usado_em" bigint,
	"responsavel_user_id" text,
	"nome_do_responsavel" text,
	"consentimento_versao" text,
	"consentimento_texto" text,
	"consentimento_em" bigint,
	"revogado_em" bigint
);
--> statement-breakpoint
CREATE TABLE "vocab_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"deleted_at" bigint,
	"session_id" text,
	"word" text NOT NULL,
	"back" text,
	"phonetics" text,
	"sentence" text,
	"src_lang" text,
	"tgt_lang" text,
	"in_deck" bigint,
	"box" bigint,
	"due_at" bigint,
	"stability" double precision,
	"difficulty" double precision,
	"reps" bigint,
	"lapses" bigint,
	"last_review" bigint,
	"cloze_prompt" text,
	"cloze_answer" text,
	"cefr_level" text,
	"cefr_confidence" double precision,
	"added_at" bigint,
	"norm_key" text,
	"occurrences" bigint DEFAULT 0 NOT NULL,
	"first_seen_at" bigint,
	"last_seen_at" bigint,
	"cefr_source" text,
	"difficulty_score" double precision,
	"difficulty_at" bigint,
	"src_lang_base" text GENERATED ALWAYS AS (lower(substr(coalesce(src_lang,''),1,2))) STORED
);
--> statement-breakpoint
CREATE TABLE "vocab_occurrences" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text NOT NULL,
	"deleted_at" bigint,
	"card_id" text NOT NULL,
	"occurred_at" bigint NOT NULL,
	"origin_kind" text NOT NULL,
	"origin_ref" text,
	"sentence" text,
	"utterance_id" text
);
--> statement-breakpoint
ALTER TABLE "anki_imports" ADD CONSTRAINT "anki_imports_deck_id_anki_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."anki_decks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anki_notes" ADD CONSTRAINT "anki_notes_deck_id_anki_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."anki_decks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anki_notes" ADD CONSTRAINT "anki_notes_projected_card_id_vocab_cards_id_fk" FOREIGN KEY ("projected_card_id") REFERENCES "public"."vocab_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_results" ADD CONSTRAINT "exercise_results_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_results" ADD CONSTRAINT "exercise_results_card_id_vocab_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."vocab_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_secret_ref_secrets_ref_fk" FOREIGN KEY ("secret_ref") REFERENCES "public"."secrets"("ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_card_id_vocab_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."vocab_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utterances" ADD CONSTRAINT "utterances_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_cards" ADD CONSTRAINT "vocab_cards_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_occurrences" ADD CONSTRAINT "vocab_occurrences_card_id_vocab_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."vocab_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_occurrences" ADD CONSTRAINT "vocab_occurrences_utterance_id_utterances_id_fk" FOREIGN KEY ("utterance_id") REFERENCES "public"."utterances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_anki_decks_user" ON "anki_decks" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "idx_anki_imports_user_deck" ON "anki_imports" USING btree ("user_id","deck_id");--> statement-breakpoint
CREATE INDEX "idx_anki_imports_deck" ON "anki_imports" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "idx_anki_notes_user_deck" ON "anki_notes" USING btree ("user_id","deck_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_anki_notes_deck_guid" ON "anki_notes" USING btree ("deck_id","guid");--> statement-breakpoint
CREATE INDEX "idx_anki_notes_deck_estado" ON "anki_notes" USING btree ("deck_id","estado");--> statement-breakpoint
CREATE INDEX "idx_anki_notes_projected_card" ON "anki_notes" USING btree ("projected_card_id") WHERE "anki_notes"."projected_card_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_cache_de_traducao_criado" ON "cache_de_traducao" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "idx_cache_de_traducao_usado" ON "cache_de_traducao" USING btree ("usado_em");--> statement-breakpoint
CREATE INDEX "idx_convidados_ip_criado" ON "convidados" USING btree ("ip_hash","criado_em");--> statement-breakpoint
CREATE INDEX "idx_convidados_visto" ON "convidados" USING btree ("visto_em");--> statement-breakpoint
CREATE INDEX "idx_credit_purchases_user" ON "credit_purchases" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_credit_purchases_payment" ON "credit_purchases" USING btree ("provider_payment_id") WHERE "credit_purchases"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_credit_spends_spend_id" ON "credit_spends" USING btree ("spend_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_credit_spends_user_spend" ON "credit_spends" USING btree ("user_id","spend_id") WHERE "credit_spends"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_exercise_results_item_ref" ON "exercise_results" USING btree ("item_ref");--> statement-breakpoint
CREATE INDEX "idx_exercise_results_round_id" ON "exercise_results" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "idx_exercise_results_kind_round" ON "exercise_results" USING btree ("exercise_kind","round_id");--> statement-breakpoint
CREATE INDEX "idx_exercise_results_card" ON "exercise_results" USING btree ("user_id","card_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_exercise_results_user_created" ON "exercise_results" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_exercise_results_session" ON "exercise_results" USING btree ("session_id") WHERE "exercise_results"."session_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_exercise_results_card_id" ON "exercise_results" USING btree ("card_id") WHERE "exercise_results"."card_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_glossario_termo" ON "glossario" USING btree ("user_id","origem","destino","termo_norm");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_idade_user" ON "idades_declaradas" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_marcas_de_teste_criado" ON "marcas_de_teste" USING btree ("criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_presencas_user_dia" ON "presencas" USING btree ("user_id","dia") WHERE "presencas"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_provider_credentials_secret" ON "provider_credentials" USING btree ("secret_ref") WHERE "provider_credentials"."secret_ref" is not null;--> statement-breakpoint
CREATE INDEX "idx_rank_jogo_pontos" ON "rank" USING btree ("jogo","pontos");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rank_jogo_apelido" ON "rank" USING btree ("jogo","apelido");--> statement-breakpoint
CREATE INDEX "idx_rank_ip" ON "rank" USING btree ("ip_hash","criado_em");--> statement-breakpoint
CREATE INDEX "idx_review_card" ON "review_logs" USING btree ("card_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "idx_review_user" ON "review_logs" USING btree ("user_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "idx_review_apagadas" ON "review_logs" USING btree ("deleted_at") WHERE "review_logs"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "idx_seed_credits_credito_id" ON "seed_credits" USING btree ("credito_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_seed_credits_user_credito" ON "seed_credits" USING btree ("user_id","credito_id") WHERE "seed_credits"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_seed_spends_spend_id" ON "seed_spends" USING btree ("spend_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_seed_spends_user_spend" ON "seed_spends" USING btree ("user_id","spend_id") WHERE "seed_spends"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sessions_user_origem_local" ON "sessions" USING btree ("user_id","origem_local_id") WHERE "sessions"."deleted_at" is null and "sessions"."origem_local_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "idx_sessions_created" ON "sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_sessions_apagadas" ON "sessions" USING btree ("deleted_at") WHERE "sessions"."deleted_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_settings_user" ON "settings" USING btree ("user_id") WHERE "settings"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_usage_counters_metric_window" ON "usage_counters" USING btree ("metric","window");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_interest" ON "user_interests" USING btree ("user_id","slug") WHERE "user_interests"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_utt_session" ON "utterances" USING btree ("session_id","idx");--> statement-breakpoint
CREATE INDEX "idx_utt_user" ON "utterances" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "idx_utt_apagadas" ON "utterances" USING btree ("deleted_at") WHERE "utterances"."deleted_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_vinculo_token" ON "vinculos_de_responsavel" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_vinculo_menor" ON "vinculos_de_responsavel" USING btree ("user_id","usado_em");--> statement-breakpoint
CREATE INDEX "idx_vinculo_responsavel" ON "vinculos_de_responsavel" USING btree ("responsavel_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_vocab_user_norm" ON "vocab_cards" USING btree ("user_id","norm_key") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "idx_vocab_user_added" ON "vocab_cards" USING btree ("user_id","added_at");--> statement-breakpoint
CREATE INDEX "idx_vocab_user_occ" ON "vocab_cards" USING btree ("user_id","occurrences");--> statement-breakpoint
CREATE INDEX "idx_vocab_user_cefr" ON "vocab_cards" USING btree ("user_id","cefr_level");--> statement-breakpoint
CREATE INDEX "idx_vocab_user_due" ON "vocab_cards" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "idx_vocab_session" ON "vocab_cards" USING btree ("user_id","session_id");--> statement-breakpoint
CREATE INDEX "idx_vocab_leitner_pendente" ON "vocab_cards" USING btree ("id") WHERE "vocab_cards"."deleted_at" is null and "vocab_cards"."stability" is null and "vocab_cards"."box" > 1;--> statement-breakpoint
CREATE INDEX "idx_vocab_session_id" ON "vocab_cards" USING btree ("session_id") WHERE "vocab_cards"."session_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_vocab_user_dificuldade" ON "vocab_cards" USING btree ("user_id","difficulty_score");--> statement-breakpoint
CREATE INDEX "idx_vocab_src_lang_base" ON "vocab_cards" USING btree ("src_lang_base");--> statement-breakpoint
CREATE INDEX "idx_vocab_apagadas" ON "vocab_cards" USING btree ("deleted_at") WHERE "vocab_cards"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "idx_occ_user_card" ON "vocab_occurrences" USING btree ("user_id","card_id");--> statement-breakpoint
CREATE INDEX "idx_occ_user_time" ON "vocab_occurrences" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_occ_utterance" ON "vocab_occurrences" USING btree ("utterance_id") WHERE "vocab_occurrences"."utterance_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_occ_card" ON "vocab_occurrences" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "idx_occ_origem" ON "vocab_occurrences" USING btree ("user_id","origin_kind","origin_ref");--> statement-breakpoint
CREATE INDEX "idx_occ_probe" ON "vocab_occurrences" USING btree ("user_id","card_id","origin_kind","origin_ref");--> statement-breakpoint
CREATE INDEX "idx_occ_apagadas" ON "vocab_occurrences" USING btree ("deleted_at") WHERE "vocab_occurrences"."deleted_at" is not null;