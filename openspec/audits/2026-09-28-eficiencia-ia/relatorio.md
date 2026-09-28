# Auditoria de eficiência da IA (transcrição e tradução) — 2026-09-28

Pergunta do dono: como reduzir o custo da IA paga sem entregar produto ruim, e como tornar o modo
gratuito (no navegador) o melhor possível, em qualquer aparelho — celular e Quest inclusive —, com
troca inteligente de modelo conforme a máquina e o estado dela em tempo real.

Método: auditoria do código (somente leitura) + três pesquisas web com fontes datadas (preços de
nuvem, modelos leves no Hugging Face/arXiv, APIs nativas dos navegadores). Números "medidos" vêm da
bancada de 24–25/09 (`docs/auditoria/eval/bancada-2026-09.md`); o resto é estimativa e está marcado.

## 1. Onde está o dinheiro (e o desperdício)

| # | Achado | Evidência | Impacto |
|---|---|---|---|
| 1 | **Parcial da fala vai ao LLM pago.** A cada ~1,1 s o parcial do microfone chama `translateSegment(..., {falada:true})`; o ramo `falada/nuvemPrimeiro` ignora `parcial` e chama `server-llm-mt`. | `src/lib/captura/pipelineDeFala.ts:337`, `src/gateway/index.ts:159` | O custo de tradução medido (US$ 0,036/h) supõe 1 chamada por frase; na prática são várias. Estimativa: 3–8× mais chamadas e cota do usuário drenada. **Maior alavanca.** |
| 2 | Cache de tradução quase nunca acerta para fala: a chave inclui os 3 turnos anteriores. Cache do cliente não persiste; do servidor é só memória do processo. | `server/ai/cacheDeTraducao.ts:88`, `traducaoDaFala.ts:230` | Custo modesto; frases curtas ("ok", "thank you", "let's go") se repetem muito. |
| 3 | Áudio vai à Groq em WAV 16 bits (~32 KB/s). | `src/gateway/audio/wav.ts` | Não muda o preço, mas pesa no plano de dados do celular; Opus a 24 kbps não piora o WER (medido). |
| 4 | Quem paga ainda baixa a reserva local inteira (80–209 MB STT + 113 MB MT) e roda parciais locais. | `pipelineDeFala.ts:909-934` | Dados e memória do celular de quem paga. |
| 5 | Inglês de quem paga usa Moonshine local (WER 13,5%) e não a nuvem (4,9%). | `src/gateway/sttRouter.ts:269` | Qualidade entregue abaixo do que se paga. |

A cobrança mínima de 10 s da Groq **já está domada**: o VAD de 800 ms levou o faturamento de 2,06×
para 1,08× do tempo real (medido). A pesquisa de nuvem estimou 2,5× por supor trechos de 4 s — não
vale para nós.

## 2. Nuvem mais barata (preços de 28/09/2026)

**Transcrição** — por hora de fala, trechos curtos:

| Opção | US$/h | Observação |
|---|---|---|
| **Cloudflare Workers AI** `whisper-large-v3-turbo` | **0,03** | Mesmo modelo que usamos (qualidade da bancada deve se manter); sem mínimo por pedido documentado; 10k "neurons"/dia grátis (~214 min/dia). Medir latência do Brasil antes. |
| Groq `whisper-large-v3-turbo` (atual) | 0,04 × 1,08 ≈ 0,043 | ZDR self-service; camada gratuita não aguenta produção (20 RPM / 1000 req/dia). |
| Soniox tempo real | 0,12 | Único streaming de verdade barato, com pt; candidato a "legenda ao vivo" do Pro. |
| Deepgram, AssemblyAI, Speechmatics, OpenAI, Google, ElevenLabs, Azure | 0,15–1,00 | Mais caros; sem vantagem para o nosso caso. |
| GPU própria (RunPod 4090) | 0,34–0,74 por hora de máquina | Só se paga com >11–25 pessoas falando 24 h/dia. Não agora. |

**Tradução** (LLM, ~150k tokens por hora de fala, com prompt):

| Opção | US$/h | Observação |
|---|---|---|
| DeepInfra `gpt-oss-120b` | ~0,01 | Mesmo modelo, ZDR; latência inicial maior que a Groq. **Melhor reserva** (troca o OpenRouter). |
| Groq `gpt-oss-20b` low | 0,018 | Perdeu no gold de conversa (0,884 vs 0,917) — só para frase fácil/curta. |
| Groq `gpt-oss-120b` low (atual) | 0,036 → ~0,029 com cache de prompt | Melhor qualidade medida. |
| Gemini (qualquer) | — | **Proibido**: termos vedam apps acessados por menores de 18. |
| APIs clássicas (Azure, Google, DeepL, Amazon) | 0,60–1,65 | 15–60× mais caras que LLM. |

