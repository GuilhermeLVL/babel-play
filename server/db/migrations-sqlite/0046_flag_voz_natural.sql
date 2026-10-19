-- FLAG `voz_natural` (E4 da Fase E, modo intérprete) — `docs/flags.md`, `server/ai/ttsProxy.ts`.
--
-- A voz natural da nuvem lê em voz alta a tradução de cada fala no intérprete (Premium, pelo entitlement
-- `vozNatural`; o Grátis lê com a voz do aparelho e nem chega à rota). A flag é o interruptor de PRODUTO;
-- quem limita o gasto são as cotas de caracteres por mês e por dia (`vozCaracteresMes`/`vozCaracteresDia`
-- em `src/core/planos.ts`), a admissão `tts` e o orçamento, todos no servidor.
--
-- NASCE DESLIGADA: ligar é decisão do operador, DEPOIS de (1) a chave do provedor existir
-- (`DEEPINFRA_API_KEY`, perna `tts` no `IA_PROVEDORES`), (2) a sonda de contrato conferir o pedido e a
-- resposta do Chatterbox, e (3) a retenção do provedor estar confirmada no contrato e registrada em
-- `docs/lgpd/operadores.md` e `docs/lgpd/ropa.csv` (hoje marcada "a confirmar com o contrato do provedor").
-- Desligada, `POST /api/ai/tts` responde 503 `voz_natural_desligada` e o cliente lê com a voz do aparelho.
-- `planos: ["premium","selfhost"]` porque são os planos com `vozNatural` na matriz.
--
-- Mesmo molde da 0036/0040: SEMENTE IDEMPOTENTE (`INSERT OR IGNORE`) — rodar de novo não desliga o que o
-- operador já ligou. Aditiva (expand): só dado; o código anterior não lê a chave. NÚMERO 0046 porque a 0044
-- e a 0045 estão reservadas para outras frentes; no merge, o `when` desta no journal fica MAIOR que o das
-- que entrarem antes (o migrador do drizzle pula a migration com `when` anterior à última aplicada).
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'voz_natural'` — flag ausente é desligada (503 e a voz do
-- aparelho), como antes.
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'voz_natural',
  'E4: voz natural da nuvem no modo intérprete (Premium). Liga só com a retenção do provedor registrada na LGPD; sai quando a voz for o padrão do Premium.',
  0, '{"planos":["premium","selfhost"]}', NULL, 1790790000000, 'semente'
);
