-- FLAG `leitura_ativa` (openspec leitura-ativa-textos-simples): a tela "Leituras" (`/leitura`), textos curtos em inglês
-- para ouvir, ler em voz alta (reconhecimento só no aparelho) e responder perguntas. Constante `FLAG_LEITURA_ATIVA` em
-- `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Desligada = nenhum item no menu e a URL
-- `/leitura` cai no início. Semente idempotente (`ON CONFLICT DO NOTHING`): rodar de novo não desliga o que o operador
-- ligou. Par SQLite: 0062.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'leitura_ativa'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'leitura_ativa',
  'Leitura ativa: 12 textos curtos em inglês para ouvir, ler em voz alta com destaque ao vivo (o microfone só liga por toque e a voz não sai do aparelho) e responder 3 perguntas. Liga o microfone para menores: ligar é ato do dono, depois de validar as suposições do proposal.',
  false, '{}', NULL, 1794800000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
