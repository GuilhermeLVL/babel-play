## 1. Specs principais a partir do codigo

- [ ] 1.1 `openspec/specs/ciclo-do-usuario/spec.md` (identidade, porta, onboarding por edicao, rotas) — fontes: `src/lib/identidade.ts`, `exigeConta.ts`, `App.tsx:722-740`, `rotas.ts`
- [ ] 1.2 `openspec/specs/conteudo-e-trilha/spec.md` (trilha por fetch, Anki acervo + projecao, sessao → bulk-add, chave de dedup) — `carregar.ts`, `import.ts`, `vocab.ts`
- [ ] 1.3 `openspec/specs/rodada-e-fsrs/spec.md` (rodada montada no cliente, `para-jogo` ordena/corta, `aoTerminar`, `gradeFor`, `writesSrs`) — `Play.tsx:717-995,1125-1294`, `grade.ts`, `vocab.ts:711-751`
- [ ] 1.4 `openspec/specs/economia/spec.md` (saldo derivado, credito idempotente, gasto autorizado, posse) — `xp.ts`, `metrics.ts`, `economiaAutoridade.ts`
- [ ] 1.5 `openspec/specs/i18n/spec.md` (tres eixos, onde cada um vive) — `langConfig.ts`, `i18n.ts`, `settings`
- [ ] 1.6 `openspec/specs/modo-anonimo/spec.md` (efemero, 501 EXIGE_CONTA, migracao) — `servidor.ts`, `migracao.ts`
- [ ] 1.7 `openspec/specs/planos-e-billing/spec.md` (PLAN_MATRIX, entitlements, webhook) — `planos.ts`, `entitlements.ts`, `billing.ts`

## 2. Sincronizar e arquivar

- [ ] 2.1 Para cada change concluida (17), `openspec sync` dos deltas nas specs principais e `openspec archive`
- [ ] 2.2 Apagar `openspec/changes/imersao-aquatica-nextgen/`
- [ ] 2.3 Nas 12 changes com tarefa pendente, nota no topo do `tasks.md` com o estado real e o achado da auditoria que a afeta

## 3. Documentos

- [ ] 3.1 `docs/arquitetura.md`: cabecalho aponta para `openspec/specs/`; remover diagramas desatualizados ou datar
- [ ] 3.2 `AUDITORIA-ESTADO.md`: remover ou corrigir a tabela de migrations
- [ ] 3.3 `CONTRIBUTING.md`: regra "change concluida = arquivada no mesmo PR"

## 4. Verificacao

- [ ] 4.1 `openspec validate --all` passa; `openspec list` mostra so changes abertas
