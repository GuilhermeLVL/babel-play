-- UM CAMPO POR EIXO DE IDIOMA (auditoria de 2026-09-07, achado A38).
--
-- O idioma que a pessoa estuda era gravado em TRÊS lugares: `settings.target_language` (a tela de
-- Ajustes), `settings.ui.captureTargetLang` (a Captura) e `settings.ui.praticaLang` (a tela de
-- jogos). Três escritas não atômicas do mesmo fato divergem, e divergiram: no banco medido,
-- `target_language = 'pt-BR'` convivia com `ui.praticaLang = 'en'` na mesma linha — cada tela lia
-- um campo diferente e mostrava um idioma diferente.
--
-- Esta migração consolida em `target_language` e apaga os espelhos do blob. A leitura dos espelhos
-- continua no cliente como FALLBACK (`langConfigFrom`), porque o modo anônimo guarda settings no
-- IndexedDB, onde migração SQL nenhuma chega; o que muda é que ninguém mais os ESCREVE.
--
-- Sem `down`: o projeto não tem migrations de reversão (nenhuma das 22 anteriores tem), e
-- reconstruir três campos a partir de um seria inventar a divergência de volta.

-- 1. Linha sem alvo herda o espelho mais específico que existir. Sem isto, apagar os espelhos
--    perderia a escolha de quem só passou pela Captura ou pela tela de jogos.
UPDATE settings
SET target_language = COALESCE(
      json_extract(ui, '$.captureTargetLang'),
      json_extract(ui, '$.praticaLang')
    ),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE target_language IS NULL
  AND ui IS NOT NULL AND json_valid(ui)
  AND COALESCE(json_extract(ui, '$.captureTargetLang'), json_extract(ui, '$.praticaLang')) IS NOT NULL;
--> statement-breakpoint

-- 2. O DESEMPATE, quando os dois existem e discordam: vence o que NÃO é o próprio idioma da
--    pessoa. "Estudo o idioma que eu já falo" não é uma escolha, é o resíduo de uma gravação
--    automática — foi exatamente o estado encontrado no banco real ('pt-BR' de alvo para quem fala
--    português, com 'en' na tela de jogos). Quando os dois são idiomas estrangeiros, o campo
--    explícito de Ajustes é mantido.
UPDATE settings
SET target_language = json_extract(ui, '$.praticaLang'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE ui IS NOT NULL AND json_valid(ui)
  AND json_extract(ui, '$.praticaLang') IS NOT NULL
  AND target_language IS NOT NULL
  AND json_extract(ui, '$.captureSourceLang') IS NOT NULL
  AND substr(lower(target_language), 1, 2) = substr(lower(json_extract(ui, '$.captureSourceLang')), 1, 2)
  AND substr(lower(json_extract(ui, '$.praticaLang')), 1, 2) <> substr(lower(json_extract(ui, '$.captureSourceLang')), 1, 2);
--> statement-breakpoint

-- 3. Os espelhos saem do blob. A partir daqui existe UM campo para o alvo.
UPDATE settings
SET ui = json_remove(ui, '$.captureTargetLang', '$.praticaLang'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE ui IS NOT NULL AND json_valid(ui)
  AND (json_extract(ui, '$.captureTargetLang') IS NOT NULL OR json_extract(ui, '$.praticaLang') IS NOT NULL);
