-- Rollback MANUAL da migração 0018 (motor-anki-midia).
--
-- Mesma política do 0017 (motor-anki-acervo): sem rollback automático no repositório (Decisão 7
-- do design.md daquele change), então este script é `DROP TABLE` simples porque as duas tabelas
-- são ADITIVAS — nenhuma tabela existente foi alterada. Dados gravados em
-- anki_media/anki_note_media são perdidos por este script; rode um backup do arquivo SQLite
-- antes. Este rollback NÃO apaga os objetos já gravados no storage
-- (`anki-media/<userId>/<sha256>`) — isso é limpeza de disco/bucket, fora do escopo de uma
-- migração de banco.
--
-- Ordem: filhos antes dos pais, por causa das FKs (anki_note_media -> anki_notes,
-- anki_note_media -> anki_media). `anki_media` não referencia nada, então vem por último.

DROP TABLE IF EXISTS `anki_note_media`;
DROP TABLE IF EXISTS `anki_media`;
