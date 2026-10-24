-- FLAGS `venda_planos_v4`, `venda_familia` e `venda_pro4` (planos v4, etapa 1; `docs/specs/2026-10-24-planos-v4.md`) —
-- `src/core/planos.ts` (`flagsDeVenda`, `encerradoPor`), `server/routes/billing.ts`.
--   - `venda_planos_v4`: vende o Plus e ENCERRA a venda do Essencial, do Premium e do Ao Vivo (`encerradoPor`). Quem já
--     tem esses planos continua com eles: a flag não é permissão de uso.
--   - `venda_familia` e `venda_pro4`: abrem a Família e o Pro (junto com a v4). Nenhuma das duas é ligada nesta etapa;
--     os dois planos aparecem como "em breve" porque a flag deles nunca foi ligada.
-- NASCEM DESLIGADAS, SEM REGRA DE PLANO (`regras = '{}'`, pelo mesmo motivo da 0048: quem compra ainda é Grátis).
-- Semente idempotente (`INSERT OR IGNORE`): rodar de novo não desliga o que o operador ligou. Aditiva: só dado.
-- REVERSÃO: `DELETE FROM flags WHERE chave IN ('venda_planos_v4', 'venda_familia', 'venda_pro4')` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'venda_planos_v4',
  'Planos v4: abre a venda do Plus em /api/billing/assinar e encerra a do Essencial, do Premium e do Ao Vivo (quem já tem esses planos os mantém). Ligar é ato do dono; sai quando o Plus for a venda de todos.',
  0, '{}', NULL, 1790870000000, 'semente'
);--> statement-breakpoint
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'venda_familia',
  'Planos v4: abre a Família (com venda_planos_v4). Nasce desligada: a Família ainda não existe como produto (grupo e convite do responsável), então a tela a mostra como "em breve". Ligar só quando existir.',
  0, '{}', NULL, 1790870000000, 'semente'
);--> statement-breakpoint
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'venda_pro4',
  'Planos v4: abre o Pro (com venda_planos_v4). Nasce desligada: o tutor por voz ainda não existe, então a tela o mostra como "em breve". Ligar só quando existir.',
  0, '{}', NULL, 1790870000000, 'semente'
);--> statement-breakpoint
-- A VOZ NATURAL NOS PLANOS NOVOS. A 0049 já fez a regra "quem cita `premium` cita `aovivo`" para a `voz_natural`, e a mesma
-- lógica vale aqui: Plus, Família e Pro têm `vozNatural` na matriz (`tests/integration/planos-v3-migracao.test.ts` cobra que
-- a regra da flag seja exatamente os planos com voz neural). SÓ a `voz_natural` (não é uma regra geral "premium → v4": o Plus
-- não tem o intérprete automático, e outra flag escrita para o Premium não é dele por omissão). Não liga nem desliga a flag.
-- Idempotente (só a lista que cita `premium` e ainda não cita `plus`); JSON inválido não é tocado. Os planos entram no FIM.
-- REVERSÃO (antes de voltar o código que não conhece os ids novos; senão a regra é inválida e a flag desliga inteira):
-- `UPDATE flags SET regras = json_set(regras, '$.planos', json((SELECT json_group_array(j.value ORDER BY j.key) FROM json_each(flags.regras, '$.planos') AS j WHERE j.value NOT IN ('plus', 'familia', 'pro4')))) WHERE chave = 'voz_natural' AND json_valid(regras) AND json_type(regras, '$.planos') = 'array'`
UPDATE flags SET regras = json_insert(json_insert(json_insert(regras, '$.planos[#]', 'plus'), '$.planos[#]', 'familia'), '$.planos[#]', 'pro4')
WHERE chave = 'voz_natural' AND CASE WHEN NOT json_valid(regras) THEN 0 WHEN json_type(regras, '$.planos') = 'array' THEN
  EXISTS (SELECT 1 FROM json_each(flags.regras, '$.planos') AS j WHERE j.value = 'premium')
  AND NOT EXISTS (SELECT 1 FROM json_each(flags.regras, '$.planos') AS j WHERE j.value = 'plus')
ELSE 0 END;
