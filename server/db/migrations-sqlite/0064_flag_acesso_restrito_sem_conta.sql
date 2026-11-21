-- FLAG `acesso_restrito_sem_conta` (openspec acesso-sem-conta-v2): a porta de entrada depois da 1ª sessão sem conta.
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Ligar é ato do dono.
-- Semente idempotente (`INSERT OR IGNORE`): rodar de novo não desliga o que o operador ligou. Aditiva: só dado.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'acesso_restrito_sem_conta'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'acesso_restrito_sem_conta',
  'Acesso restrito sem conta (openspec acesso-sem-conta-v2): depois de uma sessão livre, quem não tem conta e se declara adulto (18+) passa pela porta de entrada (login obrigatório, com volta ao destino); menor segue no modo local. A regra mora em `src/core/acessoSemConta.ts`; a flag só liga o fluxo novo. Não é cota nem segurança. Ligar é ato do dono.',
  0, '{}', NULL, 1794800000002, 'semente'
);
