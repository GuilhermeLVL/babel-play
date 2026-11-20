-- FLAG `voz_kitten` (openspec voz-natural-no-aparelho-kitten): a voz natural no aparelho (Kitten TTS 2 no navegador).
-- `FLAG_VOZ_KITTEN`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Ligar é ato do dono.
-- Semente idempotente (`INSERT OR IGNORE`): rodar de novo não desliga o que o operador ligou. Aditiva: só dado.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'voz_kitten'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'voz_kitten',
  'Voz natural no aparelho (Kitten TTS 2, Apache-2.0): a voz grátis de qualidade que roda no navegador (mini ~90 MB no computador, pico ~10 MB por idioma no celular), baixada por idioma quando a pessoa pede. Serve todo perfil, inclusive o protegido (licença Apache, fonetizador próprio sem GPL). Ligada, a ordem de quem lê vira: voz natural no aparelho, voz boa do sistema, nenhuma (o texto fica na tela). Ligar é ato do dono, depois de publicar os pesos no R2 (VITE_VOZ_KITTEN_URL).',
  0, '{}', NULL, 1794800000000, 'semente'
);
