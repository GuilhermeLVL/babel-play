-- FLAGS `escuta_player_compacto` e `leitor_selecao_firme` (openspec leitura-assistida, Fatia A): constantes em `src/core/planos.ts`. NASCEM DESLIGADAS, SEM REGRA DE PLANO (`regras = '{}'`).
-- Número 0044 (reserva da Fatia A; uma migração semeia as duas chaves). Semente idempotente. Par SQLite: 0083.
-- REVERSÃO: `DELETE FROM flags WHERE chave IN ('escuta_player_compacto','leitor_selecao_firme')` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'escuta_player_compacto',
  'Flag `escuta_player_compacto` (openspec leitura-assistida, Fatia A): o player da escuta guiada vira UMA barra compacta e a transcrição reserva o espaço dele (nada coberto), no computador e no celular. Só desenho, nenhum dado novo. Desligada, o player é o de hoje. Ligar é ato do dono.',
  false, '{}', NULL, 1795616222198, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'leitor_selecao_firme',
  'Flag `leitor_selecao_firme` (openspec leitura-assistida, Fatia A): a seleção de trechos no leitor de livros cai sempre em bordas de palavra, descarta pontos fora do texto, não passa de bloco ou coluna por deriva do gesto (toque = palavra, toque duplo ou longo = frase, toque triplo = parágrafo) e ganha alças palavra a palavra. Só no navegador, nenhum dado novo. Desligada, a seleção é a de hoje. Ligar é ato do dono.',
  false, '{}', NULL, 1795616222198, 'semente')
  ON CONFLICT (chave) DO NOTHING;
