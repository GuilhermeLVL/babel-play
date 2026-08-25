# Roadmap de distribuição pública — Babel Play

> Plano faseado para levar o app de "roda na minha máquina" a um produto público, seguro e de custo ~zero no tier gratuito, mantido por um dev independente. Escrito em 2026-07-24; custos e limites verificados nessa data.

## Princípio de arquitetura que torna isso viável

A inferência pesada (Whisper STT + tradução) roda **no navegador do usuário** (WebGPU/WASM). Custo de servidor por usuário ativo ≈ custo de servir arquivos estáticos + um CRUD leve. É o que permite um tier gratuito real sem risco de conta surpresa.

## Parecer de viabilidade técnica (auditoria de 2026-07-24, ciclo 2)

**Veredito: a base é sólida e o caminho para produção é viável e barato — mas o app NÃO deve
ser exposto publicamente antes da Fase A da change OpenSpec `production-readiness`.**

- **Já resolvido no ciclo 2** (deixou de bloquear): bind local por padrão, SSRF completo no
  import web, chave de segredos real (sem fallback), helmet/CSP/rate-limit, validação Zod,
  sourcemap fora do público, CI + testes + scans (Semgrep: 1 ERROR corrigido, 0 críticos;
  Trivy: 0 secrets, 2 HIGH transitivas aceitas e documentadas).
- **O que segue bloqueando produção** (especificado em `openspec/changes/production-readiness`):
  ausência de auth/multi-tenant (o schema já tem `userId` em sessions), rotas locais
  (loopback/yt-dlp) que precisam de flag `SELF_HOST`, e billing para o campo `plan` que a UI
  já usa nos gates.
- **Custo do tier gratuito continua ~zero**: a inferência é do lado do cliente; o servidor
  público serve estático + CRUD leve. O que custa dinheiro (STT de nuvem gerenciada,
  yt-dlp hospedado) já está atrás de gates "Pro".
- **O que já está acima da média para um app deste estágio**: SQL 100% parametrizado,
  segredos AES-256-GCM write-only, cliente sem vetor de XSS, spawn seguro de binário,
  filosofia de honestidade nos dados.

## Realidade atual (o que NÃO é publicável hoje)

| Item | Situação | Implicação |
|---|---|---|
| `server.ts` Express + Vite middleware | processo único local | precisa separar build estático × API |
| SQLite em disco (`data/babel.db`) | single-user, sem auth | multi-tenant + Postgres/Turso antes de público |
| `yt-dlp` via spawn | binário na máquina | não roda em edge; vira recurso Pro/self-host |
| Captura via servidor (WASAPI) | só faz sentido local | feature de "modo desktop/self-host" |
| Segredos | cifrados no SQLite, BYOK | bom; portar junto |
| Sem testes/CI/lint | risco de regressão | gate mínimo antes de público |

## Fase A — Fundação de qualidade (1–2 semanas, custo 0)

1. **CI GitHub Actions**: `typecheck` + `npm test` + build em cada PR.
2. **ESLint + Prettier** básicos (sem guerra de estilo; só erros reais).
3. **Vitest** para os módulos críticos: `vocabWord`, `langConfig`, `sentences`, `modelCache`, downsampler do loopback.
4. Padronizar branch `main` + PRs (hoje: commits diretos na feature branch).

## Fase B — Separação estático × API (1 semana)

1. `vite build` já gera `dist/` estático — servir por CDN.
2. Extrair a API para funções portáveis (Express hoje; Hono é drop-in p/ Workers).
3. Banco: trocar `@libsql/client` file: por **Turso** (mesmo driver libsql, free tier 500 DBs / 9GB) ou Neon Postgres. Migração Drizzle já existe.
4. Feature-flag por ambiente: `import/youtube` e `audio/loopback` só quando `SELF_HOST=1`.

## Fase C — Público beta (Cloudflare, custo R$0/mês)

| Peça | Serviço | Free tier |
|---|---|---|
| Frontend | Cloudflare Pages | banda ilimitada |
| API | Cloudflare Workers (Hono) | 100k req/dia |
| Banco | Turso (libsql) | generoso; ou D1 |
| Auth | Supabase Auth ou Cloudflare Access | 50k MAU (Supabase) |
| Áudio das sessões | Cloudflare R2 | 10GB, egress $0 |
| Modelos ONNX | R2 same-origin (`VITE_SELF_HOST_MODELS=1`, script `fetch-models.mjs` já existe) | resolve COOP/COEP + independência do HF CDN |
| Telemetria de erros | Sentry free | 5k eventos/mês |

Trabalho de código: multi-tenant (coluna `user_id` em sessions/cards/settings + RLS ou filtro na API), rate limiting (Workers KV), HTTPS automático (resolve o "contexto seguro" dos modelos).

**Privacidade como marketing**: "seu áudio nunca sai do seu dispositivo" — é literalmente verdade no tier free (STT/MT locais) e é diferencial real contra concorrentes que mandam áudio para a nuvem.

## Fase D — Monetização (LemonSqueezy ou Stripe)

| Tier | O que inclui | Custo p/ você |
|---|---|---|
| **Free** | tudo local: captura por aba, Whisper/MT no dispositivo, SRS, exercícios, importação de documento/web | ~R$0 (estático + CRUD) |
| **Pro (R$15–25/mês)** | STT de nuvem streaming (implementar `streamingCloudStt.ts` com Deepgram/Gladia — Gladia free 480min/mês p/ testar), importação YouTube gerenciada, modelos maiores, sync multi-dispositivo, painéis de IA (Analysis/Hub/Metrics "em breve") | APIs pagas repassadas no preço |
| **Desktop/Self-host** | instalador com servidor local: captura de sistema WASAPI sem fricção + yt-dlp + 100% offline | zero marginal |

BYOK continua: usuário com chave própria (Groq/Gemini) usa recursos de nuvem no free.

## Fase E — Escala e qualidade contínua

- Moonshine (27M–250M params, WER ≤ Whisper large-v3 no streaming) como engine opcional via Transformers.js — download menor e latência proporcional ao áudio; reavaliar quando os pesos ONNX estabilizarem.
- Eval de regressão de qualidade STT/MT (golden set de áudios curtos + WER, via promptfoo/DeepEval).
- Observabilidade de custo por rota (Langfuse p/ LLM; contadores simples p/ STT).

## Pendências funcionais herdadas (prioridade)

1. `streamingCloudStt.ts` (stub → Pro).
2. Painéis IA "em breve" (`AnalysisExpandedKpi`, `Hub`, `Metrics`) — LLM local/nuvem com consentimento.
3. Galeria de providers (`AiEnginePanel`).
4. opus-mt frágil: detectar falha de sessão ONNX e AVISAR o usuário que a tradução caiu para rede (hoje é silencioso); avaliar pares além de EN↔ROMANCE.
5. Botão "Descartar sessão" no modal de encerramento.
6. Changes OpenSpec: `assistant-agent-rag`, `vision-ocr-web`, `reading-mode-web`; e sincronizar os `tasks.md` com a realidade.

## Referências de pesquisa (2026-07)

- Cloudflare free tier / comparativos: northflank.com, snapdeploy.dev, blog.vibecoder.me
- STT APIs: Gladia (480 min/mês free), gradium.ai
- Tradução: DeepL free 500k chars/mês, Google Translate 500k chars/mês
- Moonshine: github.com/moonshine-ai/moonshine · huggingface.co/UsefulSensors
