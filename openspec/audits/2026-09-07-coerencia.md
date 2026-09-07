# Auditoria de coerencia ponta a ponta — Babel Play (2026-09-07)

Base: `main` @ `976af2c` (2026-09-03) com arvore de trabalho suja (28 arquivos modificados, +4.294/-1.089; 10 caminhos nao rastreados). Toda afirmacao cita `arquivo:linha`. **EXEC** = verificado por execucao nesta auditoria (suite, servidor local sobre COPIA do banco, SQL na copia, navegador, ferramentas). **lido** = leitura estatica. Nenhum arquivo de codigo foi alterado; `data/` nao foi tocado.

Metodo: Fase 0 (mapa) → Fase 1 (coerencia estrutural) → Fase 2 (jogos, economia, idioma, com execucao) → Fase 3 (medicao) → este relatorio + plano OpenSpec em `openspec/changes/`.

---

## 0. Estado apos `linha-de-base-verde` (2026-09-07, branch `linha-de-base-verde`)

A primeira change foi executada com a saida (b): a camada nao rastreada foi commitada na branch `gamificacao-v2-wip` (`0ac344d`, 74 arquivos) e `main` voltou ao HEAD `976af2c`. Com isso os itens 1 e 2 do resumo abaixo mudaram de estado:

- A01 (Loja desligada) nao existe mais na arvore: `/loja` e `/loja/passe` mostram Passe, Meu visual, Loja e Desafios com carteira (verificado no navegador).
- Os tres gates vermelhos ficaram verdes na mesma arvore: `npm test` 2.775/2.775 (`canvas-confetti` atras de `podeDesenhar()` em `src/lib/gameFeel.ts`; teste do Termo segue o rotulo "Dica"), `test:e2e` 14/14 (`_helpers.ts`/`facetas.e2e.ts` usam o botao "Fonte"), `i18n:orfas` 0 orfas (675 chaves). `uptime.yml` voltou a ser YAML valido e `scripts/validar-workflows.mjs` entrou como primeiro passo do CI; `deploy-pages.yml` roda os mesmos gates do `ci.yml`; `ci.yml` instala o Chromium antes do e2e (nao instalava). `audit:gate` verde apos `browserslist` no lock.
- Continuam valendo, para as proximas changes: A02-A06 e todo o P1/P2; A43 e A56 deixaram de existir na arvore (voltaram com a camada para a branch).

## 1. Resumo executivo

1. A arvore de trabalho **desliga o comercio inteiro**: `Loja.tsx:151` fixa `modoVisual='pro'` e nada de loja, passe, creditos, conquistas ou Personalizar e alcancavel (EXEC: `/loja` e `/loja/passe` mostram so Cofre/Vestiario). `HEAD` nao tem essa linha.
2. **Tres passos do CI falham hoje** (EXEC): `npm test` (3 falhas: confetti em jsdom, botao "pedir dica" sumiu), `test:e2e` (6 de 14: botao "Trocar" removido em `976af2c`) e `i18n:orfas` (18 chaves orfas). `uptime.yml` e YAML invalido desde 31/08.
3. **Nao existe spec vigente**: `openspec/specs/` e `changes/archive/` vazios; 29 changes abertas, 17 concluidas sem arquivar. `montarRodada` e closure de componente (`Play.tsx:717-995`), nao server-side, ao contrario do que o pedido assumia.
4. **9 jogos "culturais" fora de todos os sistemas**: report descartado (`Play.tsx:2586-2592`), 6/9 ignoram o deck, locale cravado, 0 testes, 0 rodadas no banco, e a grade anuncia "100% Funcional" (EXEC).
5. **Economia com autoridade parcial**: gasto e validado (EXEC 400 com `preco`), mas creditos de passe e drop recebem 400 (EXEC); o ledger real prova que 36 creditos `passe:t1:*` (2.472 Seeds) entraram ate 01/09 com valores do cliente — a autoridade fechou a porta sem migrar o fluxo. Tres reguas de posse, setters sem portao, 47/128 itens do Cofre inatingiveis, colisao de ids Loja x Cofre.
6. **Dinheiro e LGPD**: webhook Asaas responde 200 e descarta pagamento com assinatura divergente (`billing.ts:385-390`); `DELETE /api/me` deixa 6 tabelas do titular de pe (`conta.ts:27-52`).
7. **Contratos**: 15 divergencias cliente x servidor x efemero que mudam comportamento (recordes sem combo, paginacao Anki quebrada, procedencia perdida ao editar, IChat engolindo o motivo, migracao anonima duplicando).
8. **i18n**: sem seletor de UI, onboarding completa nao pergunta idioma, `settings.target_language='pt-BR'` com `ui.praticaLang='en'` no banco real (EXEC), CEFR do servidor so ingles, `es.json` 2,9%.
9. **Performance** (EXEC): consultas quentes indexadas e rapidas (para-jogo 24 ms, review 4 ms); os custos estao no payload (`GET /api/vocab` 2,27 MB / 189 KB gzip para 2.818 cartoes, carregado pelo lobby), no `computeProfile` (100 ms, 11 consultas, chamado 2x por tela) e no arranque (catalogo mestre de 129 KB dentro do chunk inicial de 504 KB).
10. **Solido**: FSRS-5 unico com autoridade no servidor; funil unico `aoTerminar` dos 9 classicos; `PLAN_MATRIX` unica; saldo derivado da mesma formula nos dois lados; webhook idempotente; rotas Express x cliente 100% casadas; schema == migrations (EXEC drizzle); 2.784/2.788 testes verdes.

