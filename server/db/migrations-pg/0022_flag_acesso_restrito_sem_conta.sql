-- FLAG `acesso_restrito_sem_conta` (openspec acesso-sem-conta-v2): a porta de entrada depois da 1ª sessão sem conta.
-- Constante `FLAG_ACESSO_RESTRITO_SEM_CONTA` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`);
-- depois solta por `percentual`. Desligada = comportamento de hoje (5 sessões e 80 palavras no aparelho, convites dispensáveis).
-- Semente idempotente (`ON CONFLICT DO NOTHING`): rodar de novo não desliga o que o operador ligou. Par SQLite: 0064.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'acesso_restrito_sem_conta'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'acesso_restrito_sem_conta',
  'Acesso restrito sem conta (openspec acesso-sem-conta-v2): depois de uma sessão livre, quem não tem conta e se declara adulto (18+) passa pela porta de entrada (login obrigatório, com volta ao destino); menor segue no modo local. A regra mora em `src/core/acessoSemConta.ts`; a flag só liga o fluxo novo. Não é cota nem segurança. Ligar é ato do dono.',
  false, '{}', NULL, 1794800000002, 'semente')
  ON CONFLICT (chave) DO NOTHING;
