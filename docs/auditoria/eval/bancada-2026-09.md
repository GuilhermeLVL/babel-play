# Bancada de fala e tradução — 24–25/09/2026

O objetivo foi responder, com número e intervalo de confiança, se o que o assinante paga funciona. São quatro perguntas:

- a transcrição acerta?
- inventa texto em silêncio ou música?
- a tradução preserva o sentido?
- quanto custa e quanto demora?

Toda troca de modelo aplicada depois disto seguiu uma regra de decisão.

> **Regra de decisão.** Só se troca quando a melhora é significativa, isto é, quando o IC 95% do bootstrap **pareado** da diferença não cruza zero. Além disso, o custo precisa caber no plano e o sistema não pode piorar no corpus de conversa, que é o uso real do produto.

## Método

|                       |                                                                                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Transcrição (STT)** | FLEURS `pt_br` e `en_us` (CC-BY-4.0), 300 falas de cada idioma (65 e 50 min). Derivados de 100 falas: ruído ESC-50 a 10/5/0 dB SNR e recodificação Opus a 16/24/32 kbps.                                                                                        |
| **Sem fala**          | 120 trechos ESC-50 sem voz humana (chuva, motor, animais, sirene…) e 6 sintéticos (silêncio, dither, ruído rosa, zumbido de 60 Hz). A métrica é a **taxa de alucinação**: fração de trechos que saem com qualquer letra.                                        |
| **Tradução (MT)**     | Gold próprio de 60 casos de conversa (pronome, gênero, idiomático, registro, literal, fala espontânea); FLEURS/FLORES en↔pt; WMT24++ en→pt_BR (domínios fala, social, notícia e literatura).                                                                   |
| **Métricas**          | **WER/CER** com normalização (`src/core/eval/wer.ts`). **COMET** `Unbabel/wmt22-comet-da` (Apache-2.0, CPU). **BLEU** e **chrF++** do sacreBLEU com assinatura. **Latência** p50/p95 e **RTF**. **Custo** pelo livro-caixa da bancada.                          |
| **Estatística**       | Bootstrap de 1000 reamostras com semente fixa (`src/core/eval/bootstrap.ts`). A comparação entre sistemas é sempre **pareada** caso a caso.                                                                                                                     |
| **Fidelidade**        | Opções de decode iguais às de `whisperWorker.ts` e o mesmo `filtrarAlucinacao`. O VAD é o **mesmo** Silero legacy + FrameProcessor do `@ricky0123/vad-web`, com os limiares de `systemAudio.ts`. A tradução usa o prompt de produção (`promptComunicativo.ts`). |
| **Fora do produto**   | NLLB (CC-BY-NC) e CometKiwi (CC-BY-NC-SA) ficaram fora. Os dados estão fora do git (`BANCADA_DIR`), com manifestos e sha256.                                                                                                                                    |

Reproduzir:

```
python scripts/eval-fala/baixar-bancada.py
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/stt.mjs --sistemas … --conjuntos …
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/mt.mjs --sistemas … --corpora …
%LOCALAPPDATA%/babel-bancada/venv/Scripts/python scripts/eval-fala/bancada/pontuar.py
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/refiltrar.mjs
```

Os resultados brutos ficam em `bancada-2026-09/*.json`.

**Gasto total da bancada: US$ 0,53** pela tabela de preço. Foi pago US$ 0, porque a chave é da camada gratuita da Groq.

## Transcrição

