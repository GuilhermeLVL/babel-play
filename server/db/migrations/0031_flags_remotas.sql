-- FEATURE FLAGS E CONFIGURAÇÃO REMOTA (Fase 6b) — `docs/flags.md`.
--
-- Uma linha por flag. `regras` e `payload` são JSON em TEXT (regra de portabilidade do schema): a
-- forma das regras é a de `src/core/flags.ts` (`RegrasDaFlag`), e o payload é livre, salvo as
-- chaves com schema registrado em `server/lib/flags.ts` (hoje, `oferta_planos`).
--
-- Sem `user_id` e fora de `TABELAS_DO_TITULAR`: é configuração do serviço, não dado de titular.
-- `atualizado_por` guarda o id da conta ADMIN que escreveu por último (trilha de auditoria da
-- operação), ou `cli` quando a escrita veio da CLI de operação.
--
-- SEMENTE IDEMPOTENTE (`INSERT OR IGNORE`): cria as flags que as Fases 7 e 8 vão ler, sem nunca
-- sobrescrever o que o operador já mudou — rodar de novo não desliga nada nem apaga payload.
--   modo_convidado   desligada — Fase 7 (modo convidado);
--   nuvem_convidado  desligada — Fase 7 (IA de nuvem para convidado); só faz sentido para `convidado`;
--   oferta_planos    desligada — Fase 8 (banners/modais/paywall), com os gatilhos iniciais;
--   vender_planos    LIGADA — espelha o comportamento atual (a venda existe). A porta de emergência
--                    `CHECKOUT_ENABLED=0` continua sendo quem FECHA a venda: o servidor força esta
--                    flag para desligada enquanto a porta estiver fechada (`server/lib/flags.ts`).
--
-- Aditiva e compatível com o código anterior (expand). REVERSÃO: `DROP TABLE flags` — nada além do
-- sistema de flags a lê, e o cliente trata flag ausente como desligada.
CREATE TABLE IF NOT EXISTS flags (
  chave TEXT PRIMARY KEY NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  habilitada INTEGER NOT NULL DEFAULT 0,
  regras TEXT NOT NULL DEFAULT '{}',
  payload TEXT,
  atualizado_em INTEGER NOT NULL,
  atualizado_por TEXT
);
--> statement-breakpoint
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'modo_convidado',
  'Fase 7: usar o app sem conta como convidado (fluxo novo de entrada).',
  0, '{}', NULL, 1790320000000, 'semente'
);
--> statement-breakpoint
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'nuvem_convidado',
  'Fase 7: convidado pode usar a IA de nuvem (com o teto anônimo do servidor).',
  0, '{"planos":["convidado"]}', NULL, 1790320000000, 'semente'
);
--> statement-breakpoint
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'oferta_planos',
  'Fase 8: banners, modais e paywall de planos. O payload define gatilhos, textos e frequência.',
  0, '{}',
  '{"gatilhos":[{"id":"cota_acabou","momento":"fim_de_cota","componente":"modal","titulo":{"pt":"Sua cota do mês acabou","en":"You have used this month''s quota","es":"Se acabó tu cuota del mes"},"texto":{"pt":"Com um plano pago você continua usando a nuvem sem esperar o mês virar.","en":"With a paid plan you keep using the cloud without waiting for next month.","es":"Con un plan de pago sigues usando la nube sin esperar al próximo mes."},"cta":{"pt":"Ver planos","en":"See plans","es":"Ver planes"},"maxPorDia":1,"maxPorSemana":3,"intervaloMinHoras":12,"planos":["free","essencial"]},{"id":"cota_perto","momento":"cota_proxima","componente":"aviso_cota","titulo":{"pt":"Sua cota está quase no fim","en":"Your quota is almost used up","es":"Tu cuota está por acabarse"},"texto":{"pt":"Você já usou a maior parte da cota deste mês.","en":"You have used most of this month''s quota.","es":"Ya usaste la mayor parte de la cuota de este mes."},"cta":{"pt":"Ver planos","en":"See plans","es":"Ver planes"},"maxPorDia":1,"maxPorSemana":2,"intervaloMinHoras":24,"planos":["free","essencial"]},{"id":"premium","momento":"modelo_premium","componente":"comparacao","titulo":{"pt":"Modelos maiores estão no Pro","en":"Larger models are in Pro","es":"Los modelos más grandes están en Pro"},"texto":{"pt":"Compare o que cada plano inclui.","en":"Compare what each plan includes.","es":"Compara lo que incluye cada plan."},"cta":{"pt":"Comparar planos","en":"Compare plans","es":"Comparar planes"},"maxPorDia":2,"maxPorSemana":5,"intervaloMinHoras":2,"planos":["free","essencial"]},{"id":"criar_conta","momento":"convidado_para_conta","componente":"banner","titulo":{"pt":"Guarde seu progresso","en":"Keep your progress","es":"Guarda tu progreso"},"texto":{"pt":"Crie uma conta para levar seus cartões e sessões para outros aparelhos.","en":"Create an account to take your cards and sessions to other devices.","es":"Crea una cuenta para llevar tus tarjetas y sesiones a otros dispositivos."},"cta":{"pt":"Criar conta","en":"Create account","es":"Crear cuenta"},"maxPorDia":1,"maxPorSemana":3,"intervaloMinHoras":24,"planos":["convidado"]}]}',
  1790320000000, 'semente'
);
--> statement-breakpoint
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'vender_planos',
  'Mostrar a venda de planos. Forçada para desligada enquanto CHECKOUT_ENABLED=0 (porta de emergência).',
  1, '{}', NULL, 1790320000000, 'semente'
);
