-- FLAGS `venda_planos_v3` e `stt_ao_vivo` (change `planos-v3-e-rota-inteligente`, etapa 7; ADR 0013) —
-- `docs/flags.md`, `src/core/planos.ts` (`flagsDeVenda`), `server/routes/billing.ts` (`POST /assinar`).
--
-- A matriz v3 tem quatro planos (Grátis, Essencial, Premium, Ao Vivo), mas os dois novos entram com a VENDA
-- FECHADA. Cada plano diz na matriz as chaves que abrem a venda dele:
--   - `venda_planos_v3`: abre a venda dos planos novos. Desligada, `POST /api/billing/assinar` recusa o
--     Essencial e o Ao Vivo com 503 `plano_indisponivel`, antes de falar com o Asaas. O Premium não pede
--     chave nenhuma e continua vendável como sempre.
--   - `stt_ao_vivo`: a nuvem ao vivo (o texto durante a fala) existe. O Ao Vivo só é vendável com as DUAS
--     ligadas: o serviço de fluxo ainda não foi escolhido, e vender o plano sem a rota seria cobrar por uma
--     promessa. É também o interruptor de produto da própria rota ao vivo, quando ela existir (etapa 10).
--
-- NASCEM DESLIGADAS: abrir a venda é ato do dono (depois da cobrança e da troca de plano da etapa 8, das
-- telas da etapa 9 e de conferir no Asaas que não há cobrança manual de R$ 39,90 ou R$ 179). SEM REGRA DE
-- PLANO (`regras = '{}'`), de propósito: quem compra um plano novo ainda é Grátis, e uma regra `planos`
-- avaliada no pedido de compra fecharia a venda justamente para ele. Quem tem a nuvem ao vivo é o
-- entitlement `sttAoVivo`, não a flag. Percentual e idioma podem ser usados para abrir aos poucos.
--
-- Não são permissão de USO: quem já tem o plano (o admin concedeu, ou pagou com a venda aberta) continua com
-- ele com a flag desligada.
--
-- Mesmo molde da 0036/0040/0046: SEMENTE IDEMPOTENTE (`INSERT OR IGNORE`) — rodar de novo não desliga o que o
-- operador já ligou. Aditiva (expand): só dado; o código anterior não lê as chaves.
-- REVERSÃO: `DELETE FROM flags WHERE chave IN ('venda_planos_v3', 'stt_ao_vivo')` — flag ausente é desligada
-- (a venda dos planos novos continua fechada, como nasce).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'venda_planos_v3',
  'Planos v3: abre a venda do Essencial e do Ao Vivo em /api/billing/assinar. Ligar é ato do dono; sai quando os quatro planos estiverem à venda para todos.',
  0, '{}', NULL, 1790810000000, 'semente'
);--> statement-breakpoint
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'stt_ao_vivo',
  'Planos v3: a nuvem ao vivo (texto durante a fala). Com venda_planos_v3, abre a venda do Ao Vivo. Sem regra de plano: quem compra ainda é Grátis. Sai quando o ao vivo for o padrão do plano.',
  0, '{}', NULL, 1790810000000, 'semente'
);