---

## 2. Mapa da logica central (atualizado)

Legenda: [C] confirmado · [S] suspeito · [A] ausente.

### 2.1 Stack e edicoes
React 19 + Vite 6 (`vite.config.ts`), Express (`server.ts:170-206`), Drizzle + libsql/SQLite WAL (`server/db/db.ts:13-79`), 22 migrations SQL sem `down`, Supabase JWT ou `LOCAL_OWNER` (`server/lib/auth.ts:141`), Asaas (`server/routes/billing.ts`). Tres "edicoes" coexistem: servidor completo; **servidor efemero em memoria** para o modo anonimo (`src/data/efemero/servidor.ts:632-657`, 26 rotas espelhadas); **edicao leve** (`VITE_EDICAO=leve`, Cloudflare Pages + D1 para ranking, `functions/api/rank/[[path]].ts`). `vite.config.ts:44` nao trata `mode`; a leve existe so por `.env.leve`.

### 2.2 Ciclo do usuario
`identidade.ts:25` → `supabase.ts:70` → `App.tsx:122-136` → `porta()` (`exigeConta.ts:68`) → `fetchSettings` (`App.tsx:534-557`) → onboarding por edicao (`App.tsx:738`: `Onboarding.tsx` completa **nao pergunta idioma** [A]; `OnboardingLeve.tsx` nao pergunta perfil etario [A]) → `apiFetch` (`api.ts:22-26`: anonimo → efemero) → `authMiddleware` (`server.ts:153`) → migracao anonimo→conta (`migracao.ts`) → jogo → progresso (`App.tsx:421` + **segundo** `fetchMetrics` em `Metrics.tsx:144` [S]).
Rotas: `/loja/undefined` (`rotas.ts:88-108` x `Play.tsx:2528`, `Loja.tsx:503`); `/creditos` aliasado para Cofre; `/perfil` em branco na leve (`App.tsx:873`); `ABAS_QUE_EXIGEM_CONTA` sem chamador (`exigeConta.ts:28-30`) [A].

### 2.3 Conteudo
`scripts/trilha/gerar.mjs:141-142` → `public/trilha/<lang>.json` (16) + `public/glosas/<lang>-pt.json` (15) → `carregarTrilha` (`src/data/trilha/carregar.ts:123-143`, fetch) → `Play.tsx:1641-1652` [C]. Anki: `POST /api/import/anki` (`import.ts:212-345`) → `anki_decks/notes/imports` → `vocabRepo.ativarLote` (`vocab.ts:979-1008`) → `vocab_cards` [C]; midia: tabelas e `ankiMidia.ts` sem chamador [A]. Sessao: `ficharCartao` (`adicionarAoDeck.ts:49`) → `POST /api/vocab/bulk-add` [C]. Normalizacao: 5 implementacoes da mesma chave (`trilha.ts:114`, `quality.ts:198`, `vocab.ts:74`, `servidor.ts:90`, `cefrWordlist.ts:51`), duas `chaveDedup` discordantes [S].

