-- FLAG `navegacao_simples` (openspec navegacao-mais-simples, opção 3): constante `FLAG_NAVEGACAO_SIMPLES` em `src/core/planos.ts`.
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Número 0087 (próximo livre em 27/11/2026; o integrador renumera se outra frente usar antes).
-- Semente idempotente (`INSERT OR IGNORE`). Aditiva: só dado. Par PG: 0048.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'navegacao_simples'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'navegacao_simples',
  'Flag `navegacao_simples` (openspec navegacao-mais-simples, opcao 3 "O Inicio e o menu", decisao do dono de 27/11/2026): sem trilho lateral, sem painel Mais e sem barra de baixo; o Inicio vira o menu (blocos grandes: Ao vivo, Cartoes, Jogar, Livros, Biblioteca, Progresso e Seja Premium so no Gratis e no teste) e toda outra tela ganha um cabecalho fino com Inicio, o nome da tela, busca, sino de avisos e o avatar com o menu da conta. So interface: nenhuma rota, cota ou dado muda. Desligada, o app e o de antes. Ligar e ato do dono.',
  0, '{}', NULL, 1794800008017, 'semente'
);
