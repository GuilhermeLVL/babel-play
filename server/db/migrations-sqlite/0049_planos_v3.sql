-- PLANOS V3 (change `planos-v3-e-rota-inteligente`, etapa 7; ADR 0013, decisões de 09/10/2026): Grátis + Essencial,
-- Premium e Ao Vivo. A matriz (`src/core/planos.ts`) ganhou os ids `essencial` e `aovivo`; esta migração leva o
-- plano novo aos DADOS que citam nomes de plano: as regras das flags e os gatilhos de oferta.
--
-- A REGRA É UMA SÓ, nas duas listas: QUEM CITA `premium` PASSA A CITAR `aovivo` TAMBÉM.
--   1. `flags.regras.planos`: o Ao Vivo contém o Premium (toda capacidade e toda cota do Premium, mais o ao vivo —
--      a escada é cobrada em `tests/planos-matriz.test.ts`), então o que estava liberado ao assinante do Premium
--      tem de continuar liberado a quem paga o plano de cima. É o caso da `voz_natural`, semeada pela 0046 só para
--      `premium` e `selfhost`: passa a valer para os planos com voz neural (premium, aovivo, selfhost).
--   2. `flags.payload.gatilhos[].planos` (ofertas): o mesmo. Um aviso escrito para quem paga o Premium vale para
--      quem paga o Ao Vivo. A semente da 0045 não cita `premium` (a venda é só para o Grátis) e não muda.
--
-- O QUE ELA NÃO FAZ, de propósito:
--   - NÃO põe `essencial` em lista nenhuma. O Essencial tem MENOS que o Premium (sem voz neural, sem intérprete
--     automático): uma regra escrita para o plano de cima não é dele por omissão. Quem quiser incluí-lo edita a
--     flag pelo admin. As ofertas para o assinante do Essencial são da etapa 9.
--   - NÃO mexe em `subscriptions.plan`. Nenhuma linha muda de plano: `premium` continua `premium`. O nome
--     `essencial` deixou de ser apelido do Premium na matriz, mas a 0041 já tinha reescrito toda linha antiga com
--     esse nome, e o servidor nunca foi implantado com o Essencial da v1.
--   - NÃO liga nem desliga flag, e não toca a descrição nem o `atualizado_por`: vale para a linha da semente e para
--     a que o operador editou (a regra dele citava o único plano pago que existia).
--
-- O código NÃO depende desta migração para funcionar (flag é interruptor de produto; quem pode usar é o
-- entitlement). Ela existe para o assinante do Ao Vivo não perder, no dia em que o plano for vendido, o que o
-- Premium tem atrás de flag.
--
-- JSON inválido não é tocado (`json_valid`), nem lista que não é lista, nem payload cujos gatilhos não são objetos.
-- Reaplicar é idempotente: cada UPDATE só pega a lista que tem `premium` e ainda não tem `aovivo`. O `aovivo` entra
-- no FIM da lista; a ordem dos gatilhos e os outros campos ficam. SQL puro, só dado: nenhum esquema muda (o
-- snapshot é o da 0048 com outro id).
--
-- Expand: só dado. MAS o código anterior não conhece `aovivo` no schema das regras (`PLANOS_DA_FLAG`) e trataria a
-- regra como inválida, DESLIGANDO a flag inteira — por isso a reversão abaixo roda ANTES de pôr a imagem anterior
-- no ar (como na 0041). No mesmo rollback, uma assinatura concedida em `essencial` ou `aovivo` precisa virar
-- `premium` à mão: o código anterior lê `essencial` como Premium e `aovivo` como plano desconhecido (Grátis).
-- REVERSÃO: antes de voltar a imagem, tirar o `aovivo` das listas que citam `premium` (inclusive de uma lista em
-- que o operador o tenha posto à mão ao lado do `premium`; se houver, confira antes), com os dois comandos:
-- `UPDATE flags SET regras = json_set(regras, '$.planos', json((
--    SELECT json_group_array(j.value ORDER BY j.key) FROM json_each(flags.regras, '$.planos') AS j
--    WHERE j.value <> 'aovivo')))
--  WHERE CASE WHEN NOT json_valid(regras) THEN 0 WHEN json_type(regras, '$.planos') = 'array' THEN
--    EXISTS (SELECT 1 FROM json_each(flags.regras, '$.planos') AS j WHERE j.value = 'premium')
--    AND EXISTS (SELECT 1 FROM json_each(flags.regras, '$.planos') AS j WHERE j.value = 'aovivo')
--  ELSE 0 END`
-- e
-- `UPDATE flags SET payload = json_set(payload, '$.gatilhos', json((
--    SELECT json_group_array(json(CASE
--      WHEN json_type(g.value, '$.planos') = 'array'
--       AND EXISTS (SELECT 1 FROM json_each(g.value, '$.planos') AS p WHERE p.value = 'premium')
--       AND EXISTS (SELECT 1 FROM json_each(g.value, '$.planos') AS p WHERE p.value = 'aovivo')
--      THEN json_set(g.value, '$.planos', json((
--        SELECT json_group_array(p.value ORDER BY p.key) FROM json_each(g.value, '$.planos') AS p
--        WHERE p.value <> 'aovivo')))
--      ELSE g.value END) ORDER BY g.key)
--    FROM json_each(flags.payload, '$.gatilhos') AS g)))
--  WHERE CASE WHEN NOT json_valid(payload) THEN 0 WHEN json_type(payload, '$.gatilhos') <> 'array' THEN 0
--    WHEN EXISTS (SELECT 1 FROM json_each(flags.payload, '$.gatilhos') AS g WHERE g.type <> 'object') THEN 0 ELSE
--    EXISTS (SELECT 1 FROM json_each(flags.payload, '$.gatilhos') AS g
--      WHERE json_type(g.value, '$.planos') = 'array'
--        AND EXISTS (SELECT 1 FROM json_each(g.value, '$.planos') AS p WHERE p.value = 'premium')
--        AND EXISTS (SELECT 1 FROM json_each(g.value, '$.planos') AS p WHERE p.value = 'aovivo'))
--  END`
UPDATE flags SET regras = json_insert(regras, '$.planos[#]', 'aovivo')
WHERE CASE WHEN NOT json_valid(regras) THEN 0 WHEN json_type(regras, '$.planos') = 'array' THEN
  EXISTS (SELECT 1 FROM json_each(flags.regras, '$.planos') AS j WHERE j.value = 'premium')
  AND NOT EXISTS (SELECT 1 FROM json_each(flags.regras, '$.planos') AS j WHERE j.value = 'aovivo')
