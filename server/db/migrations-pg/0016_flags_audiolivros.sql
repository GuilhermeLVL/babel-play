-- FLAGS `audiolivros`, `audiolivros_nuvem` e `audiolivros_elenco` (Audiolivros e leitura, F2;
-- `docs/specs/2026-10-31-audiolivros-e-leitura.md` §9.1). Constantes `FLAG_AUDIOLIVROS*` em `src/core/planos.ts`.
--   - `audiolivros`: "Ouvir" com o áudio pré-gerado do catálogo (R2, `VITE_AUDIO_URL`) e o destaque por frase.
--   - `audiolivros_nuvem`: voz natural para livro próprio, com consentimento (exige `voz_natural` e `vozNatural`).
--   - `audiolivros_elenco`: voz por personagem no áudio do catálogo e no narrador (exige `audiolivros`).
-- NASCEM DESLIGADAS, SEM REGRA DE PLANO (`regras = '{}'`). Desligada = nenhum chunk, rota ou requisição ao CDN novo.
-- Semente idempotente (`ON CONFLICT DO NOTHING`): rodar de novo não desliga o que o operador ligou. Ligar é ato do dono.
-- Par SQLite: `migrations-sqlite/0058_flags_audiolivros.sql`.
-- REVERSÃO: `DELETE FROM flags WHERE chave IN ('audiolivros', 'audiolivros_nuvem', 'audiolivros_elenco')` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'audiolivros',
  'Audiolivros (F2): o "Ouvir" toca o áudio pré-gerado do catálogo (voz sintetizada, rotulada) com a frase destacada; sem áudio íntegro, a voz do aparelho lê. Só para quem vê o livro. Desligada, nada novo carrega. Ligar é ato do dono, depois do piloto aprovado.',
  false, '{}', NULL, 1793600000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'audiolivros_nuvem',
  'Audiolivros: voz natural da nuvem para o livro da própria pessoa, com consentimento por livro. Exige voz_natural e o direito vozNatural do plano, e o contrato de retenção zero do provedor (G7). Ligar é ato do dono.',
  false, '{}', NULL, 1793600000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'audiolivros_elenco',
  'Audiolivros: voz por personagem no áudio do catálogo e no narrador. Exige audiolivros; independe de avatar_3d. Nasce desligada até a F3 (gold set e timbres medidos). Ligar é ato do dono.',
  false, '{}', NULL, 1793600000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
