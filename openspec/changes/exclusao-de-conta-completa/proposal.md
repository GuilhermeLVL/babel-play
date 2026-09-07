## Why

`DELETE /api/me` promete apagar a conta (LGPD art. 18, VI) e deixa dado do titular de pe. `server/db/repositories/conta.ts:27-52` (`TABELAS_DO_TITULAR`) nao inclui `seed_credits` (`schema.ts:337`), `credit_purchases` (`:365`), `credit_spends` (`:386`), `presencas` (`:399`), `anki_media` (`:700`) e `anki_note_media` (`:721`); e as linhas de rate-limit em `usage_counters` sao gravadas com `user_id='u:<id>'` (`server/lib/rateLimitStore.ts:28-32`), fora do `WHERE user_id = <id>` (`conta.ts:184`). A exportacao (`GET /api/me/exportar`) tem a mesma lista e por isso tambem omite essas tabelas. No cliente, `src/components/views/Study.tsx:121-135,194,256` guarda `reviewLogs` (cardId, palavra, nota, data) em `localStorage` sem teto e fora de qualquer exportacao ou exclusao. Achado A06 e A36 de `openspec/audits/2026-09-07-coerencia.md`.

## What Changes

- `TABELAS_DO_TITULAR` passa a ser derivada do schema: toda tabela com coluna `user_id` entra, na ordem de FK (filhos antes de pais), e um teste de invariante falha quando uma tabela nova com `user_id` nao esta na lista.
- Exclusao e exportacao cobrem as 6 tabelas e as linhas `u:<id>` de `usage_counters`.
- `Study.tsx` deixa de manter `reviewLogs` em `localStorage`; o historico de revisao e o do servidor (`review_logs`) e do efemero (`revisoes`).
- Relatorio de exclusao (`RelatorioDeExclusao.linhasPorTabela`) lista todas as tabelas, inclusive as com zero linhas.

## Capabilities

### New Capabilities
- `exclusao-e-exportacao-completas`: a conta inteira, definida pelo schema, e o que sai e o que se apaga.

## Impact

- `server/db/repositories/conta.ts` (lista derivada + ordem de FK explicita)
- `server/lib/rateLimitStore.ts` (prefixo `u:` documentado e coberto pela exclusao) ou `conta.ts` apaga `user_id IN (<id>, 'u:<id>')`
- `src/components/views/Study.tsx` (remove `reviewLogs` local)
- `tests/integration/lgpd-conta.test.ts` (uma assercao por tabela, contagem zero apos excluir; exportacao contem todas as chaves)
- Novo `tests/integration/tabelas-do-titular.test.ts` (invariante: schema x lista)
- Remove: estado `reviewLogs` e chave `localStorage['reviewLogs']`

## Pronto quando

`tests/integration/lgpd-conta.test.ts` prova, para um usuario com uma linha em CADA tabela com `user_id`, que apos `DELETE /api/me` todas contam zero e a exportacao anterior continha todas; `tests/integration/tabelas-do-titular.test.ts` falha se o schema ganhar uma tabela com `user_id` fora da lista. `npm test` verde.

## Dependencias e paralelismo

Depende de `linha-de-base-verde`. Paralelizavel com todas as outras (toca so `conta.ts`, `Study.tsx` e testes).
