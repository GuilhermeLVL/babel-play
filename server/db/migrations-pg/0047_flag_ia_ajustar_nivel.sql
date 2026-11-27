-- FLAG `ia_ajustar_nivel` (openspec leitura-assistida, fatia D): constante `FLAG_IA_AJUSTAR_NIVEL` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- Número 0047 (reservado a esta fatia; o integrador renumera se outra frente usar antes). Semente idempotente. Par SQLite: 0086.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'ia_ajustar_nivel'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'ia_ajustar_nivel',
  'Flag `ia_ajustar_nivel` (openspec leitura-assistida, fatia D): a pessoa reescreve uma palavra, um trecho, um paragrafo ou um capitulo de A1 a C2 com IA, com o original ao lado; preserva as palavras que ela ja conhece (ate 300 formas, so palavras) e mede o nivel com o classificador local. O servidor nao guarda o texto (retencao zero), a saida passa pelo filtro de perfil protegido e o cache fica so no aparelho. Cotas `ajustesDeNivelMes` e `ajustesDeCapituloMes` (0 no Gratis e no convidado). Desligada, nada muda e nenhuma rota e chamada. Ligar e ato do dono, depois de medir custo e acerto de nivel.',
  false, '{}', NULL, 1795616225198, 'semente')
  ON CONFLICT (chave) DO NOTHING;
