## Context

- **Entrega dos pesos** (`src/gateway/adapters/transformersEnv.ts`): `VITE_SELF_HOST_MODELS` ausente busca do Hub; `1` busca
  de `/models` no mesmo domínio, com o Hub de reserva; uma URL `https://…` busca do bucket R2 publicado por
  `scripts/modelos/publicar-no-r2.ts` (layout `<modelo>/<sha>/<arquivo>`, sha256 conferido contra o `lfs.oid`). A revisão
  é fixada por `urlFixadaDoModelo` (`revisoesDosModelos.ts`). `env.useBrowserCache = true`: a transformers.js grava no
  Cache Storage o que o `fetch` devolver, sem conferir o tamanho.
- **Runtime ORT**: `baseDoWasm()` (`VITE_ORT_WASM_URL` ou `/`) já é usado por `vadWorker.ts:35`, `fimDeFalaWorker.ts:23` e
  `offlineTranscribe.ts:178`. Os workers da transformers.js (`whisperWorker`, `mtWorker`) não definem `wasmPaths`, então a
  biblioteca usa o jsDelivr (`csp.ts:12-14` documenta isso).
- **CSP** (`server/http/csp.ts`, espelhada no `dist/_headers` por `scripts/vite/cabecalhos.ts`): `connect-src` libera
  `huggingface.co`, `*.huggingface.co`, `*.hf.co` e `cdn.jsdelivr.net`.
- **Sem service worker**. O `/app` sai com `max-age=0, must-revalidate`. A sessão já em curso sobrevive à queda de rede
  (`disponibilidade/runs/offline-durante`); o problema é começar ou recarregar offline.
- **Erros**: `systemAudio.ts:759-762` escreve a instrução de "npm install" sem distinguir dev, self-host e produção.
  `fontesDeAudio.ts:377` prefixa "Erro na captura do sistema:". A transformers.js propaga "Failed to fetch" e "Can't create a
  session".
- **Relatório de erros** (`src/lib/relatorioDeErros.ts`): `window.onerror`, `unhandledrejection` e ErrorBoundary vão a
  `POST /api/erros-do-cliente` pelo funil `apiFetch`. Sem conta, o funil desvia para o servidor em memória e nada sai, por
  promessa de privacidade. O Sentry direto do navegador só existe com `VITE_SENTRY_DSN`, e só com conta.

## Goals / Non-Goals

**Goals:**

- Um peso corrompido nunca fica no cache; se ficar, a próxima carga se cura sozinha.
- Quem já usou o app abre `/app` e legenda sem rede.
- Em produção, nenhuma requisição a `huggingface.co`, `*.hf.co` ou `cdn.jsdelivr.net`.
- Nenhuma mensagem técnica ou em inglês na tela de produção.
- O time sabe quantas falhas de carga de modelo o visitante tem por dia, sem conteúdo nem identidade.

**Non-Goals:**

- Instalação como PWA (manifesto de instalação, ícones, push).
- Precache dos pesos dos modelos pelo service worker (eles já ficam no Cache Storage da transformers.js e somam centenas de
  MB).
- Sentry para o visitante, a menos que o dono escolha a opção (b).

## Decisions

1. **`customCache` validado** (`src/gateway/cacheDePesos.ts`): implementa `match`/`put` sobre o Cache Storage e é
   instalado em `configureModelDelivery` (`env.useCustomCache = true; env.customCache = …`). No `put`, consome o corpo em
   streaming, conta os bytes e calcula o sha256 (WebCrypto, no próprio worker). Grava só se bater com
   `manifestoDosPesos.json` (chave `<modelo>@<sha>/<arquivo>`). Arquivo fora do manifesto (config pequena) grava se
   `content-length`, quando presente, bater com os bytes. Alternativa descartada: só `content-length`. O caso real da
   auditoria (truncado com 200 e sem `content-length`) passaria.
2. **Cura na falha da sessão**: os workers capturam o erro de criação da sessão ONNX (protobuf, `ERROR_CODE`, tamanho
   inválido), apagam do cache as chaves do modelo e refazem a carga uma vez. Na segunda falha, emitem `modelo-corrompido` e
   a captura rebaixa pela escada que o regulador já usa (`trocarModelo`). É uma tentativa por modelo por página, para não
   entrar em laço.
3. **Manifesto gerado, versionado**: `scripts/modelos/gerar-manifesto-dos-pesos.mjs` usa a API `tree/<sha>` do Hub (a
   mesma de `publicar-no-r2.ts`) e grava bytes e sha256 dos arquivos que os workers carregam. Um teste prende o manifesto a
   `REVISOES_DOS_MODELOS`: revisão nova sem manifesto reprova.
