-- FLAG `libras_vlibras` (piloto VLibras, só adultos; `docs/pesquisa/2026-10-29-vlibras-piloto.md`).
--   Sinais de apoio por um serviço EXTERNO do governo federal (widget VLibras). Só 18+ e com consentimento explícito da
--   pessoa; o texto selecionado vai ao serviço do governo. Rotulado como terceiro; nunca "tradução oficial".
-- NASCE DESLIGADA, SEM REGRA DE PLANO: não é direito de plano nem cota. Ligar é ato do dono (e exige `VLIBRAS_ATIVO=1`
-- no deploy, que abre a CSP só para os domínios do VLibras).
-- Semente idempotente (`ON CONFLICT DO NOTHING`): rodar de novo não desliga o que o operador ligou.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'libras_vlibras'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'libras_vlibras',
  'Piloto VLibras: botão "Sinais de apoio (VLibras)" no Intérprete, na Legendar e no leitor de livros, só para adultos com consentimento explícito. O texto selecionado é enviado a um serviço do governo federal (terceiro). Não substitui intérprete de Libras. Exige VLIBRAS_ATIVO=1 no deploy. Ligar é ato do dono, depois do parecer sobre licença do dicionário, termos e LGPD.',
  false, '{}', NULL, 1793600000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
