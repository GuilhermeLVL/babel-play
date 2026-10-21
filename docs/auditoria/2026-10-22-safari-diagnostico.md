# Diagnóstico do Safari: matriz de capacidades, telas e causas prováveis

Data: 21–22/10/2026 · Escopo: diagnóstico, sem mudar código de produto · Branch: `interface/t3`

Relato do dono: Safari no **macOS** (versão ainda desconhecida). "Lentidão forte em tudo", e não funcionaram
**captura de legenda, transcrição e tradução**.

## Como foi medido (e o que isto NÃO é)

- Playwright **WebKit 27.2** (build `webkit-2370`) no macOS do dono, headless, em dois perfis: desktop 1280×800 e
  `devices['iPhone 14']`. Chromium 156 (headless shell) para contraste.
- Alvos: staging (`https://frasy-staging.guigui-cruzeiro.workers.dev`) com usuário descartável (criado pelo
  `scripts/perf/_supabase-usuario.mjs`, idade declarada, apagado no fim por `DELETE /api/me` → 200, e a Admin API
  confirmou 404 depois; 4 usuários criados e apagados) e `npm run dev:local` (porta 3177, sem login).
- Por tela: tempo até a primeira tela e até `<main>`, rede quieta, erros de console, exceções, requisições
  falhas, workers criados, downloads de modelo. `longtask` e `long-animation-frame` **não existem no WebKit**
  (medido); no lugar, um batimento de 50 ms na thread principal (atraso máximo e atrasos > 200 ms), a cadência
  do `requestAnimationFrame` e uma sonda `page.evaluate` com prazo de 2 s. Memória: RSS dos processos do WebKit
  (`ps`, a cada 2 s), porque `performance.memory` não existe no WebKit.
- Roteiros no scratchpad (não versionados): `matriz.mjs`, `telas.mjs`, `hf.mjs`, `memoria.sh`.

**WebKit do Playwright não é o Safari.** Diferenças que importam aqui:

- é o motor de tronco (mais novo que o Safari do dono, quase certamente); recursos recentes podem faltar no
  Safari real (ver "depende da versão" abaixo);
- a emulação "iPhone 14" só troca UA, viewport e toque: roda no motor do Mac, com a memória do Mac e com APIs que
  o iOS não tem (`getDisplayMedia` existe na emulação e **não existe no Safari do iPhone**);
- o microfone é um dispositivo simulado ("Mock audio device 1", um tom), não fala;
- o contexto do Playwright é efêmero (como janela privada): o OPFS falhou aqui e provavelmente funciona no Safari
  normal;
- headless não mede o custo real de composição na GPU (o `backdrop-filter` do Safari, por exemplo).

## 1. Matriz de capacidades (staging; o dev local deu o mesmo nas linhas de isolamento)

