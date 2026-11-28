-- FLAG `estudo_palavras_v2` (onda 2, palavras): constante `FLAG_ESTUDO_PALAVRAS_V2` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- Numero 0051 (faixa reservada da frente `palavras`: PG 0051 e 0052). Semente idempotente. Par SQLite: 0090.
-- REVERSAO: `DELETE FROM flags WHERE chave = 'estudo_palavras_v2'` (flag ausente e desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'estudo_palavras_v2',
  'Flag `estudo_palavras_v2` (openspec cartoes 4.2, 4.4, 6.1, 6.2b, 6.3, 7.4, 9.2, 9.4 e modelo-do-aluno-e-dados 4.1 a 4.3): o estudo de palavras ganha retencao e proxima revisao por baralho, filtro por estado, selecao em massa, folha da palavra com o tutor, baralhos do Anki desativaveis, busca ampliada, contagens nas abas e a cobertura "voce conhece X% das palavras". Desligada, nada muda. Ligar e ato do dono.',
  false, '{}', NULL, 1795616230198, 'semente')
  ON CONFLICT (chave) DO NOTHING;
