-- FLAG `leitor_destaque_vocab` (openspec leitura-assistida, Fatia C): constante `FLAG_LEITOR_DESTAQUE_VOCAB` em `src/core/planos.ts`.
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Número 0085 (reservado à Fatia C; 0083, 0084, 0086 e 0087 são das outras fatias).
-- Semente idempotente (`INSERT OR IGNORE`). Aditiva: só dado. Par PG: 0046.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'leitor_destaque_vocab'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'leitor_destaque_vocab',
  'Flag `leitor_destaque_vocab` (openspec leitura-assistida, Fatia C): o leitor de livros destaca as palavras do capítulo pela força delas no vocabulário da pessoa (novas numa cor, aprendendo em gradiente, conhecidas sem cor), com legenda, cartão da palavra de 1 toque e 5 cartões no fim do capítulo. Tudo calculado NO APARELHO; nada novo sobe ao servidor. A opção de marcar como conhecidas as palavras não clicadas ao paginar nasce desligada e some para o perfil protegido. Desligada, nada muda. Ligar é ato do dono.',
  0, '{}', NULL, 1794800006017, 'semente'
);
