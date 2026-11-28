-- FLAG `estudo_revisao_v2` (openspec cartoes e modelo-do-aluno-e-dados, onda 2): constante `FLAG_ESTUDO_REVISAO_V2` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- Numero 0049 (faixa reservada PG 0049-0050; o integrador renumera se outra frente usar antes). Semente idempotente, so dado. Par SQLite: 0088.
-- REVERSAO: `DELETE FROM flags WHERE chave = 'estudo_revisao_v2'` (flag ausente e desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'estudo_revisao_v2',
  'Flag `estudo_revisao_v2` (openspec cartoes e modelo-do-aluno-e-dados, onda 2): a Revisao passa a usar o seletor unico de `src/core/selecao/`, ganha estudo livre fora da agenda, formato lacuna com alternancia da frase, tempo medido por cartao (so para a propria pessoa, fora de anuncio e de perfil), aviso de palavra dificil com saidas, saidas da pilha, atalho so as dificeis, sequencia com congelamento na aba Hoje e a tecla ? com os atalhos. Nada novo sobe ao servidor alem do `respostaMs` que ja existe. Desligada, o app fica identico ao de hoje. Ligar e ato do dono.',
  false, '{}', NULL, 1795616228198, 'semente')
  ON CONFLICT (chave) DO NOTHING;