| Sistema                                         | WER pt                           | WER en                | Alucinação sem fala (com VAD)         | RTF                      | Onde                                     |
| ----------------------------------------------- | -------------------------------- | --------------------- | ------------------------------------- | ------------------------ | ---------------------------------------- |
| Groq whisper-large-v3-turbo                     | **4,1%** [3,1–5,1]               | **4,9%** [3,8–6,1]    | 29,4% → **9,5%** com os filtros novos | ~0,03 (p50 ~365 ms/fala) | nuvem, US$ 0,04/h                        |
| Groq whisper-large-v3 (2,8× o preço)            | 4,4%                             | 4,5%                  | —                                     | 0,035                    | empate com o turbo: **não vale o preço** |
| Moonshine base q8 (**novo padrão local em en**) | —                                | **13,5%** [11,4–15,7] | **0,8%**                              | 0,07                     | navegador, 67 MB                         |
| Whisper tiny (padrão antigo em en)              | 29,2%                            | 19,7%                 | 26,2% → 13,5%                         | 0,04                     | navegador, 117 MB                        |
| Whisper base (padrão local pt sem WebGPU)       | 18,9% → **18,0%** com VAD 800 ms | 21,2%                 | 30,2% → 19,8%                         | 0,07                     | navegador                                |
| Whisper small (pt com WebGPU)                   | **11,0%**                        | 14,4%                 | 29,4% → **7,9%**                      | 0,34 (CPU)               | navegador, WebGPU                        |

**Com ruído, SNR 5 dB:**

- A nuvem erra 6,4% em pt e 6,5% em en.
- No local em en, o Moonshine base erra **24,8%** contra **41,5%** do Whisper tiny, uma diferença de −16,7 pontos, significativa.
- A 0 dB, a nuvem em pt erra 11,0%.

**Opus:** WER 4,0% a 16, 24 e 32 kbps, contra 4,1% no áudio original, ou seja, gravar comprimido **não prejudica** a retranscrição. O app passou a gravar a **24 kbps** (~11 MB/h), 25% a menos que 32. Ruído em pt: 10 dB 4,9%, 5 dB 6,4%, 0 dB 11,0%.

**VAD:**

- **Sem VAD**, os modelos locais inventam texto em 71–98% dos trechos sem fala, e a nuvem em 68%. O VAD é indispensável.
- **Fechar a fala após 800 ms** de silêncio, em vez de 450 ms, reduz os pedaços por frase de 2,57 para 1,12. O WER local cai de 20,5% para 18,0%, e o faturamento da nuvem cai de 2,06× para 1,08× o tempo real, porque a Groq cobra no mínimo 10 s por pedaço.

**Filtro de alucinação**, com 4 níveis:

- créditos;
- cortesias só com áudio longo;
- forma;
- vocalização: grito, riso, onomatopeia sem vogal e letra solta.

O filtro reduziu a alucinação com VAD em 50–73%, **com WER idêntico nos 19 conjuntos de fala real** (`refiltrar.mjs`).

## Tradução (COMET, maior = melhor)

| Sistema                                          | Gold conversa (60) | FLEURS en→pt (150) | FLEURS pt→en (100) | US$/h de fala |
| ------------------------------------------------ | ------------------ | ------------------ | ------------------ | ------------- |
| gpt-oss-120b, raciocínio "low" (**novo padrão**) | **0,917**          | 0,892              | —                  | 0,036         |
| gpt-oss-120b, raciocínio padrão (antigo)         | 0,907              | 0,877              | 0,872              | 0,065         |
| gpt-oss-20b, "low"                               | 0,884              | 0,891              | 0,886              | 0,018         |
| qwen3.8-27b, sem raciocínio                      | 0,891              | 0,898              | 0,900              | 0,14          |
| opus-mt (local, navegador)                       | 0,847              | 0,860              | 0,849              | 0             |
| opus-mt-tc-big (local)                           | 0,819              | 0,886              | —                  | 0             |

**Comparações pareadas:**

- **120b "low" contra padrão:** +0,016 no FLEURS (significativo) e empate no gold, **gastando ~45% menos**. Foi aplicado.
- **20b "low" contra 120b "low":** −0,033 no gold (significativo) e empate no FLEURS. Perde justo em conversa (idiomático 0,74 contra 0,82). **Não troca.**
- **qwen3.8 contra 120b "low":** −0,025 no gold (significativo) e +0,005 no FLEURS, por 4× o custo, e o modelo está em preview. **Não troca.**
- **tc-big contra opus-mt:** +0,025 no FLEURS e +0,021 no WMT, mas **−0,028 no gold** (idiomático 0,58 contra 0,64; registro 0,78 contra 0,86). O produto é conversa. **Não troca.**

