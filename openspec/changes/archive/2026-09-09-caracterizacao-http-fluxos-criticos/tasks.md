## 1. Harness
- [x] 1.1 `_app.ts` sobe nos dois modos e responde `/api/health` 200
- [x] 1.2 `montagem-espelha-o-server.test.ts`
## 2. Fluxos
- [x] 2.1 auth e conta (`/api/me`, 401 sem token, 403 suspenso, self-host sem token)
- [x] 2.2 idioma (`/api/settings` targetLanguage e ui.uiLang)
- [x] 2.3 sessao e rodada (`/api/sessions`, `/api/exercises/rodada`, historico, recordes)
- [x] 2.4 FSRS (`/api/vocab/:id/review`, due e review_logs)
- [x] 2.5 seeds (`/api/metrics/profile`, `seeds/gastar`, `seeds/creditar`, `presenca`)
- [x] 2.6 IA (`/api/ai/mt`, `/api/ai/stt/available`, `providers/test`) com upstream falso
- [x] 2.7 importacao Anki (`.txt` e `.apkg` com HTML hostil)
- [x] 2.8 estatisticas (`/api/metrics/xp`, `/api/exercises/*`)
- [x] 2.9 tema e posse (`PUT /api/settings` com item nao possuido)
- [x] 2.10 planos e quotas (`/api/me/entitlements`, `/api/me/uso`, cap mensal)
- [x] 2.11 rank publico (`/api/rank/:jogo` sem token, teto de pontos)
## 3. Cobertura
- [x] 3.1 `rotas-sem-caracterizacao.mjs` lista vazia para as rotas criticas