ELSE 0 END;--> statement-breakpoint
UPDATE flags SET payload = json_set(payload, '$.gatilhos', json((
  SELECT json_group_array(json(CASE
    WHEN json_type(g.value, '$.planos') = 'array'
     AND EXISTS (SELECT 1 FROM json_each(g.value, '$.planos') AS p WHERE p.value = 'premium')
     AND NOT EXISTS (SELECT 1 FROM json_each(g.value, '$.planos') AS p WHERE p.value = 'aovivo')
    THEN json_insert(g.value, '$.planos[#]', 'aovivo')
    ELSE g.value END) ORDER BY g.key)
  FROM json_each(flags.payload, '$.gatilhos') AS g
)))
WHERE CASE WHEN NOT json_valid(payload) THEN 0 WHEN json_type(payload, '$.gatilhos') <> 'array' THEN 0
  WHEN EXISTS (SELECT 1 FROM json_each(flags.payload, '$.gatilhos') AS g WHERE g.type <> 'object') THEN 0 ELSE
  EXISTS (
    SELECT 1 FROM json_each(flags.payload, '$.gatilhos') AS g
    WHERE json_type(g.value, '$.planos') = 'array'
      AND EXISTS (SELECT 1 FROM json_each(g.value, '$.planos') AS p WHERE p.value = 'premium')
      AND NOT EXISTS (SELECT 1 FROM json_each(g.value, '$.planos') AS p WHERE p.value = 'aovivo')
  )
END;