### 2.4 Sessao/jogo
`fetchDeck` (`Play.tsx:1324`, `GET /api/vocab`) → `triagem` (`:1579`) → `compor` (`composicao.ts:393` → `GET /api/vocab/para-jogo`; **`filtro` nunca serializado** `composicao.ts:348-361` [A]; anonimo sempre no fallback local) → `recortarPelaComposicao` (`:1844`) → `montarRodada` (`:717-995`, 8 ramos) → antessala → componente → `aoTerminar` (`:1125-1294`): `pontuarRodada`, FSRS por item via `POST /vocab/:id/review` (`vocab.ts:711-751`), `salvarRodada` → `POST /exercises/rodada` (`exerciseResults.ts:284`), promocao da trilha [C]. Seeds por rodada: nenhum [A] (derivadas de `exercise_results` em `computeProfile`). Culturais: `itensCulturais = acervoDaFonte.map` (`Play.tsx:2580`) → componente → `onFinish = fecharJogoCultural` (sem args) [A].

### 2.5 Economia
Ganho derivado (`xp.ts:61-125`) em `computeProfile` (`metrics.ts:207-291`) e `deriveProgress` (`progress.ts:106-109`) [C]. Presenca (`presenca.ts:22` → `metrics.ts:122`) [C]. Conquistas (`App.tsx:457` → `metrics.ts:156`, valor decidido em `economiaAutoridade.ts:127-131`) [C]. Gasto (`Play.tsx:1098` → `metrics.ts:83-106`) [C] — unico debito vivo. Loja/Passe/Creditos [A] (`Loja.tsx:151`). Creditos comprados: compra → webhook → `credit_purchases` [C], sem UI viva [A]. Drops: `drops.ts` so localStorage; `marcarPosse` grava ids do Cofre na chave da Loja [S]. Posse: tres reguas (`loja.ts:105`, `desbloqueios.ts:83`, `catalogoMestre.ts:3729`) [S].

### 2.6 i18n
UI derivada de `mine` (`langConfig.ts:156`), sem seletor; alvo em `settings.targetLanguage` + espelho `ui.captureTargetLang` + `ui.praticaLang`; conteudo em `vocab_cards.src_lang_base`, `sessions/utterances.source_lang`, `anki_decks.idioma_origem`. Trilha: `escala:'cefr'` so `en`; glosas so `*-pt`. CEFR do servidor so ingles (`vocab.ts:280,885`).

### 2.7 Matriz modulo x tabela (resumo)
26 tabelas em `server/db/schema.ts`. Sem leitor nem escritor: `analyses` (`:408`), `profiles` (`:425`, referenciada por `settings.active_profile_id`), `anki_media`/`anki_note_media` (`:700,721`). Dois escritores: `usage_counters` (`lib/storageQuota.ts`, `repositories/usageCounters.ts`) que tambem guarda rate-limit (`rateLimitStore.ts:22`). Banco real (EXEC): analyses 0, profiles 0, anki_media 0; `difficulty_score` NULL em 2.818/2.818; `frequency` nunca escrita.

### 2.8 OpenSpec x codigo
`openspec/specs/` vazio; `changes/archive/` vazio; 29 changes (17 sem tarefa pendente; `imersao-aquatica-nextgen` so esqueleto); 2 changes nao rastreadas (06/09) marcadas 100% com codigo tambem nao rastreado. `AUDITORIA-ESTADO.md:44-48` cita migrations inexistentes; `docs/arquitetura.md` de 2026-07.

---

## 3. Achados

Formato: `id [P] area — descricao — evidencia — verificacao`.

