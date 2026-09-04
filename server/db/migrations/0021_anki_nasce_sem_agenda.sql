-- Palavra importada do Anki que NUNCA foi respondida deixa de contar como vencida.
--
-- O import carimbava `due_at = now`, então todo cartão nascia "pedindo revisão" no mesmo instante
-- em que entrava. No acervo medido: 2.222 de 2.225 com `reps = 0` (nunca respondidos) e ainda
-- assim vencidos — a tela anunciava revisão de material nunca visto e a faceta "Nunca vistas"
-- mostrava zero. `projetarDoAnki` passou a gravar NULL; esta migração alcança o que já entrou.
--
-- As duas condições juntas identificam SÓ o cartão intocado desde o import: `reps = 0` (nenhuma
-- resposta registrada) E `due_at = added_at` (a agenda ainda é o carimbo do import, nunca foi
-- reagendada por uma rodada). Quem já jogou mantém a agenda que conquistou.
-- Reversível: o valor descartado era exatamente `added_at` (ver down.sql da change).
UPDATE vocab_cards
   SET due_at = NULL
 WHERE due_at IS NOT NULL
   AND due_at = added_at
   AND (reps IS NULL OR reps = 0)
   AND EXISTS (
     SELECT 1 FROM vocab_occurrences o
      WHERE o.card_id = vocab_cards.id AND o.origin_kind = 'anki'
   );
