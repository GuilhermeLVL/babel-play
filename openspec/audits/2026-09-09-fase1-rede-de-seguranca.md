# Fase 1 — Rede de segurança (entregável do Gate 1)

Rodada de saneamento, branch `saneamento/2026-09-08`. Nenhuma linha de produto foi alterada nesta
fase: ela só grava o comportamento que existe, para que as Fases 2 e 3 possam remover e mover com
prova. Onde um teste encontrou algo estranho, ele afirma o que acontece HOJE e leva um comentário
`// caracterizacao:` — a correção pertence à fase que a possui.

## 1. Fluxo crítico × tipo de teste

| Fluxo | HTTP (caracterização) | Snapshot de contrato | E2E 375/768/1280 | Banco |
|---|---|---|---|---|
| Cadastro e login | `auth-e-conta.test.ts`, `conta-self-host.test.ts` | `health.get`, `401`, `403-suspenso`, `me.get` | `login.e2e.ts` (pulado, motivo escrito) | — |
| Seleção de idioma | `idioma.test.ts` | `get.settings`, `put.settings`, `put.settings.400` | `idioma-da-interface.e2e.ts` | — |
| Sessão de jogo | `sessao-e-rodada.test.ts` | `post.exercises.rodada` + 6 | `sessao-de-jogo.e2e.ts` (Memória, Termo, Bao) | — |
| Atualização FSRS | `fsrs.test.ts` | `post.vocab.id.review` + 9 | `fsrs-revisao.e2e.ts` | `migracoes-sobre-estado-atual` |
| Crédito/débito de Seeds | `seeds.test.ts`, `seeds-concorrencia.test.ts` | `post.metrics.seeds.*` (10) | `seeds.e2e.ts`, `dois-dispositivos.e2e.ts` | `integridade-referencial` (existente) |
| Transcrição e tradução | `ia.test.ts` (upstream falso) | `post.api.ai.mt/stt/*` (16) | `transcricao.e2e.ts` (gravar: pulado) | — |
| Importação de deck | `importacao-anki.test.ts` | `post.api.import.anki` + 10 | `baralhos.e2e.ts` | — |
| Estatísticas | `estatisticas.test.ts` | `get.metrics.profile`, `get.metrics.xp` + 3 | `estatisticas.e2e.ts` | — |
| Tema e personalização | `tema-e-posse.test.ts` | `put.settings.item-nao-possuido`, `put.settings.tema-livre` | `tema.e2e.ts`, `quatro-superficies` | — |
| Limites por plano | `planos-e-quotas.test.ts` | `get.me.entitlements`, `get.me.uso`, `post.ai.mt.402` | `limites-anonimo.e2e.ts` (pulado, motivo escrito) | — |
| Ranking público | `rank.test.ts` | `get.rank.*`, `post.rank.*` (6) | — | — |
| Paridade com o modo sem conta | `paridade-de-forma.test.ts` | `paridade.faltando-no-espelho` | — | — |
| Migração e rollback | — | — | — | `fixture-sem-pii`, `migracoes-sobre-estado-atual`, `rollback-por-backup` |

## 2. Números

| Métrica | Antes (baseline 08/09) | Depois (09/09) | Comando |
|---|---:|---:|---|
| Testes vitest | 3.527 | 3.684 (+157) | `vitest run` |
| Arquivos de teste | 312 | 330 | idem |
| Cobertura de linhas | 42,8 % | 43,8 % | `npm run test:cov` |
| Cobertura de ramos | 34,5 % | 35,2 % | idem |
| Cobertura de funções | 36,7 % | 37,6 % | idem |
| Testes e2e | 26 (1 viewport) | 114 (38 × 3 viewports) | `matriz-e2e.sh` |
| Rotas sem caracterização | 85 de 85 | 0 (55 com teste, 30 justificadas) | `rotas-sem-caracterizacao.mjs` |
| Snapshots de contrato | 0 | 90 | `tests/caracterizacao/__snapshots__/` |

Matriz e2e por projeto: 33 passaram, 5 pulados, 0 falharam, ~133 s cada.