| Capacidade                                                                          | WebKit desktop                 | WebKit "iPhone 14"        | Chromium desktop      | Depende da versão do Safari?                                                                                                                |
| ----------------------------------------------------------------------------------- | ------------------------------ | ------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `crossOriginIsolated`                                                               | **false**                      | **false**                 | true                  | Não: o staging manda `COEP: credentialless`, que o WebKit não implementa (só `require-corp`). `Document-Isolation-Policy` é só do Chromium. |
| `SharedArrayBuffer`                                                                 | **ausente**                    | **ausente**               | presente              | Idem (decorre do isolamento)                                                                                                                |
| WASM SIMD / relaxed SIMD / threads (validate)                                       | sim / sim / sim                | sim / sim / sim           | sim                   | SIMD desde 16.4; mas threads sem SAB = 1 thread                                                                                             |
| `AudioWorklet`                                                                      | sim                            | sim                       | sim                   | 14.1+                                                                                                                                       |
| `MediaRecorder` `audio/webm;codecs=opus` / `audio/webm` / `audio/mp4` / `audio/ogg` | sim / sim / sim / não          | idem                      | sim / sim / sim / não | **Sim**: webm só a partir do Safari 18.4; antes só `audio/mp4` (o app já cai nele: `systemAudio.ts:139`)                                    |
| `getUserMedia`                                                                      | sim (mock)                     | sim (mock)                | sim (fake)            | —                                                                                                                                           |
| `getDisplayMedia`                                                                   | existe (sem áudio de aba/tela) | existe **só na emulação** | existe, com áudio     | Safari nunca entrega áudio de aba; no iOS a API não existe                                                                                  |
| `navigator.gpu` / adaptador                                                         | sim / **adaptador**            | sim / adaptador           | sim / null (headless) | **Sim**: WebGPU ligado no Safari 26; antes, ausente                                                                                         |
| OPFS `storage.getDirectory()`                                                       | erro (contexto efêmero)        | erro                      | ok                    | Funciona no Safari normal; falha em janela privada                                                                                          |
| `storage.estimate()` cota                                                           | 1049 MB                        | 1049 MB                   | 10737 MB              | —                                                                                                                                           |
| `SpeechRecognition` / `webkitSpeechRecognition`                                     | não / sim                      | não / sim                 | sim / sim             | 14.1+; no Mac depende da Siri ligada                                                                                                        |
| Vozes `speechSynthesis` (após 1,5 s)                                                | 75                             | 75                        | 180                   | —                                                                                                                                           |
| Worker `type: module`                                                               | sim                            | sim                       | sim                   | 15+                                                                                                                                         |
| `requestIdleCallback`                                                               | **ausente**                    | **ausente**               | sim                   | Ausente em todas as versões estáveis                                                                                                        |
| `scheduler.postTask`                                                                | **ausente**                    | **ausente**               | sim                   | Ausente                                                                                                                                     |
| `document.featurePolicy`                                                            | ausente                        | ausente                   | sim                   | —                                                                                                                                           |
| `credentialless` em iframe                                                          | ausente                        | ausente                   | sim                   | —                                                                                                                                           |
| `performance.memory`                                                                | ausente                        | ausente                   | sim                   | —                                                                                                                                           |
| `longtask` / `long-animation-frame`                                                 | **ausentes**                   | ausentes                  | sim                   | —                                                                                                                                           |
| `hardwareConcurrency`                                                               | 8                              | 8                         | 15                    | Safari limita a 4 ou 8                                                                                                                      |
| `deviceMemory`                                                                      | ausente                        | ausente                   | 16                    | —                                                                                                                                           |
| `Translator` / `LanguageDetector`                                                   | **ausentes**                   | ausentes                  | sim                   | Ausentes                                                                                                                                    |
| `documentPictureInPicture`                                                          | ausente                        | ausente                   | sim                   | Ausente (Legendas flutuantes não abrem janela)                                                                                              |
| `Atomics.waitAsync`, `OffscreenCanvas`, `CompressionStream`, `wakeLock`             | sim                            | sim                       | sim                   | `DecompressionStream` desde 16.4 (o Bergamot precisa)                                                                                       |

Consequências diretas no app (`src/lib/dispositivo/perfil.ts`, `orcamentoDeThreads.ts`):

- **todo o ONNX/WASM roda em 1 thread** no Safari (`threadsWasm = 1`, `distribuirThreads` → tudo 1);
- **o Safari 26 do Mac é classificado `desktop-com-gpu`** (tem `getDisplayMedia` e adaptador WebGPU), então
  `permiteSmall = true` e `capturaDoSistema = true`;
- sem `Translator`, o tradutor é sempre o nosso (Bergamot/opus-mt), baixado e carregado no navegador;
- sem `requestIdleCallback`/`scheduler.postTask`, o que o app agenda "no ocioso" precisa de fallback (não
  verificado um a um aqui).

## 2. Telas

### Tempos (ms, staging; navegação direta com `goto`)

