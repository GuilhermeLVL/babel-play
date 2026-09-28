# Harness adaptativo de fala e tradução — desenho (2026-09-28)

Complementa `relatorio.md` (mesma pasta). Base: auditoria do código, pesquisa de recursos nativos por
plataforma, técnicas sem IA, projetos open-source e literatura de cascata/roteamento. Nada aqui foi
implementado; é o desenho para aprovação.

## 0. Princípio

**Rodar o mínimo de IA que entrega a qualidade pedida, no lugar mais barato que aguenta.** Em ordem:

1. **Não rodar IA** — usar o que já existe (legenda do vídeo, dicionário, memória de tradução).
2. **Recurso nativo do aparelho** — navegador ou sistema (grátis, sem download, muitas vezes melhor).
3. **Nosso modelo local** — o maior que o aparelho aguenta *agora*.
4. **Nuvem** — só o que sobrou, só o texto final, e só para quem tem direito (plano/cota/consentimento).

Cada degrau tem uma **porta de qualidade**: se o resultado barato parece ruim, sobe um degrau para
aquele trecho só (cascata), e não para a sessão inteira.

## 1. Escadas por tarefa

### 1.1 Transcrição (de onde vem o texto)

| Degrau | Fonte | Onde existe | Custo | Observação |
|---|---|---|---|---|
| T0 | **Legenda pronta do conteúdo**: `TextTrack` do `<video>`, trilhas HLS/DASH, legenda do YouTube/Netflix lida na sessão do próprio usuário, `<podcast:transcript>` do RSS | extensão (Chrome/Edge/Firefox); RSS no servidor | 0 | Melhor qualidade que qualquer STT. Nunca guardar texto de YouTube/Netflix no servidor (ToS); fica no aparelho. |
| T1 | **Cache por mídia** (id do vídeo + janela de tempo) | todos | 0 | Rever o mesmo vídeo não retranscreve. |
| T2 | **Nativo no aparelho**: Chrome `SpeechRecognition` com `processLocally` (desktop), Apple SpeechAnalyzer (iOS/macOS 26, via app), Android `createOnDeviceSpeechRecognizer` / ML Kit (via app) | ver matriz §3 | 0, sem download nosso | Só se o pt-BR estiver disponível (`available()` em tempo de execução). |
| T3 | **Nosso modelo local** (Moonshine en; Whisper base/small pt; candidato Parakeet v3) | WASM/WebGPU | 0 (download único) | Tamanho escolhido pelo regulador §4. |
| T4 | **Nativo na nuvem do fornecedor** (Web Speech em modo nuvem, Safari/Siri) | Chrome/Android/Safari | 0 para nós | **Só com consentimento explícito**: o áudio vai ao Google/Apple. |
| T5 | **Nossa nuvem** (Cloudflare/Groq whisper-turbo) | todos | ~US$ 0,03–0,043/h | Plano pago ou convidado dentro da cota. |

Portões antes de qualquer STT (custo zero): VAD (já existe, 800 ms), piso de energia, vídeo pausado ou
mudo, aba escondida sem modo "só ouvir", aba sem som (`audible` na extensão), trecho de música
(energia alta com VAD negativo longo).

### 1.2 Tradução (como o sentido chega)

