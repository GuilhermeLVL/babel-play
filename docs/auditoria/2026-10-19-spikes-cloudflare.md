# Spikes da migração para Cloudflare (Fase 0)

Branch `cloudflare/migracao`. Plano: `~/.claude/plans/acabei-de-testar-a-nested-reddy.md`. Nada aqui altera a `main` nem o deploy no Fly.

## Resultado até agora

| Spike                                | Estado                       | Resultado                                                                                                                                    |
| ------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| S2 Express em Workers                | **parcial, local (workerd)** | Ver abaixo                                                                                                                                   |
| S4 zstd no Node 22                   | **parcial**                  | `zlib.zstdDecompressSync` existe no Node 22.15+ (e no 24.22 local). O Docker estava desligado, então não rodei no `node:22-slim`.            |
| S1 Latência do D1 a partir do Brasil | **pendente**                 | Exige conta Cloudflare (`wrangler login`).                                                                                                   |
| S3 Container com Litestream          | **pendente**                 | Exige conta Cloudflare.                                                                                                                      |
| S5 Bundle e arquivos                 | **feito, local**             | Ver abaixo: servidor cabe num Worker (4,8 MB bruto / 1,4 MB gzip); nenhum arquivo de `dist/` passa de 25 MiB, mas um fica a 0,4 % do limite. |

## S2 em detalhe (workerd local, `nodejs_compat`, wrangler 4.151.1)

1. **Express mínimo** com `httpServerHandler` de `cloudflare:node`: responde `/api/health` e **mantém o roteamento sensível à caixa** (`/API/health` não casa com `/api/health`), o que protege a regressão do AAL2.
2. **Falha 1 (corrigível):** `body-parser` do Express 4 usa `iconv-lite@0.4.24`, cujo `require('./streams')` quebra no bundle do workerd (`require_streams(...) is not a function`). Funcionou com `iconv-lite@0.7.0` (override do npm ou `alias` no `wrangler.jsonc`). O repo hoje resolve `0.4.24`.
3. **`criarApp` real** (`server/http/app.ts`) empacota e carrega, com helmet, compression, jose e as rotas, **até abrir o banco**. Para aí em `@libsql/client`: `URL_SCHEME_NOT_SUPPORTED ... got "file:"`. Ou seja, o bloqueio é o banco (Fase 1), não o Express.
4. **Não provado:** boot completo (depende do banco), tamanho do bundle em produção, cold start, rotas autenticadas.

## Próximo

- S1 e S3 precisam de login: `! npx wrangler login` (ou `wrangler deploy --temporary`, conta de preview temporária, a validar se cria D1).
- S5: medir o bundle do Worker e os arquivos de `dist/` contra o limite de 25 MiB do Pages.
- Portão G0 só depois de S1.

## S5: tamanho do bundle e dos arquivos estáticos (medido em 2026-10-19)

- `server/http/app.ts` empacotado com esbuild (`--packages=bundle`, minificado, sem `node:*`, libsql, jsdom e prom-client): **4,8 MB bruto, 1,4 MB gzip**. Cabe com folga no limite do Worker (64 MiB descomprimido, Free e Paid, doc de 12/10/2026). Maiores pedaços: código do app 2,0 MB, `undici` 518 KiB, `pdfjs-dist` 482 KiB, `iconv-lite` 478 KiB, `zod` 445 KiB.
- `dist/` tem 1.025 arquivos e 186 MB. **Nenhum passa de 25 MiB**, mas `ort-wasm-simd-threaded.jsep.wasm` tem 26.101.073 bytes contra o limite de 26.214.400 (0,4 % de folga): qualquer atualização do onnxruntime pode estourar. Os outros grandes: `ort-wasm-simd-threaded.asyncify` 23,6 MB e o Bergamot pt-en 22,7 MB (já previsto para o R2).
- Recomendação: servir os `.wasm` do onnxruntime e os modelos pelo R2 (com `Cache-Control` longo), não pelo Pages/Static Assets.

## S1: latência do D1 a partir do Brasil (medido em 2026-10-19)

Worker no edge do Rio (`colo GIG`) chamando D1; cliente em casa, 25 amostras por célula. Banco criado "auto" caiu em **ENAM** (América do Norte Leste); também testei `weur`. O custo de ir ao edge e voltar (sem D1) é p50 117 ms / p95 135 ms.

| Rota simulada               | D1 ENAM, em sequência | D1 ENAM, 1 `batch` | D1 WEUR, 1 `batch` |
| --------------------------- | --------------------- | ------------------ | ------------------ |
| 1 leitura                   | 249 ms (p95 287)      | 251 (p95 469)      | 289 (p95 548)      |
| 3 leituras (tipo `/api/me`) | 565 (p95 714)         | 236 (p95 278)      | 278 (p95 452)      |
| 7 leituras                  | **1140 (p95 1334)**   | 245 (p95 691)      | 299 (p95 509)      |
| 3 leituras + 2 escritas     | **920 (p95 1220)**    | 259 (p95 658)      | 305 (p95 520)      |

- **Cada ida ao D1 custa ~130 ms (ENAM) ou ~175 ms (WEUR)**; um `batch` inteiro custa o mesmo que uma consulta. O código atual faz de 3 a 7 consultas em sequência por rota, então migrar "como está" dá 0,9 a 1,3 s por rota.
- Critério do plano (p95 ≤ 400 ms): **reprovado em sequência, aprovado só com `batch`** (e mesmo assim o p95 oscila até ~700 ms por ruído de rede).
- Durable Object com SQLite (consultas locais dentro do objeto, ~0 ms), com dica `sam` ou `enam`: **total p50 ~255 ms, p95 400 a 570 ms**, mas o hop Worker→DO custa os mesmos ~130 ms, e a dica `sam` não mudou nada, ou seja, o objeto não parece ter ficado em São Paulo. Resolve o N+1 (7 consultas custam o mesmo que 1), mas não elimina o salto até a América do Norte.
- Referência hoje: SQLite local no Fly GRU ≈ 0 ms por consulta; a rota custa só a rede do usuário.

**Conclusão G0 (parcial):** a migração "como está" fica de 5 a 10 vezes mais lenta. Só funciona se toda rota for reescrita para fazer **no máximo uma ida ao banco** (batch ou DO), o que é parte da Fase 1 e aumenta o risco e o esforço. Mesmo assim, a latência mínima fica em ~250 ms por requisição contra ~100 a 130 ms do Fly em São Paulo.

Recursos de teste (Worker `spike-lat`, bancos `spike-lat-auto` e `spike-lat-weur`) foram **apagados** ao fim.
