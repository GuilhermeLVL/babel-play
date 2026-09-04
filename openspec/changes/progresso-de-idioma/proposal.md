## Why

A matéria-prima do progresso de idioma já é gravada e NÃO agregada: `vocab_cards.
difficultyScore/lapses/reps`, `review_logs` completo (grade, estabilidades, elapsed),
`exercise_results` (attempts/ms/hinted), `utterances.source` ('mic'=ativo, 'tab'=passivo).
Duas consequências: o usuário não vê suas palavras difíceis nem seu tempo ATIVO de fala
(`speakingMs` soma mic e tab sem distinção — defeito real), e os exercícios não usam a
dificuldade medida.

## What Changes

- `computeProfile`: split ativo/passivo do tempo de fala; ranking das N palavras mais difíceis
  (lapses + difficultyScore + grade médio); acerto por tipo de exercício.
- Minhas Palavras: painel "Suas palavras difíceis"; jogos podem puxar o ranking como fonte.
- Relatório de sessão/semana gerado dos dados reais, exportável em texto; iChat pode narrar
  por cima (opcional, nunca obrigatório).
