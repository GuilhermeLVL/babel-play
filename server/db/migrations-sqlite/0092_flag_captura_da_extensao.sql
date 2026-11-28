-- FLAG `captura_da_extensao` (openspec captura-em-um-clique, fatia 2): constante `FLAG_CAPTURA_DA_EXTENSAO` em `src/core/planos.ts`.
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Número 0092 (faixa reservada da onda 2, dados e captura: SQLite 0092 a 0095).
-- Semente idempotente (`INSERT OR IGNORE`). Aditiva: só dado. Par PG: 0053.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'captura_da_extensao'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'captura_da_extensao',
  'Flag `captura_da_extensao` (openspec captura-em-um-clique, fatia 2): a captura recebe o PCM da extensão do Frasy (Chrome e Edge) por postMessage quando a página abre com `?fonte=extensao`, sem o seletor do navegador, e mostra "Extensão conectada" ou "Sem extensão: usar o seletor" (cai no getDisplayMedia). Origem e mensagem validadas; o receptor nunca envia áudio ao servidor. Sem `?fonte=extensao` nenhum listener é registrado. Desligada, nada muda. Ligar é ato do dono, depois de testar a extensão em aparelho real.',
  0, '{}', NULL, 1794800008017, 'semente'
);