| Degrau | Fonte | Custo | Observação |
|---|---|---|---|
| M0 | **Não traduzir**: palavra que o aluno já sabe (vocabulário dele + frequência/CEFR) | 0 | 3 mil famílias de palavras cobrem ~95% da fala de TV (Webb & Rodgers). Mostra só o que ele não sabe; frase inteira sob demanda. |
| M1 | **Dicionário** para toque em palavra: `public/glosas`, Kaikki/Wiktextract, formas → lema | 0 | Melhor que MT para palavra solta. Hoje o dicionário vai ao Wiktionary ao vivo. |
| M2 | **Memória de tradução**: exata (texto normalizado → hash) e aproximada (3-gramas, ≥ 0,9); cliente (IndexedDB) + servidor (SQLite); semente Tatoeba (CC-BY) | 0 | Global só para frases curtas vistas por ≥ 3 pessoas, sem id; nunca fala de microfone/chamada. |
| M3 | **Nativo**: Translator API (Chrome 138+/Edge 148+ desktop), Apple Translation / ML Kit Translation (via app) | 0 | Criar no clique de "Iniciar", com progresso. |
| M4 | **Nosso modelo local**: opus-mt hoje; candidato Bergamot (36 MB/direção, MPL-2.0) | 0 | Também é a tradução do **parcial** para quem paga. |
| M5 | **Nuvem** gpt-oss-120b low (Groq; reserva DeepInfra) | ~US$ 0,01–0,036/h | **Só o texto final.** Porta de qualidade do §5 decide se o trecho local sobe para cá. |

## 2. Sinais

**Sonda uma vez por aparelho** (gravada em `localStorage` por UA + adaptador, revalidada a cada versão
do app ou 30 dias):
- já lidos hoje (`perfil.ts`): WebGPU real, `deviceMemory`, núcleos, `crossOriginIsolated`,
  `getDisplayMedia`, toque, WebXR, Quest, `saveData`, `effectiveType`, `jsHeapSizeLimit`;
- novos: `shader-f16`, `maxStorageBufferBindingSize`/`maxBufferSize` (rejeita modelo antes de
  baixar, como o WebLLM), `SpeechRecognition.available({langs:['pt-BR','en-US'],processLocally:true})`,
  `Translator.availability()`, `navigator.storage.estimate()`, modelos já no cache, ponte nativa
  (`window.Capacitor`), extensão presente, iOS (teto de ~500 MB por aba);
- **microbenchmark de 2–3 s** num worker: encoder do modelo local em 5 s de áudio, WebGPU × WASM → RTF
  real por motor (a literatura mostra que WebGPU às vezes perde para WASM em Whisper).

**Contexto da sessão:** fonte (mic/aba/sistema/arquivo), idioma, plano e cota, consentimento de nuvem,
modo "privado", existência de legenda pronta.

**Tempo real** (a cada trecho, custo desprezível): RTF em média móvel, fila, latência fim-da-fala →
legenda, falhas/OOM/`device.lost`, `visibilitychange`, rede (`online`, mudança de `effectiveType`),
bateria (`getBattery`, só Chromium), `PressureObserver` (Chromium desktop).

## 3. Plataformas: o que usar em cada uma

| Plataforma | Transcrição | Tradução | Como chegamos | Prioridade |
|---|---|---|---|---|
| Chrome/Edge desktop (Windows/macOS/Linux/ChromeOS) | T0 extensão; T2 `processLocally`; T3 | M3 Translator API; M4 | web + extensão | alta |
| Firefox / Safari desktop | T0 extensão (Firefox); T3 | M4 Bergamot | web | média |
| **Android** | T2 on-device/ML Kit (pt-BR beta) | M3 ML Kit Translation (~30 MB) | **app Capacitor** (plugins prontos: capawesome, capgo, @capacitor-mlkit/translation) | **alta** |
| **iPhone/iPad (iOS 26)** | T2 SpeechAnalyzer (pt) | M3 Apple Translation ou ML Kit | **app Capacitor** (+ plugin Swift) | **alta** — hoje é o pior aparelho (memória) |
| Android/iOS pelo navegador | T3 leve (Moonshine en / Whisper base q8); T4 com consentimento | M4 Bergamot | web | já existe, melhorar |
| **Meta Quest** | T3 WASM (sem Web Speech, WebGPU experimental); T5 | M4 Bergamot | web + pacote Bubblewrap para a loja (~1 dia) | média |
| Windows nativo (Live Captions, Windows AI Speech, Foundry Local) | — | — | app Tauri/MSIX | **adiar** (APIs experimentais, Phi Silica sendo substituído) |

