# Fase 4, Task 9 — staging publicado na Cloudflare (20–21/10/2026)

Status: concluído · Autor: Guilherme (com o assistente) · Ambiente: `https://frasy-staging.guigui-cruzeiro.workers.dev`

O staging é o primeiro Worker real do Frasy: Express no Cloudflare Workers, banco `frasy_staging` no Supabase SP pelo
Hyperdrive `frasy-staging-sp`, bucket `frasy-midia-staging`, Analytics Engine `frasy_metricas_staging`, sem crons
(plano Free). Este documento registra como ele foi publicado, o que o portão provou e os números medidos. O plano
está em `docs/superpowers/plans/2026-10-20-fase4-entrega-e-frasy.md`; a Fase 4 inteira, em
`2026-10-19-spikes-cloudflare.md` ("Fase 4 (Tasks 1–8) concluída").

## Como foi publicado (e o que mudou no caminho)

1. **Secrets** em `.secrets.staging.json` (ignorado pelo git): `SECRET_KEY` nova, `ASAAS_WEBHOOK_TOKEN` aleatório,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY` e `IA_PROVEDORES` (o JSON de
   `ops/ia-provedores.openrouter.json`). Enviados com `scripts/cloudflare/secrets.ts staging` (7 chaves).
2. **Banco**: `npm run db:migrate` contra `frasy_staging` pelo pooler de sessão (`verify-full`): 39 tabelas.
3. **Deploy manual de casa: inviável.** São ~120 MB de assets (ONNX/WASM do Whisper, Bergamot, smart-turn) e a
   conexão doméstica subia a ~14 KB/s: 6 lotes em 9 caíram com `EPIPE` em 16 minutos; a segunda tentativa, só com
   os 483 arquivos sem `.br`/`.gz`, idem. Dois ajustes nasceram daí (R13):
   - o build gera `dist/.assetsignore` (`*.br`, `*.gz`): o Worker comprime na borda e subia 1 049 arquivos em vez de 482;
   - `deploy-worker.yml` faz o **primeiro deploy sozinho** quando o Worker não existe (`wrangler deploy` comum, sem
     fumaça, porque os secrets ainda não existem), e um segundo run segue o fluxo por versões.
4. **Analytics Engine** precisa estar ativado na conta: `wrangler deploy` reprovou com o código 10089 até o dono
   criar o dataset no painel.
5. **Worker criado** daqui com um asset mínimo (o script de 5,9 MB levou 352 s para subir), secrets enviados, fumaça
   remota ok (`/api/ready` 200; `/api/health` `ok`, `banco: postgres`, versão `0.1.0+11454e9`).
6. **GitHub Environment `staging`** criado com `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
   `DATABASE_URL_MIGRACAO`, `SUPABASE_CA_PEM` e as vars `URL_DO_WORKER`, `VITE_PUBLIC_URL`, `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, `VITE_LOGIN_GOOGLE=0`. O `workflow_dispatch` exige o arquivo na branch padrão: só
   `.github/workflows/deploy-worker.yml` entrou na `main` (R14; o run usa o ref `cloudflare/migracao`; Fly intocado).
7. **Run 39529514815** (por versões): build no runner, migrações, `versions upload` com alias de preview, fumaça na
   preview, promoção a 100 %, fumaça final, `triggers deploy` — tudo verde em ~9 minutos.
8. **Achado do E2E contra o staging real**: o front saiu em **self-host** (sem porta de login, "Você está no
   Premium") porque o workflow não passava `VITE_AUTH_REQUIRED=1` (o Dockerfile do Fly tinha o `ARG`). Corrigido com
   teste (`tests/worker/wrangler.test.ts`) e republicado (run 39530578025).

## Portão do staging

| Verificação                                          | Resultado                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fumaça remota (preview e URL final)                  | ok nos dois runs (`versao` termina no sha do commit)                                                                                                                                                                                                  |
| SPA e cabeçalhos                                     | `index.html` 200 com CSP bloqueante, COOP `same-origin`, COEP `credentialless`, Permissions-Policy; chunk com hash `immutable` 1 ano; `index.html` `must-revalidate`                                                                                  |
| E2E da porta de login (desktop, staging real)        | PENDENTE_E2E_STAGING                                                                                                                                                                                                                                  |
| ZAP baseline (260 URLs)                              | 0 FAIL, 8 WARN, 60 PASS. WARN: HSTS ausente nos estáticos (corrigido no gerador de `_headers`), CORP ausente nos estáticos, cache dos estáticos, CSP com `https:` em `img-src` e `*.huggingface.co` (aceitos), comentários/base64 nos bundles (ruído) |
| Lighthouse (3 execuções, URL do staging)             | PENDENTE_LIGHTHOUSE                                                                                                                                                                                                                                   |
| CPU e tempo no Worker (analytics da Cloudflare, 2 h) | 92 requisições, 0 erros; CPU p50 26 ms, p90 112 ms, p99 921 ms; tempo total p50 154 ms, p90 365 ms, p99 1 046 ms                                                                                                                                      |

## Medições (R9) — e o que elas valem

As medições de latência foram feitas **de uma conexão doméstica ruim** (TLS 127 ms; um asset estático respondeu em
118 ms de TTFB; `/api/health`, com uma consulta ao banco, 150 ms; colo GIG). Os números do script são tempo de
parede visto daqui; o que é servidor vem dos quantis por minuto do analytics da Cloudflare.

| Medição                                     | Resultado visto daqui                                               | Lado do servidor (analytics, minuto do passo)                                                  | Critério do plano                                     |
| ------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| scrypt frio (`GET /api/me` ×20)             | 1ª 590 ms, 2ª 572 ms, mediana 237 ms, p95 741 ms, 1 colo            | boot frio (3–4 primeiras requisições após deploy): CPU p50 **90–162 ms**; depois CPU p50 22 ms | < 50 ms de CPU: **reprovado** → Fase 5                |
| admissão de STT (50 paralelas, corpo vazio) | p50 490 ms, p95 1 297 ms, status 402 ×50 (conta sem STT gerenciado) | minuto com as 50 paralelas: tempo total p50 120 ms, p99 453 ms                                 | p95 < 250 ms: **não comprovado daqui** → k6 na Fase 5 |
| upload de áudio                             | 2 MB em 68,9 s (rede de casa); `Range: bytes=0-1023` → 206          | CPU p50 9 ms no minuto                                                                         | 100 MB: **pendente** de uma rede decente              |
| importação web ×2 (cache de DoH)            | 827 ms e 1 120 ms (sem ganho: isolates diferentes)                  | CPU p90 **921 ms** (linkedom numa página grande da Wikipédia)                                  | informativo                                           |

O que o scrypt frio custa: a derivação da chave roda uma vez por isolate (não por requisição) e aparece só nas
primeiras requisições depois de um deploy ou de um isolate novo; 90–160 ms de CPU por boot é aceitável no plano
Paid (CPU por requisição até 30 s), mas supera o critério de 50 ms do plano. Opções para a Fase 5: baixar o custo
do scrypt (`N`) mantendo o segredo com entropia alta, ou derivar a chave uma vez e guardá-la como secret.

## Dívidas registradas

- Medir de uma rede decente (ou de um runner em sa-east-1): admissão p95, upload de 100 MB e o ganho do DoH no
  mesmo isolate; k6 Fly × Cloudflare (Fase 5).
- `Cross-Origin-Resource-Policy` nos estáticos (ZAP 90004): avaliar `same-origin` sem quebrar a imagem `og`.
- O staging divide o Supabase Auth com a produção (R11): projeto separado antes do lançamento.
- Teste de carga e `wrangler tail` com um usuário real (captura, jogos, importação de `.apkg`) ficam para o passeio
  manual do dono, com o console aberto, para pegar violação de CSP que o E2E da porta não cobre.
