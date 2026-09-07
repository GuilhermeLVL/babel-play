## 1. Lista derivada do schema

- [ ] 1.1 Em `conta.ts`, construir `TABELAS_DO_TITULAR` a partir de `server/db/schema.ts` (toda tabela com coluna `user_id`), com a ordem de FK declarada em um unico lugar
- [ ] 1.2 Incluir `seed_credits`, `credit_purchases`, `credit_spends`, `presencas`, `anki_note_media` (antes de `anki_media`), `anki_media`
- [ ] 1.3 Apagar tambem `usage_counters WHERE user_id = 'u:<id>'` (rate-limit)
- [ ] 1.4 `tests/integration/tabelas-do-titular.test.ts`: falha se existir tabela com `user_id` fora da lista

## 2. Exportacao e exclusao completas

- [ ] 2.1 `GET /api/me/exportar` inclui as 6 tabelas
- [ ] 2.2 `DELETE /api/me` apaga as 6 tabelas e as linhas `u:<id>`; `linhasPorTabela` lista todas
- [ ] 2.3 `tests/integration/lgpd-conta.test.ts`: fixture com uma linha por tabela; assercao de zero por tabela apos excluir

## 3. Dado do titular fora do servidor

- [ ] 3.1 Remover `reviewLogs`/`setReviewLogs` e `localStorage['reviewLogs']` de `src/components/views/Study.tsx`
- [ ] 3.2 Se alguma tela lia esse historico, passar a ler `review_logs` (servidor) ou `revisoes` (efemero)

## 4. Verificacao

- [ ] 4.1 `npm test` verde; colar a saida de `lgpd-conta` e `tabelas-do-titular` no PR
