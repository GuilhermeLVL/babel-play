# Spikes da migração para Cloudflare (Fase 0)

Branch `cloudflare/migracao`. Plano: `~/.claude/plans/acabei-de-testar-a-nested-reddy.md`. Nada aqui altera a `main` nem o deploy no Fly.

## Resultado até agora

| Spike                                | Estado                       | Resultado                                                                                                                         |
| ------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| S2 Express em Workers                | **parcial, local (workerd)** | Ver abaixo                                                                                                                        |
| S4 zstd no Node 22                   | **parcial**                  | `zlib.zstdDecompressSync` existe no Node 22.15+ (e no 24.22 local). O Docker estava desligado, então não rodei no `node:22-slim`. |
| S1 Latência do D1 a partir do Brasil | **pendente**                 | Exige conta Cloudflare (`wrangler login`).                                                                                        |
| S3 Container com Litestream          | **pendente**                 | Exige conta Cloudflare.                                                                                                           |
| S5 Bundle e arquivos                 | **pendente**                 |                                                                                                                                   |

## S2 em detalhe (workerd local, `nodejs_compat`, wrangler 4.151.1)

1. **Express mínimo** com `httpServerHandler` de `cloudflare:node`: responde `/api/health` e **mantém o roteamento sensível à caixa** (`/API/health` não casa com `/api/health`), o que protege a regressão do AAL2.
2. **Falha 1 (corrigível):** `body-parser` do Express 4 usa `iconv-lite@0.4.24`, cujo `require('./streams')` quebra no bundle do workerd (`require_streams(...) is not a function`). Funcionou com `iconv-lite@0.7.0` (override do npm ou `alias` no `wrangler.jsonc`). O repo hoje resolve `0.4.24`.
3. **`criarApp` real** (`server/http/app.ts`) empacota e carrega, com helmet, compression, jose e as rotas, **até abrir o banco**. Para aí em `@libsql/client`: `URL_SCHEME_NOT_SUPPORTED ... got "file:"`. Ou seja, o bloqueio é o banco (Fase 1), não o Express.
4. **Não provado:** boot completo (depende do banco), tamanho do bundle em produção, cold start, rotas autenticadas.

## Próximo

- S1 e S3 precisam de login: `! npx wrangler login` (ou `wrangler deploy --temporary`, conta de preview temporária, a validar se cria D1).
- S5: medir o bundle do Worker e os arquivos de `dist/` contra o limite de 25 MiB do Pages.
- Portão G0 só depois de S1.
