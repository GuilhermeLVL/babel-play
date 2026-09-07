-- Rollback MANUAL da migração 0017 (motor-anki-acervo).
--
-- O repositório não tem rollback automático (Decisão 7 do design.md): zero migrações `down`
-- existentes, e a política adotada aqui é `DROP TABLE` simples porque as três tabelas são
-- ADITIVAS — nenhuma tabela existente foi alterada, então reverter é seguro ANTES de haver
-- adoção (dados gravados em anki_decks/anki_notes/anki_imports são perdidos por este script;
-- rode um backup do arquivo SQLite antes, como a política de deploy manda).
--
-- Ordem: filhos antes dos pais, por causa das FKs (anki_notes -> anki_decks,
-- anki_imports -> anki_decks; anki_notes.projected_card_id -> vocab_cards, mas vocab_cards
-- nunca é tocada por este rollback).

DROP TABLE IF EXISTS `anki_notes`;
DROP TABLE IF EXISTS `anki_imports`;
DROP TABLE IF EXISTS `anki_decks`;