### 3.1 P0 — quebra fluxo central ou corrompe dados
- A01 [P0] frontend/economia — `modoVisual='pro'` fixo; loja de Seeds, Creditos, Passe, Conquistas e Personalizar inalcancaveis; ausente em HEAD — `src/components/views/Loja.tsx:151,457-703` — EXEC (`/loja`, `/loja/passe`) + `git show HEAD`.
- A02 [P0] jogos — 9 culturais: report descartado, 6/9 ignoram `items`, "100% Funcional" — `Play.tsx:2580-2592,3648`; Koffer:88, Taboo:134, Cadavre:113, Bao:122, TenseTennis:108, Vitendawili:120 — EXEC UI + SQL (0 rodadas) + 0 testes.
- A03 [P0] economia — creditos de passe e drop recusados (400); `seedsDoCofreDoPasse` sem chamador; passe repete pedido a cada mount; drop anuncia "+40" sem credito — `economiaAutoridade.ts:127-140`; `metrics.ts:160-164`; `PasseDeTemporada.tsx:143-144`; `drops.ts:207-216` — EXEC (curl 400) + SQL (36 creditos `passe:*` aceitos ate 01/09 15:15).
- A04 [P0] economia — 31 ids coincidem entre Loja e Catalogo Mestre sobre `babel.loja_possuidos`; drop da item da loja de graca; apagado no proximo `/profile` na conta — `drops.ts:232`; `loja.ts:68-81`; `App.tsx:431` — lido.
- A05 [P0] billing — pagamento confirmado com assinatura divergente ou avulso desconhecido → `break` + 200, sem reentrega — `server/routes/billing.ts:364-390` — lido.
- A06 [P0] LGPD — `DELETE /api/me` nao apaga `seed_credits`, `credit_purchases`, `credit_spends`, `presencas`, `anki_media*`, nem rate-limit `u:<id>` — `conta.ts:27-52,184`; `rateLimitStore.ts:28-32` — lido.

### 3.2 P1 — economia e gating
- A10 tres reguas de posse e setters sem portao — `loja.ts:105-126`; `desbloqueios.ts:83-89`; `catalogoMestre.ts:3729-3742`; `theme.ts:175`; `particulas.ts:68,141,233,244`; `cursores.ts:165`; `rastroDoMouse.ts:169`; `suitesTematicas.ts:761-822` — lido.
- A11 `PUT /api/settings` persiste tema/cores sem validar posse — `settings.ts:13-26`; `validation.ts:234-242` — lido.
- A12 posse em localStorage sem reconciliacao (`babel.conquistas`, `babel.premium_possuidos`) — `conquistasPosse.ts:8-20`; `carteira.ts:36`; `loja.ts:118-121` — lido; EXEC 18 chaves no navegador.
- A13 47/128 itens do Cofre sem canal (`desafio`, `tempo`, 4 conquistas inexistentes) — `catalogoMestre.ts`; `GaleriaDoCofre.tsx:655-659` — lido.
- A14 conquistas impossiveis na conta: `ouvinte`, `poliglota` (campos nao emitidos), `duelista` (sem combo) — `conquistas.ts:51,67`; `metrics.ts:272-321` — EXEC (`/profile` sem `capturaMinutos`/`idiomas`; `/recordes` sem `melhorCombo`).
- A15 `GamificacaoHub` nao desestrutura `comprar`; `ABAS_QUE_EXIGEM_CONTA` sem chamador — `GamificacaoHub.tsx:22-42`; `exigeConta.ts:20-30` — lido + knip.
- A16 `/loja/undefined`; `/creditos` → Cofre — `rotas.ts:68,88-108`; `Loja.tsx:93-105`; `Play.tsx:2528`; `Loja.tsx:503` — EXEC (`/loja/passe`).
- A26 efemero aceita `amount`/`xp` do cliente — `servidor.ts:436-476` — lido.

