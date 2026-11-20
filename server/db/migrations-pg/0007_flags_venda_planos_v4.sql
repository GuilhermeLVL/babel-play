-- FLAGS `venda_planos_v4`, `venda_familia` e `venda_pro4` (planos v4, etapa 1). Par da 0054 do SQLite: nascem DESLIGADAS,
-- sem regra de plano. Semente idempotente (`ON CONFLICT DO NOTHING`): rodar de novo não desliga o que o operador ligou.
-- REVERSÃO: `DELETE FROM flags WHERE chave IN ('venda_planos_v4', 'venda_familia', 'venda_pro4')`.
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'venda_planos_v4',
  'Planos v4: abre a venda do Plus em /api/billing/assinar e encerra a do Essencial, do Premium e do Ao Vivo (quem já tem esses planos os mantém). Ligar é ato do dono; sai quando o Plus for a venda de todos.',
  false, '{}', NULL, 1790870000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'venda_familia',
  'Planos v4: abre a Família (com venda_planos_v4). Nasce desligada: a Família ainda não existe como produto (grupo e convite do responsável), então a tela a mostra como "em breve". Ligar só quando existir.',
  false, '{}', NULL, 1790870000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'venda_pro4',
  'Planos v4: abre o Pro (com venda_planos_v4). Nasce desligada: o tutor por voz ainda não existe, então a tela o mostra como "em breve". Ligar só quando existir.',
  false, '{}', NULL, 1790870000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
-- A VOZ NATURAL NOS PLANOS NOVOS (par da 0054 do SQLite): só a `voz_natural`, na lista que cita `premium` e ainda não cita `plus`.
-- `regras` é texto: o cast para jsonb pode falhar num valor editado à mão e inválido; nesse caso a migração avisa e segue (o
-- código não depende dela: voz é entitlement, a flag é interruptor).
-- REVERSÃO: tirar plus, familia e pro4 da lista de `voz_natural` (antes de voltar o código que não conhece os ids).
DO $$
BEGIN
  UPDATE flags
     SET regras = jsonb_set(regras::jsonb, '{planos}', (regras::jsonb -> 'planos') || '["plus", "familia", "pro4"]'::jsonb)::text
   WHERE chave = 'voz_natural'
     AND jsonb_typeof(regras::jsonb -> 'planos') = 'array'
     AND (regras::jsonb -> 'planos') @> '["premium"]'::jsonb
     AND NOT ((regras::jsonb -> 'planos') @> '["plus"]'::jsonb);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'voz_natural: regra não atualizada (%)', SQLERRM;
END $$;
