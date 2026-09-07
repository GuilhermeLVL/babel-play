## 1. Specs principais a partir do codigo

- [x] 1.1 `openspec/specs/ciclo-do-usuario/spec.md` (identidade, porta, onboarding por edicao, rotas) — fontes: `src/lib/identidade.ts`, `exigeConta.ts`, `App.tsx:722-740`, `rotas.ts`
- [x] 1.2 `openspec/specs/conteudo-e-trilha/spec.md` (trilha por fetch, Anki acervo + projecao, sessao → bulk-add, chave de dedup) — `carregar.ts`, `import.ts`, `vocab.ts`
- [x] 1.3 `openspec/specs/rodada-e-fsrs/spec.md` (rodada montada no cliente, `para-jogo` ordena/corta, `aoTerminar`, `gradeFor`, `writesSrs`) — `Play.tsx:717-995,1125-1294`, `grade.ts`, `vocab.ts:711-751`
- [x] 1.4 `openspec/specs/economia/spec.md` (saldo derivado, credito idempotente, gasto autorizado, posse) — `xp.ts`, `metrics.ts`, `economiaAutoridade.ts`
- [x] 1.5 `openspec/specs/i18n/spec.md` (tres eixos, onde cada um vive) — `langConfig.ts`, `i18n.ts`, `settings`
- [x] 1.6 `openspec/specs/modo-anonimo/spec.md` (efemero, 501 EXIGE_CONTA, migracao) — `servidor.ts`, `migracao.ts`
- [x] 1.7 `openspec/specs/planos-e-billing/spec.md` (PLAN_MATRIX, entitlements, webhook) — `planos.ts`, `entitlements.ts`, `billing.ts`

## 2. Sincronizar e arquivar

- [x] 2.1 Para cada change concluida (17), `openspec archive -y` (o CLI desta versao faz o sync dos deltas no proprio archive) → `openspec/changes/archive/2026-09-07-*`. Dois deltas `MODIFIED` sem spec base (`trilha-multi-idioma/procedencia-do-nivel`, `filtro-facetado-chega-ao-servidor`) viraram `ADDED`.
- [x] 2.2 Apagar `openspec/changes/imersao-aquatica-nextgen/`
- [x] 2.3 Nas 13 changes com tarefa pendente (a contagem da proposta era 12), nota no topo do `tasks.md` com o estado real e o achado da auditoria que a afeta. `auditoria-i18n-v1` e `economia-legivel-e-moedas` nao tinham delta e nao validavam: ganharam um delta minimo (o segundo com os invariantes de `tests/passe.test.ts`).

## 3. Documentos

- [x] 3.1 `docs/arquitetura.md`: cabecalho aponta para `openspec/specs/`; remover diagramas desatualizados ou datar
- [x] 3.2 `AUDITORIA-ESTADO.md`: remover ou corrigir a tabela de migrations
- [x] 3.3 `CONTRIBUTING.md`: regra "change concluida = arquivada no mesmo PR"

## 4. Verificacao

- [x] 4.1 `openspec validate --all` passa; `openspec list` mostra so changes abertas. Pendencia registrada: as specs criadas pelo archive ficam com `## Purpose` = TBD (texto do CLI); preencher quando cada capacidade for tocada.
