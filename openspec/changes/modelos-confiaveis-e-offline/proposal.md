## Why

A frente de disponibilidade da auditoria de 17/11/2026 achou cinco falhas que, juntas, deixam a legenda local frágil e
invisível para o time:

- **DISP-01 (PLAUSIVEL, "atrapalha")**: um `.onnx` truncado que chega com status 200 é gravado no Cache Storage. Daí em
  diante a legenda fica morta para sempre: 0 falas em 90 s depois de reabrir o navegador, 0 pedidos ao HF (o modelo veio do
  cache) e "protobuf parsing failed" na tela. A transformers.js 4.2.0 grava sem conferir o tamanho. O revisor rebaixou a
  frequência (uma queda real de Wi-Fi vira erro de rede e não envenena), mas não há autocorreção quando a sessão ONNX
  falha.
- **DISP-02 (PLAUSIVEL)**: não há service worker (`/sw.js` dá 404). Iniciar offline falha com "Worker error" ao lado da
  promessa "A legenda roda no aparelho e nada se perde" (`pecas.tsx:216`), e recarregar offline deu página em branco.
- **DISP-03 (CONFIRMADO)**: mensagens técnicas e em inglês na tela: "Failed to fetch", "Worker error", "Can't create a
  session. ERROR_CODE: 7" e a instrução incondicional de rodar "npm install" (`systemAudio.ts:759-762`). DISP-04
  (CONFIRMADO, polimento): o erro some e a tela volta a "Pronto para legendar" sem rastro.
- **DISP-05 (CONFIRMADO)**: os pesos vêm de `huggingface.co` → `us.aws.cdn.hf.co` (cerca de 176 MB) e o
  `ort-wasm-simd-threaded.asyncify.wasm` vem de `cdn.jsdelivr.net`. `modelos.frasy.com.br` está liberado na CSP, mas não é
  usado (`/` e `/ort/` dão 404). Uma queda ou um bloqueio de rede escolar derruba a legenda sem alarme.