Tutor: no iPhone com Apple Intelligence, o Foundation Models (on-device, pt-BR) pode responder de graça
via plugin Swift; nos demais, nuvem gpt-oss. Segunda onda.

## 4. Regulador em tempo real (MAPE-K simples)

Tabela de regras precomputada por classe de aparelho (estilo CARIn), com histerese:

- **Descer** quando RTF médio > 0,8 por 3 trechos, ou fila > 2, ou latência p90 > 3 s, ou pressão
  "serious/critical", ou bateria < 20% sem carregador. Ordem: (1) cortar parciais → (2) trocar
  WebGPU↔WASM se o microbenchmark disser → (3) modelo menor (small → base → tiny/Moonshine) → (4)
  oferecer degrau nativo (T2/T4 com consentimento) ou nuvem.
- **Subir** só após 60 s com RTF < 0,5 e sem erro.
- **OOM ou `device.lost`**: marca o modelo como proibido naquele aparelho (gravado).
- **Aba escondida**: pausa STT, a menos que a pessoa esteja em modo "só ouvir".
- Parâmetros de streaming (tamanho do trecho, wait-k da tradução, beams) vêm da mesma tabela.

Custo: contadores que já existem em `captureMetrics.ts`; nenhum modelo extra.

## 5. Portas de qualidade (cascata por trecho)

- **STT local → degrau acima**: `compression_ratio > 2,4` ou `avg_logprob < −1` (limiares do próprio
  Whisper); confiança média da palavra < τ; duas quedas bruscas de confiança no trecho; ou discordância
  entre dois motores quando ambos rodam. τ calibrado na nossa bancada (FLEURS + gold de conversa), com
  meta de taxa de escalada (ex.: ≤ 15% dos trechos) para caber no orçamento.
- **MT local → nuvem**: logprob médio do decodificador < τ_mt, razão de tamanho fora de [0,5; 2], cópia
  do original > 50%, ou validação atual (`validarTraducao`) reprovada. Calibração offline com
  MetricX-24 (Apache-2.0; CometKiwi é não comercial).
- Quem é grátis sobe só até o local maior/nativo; quem paga sobe à nuvem com limiar mais sensível.
- Mais tarde: bandit (épsilon-guloso por classe de aparelho) entre braços que passam nos guardrails,
  recompensa = −erro estimado − λ·latência − μ·custo.

## 6. Registro de motores (troca os `switch` de `src/gateway/index.ts`)

Um registro declarativo, no estilo `ModelRecord` do WebLLM:

```
{ id, tarefa: 'stt'|'mt'|'llm', runtime: 'dados'|'nativo-navegador'|'nativo-app'|'local'|'nuvem',
  idiomas, bytes, memoriaDePico, requer: { webgpu?, shaderF16?, isolado?, ponte?, extensao? },
  limitesMinimos, dtypePorMotor, rtfEsperadoPorClasse, licenca, enviaDadosA: null|'google'|'apple'|'nos',
  custo: 'zero'|'download'|'cota' }
```

`enviaDadosA` substitui a lista fixa `exigeConsentimento`: qualquer motor que mande dado a terceiro
exige consentimento automaticamente (corrige o microfone do perfil "Privado" indo ao Google).

## 7. Onde encaixa no código