4. **Service worker mínimo, escrito à mão e gerado no build** (sem `vite-plugin-pwa`, para não trazer dependência nova).
   `scripts/vite/` gera `dist/app/sw.js` com a lista de precache tirada do `manifest.json` do Vite: a entrada, os chunks
   estáticos da casca e os da captura (`LiveCapture`, `whisperWorker`, `vadWorker`, `mtWorker`, `bergamot`), mais o
   `silero_vad_legacy.onnx` e os `ort-wasm-*` locais. Estratégias: HTML network-first com reserva no cache em 3 s; assets
   com hash cache-first; `/api/*` e pesos de modelo sempre pela rede, sem passar pelo service worker. É registrado só em
   produção e no staging, depois do LCP (`requestIdleCallback`), escopo `/app/`. A versão do cache é o hash do build, e as
   versões velhas são apagadas no `activate`. A atualização entra na próxima abertura, nunca no meio de uma captura.
   Alternativa mais barata, guardada como fase 1 se o dono não aprovar o SW: `modulepreload`/`prefetch` dos chunks do
   worker quando Legendar abre. Isso resolve "Iniciar offline", mas não "recarregar offline".
5. **Promessa condicionada**: `pecas.tsx` só mostra "A legenda roda no aparelho" offline quando a sonda confirma o worker de
   STT carregável (o chunk está no cache do SW) e o modelo está no cache de pesos. Sem isso: "Sem internet. Para legendar
   sem rede, abra a legenda uma vez com internet."
6. **Espelho**: no build de produção, `VITE_SELF_HOST_MODELS=https://modelos.frasy.com.br` e
   `VITE_ORT_WASM_URL=https://modelos.frasy.com.br/ort/<versão>/`. `transformersEnv.ts` passa a definir
   `env.backends.onnx.wasm.wasmPaths = baseDoWasm()`. A CSP fica por ambiente: produção sem Hub e sem jsDelivr; dev,
   testes e self-host como hoje. Um portão no `deploy-worker.yml` faz um HEAD em cada arquivo do manifesto no bucket antes
   de publicar.
7. **Mensagens**: `src/core/falhas/mensagemDeFalha.ts` (puro) mapeia a classe da falha para `{ texto, acao }`:
   `download-interrompido` → "A conexão caiu enquanto baixávamos o modelo." + "Baixar de novo";
   `modelo-corrompido` → "O modelo baixado veio com defeito. Já apagamos a cópia." + "Baixar de novo";
   `sem-internet` → (decisão 5); `worker-indisponivel` → "Não deu para iniciar a legenda neste navegador agora." +
   "Recarregar"; `detector-de-fala` → "Não deu para carregar o detector de fala." + "Tentar de novo";
   `compartilhamento-negado` → "Para legendar, escolha uma aba e marque “Compartilhar áudio”." + "Escolher de novo".
   A classificação usa o tipo do erro (`TypeError` de fetch, `MotorAindaCarregando`, mensagens ORT conhecidas) e cai em
   "Algo deu errado ao preparar a legenda." + "Tentar de novo". "npm install" só com `import.meta.env.DEV` ou build
   self-host. A mensagem fica num aviso persistente junto ao Iniciar até a próxima tentativa; um toast só, sem prefixo
   técnico.
8. **Contador anônimo (opção recomendada ao dono)**: `navigator.sendBeacon('/api/falhas-do-cliente', {tipo, aparelho,
modelo})`, com `tipo` e `modelo` vindos de enums fechados e `aparelho` de `perfilDoDispositivo().tipo`. Sem id, sem
   pathname, sem texto. Fora do funil `apiFetch`, para funcionar sem conta, e no máximo 1 envio por tipo por página. O
   servidor valida o enum, aplica limite de taxa por IP e não grava o IP (só incrementa
   `cliente_falha_total{tipo,aparelho,modelo}`). O beacon do Cloudflare: desligar a injeção automática na zona (o dono faz
   no painel), sem mudar a CSP.

## Risks / Trade-offs

- [Service worker preso numa versão quebrada] → HTML network-first; um `?sw=desligar` na URL e um botão no Diagnóstico
  desregistram; o `sw.js` sai sempre com `Cache-Control: no-cache`.
- [Custo do sha256 no celular] → Só na primeira gravação e no worker. Medir: no máximo +15% no tempo de primeira carga do
  whisper-base no perfil celular.
- [Bucket incompleto] → Portão de deploy (decisão 6) e monitor do UptimeRobot.
- [Privacidade do contador] → Enum fechado; o teste do servidor rejeita qualquer campo extra; texto de privacidade
  revisado com o dono antes de ligar.

## Migration Plan

1. Mensagens e cura do cache (sem dependência do dono).
2. Dono publica no R2; deploy com as variáveis e a CSP por ambiente; portão verde.
3. Service worker no staging por 1 semana (rodadas de `disponibilidade/cenario.mjs`), depois produção.
4. Contador, se aprovado.

Rollback do SW: publicar um `sw.js` que se desregistra (`self.registration.unregister()`) e limpa os caches.

## Open Questions

- (Dono) Opção de observabilidade: (a) contador, (b) Sentry para o visitante, (c) nada.
- (Dono) Beacon do Cloudflare: desligar na zona ou liberar na CSP.
- (Dono) Aprovar o service worker ou ficar na fase 1 (pré-carga dos chunks).
