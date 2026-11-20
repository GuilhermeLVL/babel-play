-- FLAG `voz_no_aparelho` (openspec voz-no-aparelho): a voz de alta qualidade no aparelho (Supertonic 3 no navegador, Web
-- Worker + onnxruntime-web, pesos em `VITE_VOZ_MODELO_URL`). Constante `FLAG_VOZ_NO_APARELHO` em `src/core/harness/vozNoAparelho.ts`.
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Desligada = nenhum chunk do motor e nenhuma requisição aos pesos.
-- Semente idempotente (`ON CONFLICT DO NOTHING`): rodar de novo não desliga o que o operador ligou. Par SQLite: 0060.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'voz_no_aparelho'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'voz_no_aparelho',
  'Voz de alta qualidade no aparelho (Supertonic 3): a narração de qualquer livro com uma voz sintetizada que roda no navegador, depois de a pessoa baixar o modelo (~401 MB). Nunca para perfil protegido, celular ou iOS. Ligar é ato do dono, depois da revisão jurídica da licença OpenRAIL-M e de publicar os pesos no R2.',
  false, '{}', NULL, 1793800000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
