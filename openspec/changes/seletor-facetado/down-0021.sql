-- Rollback de 0021: restaura a agenda falsa (que era, por construção, o carimbo do import).
UPDATE vocab_cards
   SET due_at = added_at
 WHERE due_at IS NULL
   AND (reps IS NULL OR reps = 0)
   AND EXISTS (SELECT 1 FROM vocab_occurrences o
                WHERE o.card_id = vocab_cards.id AND o.origin_kind = 'anki');