## Latência

Medida do Brasil, em chamada sequencial e sem fila, com `latencia.mjs` e 20 chamadas por configuração.

| Chamada                                  | p50               | p95    |
| ---------------------------------------- | ----------------- | ------ |
| Transcrição Groq turbo (fala de ~12,7 s) | **0,37 s**        | 1,66 s |
| Tradução gpt-oss-120b (1º token / total) | 0,64 / **0,72 s** | 1,45 s |
| Tradução gpt-oss-20b "low"               | 0,30 / 0,33 s     | 2,1 s  |
| Tradução qwen3.8                         | 0,47 / 0,51 s     | 2,4 s  |

O 120b "low" teve só 1 chamada válida (0,98 s), porque a cota diária de tokens da camada gratuita acabou. Por raciocinar menos, ele fica no máximo no tempo do padrão.

**Fim da fala até a legenda traduzida**, na nuvem: VAD 0,8 s + STT 0,37 s + tradução 0,72 s ≈ **1,9 s no p50**. A legenda parcial local aparece durante a fala.

## Custo por plano, pior caso: assinante usa o teto inteiro

| Plano              | Líquido  | STT (15/20 h × 1,08 × US$ 0,04) | LLM no pior caso | Total no pior caso  |
| ------------------ | -------- | ------------------------------- | ---------------- | ------------------- |
| Essencial R$ 19,90 | R$ 17,62 | US$ 0,65                        | US$ 1,80         | US$ 2,45 ≈ R$ 13,72 |
| Pro R$ 39,90       | R$ 36,42 | US$ 0,86                        | US$ 3,00         | US$ 3,86 ≈ R$ 21,62 |

No caso típico, a tradução medida custa US$ 0,036 por hora de fala: 15 h dão ≈ US$ 0,54. O resultado por assinante fica em ≈ US$ 1,2/mês, cerca de R$ 7 do líquido.

## O que isto mudou no produto

Tudo em `main`, com testes:

1. **Cota de transcrição** em segundos reais. O mínimo de 10 s fica só no custo do dono.
2. **Nuvem:** temperatura 0, descarte por `no_speech_prob`/`compression_ratio`, `prompt` com a frase anterior e filtro de alucinação também na saída da nuvem.
3. **Filtro de alucinação:** vocalização e onomatopeia sem vogal.
4. **VAD:** fecha a fala em 800 ms. A nuvem corta a fala em 12 s, e o local em 6 s.
5. **Captura:** áudio do sistema sem o processamento de chamada. Gravação em Opus a 24 kbps, e a mistura mic + sistema em Ogg Opus (≈ 2,5 MB a cada 10 min; antes, WAV estourava 120 MB em 62 min). Retenção de 90 dias.
6. **Inglês local** passou a usar o **Moonshine base q8**. No navegador, carrega em ~6 s na primeira vez e 1,3 s do cache, e decodifica ~1,1 s a cada 10 s de fala.
7. **Tradução:** gpt-oss com raciocínio "low" e ZDR na OpenRouter. Importação de arquivo usa a nuvem para quem paga.
8. **Telemetria anônima de qualidade** em `POST /api/metricas/captura` → `/metrics`: latência, RTF, descartes e fallback em produção.

## Pendências (dependem do dono)

- **A chave Groq é da camada gratuita.** O limite é de 20 transcrições por minuto e 1.000 pedidos, ou 200 mil tokens, por dia e por modelo, para o app inteiro. Isso **não sustenta produção**: é preciso subir para a camada Developer (pago por uso).
- **A chave da OpenRouter informada está expirada.** Sem reserva de nuvem até ela ser trocada.
- **O token do Hugging Face não tem permissão de inferência.** Por isso Gemma 3 e Qwen3 235B não foram medidos por lá.
- **Ampliar o gold de conversa** de 60 casos para 300 ou mais. Ele decidiu duas trocas, e o IC ainda é largo (±0,03).
- **Latência medida em WebGPU real** (Whisper small em pt) num computador do público-alvo. O headless desta máquina não expõe GPU.