### 3.3 P1 — jogos e contratos
- A17 `PedidoDeComposicao.filtro` nunca serializado — `composicao.ts:348-361` — EXEC (com `filtro` na query o servidor filtra: 15 vs 60 itens).
- A18 `melhorSequencia` descartado; `RecordeDoJogo.melhorCombo/precisao/ultimaEm` so no efemero — `api.ts:703,902-913`; `validation.ts:125`; `exerciseResults.ts:265-270` — EXEC.
- A19 `rowToVocabCard` descarta `occurrences/difficultyScore/cefrSource`; recorte "dificeis" esvazia no fallback — `api.ts:342-416`; `Play.tsx:1610-1613` — lido; EXEC "As que mais escapam 0".
- A20 PATCH/review devolvem linha crua sem procedencia — `vocab.ts:136,148`; `api.ts:387-392` — lido.
- A21 paginacao de notas Anki quebrada (cursor objeto, `cursorId` ausente); `estado=descartada` 400; `porMotivo` string — `anki.ts:440`; `apiAnki.ts:59,74,97`; `routes/anki.ts:51`; `validation.ts:499` — EXEC.
- A22 IChat sem `res.ok`, ignora `reason` — `IChat.tsx:457-474` — lido.
- A23 efemero ignora `origemLocalId` — `servidor.ts:117-145` — lido.
- A24 `chaveDedup` efemero ≠ servidor; 5 normalizadores — `servidor.ts:90`; `vocab.ts:74`; `trilha.ts:114`; `quality.ts:198`; `cefrWordlist.ts:51` — lido.
- A25 efemero nao espelha 6 rotas nem 4 campos do perfil — `servidor.ts:632-657` — lido.
- A63 `ResumoDaRodada.tsx:231` nivel fixo; drop so via "ver erros"; `conectores` so en/pt/es; Termo cai em `en` — lido.

### 3.4 P1 — backend e infra
- A27 dois rate limiters na mesma linha — `server.ts:87-121`; `rateLimitStore.ts:22,45` — lido.
- A28 `proxy.ts:36` repassa `req.body` sem teto; 12 leituras sem schema — `proxy.ts:36,71-72`; `sttProxy.ts:85-86`; `sessions.ts:272,287,306,332`; `vocab.ts:148`; `admin.ts:45,63,74` — lido.
- A29 erro engolido com 200 — `import.ts:312,346`; `sessions.ts:206-209`; `erroDeRota.ts:54` — lido.
- A30 9+ formatos de erro; `erroGlobal.ts:78-86` envelope aninhado; nenhum leitor de `code`/`codigo` em `src` — lido.
- A31 7 clientes LLM; `OLLAMA_URL` cravada x2; `gemini-2.0-flash` cravado; modelo morto sugerido em `Onboarding.tsx:25` — `server.ts:240-331,379`; `proxy.ts`; `mtProxy.ts:68-78`; `profiles.ts:10,40` — lido.
- A32 `usage_counters` com 4 escritores — `storageQuota.ts:106-163`; `usageCounters.ts:69,111` — lido.
- A33 reconciliacao O(n) sem lock em `GET /me/entitlements` — `storageQuota.ts:83-94,230-250`; `me.ts:237-243` — lido.
- A34 `data/secret.key` em `process.cwd()`; `bootStatus` por processo — `crypto.ts:17,40`; `bootStatus.ts:20` — lido; audio: EXEC 404 "arquivo ausente" em replica sem o arquivo.
- A35 `analyses`, `profiles`, `anki_media*` orfas; `ankiMidia.ts` sem importador; `recalcularDificuldade` sem rota — `schema.ts:408,425,700,721`; `vocab.ts:443` — EXEC (0 linhas; `difficulty_score` NULL em 100%).
- A36 `Study.tsx:121-135` grava `reviewLogs` em localStorage sem teto, fora do LGPD — lido.
- A37 dois `GET /api/metrics/profile` por tela — `App.tsx:421`; `Metrics.tsx:144` — lido; EXEC 100 ms cada.
- A43 `core/index.ts:56` re-exporta arquivo nao rastreado; `galeria/passe.ts:3` re-exporta o barril — lido; EXEC catalogo no chunk de arranque.

### 3.5 P1 — i18n, leve, CI
- A38 sem seletor de UI; `users.locale` nunca escrita; Onboarding completa nao pergunta idioma; `es.json` 20/693 — `i18n.ts:36`; `schema.ts:504`; `Onboarding.tsx:30-36`; `langConfig.ts:41` — lido; EXEC `users.locale NULL`; `target_language='pt-BR'` x `praticaLang='en'`.
- A39 `en`/`pt` cravados: `tts.ts:261`; `dictionary.ts:124`; `VocabularyPanel.tsx:304`; `Honestidade.tsx:80`; `Metrics.tsx:307`; `fluencia.ts:103`+`AbaProgresso.tsx:49`; `cefrWordlist.ts:77`+`vocab.ts:280,885`; `profile.ts:394`; `relatorioDeProgresso.ts:28-79` — lido.
- A40 leve: `/perfil` vazio, `/plano` sem backend; `deploy-pages.yml:40-46` pula gates — lido.
- A41 `i18n:orfas` vermelho (18) — EXEC.
- A42 `uptime.yml:66-76` YAML invalido desde `c6eb8b3` — EXEC (js-yaml).
- A44 `npm test` falha: `blitzGame.test.tsx` (confetti/jsdom), `termoTravado.test.tsx` (confetti; "pedir dica" ausente) — EXEC.
- A45 e2e: 6/14 falham esperando "Trocar" (`tests/e2e/_helpers.ts:110`), removido em `976af2c` — EXEC.