| Peça | Hoje | Mudança |
|---|---|---|
| Sonda | `src/lib/dispositivo/perfil.ts` (pura, testada) | + sinais novos, microbenchmark, persistência |
| Roteamento STT | `src/gateway/sttRouter.ts` (puro) | vira consulta à tabela de regras + registro |
| Roteamento MT | cadeia fixa em `profiles.ts` | nova função pura `routeMt` com as escadas M0–M5 |
| Registro | `switch` em `src/gateway/index.ts` | registro declarativo §6 |
| Fallback | `AiGateway.run` + disjuntores | mantém; STT passa a usar o mesmo runner |
| Regulador | inexistente (RTF só vai à telemetria) | novo módulo puro alimentado por `captureMetrics` |
| Dados | `public/glosas`, `public/trilha`, cache LRU do servidor | memória de tradução persistente + filtro de palavra conhecida |
| Nativo | Web Speech sem `processLocally`; Translator criado fora do clique | adaptadores novos |
| Empacotamento | sem PWA, sem casca | manifesto + service worker; Capacitor (Android/iOS); extensão; Bubblewrap (Quest) |

## 8. Ordem de entrega sugerida

1. **Desperdício** (relatório §6 fase 1): parcial fora da nuvem, cache persistente, Opus, inglês na nuvem para quem paga.
2. **Núcleo do harness**: registro, sonda persistida + microbenchmark, `routeMt`, regulador, portas de qualidade — tudo puro e testado, sem mudar motor.
3. **Degraus sem IA**: filtro de palavra conhecida, dicionário local, memória de tradução.
4. **Nativos do navegador**: `processLocally`, Translator no clique, consentimento por `enviaDadosA`.
5. **Modelos novos pela bancada**: Parakeet v3, Bergamot, Cloudflare, DeepInfra.
6. **Extensão** (legenda pronta + captura de aba) e **PWA**.
7. **App Capacitor** Android/iOS com ML Kit / SpeechAnalyzer / Apple Translation.
8. Bandit e tutor on-device (Foundation Models).

## 9. Validação

- Bancada existente para toda troca de modelo e para calibrar τ (IC pareado, sem piorar o gold).
- Testes puros para sonda, regras, regulador e portas (entradas sintéticas: RTF subindo, OOM, bateria).
- Aparelho real: Pixel/Android médio, iPhone, Quest 3 — RTF, memória de pico, latência p50/p95,
  taxa de escalada. Não há números publicados de Whisper no Quest nem no iPhone; teremos os nossos.
- Telemetria por trecho (classe do aparelho, motor, RTF, latência, escalada) em `/metrics`/Langfuse,
  sem texto, para ajustar limiares com dado real.

## 10. Cuidados legais

- YouTube/Netflix: ler legenda só no navegador da pessoa (extensão), nunca guardar no servidor, nunca tocar em DRM.
- Memória de tradução global: só frases curtas, sem id, vistas por ≥ 3 pessoas; nunca microfone/chamada (LGPD art. 12 e 14).
- Motores que enviam áudio a Google/Apple/Meta: consentimento e política de privacidade.
- Licenças: NLLB, CometKiwi e Moonshine não-inglês ficam fora (não comerciais); Canary é share-alike;
  dados Kaikki são CC-BY-SA (atribuição e mesma licença nos dados redistribuídos); GPL não entra no código fechado.
- App iOS: a casca só passa na revisão da Apple porque usa recurso nativo (diretriz 4.2); apps com crianças têm revisão extra.

## Fontes principais
whisper_streaming (arXiv 2307.14743), SimulStreaming (2506.17077), FrugalGPT (2305.05176), RouteLLM
(2406.18665), Agreement-Based Cascading (2407.02348), CARIn (2409.01089), EdgeMLBalancer (2502.06493),
confiança de ASR (2509.07195), browser × nativo (2402.05981), LlamaWeb (2605.20706), MetricX-24
(hf.co/google/metricx-24-hybrid-large-v2p6), WebLLM, transformers.js, asbplayer (MIT), RTranslator,
Apple SpeechAnalyzer (WWDC25), ML Kit GenAI, capawesome/capgo, Meta PWA packaging, Webb & Rodgers (2009).

## 11. Estado da integração (2026-09-28, branch `ei/h`)

**Ligado:**
- **Consentimento pelo registro** — `src/gateway/index.ts` usa `bindingExigeConsentimento`; a lista à
  mão saiu. Web Speech em modo nuvem exige consentimento (também em `stt.startLive`/`isAvailable`).
