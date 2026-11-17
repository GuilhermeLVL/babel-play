## 1. Mensagens humanas (sem dependência do dono)

- [ ] 1.1 Criar `src/core/falhas/mensagemDeFalha.ts` (classe da falha → `{ texto, acao }`) e o classificador de erros. Verificar: `tests/mensagemDeFalha.test.ts` com cada classe e o desconhecido.
- [ ] 1.2 `systemAudio.ts:759-762`: "npm install" só com `import.meta.env.DEV` ou build self-host; em produção, a classe `detector-de-fala`. Verificar: teste com o ambiente simulado.
- [ ] 1.3 `fontesDeAudio.ts`: toast único, sem o prefixo "Erro na captura do sistema:", e aviso persistente junto ao Iniciar até a próxima tentativa. Verificar: teste de componente (+30 s com relógio falso) e portões de i18n da CI.

## 2. Cache de pesos validado e cura

- [ ] 2.1 `scripts/modelos/gerar-manifesto-dos-pesos.mjs` → `src/gateway/manifestoDosPesos.json` (bytes e sha256 por `<modelo>@<sha>/<arquivo>`, só os dtypes carregados). Verificar: teste que prende o manifesto a `REVISOES_DOS_MODELOS`.
- [ ] 2.2 `src/gateway/cacheDePesos.ts` (`customCache` com `match`/`put` validados em streaming) instalado em `configureModelDelivery`. Verificar: teste com `Response` truncada (não grava) e íntegra (grava).
- [ ] 2.3 Cura nos workers (`whisperWorker`, `mtWorker`, `parakeetWorker`, moonshine): erro de sessão → apaga as chaves do modelo → 1 nova carga → `modelo-corrompido` e rebaixamento. Verificar: teste do worker com cache envenenado simulado.
- [ ] 2.4 Medir o custo do sha256 no perfil celular. Verificar: primeira carga do whisper-base no máximo +15% (bancada `scripts/perf/latencia-legenda/bancada-captura.mjs --perfis fraco`).

## 3. Espelho próprio e CSP

- [ ] 3.1 `transformersEnv.ts`: `env.backends.onnx.wasm.wasmPaths = baseDoWasm()` para os workers da transformers.js. Verificar: teste que importa a configuração com `VITE_ORT_WASM_URL` definida.
- [ ] 3.2 CSP por ambiente em `server/http/csp.ts` e `scripts/vite/cabecalhos.ts`: produção sem Hub e sem jsDelivr quando `VITE_SELF_HOST_MODELS` é uma URL. Verificar: os testes de CSP (os dois lados iguais) com e sem a variável.
- [ ] 3.3 Portão no `.github/workflows/deploy-worker.yml`: HEAD de cada arquivo do manifesto no bucket. Verificar: rodar os testes que leem o YAML (lição registrada na memória do projeto) e uma execução com um arquivo ausente que falha.
- [ ] 3.4 (Dono) Publicar pesos e ORT no R2 e definir as variáveis em `production`; monitor no UptimeRobot. Verificar: `cenario.mjs primeiro-uso` com 0 requisições a `huggingface.co`, `*.hf.co` e `cdn.jsdelivr.net` e pelo menos 90 falas.

## 4. Offline

- [ ] 4.1 (Fase 1, independe da aprovação do SW) Pré-carga dos chunks do worker de STT, do VAD e do ORT quando Legendar abre. Verificar: `cenario.mjs offline` com Iniciar offline produzindo pelo menos 1 fala.
- [ ] 4.2 Gerador do `sw.js` em `scripts/vite/` a partir do `manifest.json` do Vite; `src/lib/registrarSw.ts` (só produção e staging, depois do LCP); `server/http/siteNoWorker.ts` serve `/app/sw.js` com `no-cache`. Verificar: teste do gerador (lista de precache sem `/api` e sem pesos) e `npm run build`.
- [ ] 4.3 Promessa offline condicionada em `pecas.tsx`. Verificar: teste de componente com e sem modelo no cache.
- [ ] 4.4 Saída de emergência: `?sw=desligar` e botão no Diagnóstico. Verificar: e2e que registra e desregistra.
- [ ] 4.5 Rodar `cenario.mjs offline` e a recarga offline contra o staging. Verificar: a casca aparece, Legendar abre, pelo menos 1 fala em 60 s.

## 5. Observabilidade (depois da decisão do dono)

- [ ] 5.1 (Opção a) `POST /api/falhas-do-cliente` com validação de enum, limite de taxa, sem gravar IP; métrica `cliente_falha_total`; envio por `sendBeacon` fora do funil, 1 por tipo por página. Verificar: testes de rota (400 com campo extra, contagem com o corpo válido) e teste do cliente.
- [ ] 5.2 Revisar o texto de privacidade e o topo de `relatorioDeErros.ts` com o dono. Verificar: aprovação registrada no PR.
- [ ] 5.3 (Dono) Desligar a injeção do Web Analytics na zona, ou liberar na CSP. Verificar: Lighthouse de `/` e `/app` sem `cloudflareinsights` em `consoleErros` (`scripts/perf/frontend.mjs --url=https://frasy.com.br --rotas=/,/app`).

## 6. Verificação final

- [ ] 6.1 Rodar `disponibilidade/rodar-envenenado.sh`, `rodar-corte-hf.sh` e `rodar-corte.sh` contra o staging. Verificar: pelo menos 80 falas na fase reaberto e 0 textos técnicos visíveis (regex da spec).
- [ ] 6.2 `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` verdes.
