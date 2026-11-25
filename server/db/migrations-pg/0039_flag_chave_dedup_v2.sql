-- FLAG `chave_dedup_v2` (openspec modelo-do-aluno-e-dados, 5.1): constante `FLAG_CHAVE_DEDUP_V2` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- NÚMERO PROVISÓRIO (0039): o integrador renumera. Par SQLite: 0078. Semente idempotente; só dado, nenhum `norm_key` muda aqui.
-- A reescrita de `norm_key` NÃO é migração de schema: é o comando `operacao.cjs chave-de-duplicata` (ensaio por padrão, lotes por usuário, reversível).
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'chave_dedup_v2'` (flag ausente é desligada) e, se a reescrita foi aplicada, `operacao.cjs chave-de-duplicata --para 1 --aplicar --backup-feito`.
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'chave_dedup_v2',
  'Chave de duplicata por idioma (openspec modelo-do-aluno-e-dados, 5.1): com a flag ligada, a palavra e comparada por uma chave que MANTEM as marcas que distinguem palavras (ano x ano com til no es, schon x schon com trema no de, avo x avo com circunflexo no pt, kana com dakuten, cirilico, hindi, tailandes), em vez de tirar todo acento. SO LIGAR DEPOIS de rodar a reescrita de norm_key (operacao.cjs chave-de-duplicata --aplicar --backup-feito) com o app parado, e backup: ligar sem reescrever, ou reescrever sem ligar, cria cartao duplicado. Desligada, a chave e a de sempre. Ligar e ato do dono.',
  false, '{}', NULL, 1794800000015, 'semente')
  ON CONFLICT (chave) DO NOTHING;
