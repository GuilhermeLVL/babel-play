# Ordem de execucao — changes da auditoria de 2026-09-07

Origem: `openspec/audits/2026-09-07-coerencia.md`. Cada change tem `proposal.md` (por que, o que muda, impacto, pronto quando, dependencias), `tasks.md` e `specs/*/spec.md`. Nada foi implementado; a primeira change so comeca apos aprovacao humana.

Regras: P0 primeiro; depois consolidacoes que destravam varias correcoes; changes que tocam os mesmos arquivos nao rodam em paralelo; toda change termina com a lista de "Pronto quando" executada e colada no PR.

## Ondas

| Onda | Change | Prioridade | Depende de | Paralelo com | Perguntas de produto |
|---|---|---|---|---|---|
| 0 | `linha-de-base-verde` | P0 (bloqueia tudo) | — | ninguem | 1 (camada nao rastreada) |
| 1 | `exclusao-de-conta-completa` | P0 | onda 0 | toda a onda 1 | — |
| 1 | `webhook-asaas-sem-pagamento-perdido` | P0 | onda 0 | toda a onda 1 (migration numerada na ordem de merge) | — |
| 1 | `spec-vigente-do-codigo` | fundacao | onda 0 | toda a onda 1 (so documentos) | — |
| 1 | `filtro-facetado-chega-ao-servidor` | P1 (pequena) | onda 0 | toda a onda 1; antes de `jogos-culturais` | — |
| 1 | `idioma-alvo-e-ui-respeitados` | P1 | onda 0 | toda a onda 1 exceto `arranque-leve` | 7 (seletor de UI) |
| 1 | `replica-sem-estado-local-e-config-completa` | P1 | onda 0 | toda a onda 1; coordenar `config.ts` com `servicos-sem-duplicata` | — |
| 1 | `jogos-culturais-dentro-do-sistema` | P0 | onda 0, `filtro-facetado` | toda a onda 1 | 6 (integrar ou retirar) |
| 2 | `contratos-alinhados-nas-tres-pontas` | P1 (destrava 4) | onda 0 | `posse-de-cosmeticos` | — |
| 2 | `posse-de-cosmeticos-uma-regua` | P1 (destrava economia) | onda 0 | `contratos-alinhados` | 8 (Cofre e canais) |
| 3 | `seeds-e-creditos-fonte-unica` | P0/P1 | `posse-de-cosmeticos`, `contratos-alinhados` | `servicos-sem-duplicata`, `schema-sem-tabela-orfa` | 3, 9 (rombo e creditos historicos) |
| 3 | `servicos-sem-duplicata` | P1 | `contratos-alinhados` | `seeds-e-creditos`, `schema-sem-tabela-orfa` | — |
| 3 | `schema-sem-tabela-orfa` | P2 | `contratos-alinhados` | `seeds-e-creditos`, `servicos-sem-duplicata` | 5 (analyses, profiles, anki_media) |
| 4 | `modo-anonimo-em-paridade` | P1 | `contratos-alinhados`, `seeds-e-creditos` | `arranque-leve` | 4 (manter a leve) |
| 4 | `arranque-leve-e-payloads-enxutos` | P1/P2 | `contratos-alinhados`, `seeds-e-creditos`, `idioma-alvo` | `modo-anonimo` | — |
| 5 | `codigo-morto-removido` | P2 | todas | ninguem | — |

## Conflitos de arquivo (por que nao paralelizar)

- `src/data/api.ts`, `server/db/repositories/metrics.ts`: `contratos-alinhados` → `seeds-e-creditos` → `arranque-leve` (nesta ordem).
- `src/components/views/Play.tsx`, `src/core/minigames/composicao.ts`: `filtro-facetado` antes de `jogos-culturais`.
- `src/components/views/Metrics.tsx`: `idioma-alvo` antes de `arranque-leve`.
- `server/lib/config.ts`: `replica-sem-estado-local` declara; `servicos-sem-duplicata` consome.
- `server/validation.ts`: `contratos-alinhados` define o envelope; `servicos-sem-duplicata` adiciona schemas.
- Migrations aditivas: `webhook-asaas` (billing_events), `seeds-e-creditos` (exercise_results.combo), `schema-sem-tabela-orfa` (remocoes) — numerar na ordem de merge; uma por change.

## Decisoes que travam changes (perguntas do relatorio, secao 6)

1. Camada nao rastreada → `linha-de-base-verde` (onda 0). Sem resposta, a saida padrao e (b) descartar e guardar em branch.
3 e 9. Rombo de Seeds e creditos historicos de passe → `seeds-e-creditos-fonte-unica`.
4. Manter a edicao leve → `modo-anonimo-em-paridade`.
5. Tabelas orfas → `schema-sem-tabela-orfa` (padrao: remover, como `memory_embeddings`).
6. Jogos culturais → `jogos-culturais-dentro-do-sistema` (padrao: retirar da grade ate integrar).
7. Seletor de idioma da UI → `idioma-alvo-e-ui-respeitados`.
8. Cofre e canais sem mecanica → `posse-de-cosmeticos-uma-regua` (padrao: itens sem canal saem).
2. Politica de branches e remotos: nao trava change; decidir antes do primeiro merge.

## O que cada change remove (entregaveis, nao efeito colateral)

- `linha-de-base-verde`: `three`, `@types/three`, 18 chaves orfas, (b) 10 caminhos nao rastreados.
- `exclusao-de-conta-completa`: `reviewLogs` em localStorage.
- `webhook-asaas`: os dois `break` silenciosos.
- `spec-vigente-do-codigo`: `imersao-aquatica-nextgen`, 17 changes para o archive, `AUDITORIA-ESTADO.md` (ou correcao).
- `posse-de-cosmeticos`: G2 e G3, `ALIAS_DE_ABA`, itens sem canal, `ICONES_SUITE_LUCIDE` sem alvo, chaves `babel.equipado.*` redundantes.
- `seeds-e-creditos`: `creditoId` com `Date.now()`, `amount`/`xp` do cliente, `babel.passe_*_creditados` como fonte.
- `contratos-alinhados`: `lerBaralhoAnki`, `LeituraAnki`, `NotaAnki`, `rowToVocabCard` manual, 8 formatos de erro.
- `modo-anonimo`: `chaveDedup` local do efemero.
- `jogos-culturais`: `MinigamesShowcase.tsx`, `JOGOS_CULTURAIS`, `_itemsProp`, locales cravados, clones de casca.
- `idioma-alvo`: `ui.captureTargetLang`/`ui.praticaLang` como fontes, defaults `'en'` implicitos.
- `servicos-sem-duplicata`: `tryOllamaChat`/`tryGroqChat`, `prepareLlmRequest` manual, `chatStream`, `POST /exercises/results`, 3 `baseLang`, 5 `readMeta`, `FiltroPersistido`, GRAMATICAIS duplicado.
- `replica-sem-estado-local`: `OLLAMA_URL` cravada, `seedIfEmpty` em modo publico.
- `schema-sem-tabela-orfa`: `analyses`, `profiles`, `anki_media*`/`ankiMidia.ts` (ou implementacao), `frequency` no cliente.
- `arranque-leve`: re-exports do catalogo, `fetchDeck` como fonte do lobby, segundo `fetchMetrics`.
- `codigo-morto-removido`: tudo que knip/madge/depcheck acusarem depois das demais.
