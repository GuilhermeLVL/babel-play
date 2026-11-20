-- FLAG `leitura_ativa` (openspec leitura-ativa-textos-simples): a tela "Leituras" (`/leitura`).
-- `FLAG_LEITURA_ATIVA`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Ligar é ato do dono.
-- Semente idempotente (`INSERT OR IGNORE`): rodar de novo não desliga o que o operador ligou. Aditiva: só dado.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'leitura_ativa'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'leitura_ativa',
  'Leitura ativa: 12 textos curtos em inglês para ouvir, ler em voz alta com destaque ao vivo (o microfone só liga por toque e a voz não sai do aparelho) e responder 3 perguntas. Liga o microfone para menores: ligar é ato do dono, depois de validar as suposições do proposal.',
  0, '{}', NULL, 1794800000000, 'semente'
);
