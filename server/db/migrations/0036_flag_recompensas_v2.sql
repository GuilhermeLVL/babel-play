-- FLAG `recompensas_v2` (recompensas v2, Task 2.4) — `docs/flags.md`, `docs/economia-v2.md`.
--
-- O interruptor de tudo que é novo nas recompensas (baú v2, reembolso do corte do catálogo, e as
-- ondas 3–6 que vêm depois). Nasce DESLIGADA: o operador liga pelo admin quando a onda 5 fechar.
-- Na edição estática não há servidor de flags; lá quem liga é o build (`VITE_RECOMPENSAS_V2=1`).
--
-- Mesmo molde da 0031: SEMENTE IDEMPOTENTE (`INSERT OR IGNORE`) — rodar de novo não desliga o que
-- o operador já ligou. Aditiva (expand). REVERSÃO: `DELETE FROM flags WHERE chave = 'recompensas_v2'`
-- — o cliente trata flag ausente como desligada.
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'recompensas_v2',
  'Recompensas v2: baú por desempenho, reembolso do corte do catálogo e as telas novas. Sai quando a onda 6 fechar.',
  0, '{}', NULL, 1790370000000, 'semente'
);
