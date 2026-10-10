-- FLAG `anuncios` (change `planos-v3-e-rota-inteligente`, grupo 11; `design.md` §7 e §11.13) —
-- `docs/flags.md`, `src/core/anuncios/politicaDeAnuncio.ts`, `src/components/anuncios/EspacoDeAnuncio.tsx`.
--
-- O interruptor dos ANÚNCIOS NO GRÁTIS. É a primeira regra da política (`podeMostrar`): desligada, nenhum
-- espaço de anúncio renderiza e nada é pedido a terceiros. Ligada, a política ainda nega para plano com
-- `semAnuncios`, teste de 14 dias, perfil protegido, headset, edição estática, tela ocupada (captura,
-- intérprete, rodada), conta com menos de três dias e quem não deu o consentimento de anúncios.
--
-- NASCE DESLIGADA, e ligar NÃO BASTA: nesta etapa não existe provedor de anúncios de produção (nenhuma
-- rede, nenhum script de terceiro, nenhum host na CSP). Ligar sem provedor não mostra nada. Abrir de
-- verdade pede domínio próprio, rede escolhida, o ajuste da CSP por configuração e a consulta jurídica
-- (ECA Digital, Lei 15.211/2025): é ato do dono.
--
-- SEM REGRA DE PLANO (`regras = '{}'`): quem tira o anúncio é o entitlement `semAnuncios`, conferido pela
-- política, não a flag. Percentual e idioma podem ser usados para abrir aos poucos.
--
-- NÃO É GUARDA DE SEGURANÇA nem de cota: a recompensa de um anúncio premiado, quando existir, é creditada
-- e limitada pelo servidor.
--
-- Mesmo molde da 0036/0040/0046/0048: SEMENTE IDEMPOTENTE (`INSERT OR IGNORE`) — rodar de novo não
-- desliga o que o operador já ligou. Aditiva (expand): só dado; o código anterior não lê a chave.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'anuncios'` — flag ausente é desligada (como nasce).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'anuncios',
  'Anúncios no Grátis: libera os espaços de anúncio para quem a política permite. Sem provedor de produção nesta etapa: ligada, ainda não mostra nada. Ligar é ato do dono (domínio, rede, CSP e consulta jurídica). Sai quando os anúncios forem parte fixa do Grátis, ou se a ideia for abandonada.',
  0, '{}', NULL, 1790840000000, 'semente'
);
