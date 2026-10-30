-- FLAGS `avatar_3d`, `avatar_sinais` e `avatar_elenco` (avatares no Frasy, M0; `docs/specs/2026-10-28-avatar-interprete.md`).
--   - `avatar_3d`: a base. Meu avatar, avatar do intérprete e do PiP, com fallback 2D (foto/iniciais).
--   - `avatar_sinais`: soletração de nomes e palavras sem sinal, rotulada como demonstração. Nunca "tradução para Libras".
--   - `avatar_elenco`: narrador e personagens nos livros (depende das frentes de Livros).
-- NASCEM DESLIGADAS, SEM REGRA DE PLANO: avatar não é direito de plano nem cota. Ligar é ato do dono.
-- Semente idempotente (`ON CONFLICT DO NOTHING`): rodar de novo não desliga o que o operador ligou.
-- REVERSÃO: `DELETE FROM flags WHERE chave IN ('avatar_3d', 'avatar_sinais', 'avatar_elenco')` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'avatar_3d',
  'Avatares (M1 a M4): o avatar da pessoa (Ajustes, perfil) e o do intérprete e do PiP, em 3D carregado sob demanda, com fallback 2D e modo economia. O arquivo "traga o seu" nunca vai ao servidor. Desligada, nada muda. Ligar é ato do dono, depois do staging e do parecer sobre licenças.',
  false, '{}', NULL, 1793500000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'avatar_sinais',
  'Avatares: soletração de nomes e palavras sem sinal, sempre rotulada como demonstração (sem promessa de tradução para Libras). Exige avatar_3d. Ligar só depois da revisão por pessoas surdas; ato do dono.',
  false, '{}', NULL, 1793500000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'avatar_elenco',
  'Avatares: narrador e personagens nos livros (quem fala e com que emoção, mapa personagem para voz, painel do elenco). Exige avatar_3d. Nasce desligada até as frentes de Livros e o juiz de qualidade. Ligar é ato do dono.',
  false, '{}', NULL, 1793500000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