- **Motor do microfone** — `src/lib/captura/motorDoMicrofone.ts`, chamado de `startMic` (clique):
  Web Speech com `processLocally` quando `available()` = `available` (registro `web-speech-local`,
  sem consentimento); Web Speech na nuvem só com consentimento e fora do `local-private`; senão
  Whisper/Moonshine local. `install()` só no clique, sem esperar. O adaptador lança se o navegador
  não tem `processLocally`. A rota do STT conta o mic no Whisper quando é o que vai acontecer.
- **"Rápido" ou "Privado"** (decisão do dono, opção b) — sem o reconhecimento no aparelho, a primeira
  abertura do mic pergunta (`EscolhaDoMicrofone.tsx`, `precisaPerguntarMotorDoMic`). "Rápido" grava o
  consentimento PRÓPRIO `reconhecimentoDoNavegador` (Google/Microsoft/Apple), separado do `nuvem`;
  "Privado" registra a recusa com data. Troca no painel "Dispositivos e modelos de IA" e em Ajustes →
  Privacidade. Perfil Privado não vê o "Rápido"; perfil protegido (`perfilProtegido()`) também não,
  salvo com o vínculo do responsável aceito e a conta não restrita — a régua da nuvem.
- **Translator API no clique** — `gateway.mt.prepararNativo` no "Iniciar" (com `monitor`); o
  `warmup`/`preload` do opus-mt pulam o par que o nativo já traduz.
- **Regulador** — `src/lib/captura/reguladorDaCaptura.ts`, alimentado por final LOCAL (RTF, fila,
  latência, visibilidade, bateria, `PressureObserver`): corta parciais, desce o modelo
  (`stt.trocarModeloLocal`), sobe com folga, proíbe o modelo após falha de GPU em uso, oferece
  nativo/nuvem pelo aviso de sempre. Aba escondida pausa só os parciais do mic. A rota desce a escada
  quando o modelo está proibido.
- **Porta da MT final** — `avaliarTraducaoLocal` após Chrome Translator/opus-mt; sobe o trecho ao
  `server-llm-mt` com `escalarSeRuim` (plano `managedCloudLlm`) e consentimento.
- **Porta do STT (leve)** — `razaoDeCompressaoAproximada` → `avaliarTrechoStt`; final local em laço
  sobe por `stt.transcribePcmNaNuvem` para plano `managedCloudStt`. Escaladas em
  `capMetrics.summary().escaladas`.
- **`routeMt`** — só como conferência em DEV (`src/gateway/conferenciaDaRotaMt.ts`).

**Não ligado / limites:**
- `routeMt` não ordena a cascata (M0 precisa do vocabulário conhecido); "grátis nunca na nuvem" fica
  com o servidor (cota de convidado).
- Porta da MT quase dormente hoje: quem paga já vai à nuvem primeiro, e a porta não repete a nuvem
  que falhou no mesmo pedido. Vira útil quando o "local primeiro, sobe se ruim" for decidido.
- `trocar-backend` não é emitido (microbenchmark ainda não alimenta a config). OOM fora da GPU não
  é detectado. Escaladas não vão à telemetria do servidor (só na aba).
- Progresso do pacote do Translator só no log (sem barra); `install()` do reconhecimento sem UI.
- Limiares (2,4 aproximado sem zlib; razão/cópia da MT) sem calibração na bancada.

**Conferir em aparelho real:** `processLocally` + `available()` em pt-BR no Chrome estável;
`install()` e `Translator.create()` dentro da janela de ativação do clique; `PressureObserver` e
`getBattery` no Chromium; troca de modelo pelo regulador no Pixel/iPhone/Quest (tempo de recarga);
que o mic cai no Whisper sem consentimento sem pedir download inesperado grande no celular.
