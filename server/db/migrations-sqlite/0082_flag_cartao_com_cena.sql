-- FLAG `cartao_com_cena` (openspec cartao-com-captura-de-tela): constante `FLAG_CARTAO_COM_CENA` em `src/core/planos.ts`.
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Número 0082 (renumerado na integração da Onda 4).
-- Semente idempotente (`INSERT OR IGNORE`). Aditiva: só dado. Par PG: 0043.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'cartao_com_cena'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'cartao_com_cena',
  'Flag `cartao_com_cena` (openspec cartao-com-captura-de-tela): a pessoa ADULTA guarda um quadro da tela compartilhada no cartão, depois de ver e cobrir o que quiser, SÓ NESTE APARELHO (IndexedDB, teto de 100 MB); nada sobe ao servidor nem à IA. Fora do perfil protegido (menor ou idade não declarada não vê o botão). Desligada, nada muda. Ligar é ato do dono, depois do ROPA e de uma semana de uso em vídeo real.',
  0, '{}', NULL, 1794800002017, 'semente'
);