| Tela                                      | WebKit desktop: 1ª tela / rede quieta | WebKit iPhone | Chromium    | Batimento máx. (WebKit desk.) |
| ----------------------------------------- | ------------------------------------- | ------------- | ----------- | ----------------------------- |
| Porta (visitante, sem sessão)             | 641 até o trilho                      | 1 162         | 552         | 46                            |
| Início (recarga, conta já com onboarding) | —                                     | 379 / 1 350   | —           | 0                             |
| Capturar                                  | 381 / 1 670                           | 313 / 1 835   | 297 / 1 631 | 19                            |
| Intérprete                                | 521 / 1 979                           | 961 / 1 941   | 352 / 1 955 | 0                             |
| Biblioteca                                | 447 / 1 440                           | 297 / 1 220   | 275 / 958   | 0                             |
| Cartões                                   | 557 / 1 569                           | 391 / 2 309   | 271 / 1 241 | 0                             |
| Jogar (lobby)                             | 1 132 / 3 155                         | 303 / 2 287   | 657 / 2 195 | 68                            |
| Planos                                    | 1 159 / 2 707                         | 301 / 1 198   | 259 / 1 177 | 0                             |
| Ajustes                                   | 639 / 2 753                           | 280 / 1 577   | 252 / 1 172 | 0                             |

- Navegação pelo trilho (clique → URL nova + `<main>`): 212–271 ms no WebKit e 247–257 ms no Chromium. O painel
  "Mais" abre em 57–66 ms (WebKit) e 39 ms (Chromium); ele usa `backdrop-filter: blur(28px) saturate(1.7)` e, no
  celular, o trilho usa `blur(22px)` — custo que o headless não mede (pendente no Safari real).
- Jogar (Memória, uma rodada): palco em 1,1–1,5 s; clique em carta 94–115 ms em média, 408–930 ms no pior;
  fim de rodada em ~11,9 s no WebKit iPhone e no Chromium (no WebKit desktop o roteiro não fechou os pares a
  tempo na primeira versão; não é sinal de defeito).
- Nenhuma tela fora da captura teve a thread principal parada > 200 ms nem deixou de responder em 2 s.
- **Conclusão honesta: a lentidão geral NÃO se reproduz no WebKit headless numa máquina parada.** O que a
  explica no Safari real é o que roda POR TRÁS das telas (seção 3, causas 1 e 2).
- O "Início" de uma conta nova mostra o onboarding de 6 passos; o 1º tempo (~30 s) na tabela bruta é do roteiro
  esperando um seletor atrás do onboarding, não do app.

### Erros que aparecem em toda tela no staging (todos os navegadores)

- **Toast "Nova versão disponível" permanente**: o bundle embute `__APP_VERSION__ = "0.1.0"` e o servidor manda
  `x-babel-versao: 0.1.0+0b82814`; a conferência (`src/lib/versao.ts`) acusa diferença em toda resposta. "Atualizar"
  recarrega e volta igual. Bug de build do staging, não do Safari.
- `GET /api/ai/stt/available` → 501, `GET /api/audio/loopback/support` → 403 (esperados no Worker; viram erro de
  console).
- 503 esporádicos em `/api/exercises/*` (uma corrida no iPhone).
- Visitante: `GET /api/settings` → 401 (esperado).

### Capturar (o que o dono viu como "não funciona")

Linha do tempo no **WebKit desktop, staging**, microfone concedido, "Privado" (modelo local):

```
   48ms getUserMedia direto: ok 1 faixa(s): Mock audio device 1
  606ms diálogo: Este navegador não captura o som da tela … Entendi
  678ms liga microfone (o switch "Microfone mudo" do topo)
 3745ms diálogo: Como transcrever a sua voz? … → Privado → "Baixar e iniciar"
 5747ms gravando (Encerrar visível)
 5748ms texto: … Legendando · vai rodar no aparelho · O tradutor deste aparelho não carregou (pouca memória ou
        navegador sem suporte). As falas seguem sem tradução. …
105236ms encerrou   ← 100 s "Legendando" sem nenhuma legenda e sem aviso sobre a transcrição
```

Console no mesmo trecho (sem segredos):

