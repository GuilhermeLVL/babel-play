## Why

O servidor assume um processo e um disco em pontos que o modo cluster e o deploy multi-replica nao cobrem, e o inventario de configuracao nao corresponde ao codigo (achados A33, A34, A60, A61 e secao 5 de `openspec/audits/2026-09-07-coerencia.md`):

- `data/secret.key` e gerada e lida em `process.cwd()` (`server/crypto.ts:17,40`), ignorando `DATA_DIR`/`DATABASE_URL` que `server.ts:430-436` ja deduz para o diario; sem `SECRET_KEY`, duas replicas nao decifram as credenciais uma da outra.
- `bootStatus` e por processo (`server/lib/bootStatus.ts:20`): so o primario roda migracao/backfill (`server.ts:512-548`), entao `/api/health` responde `degraded` no primario e `ok` nos workers, alternando conforme o balanceador.
- A reconciliacao de armazenamento roda dentro de `GET /api/me/entitlements` (`me.ts:237-243` → `storageQuota.ts:230-250`), O(n sessoes) com `stat`/`HEAD S3` por arquivo, sem lock: duas requisicoes simultaneas varrem duas vezes.
- Por worker: N sinks de erro no mesmo `.jsonl` e N podas (`server.ts:450-468`, `diarioDeErros.ts:66-80`); mutex de loopback WASAPI por processo (`loopback.ts:44`) com o dispositivo global; caches em memoria (`images.ts:20`, `erros.ts:42`); `seedIfEmpty` cria sessao e cartoes de demonstracao para `LOCAL_OWNER` em toda base nova, inclusive publica (`seed.ts:11-48`).
- Audio referenciado no banco e ausente no disco da replica responde 404 "arquivo ausente" (EXEC) — o seam S3 existe (`armazenamento.ts:182-194`) e nao e obrigatorio em multi-replica.
- `server/lib/config.ts:77-111` se apresenta como "o contrato" e nao declara `S3_*` (`armazenamento.ts:183`), `ASAAS_*` (`asaas.ts:18-30`), `LLM_RESERVA_*` (`mtProxy.ts:87-92`), `ESSENCIAL_*`/`*_STORAGE_MB` (`usageQuota.ts:29`, `storageQuota.ts:36-44`), `ANKI_MEDIA_DIR` (`ankiMidia.ts:20`); `.env.example` nao declara `OLLAMA_MODEL`, `DATA_DIR`, `ERROS_DIR`, `MIGRATIONS_DIR`; `OLLAMA_URL` e cravada em `server.ts:240` e `profiles.ts:10`.

## What Changes

- `secret.key` vive em `diretorioGravavel()` (mesma regra do diario); em `NODE_ENV=production` continua obrigatoria por env; teste que prova que dois processos com o mesmo `DATA_DIR` decifram o mesmo segredo.
- `bootStatus` persistido (tabela `manutencao` ou arquivo em `DATA_DIR`) e lido por `/api/health` em qualquer processo; teste com `prepararDados:false` responde o mesmo que o primario.
- Reconciliacao: reivindica a janela (`updatedAt` otimista) ANTES de varrer; no maximo uma varredura em voo por usuario; fora do caminho de `entitlements` quando `STORAGE_RECONCILE_MODE=job`.
- Multi-replica declarada: `CLUSTER_WORKERS>1` ou `REPLICAS>1` exige `S3_*` (ou volume compartilhado declarado) e recusa loopback WASAPI; diario com sufixo de PID; `seedIfEmpty` so em `!authRequired()`.
- `config.ts` completo e testado: um teste varre `server/**` por `process.env.X` e falha se `X` nao esta em `VARIAVEIS`; `.env.example` gerado de `VARIAVEIS` (ou verificado contra ele); `OLLAMA_URL` e `GEMINI_MODEL` viram variaveis.

## Capabilities

### New Capabilities
- `replica-sem-estado-local`: nada que o servidor precisa para responder vive so na memoria ou no disco de um processo, ou a configuracao recusa o modo multi-processo.
- `config-declarada-igual-a-usada`: o inventario de configuracao e o unico lugar onde variaveis existem, e o CI prova.

## Impact

- `server/crypto.ts`, `server/lib/{bootStatus,config,storageQuota,diarioDeErros}.ts`, `server/routes/{health,me}.ts`, `server.ts` (boot, cluster), `server/audio/loopback.ts`, `server/db/seed.ts`, `server/lib/armazenamento.ts`
- `.env.example`, `.env.docker.example`, `docker-compose.yml` (comentarios), `docs/deploy.md`
- Novos testes: `tests/integration/config-inventario.test.ts`, `secret-key-compartilhada.test.ts`, `boot-status-cluster.test.ts`, `reconciliacao-concorrente.test.ts`
- Remove: `OLLAMA_URL` cravada (2x); `seedIfEmpty` em modo publico

## Pronto quando

Os quatro testes novos verdes; `config-inventario` prova `VARIAVEIS` == variaveis lidas no codigo; `.env.example` contem todas as declaradas; `npm test` verde.

## Dependencias e paralelismo

Depende de `linha-de-base-verde`. Paralelizavel com `idioma-alvo-e-ui-respeitados`, `modo-anonimo-em-paridade`, `jogos-culturais-dentro-do-sistema`; coordenar `config.ts` com `servicos-sem-duplicata` (esta declara, aquela consome).