### 3.6 P2 — limpeza, padrao, DX
- A50 15 arquivos sem importador (`MinigamesShowcase.tsx`, `gamificacao/versao{1,2,3}/*`, `StagePreviewLive.tsx`, `ModalCelebracaoRecompensa.tsx`, ~2.761 linhas) — EXEC madge.
- A51 140 exports/93 tipos sem uso (knip): `LeitnerStrategy`, `estimateCefr`, `distribuicao.ts`, 11 `play*Sound`, `api.ts` x4, `chatStream`/SSE, 5 metodos de repositorio, `IDIOMAS_DA_INTERFACE`, `seedsDoCofreDoPasse` — EXEC.
- A52 endpoints sem consumidor: `distribuicao-dificuldade`, `:id/ocorrencias`, `DELETE /vocab/:id`, 6 `/api/admin/*` — lido.
- A53 legado vivo: `POST /exercises/results` (Study), `vocab_cards.frequency` preenchida pelo cliente, `migrarLeitnerParaFsrs` a cada boot — lido; EXEC frequency 0/2.818.
- A54 58 clones jscpd (culturais, Passe x3, MenuDaConta = MenuDeConforto, `vocab.ts:313 = 921`, `api.ts:707 = 727`, `trilha.ts:101` em 4 lugares) — EXEC.
- A55 STOPWORDS = GRAMATICAIS; `FiltroPersistido` = `FiltroDaPratica`; `baseLang` x4; leitura de `meta` x6; `ROMANCE` x4; 3 resolvedores de diretorio — lido.
- A56 deps: `three` sem import (nao commitado), `tesseract.js` so em `ocr.ts` morto, `@axe-core/playwright` — EXEC.
- A57 ciclo `source.ts ↔ filtro.ts` (tipo); `vite.config.ts:44` ignora `mode` — EXEC madge.
- A58 7 `catch {}` em `soundFx.ts`; `.catch(() => {})` em `web.ts:70`, `db.ts:70`, `storageQuota.ts:62,88,91,248`, `api.ts:1026` — EXEC ast-grep.
- A59 323 warnings de lint sem falhar CI — EXEC.
- A60 `config.ts:77-111` nao declara `S3_*`, `ASAAS_*`, `LLM_RESERVA_*`, `ESSENCIAL_*`, `ANKI_MEDIA_DIR`; `.env.example` nao declara `OLLAMA_MODEL`, `DATA_DIR`, `ERROS_DIR`, `MIGRATIONS_DIR`; `OPENROUTER_API_KEY` no `.env` so e lido por script de eval — lido.
- A61 por worker: sinks duplicados, podas, mutex de loopback por processo, caches em memoria, `seedIfEmpty` demo orfa — lido.
- A62 capa `data:` URI inteira em `GET /sessions/:id` e PATCHs — lido.
- A64 docs desatualizadas; changes concluidas sem arquivar; esqueleto `imersao-aquatica-nextgen` — lido.
- A65 `ar.json` fora da lista; `locale-cravado.yml` nao cobre `Intl.NumberFormat`; ~394 `t()` x ~4.353 literais — EXEC (subagente).

---

## 4. Fase 2 — tabela por jogo (resumo)