```
Origin https://frasy-staging.guigui-cruzeiro.workers.dev is not allowed by Access-Control-Allow-Origin. Status code: 404
Fetch API cannot load https://huggingface.co/onnx-community/whisper-base/resolve/<rev>/config.json due to access control checks.
[whisper:worker] dtype {encoder_model: fp32, decoder_model_merged: q4} indisponível no repo, caindo para q8: Load failed
[whisper] sem-gpu → recriando o worker em WASM: Load failed
[mt:worker] Xenova/opus-mt-en-ROMANCE DESATIVADO nesta sessão (todos os dtypes falharam), usando tradutor de fallback.
[bergamot] bergamot/pt-en indisponível (integridade): modelo: sha256 não confere (c1199630b68d…) — o opus-mt assume o par
```

O mesmo roteiro no **Chromium/staging** mostra o erro na tela ("Não foi possível preparar o modelo. Failed to
fetch · Tentar de novo"); no **WebKit** a mensagem não aparece: a falha de rede ("Load failed", o texto do
WebKit) foi lida como GPU ruim (`whisperLocal.ts:227`, `recarregarEmWasm('sem-gpu', …)`), o worker foi recriado
em WASM, falhou de novo, e a tela ficou em "Legendando · Ouvindo…" para sempre.

No **dev local** (WebKit desktop), a mesma captura funciona: os modelos baixam do Hugging Face, a primeira
legenda (o tom simulado vira "O que você tem?" → "W…") aparece **~17 s** depois do Iniciar, e a tradução sai.
Então **o motor do Safari consegue transcrever e traduzir**; o que quebrou no teste do dono foi o staging.

### Memória e queda da aba (dev local, WebKit desktop)

- Capturar por ~100 s com Whisper base fp32 (82 + 124 MB) + opus-mt (53 + 60 MB): o processo WebContent subiu de
  ~0,1 para **4,2 GB** em 30 s e ficou lá; somando GPU e rede, **5,7 GB**. Chromium, mesma tela e mesma duração:
  **3,5 GB** no total (não baixa opus-mt: usa o `Translator`).
- **Ao sair da Capturar depois de capturar, a página caiu** (`page.goto: Page crashed`) nas duas corridas
  locais no WebKit (com o base e, na primeira, com o **Whisper small**, 353 + 233 MB, escolhido depois que a
  sonda do aparelho viu o adaptador WebGPU). No Chromium, a mesma sequência não caiu. No Safari real isso
  aparece como "Esta página foi recarregada porque ocorreu um problema".
- Só **passar** pela Capturar (cerca de 1 s, sem tocar em Iniciar) já baixou **~320 MB** no WebKit (Whisper base
  - opus-mt + motor do Bergamot) e ~220 MB no Chromium, com os workers vivos, e o WebContent foi de 0,7 para
    1,7 GB navegando. O `preaquecerModelos` (`pipelineDeFala.ts:1506`) só aquece o que já está em cache, então o
    download vem de outro caminho da montagem da tela (origem a confirmar).

### Outras telas

- Intérprete, Biblioteca, Cartões, Planos, Ajustes: sem exceção não tratada, sem requisição falha própria.
- Nenhum `pageerror` (exceção não capturada) em nenhuma corrida.

## 3. Mapa recurso → código → comportamento

