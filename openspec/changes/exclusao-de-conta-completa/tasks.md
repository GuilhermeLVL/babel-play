## 1. Lista derivada do schema

- [x] 1.1 Em `conta.ts`, a lista continua explicita (a ordem de FK nao se deduz do schema), mas `conferirCobertura()` compara com o schema no carregamento e lanca se faltar tabela com `user_id`; `secrets` e a unica tratada a parte, com motivo escrito (`TABELAS_TRATADAS_A_PARTE`)
- [x] 1.2 Incluidas `seed_credits`, `credit_purchases`, `credit_spends`, `presencas`, `anki_note_media` (antes de `anki_media` e de `anki_notes`), `anki_media` — e `billing_events`, que a invariante revelou fora da lista (tem `user_id` do pagador)
- [x] 1.3 `usage_counters` apagada tambem para `user_id = 'u:<id>'` (rate limit), via `chavesDoTitular`
- [x] 1.4 `tests/integration/tabelas-do-titular.test.ts`: falha se existir tabela com `user_id` fora da lista; confere ordem de FK

## 2. Exportacao e exclusao completas

- [x] 2.1 `GET /api/me/exportar` inclui as 7 tabelas novas (mesmo laco de `TABELAS_DO_TITULAR`)
- [x] 2.2 `DELETE /api/me` apaga as 7 tabelas e as linhas `u:<id>`; `linhasPorTabela` lista todas
- [x] 2.3 `tests/integration/lgpd-conta.test.ts`: fixture com uma linha por tabela (inclusive rate limit e billing_events); assercao de zero por tabela apos excluir; 10/10

## 3. Dado do titular fora do servidor

- [x] 3.1 Removidos `reviewLogs`/`setReviewLogs` e `localStorage['reviewLogs']` de `src/components/views/Study.tsx`
- [x] 3.2 Nenhuma tela lia a copia local (grep); o historico e `review_logs` (servidor) / `revisoes` (efemero)

## 4. Verificacao

- [x] 4.1 `npm test` verde (saida no PR); `typecheck`, `typecheck:core` e `lint` verdes