| Jogo | Fonte | FSRS | Idioma | Anki | Estado (verificacao) |
|---|---|---|---|---|---|
| Memoria | deck + `para-jogo`, cauda generica | ≤1→3, ≤3→2, senao 1 | `carta.lang` | sim | funcional (EXEC testes; SQL 0 rodadas) |
| Caca-palavras | idem, so latino | erro→2; ≤1→3 senao 2 | `it.lang`; grade A-Z | sim | funcional (EXEC 19/19; SQL 2 rodadas) |
| Blitz | idem, urgencia | ≤3 s→4 senao 3 | `item.lang` | sim | funcional; teste de componente quebrado (confetti) |
| Termo | `rodadasDaEscada` | ≤1→4, ≤3→3, senao 2 | `'en'` fallback; QWERTY | sim | funcional; 2 testes quebrados; SQL 14 rodadas |
| Scramble / Karaoke / Escuta / Ditado | falas da sessao ou trilha | nao grava (writesSrs false) | por fala; Karaoke `'en-US'` fallback | nao | funcional sem uso (EXEC testes; SQL 0); audio da sessao 404 em replica sem arquivo (EXEC) |
| Conectores | falas, so texto | nao grava | so en/pt/es | nao | parcial |
| 9 culturais | `acervoDaFonte` ou arrays fixos | nao (report descartado) | cravado | nao | nao conectado (EXEC UI; 0 testes; SQL 0) |
| Bingo | falas ao vivo | nao | por fala | nao | nao e minigame (EXEC 19/19) |

Economia (EXEC): `seedsGastas 3085`, `seedsCreditadas 2923`; gastos loja 1.580 / croma 745 / aprimoramento 760; 8 de 14 conquistas no ledger; `credit_purchases 0`; drops 7 pendentes em localStorage.

i18n (EXEC): cartoes en 2.228, pt 489, 6 idiomas com 10; 5/6 sessoes com origem = destino = pt-BR; `users.locale NULL`.

---

## 5. Fase 3 — medicoes

Ambiente: servidor de dev (`tsx` + Vite middleware) sobre copia do banco (1 usuario, 2.818 cartoes, 240 falas); 15 requisicoes por rota via `127.0.0.1` (via `localhost` o Windows adiciona ~200 ms de fallback IPv6 — artefato de medicao, nao do servidor).

| Rota | med | p90 | payload |
|---|---|---|---|
| `GET /api/health` | 1,7 ms | 1,8 ms | 60 B |
| `GET /api/metrics/profile` (5 cargas + 6 agregados = 11 consultas; agrega em JS) | 100 ms | 108 ms | 1,7 KB |
| `GET /api/vocab` (deck inteiro) | 152 ms | 160 ms | **2,27 MB / 189 KB gzip** |
| `GET /api/vocab/para-jogo?lang=en&limite=200` | 25 ms | 29 ms | 84 KB / 12 KB gzip |
| `GET /api/vocab/para-jogo` com `filtro` (EXISTS anki) | 24 ms | 24 ms | 84 KB |
| `GET /api/anki/decks/:id/notas?limite=50` | 32 ms | 35 ms | — |
| `POST /api/vocab/:id/review` (4 statements) | 4 ms | 4 ms | 726 B |
| `POST /api/exercises/rodada` | 2,6 ms | 3 ms | 36 B |
| `GET /api/sessions` | 2,2 ms | 2,3 ms | 2,5 KB |

`EXPLAIN QUERY PLAN` (copia): todas as consultas quentes usam indice (`idx_vocab_user_due`, `idx_occ_probe` cobrindo os EXISTS, `idx_vocab_user_added`, `idx_utt_user`, `idx_review_user`, `idx_exercise_results_card`); nenhum SCAN. Temp B-tree apenas em `anki_notes ORDER BY created_at,id` e no `GROUP BY` de recordes. `list()` de 2.783 cartoes: 64 ms no driver. N+1: nenhum nos caminhos quentes (`list()` e 3 consultas; `addRodada` 1 INSERT multi-VALUES). Custo estrutural: `computeProfile` carrega TODAS as `utterances`, `vocab_cards`, `review_logs`, `exercise_results` do usuario (`metrics.ts:54-60`) e e chamado 2x por tela (A37); `migrarLeitnerParaFsrs` varre `vocab_cards` em todo boot.