| Recurso                                                          | Código                                                                      | WebKit (Playwright)                 | Causa                                                                                                                                                                                                                                                                                                          | Classe                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Modelos do Hugging Face (Whisper, opus-mt, WeSpeaker) no staging | `src/gateway/adapters/whisperWorker.ts`, `mtWorker.ts` (transformers.js)    | **Falha** em todo navegador         | O Hugging Face responde **404 sem CORS a qualquer `Referer` de `*.workers.dev`** (`curl -H "Referer: https://x.workers.dev/"` → 404; `example.com`, `pages.dev`, `localhost` → 307 normal). O app manda `Referrer-Policy: strict-origin-when-cross-origin`                                                     | Bug do staging (domínio)                          |
| Bergamot pt→en no staging                                        | `bergamotModelo.ts` (`/modelos/bergamot/pt-en/…`)                           | Falha de integridade                | O `.bin.gz` do modelo **não está publicado** no staging: a URL devolve o `index.html` (`content-type: text/html`); o motor (`.wasm`) está                                                                                                                                                                      | Bug do deploy do staging                          |
| Erro de rede lido como "sem GPU"                                 | `whisperLocal.ts:213-260`                                                   | Silencioso no WebKit                | O texto do erro de rede do WebKit é "Load failed" (Chromium: "Failed to fetch"); a carga falhou e caiu na troca para WASM, que também falhou, sem aviso                                                                                                                                                        | Bug real (afeta Safari)                           |
| Áudio da aba/tela                                                | `systemAudio.ts`, `navegadorSemAudioDaTela.ts`, `LiveCapture.tsx:3703-3820` | Degrada com aviso                   | Safari não entrega áudio de `getDisplayMedia`. O aviso tem só "Entendi": não oferece "Usar o microfone"; a pessoa tem de achar o switch do topo e tocar em Iniciar de novo. No Mac a fonte padrão é o som do computador (`capturaDoSistema = true`), então todo primeiro Iniciar no Safari passa por esse beco | Degradação do Safari + atrito de UX               |
| Threads do WASM                                                  | `perfil.ts`, `orcamentoDeThreads.ts`                                        | 1 thread                            | `COEP: credentialless` não existe no WebKit → sem `crossOriginIsolated` → sem SAB                                                                                                                                                                                                                              | Limite do Safari (contornável com `require-corp`) |
| Whisper small no Mac                                             | `sttRouter.ts:130` (`smallComGpuProvada`)                                   | Escolhido após a sonda              | Safari 26 tem adaptador WebGPU → `desktop-com-gpu` → small (589 MB)                                                                                                                                                                                                                                            | Risco real de memória                             |
| Memória da captura                                               | `pipelineDeFala.ts`, workers de STT/MT/VAD/voz                              | 4,2 GB no WebContent; queda ao sair | Modelos fp32 + opus-mt (sem `Translator`) + VAD + voz + fim de fala, 1 thread                                                                                                                                                                                                                                  | Bug real/limite (mais grave no Safari)            |
| Tradução nativa                                                  | `chromeTranslator.ts`                                                       | Ausente                             | Sem `Translator` no Safari                                                                                                                                                                                                                                                                                     | Degradação esperada                               |
| Web Speech ("Rápido")                                            | `adapters/webSpeech.ts`                                                     | Existe (`webkitSpeechRecognition`)  | No Mac depende da Siri; não exercitado com fala real                                                                                                                                                                                                                                                           | —                                                 |
| MediaRecorder                                                    | `systemAudio.ts:139`                                                        | webm suportado                      | Safari < 18.4 cai para `audio/mp4` (já tratado)                                                                                                                                                                                                                                                                | OK                                                |
| OPFS                                                             | —                                                                           | Erro no contexto efêmero            | Janela privada do Safari                                                                                                                                                                                                                                                                                       | Verificar onde o app usa                          |
| `requestIdleCallback` / `scheduler.postTask`                     | (vários)                                                                    | Ausentes                            | —                                                                                                                                                                                                                                                                                                              | Conferir fallbacks                                |
| Versão do app                                                    | `src/lib/versao.ts`                                                         | Toast em toda tela                  | Bundle "0.1.0" vs servidor "0.1.0+sha"                                                                                                                                                                                                                                                                         | Bug do build do staging                           |

## 4. As 3 causas mais prováveis

1. **Transcrição e tradução nunca carregam no staging, e no Safari a falha é silenciosa.** O Hugging Face recusa
   (404 sem CORS) qualquer requisição com `Referer` de `*.workers.dev`, então Whisper e opus-mt não baixam; o
   Bergamot pt→en não está publicado (o servidor devolve HTML). No Chromium aparece "Não foi possível preparar o
   modelo"; no WebKit o "Load failed" vira "sem GPU → WASM" e a tela fica em "Legendando · Ouvindo…" sem legenda.
   Evidência: console acima, `curl` com `Referer`, mesma captura funcionando no dev local. Explica "captura,
   transcrição e tradução não pegam". **Não depende da versão do Safari.**