## 3. Portões novos no CI

- `npx vitest run --coverage` com piso (`vitest.config.ts`): linhas 43, ramos 35, funções 37,
  statements 42. Catraca — só sobe; baixar exige justificativa no mesmo commit.
- `node scripts/testes/rotas-sem-caracterizacao.mjs`: rota nova sem teste nem motivo escrito
  derruba a run.
- Artefatos `if: always()`: JSON da suíte, `coverage-summary.json`/`lcov.info`, trace e screenshot
  do Playwright. Antes, uma falha de CI só era legível por quem tem admin no repositório.

## 4. Prova negativa

Removido o campo `db` de `server/routes/health.ts` numa edição temporária: o snapshot de forma
falhou apontando a chave ausente, e a edição foi revertida. Saída em
`openspec/changes/contratos-snapshot-de-api/evidencias/prova-negativa-health.md`.

## 5. O que a rede encontrou (hipóteses para as fases seguintes)

Nada disto foi corrigido nesta fase.

| Achado | Onde | Fase que o resolve |
|---|---|---|
| `POST /api/exercises/rodada` não é idempotente por `roundId`: uma retentativa duplica a rodada | `sessao-e-rodada.test.ts` | 4 (validação) |
| Recusa de SSRF em `POST /api/ai/providers/test` responde **200** `{ok:false, message:'erro interno'}` — indistinguível de qualquer outra falha | `ia.test.ts` | 4 |
| Corpo do provedor externo é ecoado ao cliente nos 502 de `mt` e `stt` (até 160 caracteres) | `ia.test.ts` | 4 |
| `POST /api/ai/credentials` devolve `secretRef` (referência interna à tabela `secrets`) | `ia.test.ts` | 4 |
| `review` de cartão inexistente responde 400, não 404; `DELETE` de cartão já removido responde 200 | `fsrs.test.ts` | 4 |
| Apelido do ranking com HTML vira `bAnab` (caracteres removidos um a um, sem escapar nem recusar) | `rank.test.ts` | 4 |
| Erros de `seeds/gastar` e `presenca` usam envelope solto, sem `code`, ao contrário das demais recusas | `seeds.test.ts` | 4 |
| Cap mensal de chamadas é invisível por HTTP: `mtProxy` confere configuração do provedor ANTES de reservar, então sem chave o 501 vem antes do 402 | `planos-e-quotas.test.ts` | 4 |
| `settings.ui` volta como string JSON, não objeto | `idioma.test.ts`, `tema-e-posse.test.ts` | 3 (contrato) |
| Migration que falha no boot é engolida com `console.warn` quando o schema já existe: o diário fica atrasado e o boot repete a falha em silêncio | `migracoes-sobre-estado-atual.test.ts` | 5 (`health-e-ready`) |
| Desativar baralho Anki arquiva as notas mas mantém os cartões já projetados no deck de jogo | `importacao-anki.test.ts` | produto (pergunta aberta) |
| O saldo cresce entre duas leituras com a Loja aberta (+20 Seeds, `seedsCreditadas` inalterado) | `dois-dispositivos.e2e.ts` | 5 (medição) |
| `GET /api/exercises/results?limite=N` ignora `limite` (não está no schema) | `sessao-e-rodada.test.ts` | 4 |

## 6. Limites conhecidos desta fase

- **Login real não é exercitado por navegador** (decisão do dono): a cobertura equivalente está no
  nível HTTP, com JWT ES256 assinado localmente.
- **Modo sem conta não é alcançável pela suíte e2e**: `dev:local` compila com
  `VITE_AUTH_REQUIRED=0`. A regra do teto segue coberta no core.
- **O processo do Playwright morre acima de ~30 testes por comando nesta máquina** (medido em
  9/114 e 32/38, sempre sem falha de asserção). A matriz local roda em lotes
  (`scripts/testes/matriz-e2e.sh`); na CI o comando único vale.
- **Dois testes antigos são condicionais** a já existir baralho importado e pulam num banco novo.
