-- FLAG `nuvem_gratuita_alivio` (A10 do plano "Grátis sem travar") — `docs/flags.md`, `server/lib/nuvemDeAlivio.ts`.
--
-- A nuvem de alívio do Grátis: 3 h/mês de transcrição na nuvem para quem o aparelho não aguenta o modelo
-- local (`FRANQUIA_DE_ALIVIO` em `src/core/planos.ts`, com o teto de US$ 0,13 por conta). A flag é o
-- interruptor de PRODUTO; o limite de verdade é a franquia por conta, o pool do dia (no máximo 20% do
-- orçamento diário) e a reserva de 80% dos pagantes, todos no servidor.
--
-- NASCE DESLIGADA: ligar é decisão do operador, depois de conferir `AI_BUDGET_USD_DAY` (é dele que sai o
-- pool do alívio) e a retenção zero da Groq ligada no console. `planos: ["free"]` porque só a conta Grátis
-- tem o alívio (o convidado tem o pool dele; o pagante, a cota do plano).
--
-- Mesmo molde da 0036: SEMENTE IDEMPOTENTE (`INSERT OR IGNORE`) — rodar de novo não desliga o que o
-- operador já ligou. Aditiva (expand): só dado; o código anterior não lê a chave. Número PROVISÓRIO (as
-- 0040+ do plano podem ser renumeradas no merge com a Fase C).
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'nuvem_gratuita_alivio'` — o cliente e o servidor tratam flag
-- ausente como desligada (a conta Grátis volta ao 402 de sempre na nuvem).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'nuvem_gratuita_alivio',
  'A10: nuvem grátis de 3 h/mês para aparelho fraco (conta Grátis). O limite é por conta no servidor; sai quando a Fase C absorver o alívio na matriz v2.',
  0, '{"planos":["free"]}', NULL, 1790730000000, 'semente'
);