Frontend (build de producao para o scratchpad, 18 s): 89 chunks, 4,42 MB (1,33 MB gzip). Arranque: `index-Q6_HRh40.js` 517 KB (166 KB gz) + `vendor-react` 194 KB (61 gz) + CSS 298 KB (38 gz). **O chunk de arranque contem o catalogo mestre** (`suite_ouro_imperial` encontrado em `index-Q6_HRh40.js`), via `core/index.ts:56` e `galeria/passe.ts:3`. `Play` 539 KB (152 gz); `index-nNtD4aSz` 434 KB (120 gz); `AreaChart` (recharts) 357 KB (106 gz) sob demanda; `Loja` 242 KB (58 gz) inclui gamificacao; 3 workers (~500 KB cada, transformers.js); 15 chunks de niveis da trilha (319 KB gz somados, sob demanda). `three` nao entra no bundle (sem import). Avisos do build: `eventosDeJogo.ts` importado estatica e dinamicamente; chunks > 500 KB. Componentes-deus: `LiveCapture.tsx` 4.257 linhas (40 `useState`, 39 `useEffect`, 0 `memo`), `Play.tsx` 3.714 (20/18/30 `useMemo`), `Analysis.tsx` 2.880. Assets estaticos: ORT wasm 25,5 + 12,6 MB, VAD onnx 2,3 + 1,8 MB, trilha 4,5 MB, glosas 2 MB.

Instancia unica remanescente (cruzado com Fase 1): `data/secret.key` (A34), `bootStatus` (A34), diario de erros em arquivo (A61), mutex de loopback (A61), caches em memoria (A61), audio em filesystem sem S3 configurado (EXEC 404).

Custos de IA: `/api/gemini/chat` (Groq `gpt-oss-120b` → Gemini `gemini-2.0-flash` cravado → Ollama) com `hasEntitlement` + `reserveManagedCall` (`server.ts:352-353`); `/api/ai/mt` (`mtProxy.ts`) com entitlement, reserva, tokens e cascata `LLM_RESERVA_*`; `/api/ai/stt` (`sttProxy.ts`) com reserva de chamadas e segundos; `/api/ai/llm/chat/completions` (`proxy.ts`) BYOK sem quota (por desenho). **Nenhum cache server-side em nenhum caminho de IA.** Matriz (`planos.ts:56-87`): free 0 chamadas / 0 s / 500 MB; essencial 12.000 / 0 s / 1 GB; pro 12.000 / 36.000 s / 5 GB; selfhost ilimitado. Cliente: MyMemory com cota diaria rastreada no navegador; Chrome Translator, opus-mt e Whisper locais sem custo.

---

## 6. Perguntas abertas (decisao de produto)

1. Camada nao rastreada (3 versoes de gamificacao, `catalogoMestre.ts`, `Loja.tsx` que desliga o comercio): commitar, escolher uma versao, ou descartar e voltar ao HEAD? Precede toda change de economia/personalizacao.
2. 205 commits em `main` sem push; remote extra `auditoria`; branch de auditoria citada em `AUDITORIA-ESTADO.md` inexistente. Politica de branches/remotos.
3. Rombo historico de Seeds (3.085 gastas contra 2.923 creditadas + ganho derivado): perdoar via credito de ajuste ou manter.
4. Edicao leve (Pages + D1) continua mantida em paralelo? Ela obriga o efemero a espelhar economia e rotas.
5. `analyses` e `profiles`: remover ou implementar. `anki_media*`: terminar (motor-anki-midia) ou remover.
6. Jogos culturais: virar jogos de verdade (entrar em `MinigameId`, `montarRodada`, `aoTerminar`, ranking) ou sair da grade ate isso acontecer.
7. Idioma da interface: seletor proprio (e `users.locale` escrita) ou continua derivado de "Meu idioma"? `es` continua oferecido com 2,9% traduzido?
8. Cofre/drops: 100% gratuito e fora dos Seeds (como `cofreGameplay.test.ts` afirma) ou integrado a economia? Canais `desafio`/`tempo` (43 itens) ganham mecanica ou saem?
9. Creditos historicos de passe (2.472 Seeds em `seed_credits` com valores do cliente): manter, reconciliar contra `slotsDoPasse`, ou estornar?

---

## 7. Plano OpenSpec

Changes criadas em `openspec/changes/` (proposal, tasks, specs). Ordem, dependencias e paralelismo estao em `openspec/changes/README-ordem-2026-09-07.md`. Nada foi implementado.
