-- FLAG `leitor_modo_traducao` (openspec leitura-assistida, fatia B): constante `FLAG_LEITOR_MODO_TRADUCAO` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- Número 0045 (reservado à fatia B; o 0044 é de outra fatia). Semente idempotente. Par SQLite: 0084.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'leitor_modo_traducao'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'leitor_modo_traducao',
  'Flag `leitor_modo_traducao` (openspec leitura-assistida, fatia B): no leitor de livros, a tradução do trecho grifado aparece num balão ancorado a ele (sem cobri-lo), sem cliques extras, com ler em voz alta, copiar, atalhos T/V/C/A, exportar grifos com as traduções e ditado de uma frase. Motor do aparelho primeiro; nuvem só como hoje (plano, idade, consentimento); nada do livro é gravado no servidor. Desligada, nada muda. Ligar é ato do dono.',
  false, '{}', NULL, 1795616222198, 'semente')
  ON CONFLICT (chave) DO NOTHING;
