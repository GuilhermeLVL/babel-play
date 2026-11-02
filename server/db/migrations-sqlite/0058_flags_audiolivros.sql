-- FLAGS `audiolivros`, `audiolivros_nuvem` e `audiolivros_elenco` (Audiolivros e leitura, F2; par de PG 0016,
-- `docs/specs/2026-10-31-audiolivros-e-leitura.md` §9.1). NASCEM DESLIGADAS, SEM REGRA DE PLANO (`regras = '{}'`).
-- Semente idempotente (`INSERT OR IGNORE`): rodar de novo não desliga o que o operador ligou. Aditiva: só dado.
-- REVERSÃO: `DELETE FROM flags WHERE chave IN ('audiolivros', 'audiolivros_nuvem', 'audiolivros_elenco')`.
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'audiolivros',
  'Audiolivros (F2): o "Ouvir" toca o áudio pré-gerado do catálogo (voz sintetizada, rotulada) com a frase destacada; sem áudio íntegro, a voz do aparelho lê. Só para quem vê o livro. Desligada, nada novo carrega. Ligar é ato do dono, depois do piloto aprovado.',
  0, '{}', NULL, 1793600000000, 'semente'
);
--> statement-breakpoint
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'audiolivros_nuvem',
  'Audiolivros: voz natural da nuvem para o livro da própria pessoa, com consentimento por livro. Exige voz_natural e o direito vozNatural do plano, e o contrato de retenção zero do provedor (G7). Ligar é ato do dono.',
  0, '{}', NULL, 1793600000000, 'semente'
);
--> statement-breakpoint
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'audiolivros_elenco',
  'Audiolivros: voz por personagem no áudio do catálogo e no narrador. Exige audiolivros; independe de avatar_3d. Nasce desligada até a F3 (gold set e timbres medidos). Ligar é ato do dono.',
  0, '{}', NULL, 1793600000000, 'semente'
);
