## Why

O schema declara tabelas e colunas que nenhum codigo le ou escreve, e uma funcao de dado que nunca roda (achados A35, A53 de `openspec/audits/2026-09-07-coerencia.md`; SQL na copia do banco real):

- `analyses` (`schema.ts:408`): 0 operacoes em `server/`, 0 linhas; `CachedAnalysis` (`contract.ts:34-35`) diz "na web vai para `analyses`" e nunca foi.
- `profiles` (`schema.ts:425`): 0 operacoes, 0 linhas; `settings.active_profile_id` (`:469`) aponta para ela; os perfis reais vivem em `src/gateway/profiles.ts`.
- `anki_media` e `anki_note_media` (`schema.ts:700,721`, migration `0018`): 0 operacoes; `server/lib/ankiMidia.ts` inteiro sem importador; `motor-anki-midia` com 14 tarefas abertas.
- `vocab_cards.frequency` (`schema.ts:105`, `@deprecated`): nunca escrita (EXEC 0/2.818) e ainda preenchida pelo cliente (`api.ts:393`).
- `vocabRepo.recalcularDificuldade` (`vocab.ts:443`) nao tem rota: `difficulty_score` e NULL em 100% dos cartoes (EXEC), `palavrasDificeis` e sempre `[]`, e o recorte "dificeis" e a estrategia `em-dificuldade` nunca selecionam nada.
- `memory_embeddings` ja foi removida pelo mesmo motivo (`schema.ts:417-423`); a regra "schema nao e lugar de intencao" existe e nao e aplicada.

## What Changes

Pergunta 5 do relatorio decide por tabela; sem decisao, o padrao e remover (a mesma regra de `memory_embeddings`):

- `analyses`: remover (e `CachedAnalysis` sai de `contract.ts`) ou implementar `POST /api/sessions/:id/analysis`.
- `profiles`: remover e mover `settings.active_profile_id` para `ui` (perfis sao codigo em `src/gateway/profiles.ts`).
- `anki_media`/`anki_note_media`/`ankiMidia.ts`: concluir a negociacao de upload (`motor-anki-midia` F6b: rota `POST /api/anki/decks/:id/midia`, cota via `usageCountersRepo`, `somarBytesEmDisco` incluindo midia) ou remover as tres com `down` manual.
- `vocab_cards.frequency`: parar de preencher no cliente; marcar como coluna morta com teste que garante 0 escritas (SQLite nao remove coluna sem recriar a tabela — decisao registrada).
- `recalcularDificuldade`: ligar a um gatilho (apos `addRodada`, em lote, para os `cardId` da rodada; e job por usuario a cada N revisoes) ou remover junto com a faceta "dificeis", `cortesDeFaixa`, `distribuicaoDeDificuldade` e `GET /vocab/distribuicao-dificuldade`.
- Teste de invariante: toda tabela do schema tem ao menos um leitor e um escritor em `server/` (varredura de `.from(`/`.insert(`/`INSERT INTO`).

## Capabilities

### New Capabilities
- `schema-e-so-o-que-o-codigo-usa`: nenhuma tabela ou coluna sem leitor e escritor.

## Impact

- `server/db/schema.ts`, migration `002x_*` (remocoes/renomeacoes), `server/db/repositories/{conta,tenancy,vocab,exerciseResults}.ts`, `server/lib/ankiMidia.ts`, `server/routes/{anki,vocab,exercises}.ts`, `src/core/learning/contract.ts`, `src/data/api.ts`, `src/components/views/Play.tsx` (faceta dificeis)
- Novo `tests/integration/schema-usado.test.ts`
- Remove: as tabelas decididas, `CachedAnalysis`, `frequency` no cliente, `distribuicao-dificuldade` se a dificuldade sair

## Pronto quando

`schema-usado.test.ts` verde; `EXPLAIN`/SQL na base de teste sem tabela vazia sem operacao; se a dificuldade ficar, `f3-rodada` prova que uma rodada altera `difficulty_score` dos cartoes jogados e `palavrasDificeis` deixa de ser sempre vazio.

## Dependencias e paralelismo

Depende de `linha-de-base-verde`, da pergunta 5 e de `contratos-alinhados-nas-tres-pontas` (tipos). Paralelizavel com `idioma-alvo-e-ui-respeitados` e `replica-sem-estado-local-e-config-completa`.
