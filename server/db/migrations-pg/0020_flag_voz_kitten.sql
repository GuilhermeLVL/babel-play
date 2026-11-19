-- FLAG `voz_kitten` (openspec voz-natural-no-aparelho-kitten): a voz natural no aparelho (Kitten TTS 2 no navegador, Web
-- Worker + onnxruntime-web, pesos em `VITE_VOZ_KITTEN_URL`). Constante `FLAG_VOZ_KITTEN` em `src/core/harness/vozKitten.ts`.
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Desligada = nenhum chunk do motor, nenhuma requisição aos pesos e
-- a ordem de quem lê de antes. Semente idempotente (`ON CONFLICT DO NOTHING`). Par SQLite: 0062.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'voz_kitten'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'voz_kitten',
  'Voz natural no aparelho (Kitten TTS 2, Apache-2.0): a voz grátis de qualidade que roda no navegador (mini ~90 MB no computador, pico ~10 MB por idioma no celular), baixada por idioma quando a pessoa pede. Serve todo perfil, inclusive o protegido (licença Apache, fonetizador próprio sem GPL). Ligada, a ordem de quem lê vira: voz natural no aparelho, voz boa do sistema, nenhuma (o texto fica na tela). Ligar é ato do dono, depois de publicar os pesos no R2 (VITE_VOZ_KITTEN_URL).',
  false, '{}', NULL, 1794800000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