2. **Memória da captura no WebKit: 4,2 GB no processo da página e queda ao sair da tela.** Uma thread só (sem
   `crossOriginIsolated`), Whisper fp32 (ou o small, de 589 MB, quando a sonda vê WebGPU no Safari 26), opus-mt
   no lugar do `Translator` e quatro workers auxiliares. Em ~1,6× a memória do Chromium, a aba fica sob pressão
   (o macOS comprime e troca memória, e tudo fica lento) e cai ao navegar. Explica "travando". **Piora no
   Safari 26** (WebGPU → small); sem WebGPU (Safari ≤ 18) fica o base.
3. **Trabalho pesado fora da captura.** Só passar pela Capturar (o "Legendar agora" do Início leva até lá)
   baixa ~320 MB e sobe workers de Whisper/opus-mt/Bergamot e o benchmark, que seguem vivos enquanto a pessoa
   usa as outras telas (WebContent de 0,7 → 1,7 GB). No Safari tudo isso compila e roda em 1 thread. Somado ao
   toast que nunca some, é o candidato para "lentidão em tudo". Evidência mais fraca que as duas primeiras: o
   WebKit headless não mostrou a thread principal travada nas outras telas; precisa de confirmação no Safari real.

## 5. Correções propostas

| #   | Correção                                                                                                                                                                                                                                                                                                                   | Tamanho | Tipo                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------- |
| A   | Buscar os modelos do Hugging Face com `referrerPolicy: 'no-referrer'` (por um `fetch` próprio no worker; conferir se a versão instalada do transformers.js expõe o gancho), ou servir do R2/domínio próprio; e/ou pôr o staging num domínio próprio. Teste: `curl` com `Referer` de `workers.dev` e uma captura no staging | P       | Bug do staging (atinge todos os navegadores) |
| B   | Publicar o modelo Bergamot pt→en no staging (ou `VITE_BERGAMOT_MODELOS_URL` para o R2) e checar no deploy que `/modelos/bergamot/pt-en/…` responde `application/gzip`                                                                                                                                                      | P       | Bug do deploy                                |
| C   | Separar erro de rede de erro de GPU no `whisperLocal` (incluir "Load failed" do WebKit) e mostrar "Não foi possível preparar o modelo · Tentar de novo" também no Safari; nunca deixar "Legendando" sem STT pronto                                                                                                         | P       | Bug real                                     |
| D   | Alinhar `__APP_VERSION__` do bundle com o `x-babel-versao` do Worker no build do staging                                                                                                                                                                                                                                   | P       | Bug do build                                 |
| E   | No aviso "Este navegador não captura o som da tela", oferecer "Usar o microfone" (liga o mic e inicia); no Safari, nascer com o microfone como fonte em vez do som do computador                                                                                                                                           | P       | Degradação do Safari (UX)                    |
| F   | No Safari, não escolher o Whisper small (tratar WebKit como `poucaMemoria`/sem small até medir no aparelho) e encerrar os workers ao sair da Capturar (já existe para celular/Quest: `poucaMemoria`)                                                                                                                       | M       | Degradação do Safari + bug de memória        |
| G   | Descobrir e cortar o download na montagem da Capturar (só baixar depois do "Baixar e iniciar")                                                                                                                                                                                                                             | M       | Bug real                                     |
| H   | Isolamento no WebKit: servir `COEP: require-corp` (com CORP/CORS nos recursos de terceiros) para Safari, liberando SAB e threads; exige revisar anúncios, imagens e Hugging Face                                                                                                                                           | G       | Melhoria (Safari)                            |
| I   | Medir no Safari real o custo do `backdrop-filter` (trilho com blur 22 px e "Mais" com blur 28 px) e trocar por fundo opaco no modo leve se pesar                                                                                                                                                                           | P       | A confirmar                                  |

Ordem sugerida: A, B, C e D (destravam o teste do dono no staging), depois F e G (memória), E, e por fim H.

## 6. Perguntas ao dono

1. Qual o Mac (modelo, chip M1/M2/Intel e quantos GB de memória) e qual a versão do macOS?
2. Qual a versão do Safari (menu Safari → Sobre o Safari)? Com 26 ou mais, o app baixa o Whisper small.
3. Em qual tela travou primeiro, e foi antes ou depois de abrir a Capturar? Apareceu "Esta página foi
   recarregada porque ocorreu um problema"?