**Custo por assinante Essencial (15 h/mês, estimado):** hoje ~US$ 1,2 (sem contar o vazamento do
achado 1, que pode multiplicar a parte de tradução); com as mudanças abaixo ~US$ 0,6–0,75
(≈ R$ 3,3–4,1 de R$ 19,90).

## 3. O que o navegador já dá de graça

| Recurso | Chrome/Edge desktop | Android Chrome | iOS Safari | Quest | Firefox |
|---|---|---|---|---|---|
| Transcrição no aparelho (`SpeechRecognition` + `processLocally`) | Chrome estável (~139+); **pt-BR não confirmado**, testar com `available()` | não | não (Siri, pode ir à Apple) | não | não |
| Transcrição do áudio de uma aba (`start(track)`) | Chrome M133+ | não confirmado | não | não | não |
| Tradução nativa (Translator API) | Chrome 138+, Edge 148+, com pt | **não (desktop só)** | não | não | não |
| LLM nativo (Prompt API / Gemini Nano) | 22 GB, sem pt, termos com restrição de idade | não | não | não | não |
| WebGPU | sim | sim (Android 12+) | sim (Safari 26) | sim (páginas 2D) | sim |
| Compute Pressure (estado da CPU em tempo real) | sim | desconhecido | não | desconhecido | não |

Conclusão: o nativo **resolve bem o computador com Chrome/Edge**, a custo zero e sem baixar modelo.
Celular, iPhone e Quest dependem dos nossos modelos (WASM/WebGPU) ou da nuvem.

Achados no código:
- A Web Speech do microfone é o padrão e **manda o áudio ao Google** (Android/desktop) mesmo no
  perfil "Privado/Local 100% offline", sem passar pelo consentimento
  (`fontesDeAudio.ts:292`, `profiles.ts:45`, `index.ts:49-54`). Problema de LGPD e de promessa.
- `processLocally`, `available()` e `install()` não são usados em lugar nenhum.
- A Translator API é criada fora de um clique; se o pacote de idioma precisa baixar, a criação
  falha e o par fica "indisponível" a sessão inteira (`chromeTranslator.ts:139-149`, inferido da
  especificação). Com ela disponível, ainda assim baixamos o opus-mt (113 MB).

## 4. Modelos leves melhores (licença comercial conferida)

| Uso | Hoje | Candidato | Número publicado | Tamanho | Licença |
|---|---|---|---|---|---|
| Transcrição pt (e en) com GPU ou desktop bom | Whisper small (11% pt) / base (18%) | **Parakeet-TDT-0.6B-v3** (NVIDIA), roda no navegador via parakeet.js | FLEURS pt 4,76% / en 4,85% (card; treino em pt-PT — medir pt-BR) | ~650 MB int8 | CC-BY-4.0 |
| Idem, afinado em pt-BR | — | Parakeet v3 **TAGARELA** | 7,5% leitura / 14,3% fala espontânea | ~650 MB | CC-BY-4.0 |
| Transcrição com GPU forte | — | Whisper large-v3-turbo q4f16 | estimado 4–6% pt | ~560 MB | MIT |
| Tradução en↔pt em qualquer aparelho | opus-mt ROMANCE (113 MB/direção, COMET 0,847 no gold) | **Bergamot (modelos do Firefox)** via WASM | Mozilla só publica par ≥ ~95% do Google Translate em COMET | ~36 MB/direção | MPL-2.0 |
| Tradução "alta qualidade" com GPU | — | TranslateGemma 4B q4 | MetricX ≈ Gemma 3 12B | ~2,5 GB | Gemma Terms |

Fora por licença: NLLB (não comercial), Moonshine não-inglês (não comercial). Moonshine continua sem pt.
Canary-1B-v2 é CC-BY-SA (share-alike). Hy-MT (Tencent) tem licença a verificar.

Limites de memória que mandam no tier baixo: celular de 4 GB comporta ~300–400 MB de modelo; aba do
iOS morre perto de 1–1,5 GB. Hoje o pico medido é **1,3–1,4 GB** e o iPhone perdeu 8 de 12 falas
(`openspec/audits/2026-09-26-dispositivos/relatorio.md`).

## 5. Troca inteligente de modelo em tempo real — o que falta

