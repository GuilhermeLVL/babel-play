# Marco 1 — Autenticação (Supabase) + isolamento multi-tenant

Primeiro marco do caminho para SaaS público. **O motor de identidade + isolamento por usuário,
construído e testado 100% em localhost, sem hospedar nada.** Os dados continuam no SQLite local;
o Supabase entra só como provedor de login (JWT). Migração para Postgres/Turso, RLS, hospedagem e
cobrança ficam para os próximos marcos.

## O que mudou

- **Middleware de auth** (`server/lib/auth.ts` + `server/lib/authContext.ts`): verifica o JWT do
  Supabase localmente (JWKS assimétrico, com fallback HS256). Dois modos por uma flag `AUTH_REQUIRED`:
  desligada (padrão) = self-host sem login (todo request é o `LOCAL_OWNER`); ligada = exige token.
- **Isolamento na camada de aplicação**: `userId` virou parâmetro **obrigatório** (tipo *branded*
  `UserId`) em TODA função de repositório — o TypeScript quebra o build se algum call site esquecer
  de escopar. Todos os 9 repositórios (sessions, utterances, vocab, reviewLogs, exerciseResults,
  seedSpends, settings, credentials, metrics) filtram/carimbam por `user_id`.
- **Backfill no boot** (`tenancy.ts`): as linhas legadas (`user_id` NULL) são atribuídas ao
  `LOCAL_OWNER`, então os dados do usuário local atual continuam visíveis. `profiles` fica de fora
  (builtin/global).
- **Frontend**: client Supabase (`src/lib/supabase.ts`), `authHeaders()` no `apiFetch` e tela de
  login (`src/components/Login.tsx`) atrás de uma porta de boot que só aparece no modo público.

Prova de isolamento: `tests/integration/mt1-*.test.ts` (unidade por repo) + `mt1-isolation-e2e`
(Express real + 2 tokens → conjuntos disjuntos + 401 sem token). O `npm run typecheck` é o gate
anti-vazamento (toda chamada de repo precisa passar o `userId`).

## Como rodar

- **Local / self-host (padrão):** nada a fazer. `AUTH_REQUIRED` desligada → sem login, como sempre.
- **Modo público (SaaS):** crie um projeto grátis no Supabase e preencha as variáveis da seção
  "Marco 1" do `.env.example` (servidor: `AUTH_REQUIRED=1`, `SUPABASE_URL`; cliente: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_REQUIRED=1`). Login inicial: **e-mail + senha** (Google e
  link-mágico entram depois, sem retrabalho no motor).

## Fora de escopo do Marco 1 (próximos marcos)

- Migração do banco para Postgres/Turso e **RLS** (isolamento hoje é da aplicação; SQLite não tem RLS).
- Hospedagem / ligar `AUTH_REQUIRED=1` em tráfego real.
- **Cobrança** (Stripe/LemonSqueezy) ligada ao plano.
- Métodos de login extras (Google OAuth, link-mágico).
- Auth por **cookie / URL assinada** para mídia: o `<audio src="/api/sessions/:id/audio">` e os
  `fetch(audioUrl)` não conseguem mandar o header `Authorization`; no deploy público o streaming de
  áudio precisa de cookie ou URL assinada. Em localhost (auth desligada) é irrelevante.
- `unique(user_id, spend_id)` para `seed_spends` (hoje `spend_id` é UNIQUE global; UUIDs não colidem).
- Repositórios/scoping de `analyses`, `memory_embeddings`, `profiles` (sem repo hoje; o backfill os
  cobre, exceto profiles).