- **DISP-06 (CONFIRMADO) e LB-06/COMP-10**: o visitante não tem observabilidade de erro. O Sentry não está no bundle (0 DSN
  em 48 JS), o beacon do Cloudflare Web Analytics é bloqueado pela CSP em toda página, e as falhas tratadas na UI ("Não foi
  possível preparar o modelo") não são reportadas nem para quem tem conta.

Evidências (relativas a `reports/auditoria-qualidade/`): `disponibilidade/runs/download-cortado-hf-trunc/02-corte.png` e
`resultado.json`, `disponibilidade/runs/envenenado-2-reaberto/resultado.json`, `disponibilidade/runs/offline/03-offline-capturando.png`
e `05-offline-recarregou.png`, `disponibilidade/runs/offline-durante/`, `disponibilidade/runs/download-cortado-amplo/resultado.json`,
`disponibilidade/runs/download-cortado-hf-abort/`, `disponibilidade/runs/tela-negada/01c-inicio-1s.png` e `02-depois.png`,
`disponibilidade/runs/primeiro-uso/resultado.json`, `disponibilidade/cabecalhos.json`, `linha-de-base/lighthouse-detalhe.json`.
Scripts: `disponibilidade/cenario.mjs`, `rodar-envenenado.sh`, `rodar-corte-hf.sh`, `rodar-corte.sh`.

## What Changes

- **Cache de pesos que se valida e se cura**: antes de gravar no Cache Storage, o peso é conferido contra um manifesto
  gerado no build (bytes e sha256 de cada arquivo na revisão fixada de `revisoesDosModelos.ts`). O arquivo que não confere
  não é gravado. Se a sessão ONNX falha ao carregar um modelo do cache, as entradas daquele modelo são apagadas e a carga
  é refeita uma vez da rede. Se falhar de novo, a captura rebaixa para o modelo menor e diz isso em pt-BR.
- **Abrir e legendar offline no app já visitado**: um service worker mínimo, escopo `/app/`, faz o precache do shell e dos
  chunks da captura (workers de STT, VAD e tradução, runtime ORT, VAD `.onnx`). O HTML é network-first com reserva no cache,
  e `/api/*` nunca é cacheado. A promessa "roda no aparelho" só aparece quando o worker e o modelo estão de fato
  disponíveis offline.
- **Espelho próprio em produção**: os pesos e o runtime ORT são servidos de `modelos.frasy.com.br` (R2). Os workers do
  transformers.js passam a apontar `wasmPaths` para `baseDoWasm()` (hoje só o VAD, o fim de fala e o `offlineTranscribe`
  fazem isso). A CSP de produção deixa de liberar `huggingface.co`, `*.hf.co` e `cdn.jsdelivr.net`. Dev e self-host
  continuam podendo usar o Hub.
- **Mensagens humanas**: um mapa de falhas (rede caiu no download, modelo corrompido, sem internet, worker não carregou,
  detector de fala não carregou, compartilhamento negado) para texto em pt-BR com a ação certa. "npm install" só aparece
  em dev e no self-host. O erro fica num aviso persistente junto ao Iniciar até a próxima tentativa, com um toast só.
- **Observabilidade mínima do visitante** (o dono decide a forma, ver Open Questions): um contador anônimo e agregado de
  tipos de falha, sem conteúdo, mais a decisão sobre o beacon do Cloudflare (desligar a injeção na zona ou liberá-lo na
  CSP), para o console não ter erro de CSP em toda carga.

## Capabilities

### New Capabilities

- `modelos-locais-confiaveis`: integridade do cache de pesos, autocorreção, espelho próprio e funcionamento offline do app
  já visitado.
- `falhas-visiveis-e-contadas`: mensagens de falha humanas e persistentes, e a contagem anônima das falhas do visitante.

### Modified Capabilities

(nenhuma)

## Impact

- Novos: `src/gateway/cacheDePesos.ts` (o `customCache` validado), `src/gateway/manifestoDosPesos.json` (gerado por
  `scripts/modelos/gerar-manifesto-dos-pesos.mjs` a partir da API do Hub, o mesmo `lfs.oid` que `publicar-no-r2.ts` já
  confere), `src/core/falhas/mensagemDeFalha.ts`, `public/sw.js` gerado no build por `scripts/vite/` a partir do
  `manifest.json` do Vite, e `src/lib/registrarSw.ts`.
- Alterados: `src/gateway/adapters/transformersEnv.ts`, `whisperWorker.ts`, `mtWorker.ts`, `parakeetWorker.ts` (`wasmPaths`
  e a cura), `src/gateway/capture/systemAudio.ts` (a mensagem do VAD), `src/lib/captura/fontesDeAudio.ts` (toast único e
  aviso persistente), `src/components/views/captura/pecas.tsx` (a promessa de offline), `server/http/csp.ts` e
  `scripts/vite/cabecalhos.ts` (origens por ambiente, `worker-src` do service worker), `server/http/siteNoWorker.ts`
  (servir `/app/sw.js` sem cache longo), `.github/workflows/deploy-worker.yml` (variáveis).
- Se o dono escolher o contador: rota nova `POST /api/falhas-do-cliente` (só enum, sem id de usuário, com limite de taxa) e
  métrica `cliente_falha_total{tipo,aparelho}`.

## Prioridade, esforço, riscos e dono

- **Prioridade**: P1. A cura do cache e as mensagens humanas são baratas e vêm primeiro; o espelho em seguida (é quase só
  configuração); o service worker por último, por ser o mais arriscado.
- **Esforço**: médio a grande (cerca de 5 a 7 dias). Cache e cura: 1,5. Mensagens: 1. Espelho e CSP: 1 (mais o tempo de
  publicação do dono). Service worker: 2 a 3. Observabilidade: 0,5 a 1.
- **Riscos**:
  - O service worker pode servir uma versão velha do app. Mitigação: HTML network-first, `skipWaiting` só entre sessões de
    captura, versão no nome do cache, e um botão de "desregistrar" no diagnóstico.
  - O sha256 de um peso de 60 MB custa CPU no celular. Mitigação: calcular no worker, em streaming, só na primeira gravação.
  - Tirar o Hub da CSP de produção sem o bucket completo quebra a legenda. Mitigação: um portão de deploy confere que cada
    arquivo do manifesto responde 200 no bucket antes de publicar a CSP nova.
  - O contador anônimo muda a promessa "no modo sem conta nada sai deste navegador" (`relatorioDeErros.ts`). Exige decisão
    do dono e revisão do texto de privacidade.
- **Precisa do dono**:
  1. Credencial do R2 para rodar `scripts/modelos/publicar-no-r2.ts` (pesos e `--prefixo=ort/<versão>`), e definir
     `VITE_SELF_HOST_MODELS` e `VITE_ORT_WASM_URL` no Environment `production`.
  2. Monitor no UptimeRobot para `modelos.frasy.com.br` (um peso pequeno e o `.wasm`).
  3. Observabilidade do visitante: (a) contador anônimo agregado (recomendado), (b) Sentry também para o visitante, ou (c)
     nada. E o beacon do Cloudflare: desligar a injeção na zona (recomendado: coerente com o público menor) ou liberar
     `static.cloudflareinsights.com` na CSP.
  4. Aprovar o service worker (muda o comportamento de atualização do app).
