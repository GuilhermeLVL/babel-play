## 0. Decisao

- [ ] 0.1 Pergunta 5 respondida por tabela em `design.md` (remover | implementar), com `down.sql` manual para cada remocao

## 1. Tabelas

- [ ] 1.1 `analyses`: remover tabela, `CachedAnalysis`, entradas em `conta.ts`/`tenancy.ts` — ou implementar a rota
- [ ] 1.2 `profiles`: remover; `active_profile_id` migra para `ui`
- [ ] 1.3 `anki_media`/`anki_note_media`/`ankiMidia.ts`: concluir F6b (rota, cota, `somarBytesEmDisco`) ou remover

## 2. Colunas e funcoes

- [ ] 2.1 `frequency`: cliente para de preencher; teste de 0 escritas
- [ ] 2.2 `recalcularDificuldade`: gatilho apos `addRodada` + lote por usuario, ou remocao da faceta "dificeis" e das rotas associadas
- [ ] 2.3 `GET /vocab/distribuicao-dificuldade` e `GET /vocab/:id/ocorrencias`: ligar a uma tela ou remover

## 3. Invariante

- [ ] 3.1 `tests/integration/schema-usado.test.ts`: toda tabela tem leitor e escritor em `server/`
- [ ] 3.2 `npm test` verde; `drizzle-kit generate` sem drift
