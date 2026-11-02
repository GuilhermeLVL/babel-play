-- FLAG `voz_no_aparelho` (openspec voz-no-aparelho): a voz de alta qualidade no aparelho (Supertonic 3 no navegador).
-- `FLAG_VOZ_NO_APARELHO`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Ligar é ato do dono.
-- Semente idempotente (`INSERT OR IGNORE`): rodar de novo não desliga o que o operador ligou. Aditiva: só dado.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'voz_no_aparelho'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'voz_no_aparelho',
  'Voz de alta qualidade no aparelho (Supertonic 3): a narração de qualquer livro com uma voz sintetizada que roda no navegador, depois de a pessoa baixar o modelo (~401 MB). Nunca para perfil protegido, celular ou iOS. Ligar é ato do dono, depois da revisão jurídica da licença OpenRAIL-M e de publicar os pesos no R2.',
  0, '{}', NULL, 1793700000000, 'semente'
);
