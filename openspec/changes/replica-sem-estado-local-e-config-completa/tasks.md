## 1. Segredo e boot

- [ ] 1.1 `crypto.ts`: chave em `diretorioGravavel()`; producao exige `SECRET_KEY` (ja); teste de dois processos com o mesmo `DATA_DIR`
- [ ] 1.2 `bootStatus` persistido e lido por `/api/health` em qualquer processo; teste com worker (`prepararDados:false`)

## 2. Reconciliacao

- [ ] 2.1 Reivindicar janela antes de varrer (update condicional em `updatedAt`); uma varredura em voo por usuario
- [ ] 2.2 `STORAGE_RECONCILE_MODE=job` tira a varredura do caminho de `entitlements`
- [ ] 2.3 Teste de concorrencia: duas chamadas simultaneas varrem uma vez

## 3. Multi-processo declarado

- [ ] 3.1 `CLUSTER_WORKERS>1` sem `S3_*`/volume declarado: recusa no boot com mensagem; loopback recusa cluster
- [ ] 3.2 Diario de erros com sufixo de PID; poda so no primario
- [ ] 3.3 `seedIfEmpty` so em `!authRequired()`

## 4. Inventario de configuracao

- [ ] 4.1 `VARIAVEIS` completo (S3_*, ASAAS_*, LLM_RESERVA_*, ESSENCIAL_*, *_STORAGE_MB, ANKI_MEDIA_DIR, OLLAMA_URL, GEMINI_MODEL, DATA_DIR, ERROS_DIR, MIGRATIONS_DIR, OLLAMA_MODEL)
- [ ] 4.2 `tests/integration/config-inventario.test.ts`: varre `server/**` por `process.env.X` e por `env[...]` dinamico com prefixo conhecido
- [ ] 4.3 `.env.example` e `.env.docker.example` verificados contra `VARIAVEIS`
- [ ] 4.4 `npm test` verde; `docs/deploy.md` atualizado
