-- FLAG `diario` (openspec diario-com-correcao-que-vira-cartao): constante `FLAG_DIARIO` em `src/core/planos.ts`.
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Número PROVISÓRIO 0081 (o integrador renumera).
-- Semente idempotente (`INSERT OR IGNORE`). Aditiva: só dado. Par PG: 0042.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'diario'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'diario',
  'Flag `diario` (openspec diario-com-correcao-que-vira-cartao): a tela `/diario`, onde a pessoa escreve livremente no idioma que aprende (20 a 200 palavras, rascunho e histórico SÓ NO APARELHO), recebe 1 elogio e até 3 correções e guarda cada correção como cartão. A IA do retorno é só para adulto declarado nos planos pagos (cota `escritasMes`); menores só têm o "Conferir sozinho". Desligada, nada muda e `POST /api/ai/diario` responde 404. Ligar é ato do dono, depois da bancada de qualidade (tarefas 1.2 e 1.3).',
  0, '{}', NULL, 1794800001018, 'semente'
);