Hoje o perfil do aparelho é detectado bem uma vez (WebGPU real, memória, núcleos, Quest, economia
de dados; `src/lib/dispositivo/perfil.ts`), mas **nada reage durante o uso**: o fator de tempo real
(RTF) e a fila só vão para telemetria. No Pixel 7 e iPhone 14 o RTF medido foi 1,04–1,53, a fila
cresce e a legenda chega com p95 > 8 s. Não lemos bateria, Compute Pressure nem `shader-f16`.

Proposta (custo computacional desprezível — são contadores que já existem):
1. **Aquecimento de 5 s** no primeiro uso mede o RTF e escolhe o tier; a escolha fica gravada por aparelho.
2. **Regulador durante a sessão:** RTF p90 > 0,8 ou fila > 2 por 3 janelas → primeiro corta parciais,
   depois desce de modelo (small → base → tiny/Moonshine), e por fim oferece nuvem (a quem tem) ou
   Web Speech (com consentimento). Sobe de novo com folga sustentada.
3. **Sinais extras onde existem:** `PressureObserver` ("serious/critical" = descer), bateria < 20% sem
   carregador = descer, `shader-f16` = usar `hybrid-fp16` (small cai de 589 para ~410 MB).
4. **Memória:** descarregar o opus-mt quando a Translator API ou a nuvem traduz; `navigator.storage.persist()`.

## 6. Plano recomendado, por ordem de retorno

**Fase 1 — cortar desperdício (sem trocar provedor, baixo risco):**
1. Parcial nunca vai ao LLM pago: parcial traduz local (Translator API/opus-mt/Bergamot) ou não traduz; só o final vai à nuvem.
2. Cache de tradução: consulta sem contexto para falas curtas, cache persistente no servidor (SQLite) e no cliente (IndexedDB).
3. Envio em Opus em vez de WAV; reserva local preguiçosa no celular de quem paga.
4. Inglês de quem paga vai à nuvem no modo automático.

**Fase 2 — grátis melhor e em mais aparelhos:**
1. Chrome/Edge desktop: `SpeechRecognition` com `processLocally` (quando pt-BR estiver disponível) e Translator API criada no clique de "Iniciar", com barra de progresso.
2. Web Speech na nuvem só com consentimento explícito; corrigir a promessa do perfil "Privado".
3. Regulador em tempo real (seção 5).
4. Bergamot no lugar do opus-mt, se ganhar na bancada (36 MB contra 113 MB por direção).

**Fase 3 — trocas decididas pela bancada (regra de sempre: IC pareado, sem piorar o gold de conversa):**
1. Parakeet v3 / TAGARELA contra Whisper small/base em FLEURS pt, CV pt-BR e gold, com RTF medido em desktop, Android e Quest.
2. Bergamot contra opus-mt (COMET + gold).
3. Cloudflare Workers AI contra Groq: WER (deve empatar), latência do Brasil e cobrança real por segundo.
4. DeepInfra `gpt-oss-120b` como reserva no lugar do OpenRouter.

**Fase 4 — produto:** Soniox como "legenda ao vivo" do Pro, se o preço (US$ 0,12/h) couber.

> **Complemento (mesmo dia):** recursos nativos por plataforma, técnicas sem IA, projetos
> open-source, literatura de cascata/roteamento e o desenho completo em `harness-adaptativo.md`.

## 7. O que precisa de teste em aparelho real
- Quest: `getDisplayMedia` com áudio, WASM threads, WebGPU no navegador 150.
- Chrome desktop: `start(track)` junto com `processLocally`; pt-BR no aparelho.
- iPhone: memória de pico com Bergamot + Whisper base q8.

## Fontes
Preços: console.groq.com/docs, developers.cloudflare.com/workers-ai/platform/pricing, soniox.com/pricing,
deepgram.com/pricing, deepinfra.com/openai/gpt-oss-120b, ai.google.dev/gemini-api/terms (menores).
Modelos: huggingface.co/nvidia/parakeet-tdt-0.6b-v3, github.com/ysdede/parakeet.js,
huggingface.co/alefiury/parakeet-tdt-0.6b-v3-ptBR-TAGARELA-onnx, mozilla.github.io/translations/firefox-models,
huggingface.co/onnx-community/whisper-large-v3-turbo, transformers.js issue #1317.
Navegadores: developer.chrome.com/docs/ai/translator-api, groups.google.com/a/chromium.org (on-device
speech, M150 quality), chromestatus.com/feature/5178378197139456, developer.chrome.com/docs/web-platform/compute-pressure,
webkit.org/blog/17333, developers.meta.com/horizon/release-notes/web.
