-- F3-03: anula `session_id` que não aponta para nenhuma sessão. São sentinelas
-- ('trilha:en', 'anki:teste.apkg') gravados antes do saneamento do bulkAdd; a procedência
-- real vive em `vocab_occurrences.origin_kind`, então anular não perde informação.
-- Precede a declaração das FOREIGN KEY (0011) — com as 46 linhas, a recriação falharia.
UPDATE `vocab_cards` SET `session_id` = NULL
WHERE `session_id` IS NOT NULL
  AND `session_id` NOT IN (SELECT `id` FROM `sessions`);
