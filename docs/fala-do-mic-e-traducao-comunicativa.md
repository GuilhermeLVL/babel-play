# Sua voz em português no cenário "conversa" + tradução comunicativa (2026-08-28)

Cenário do relato: áudio do sistema em **inglês** (grupo/chamada) e o dono falando **português** ao
microfone. A transcrição do português degradava e a tradução pt→en saía literal.

## O que a auditoria achou

| # | Achado | Onde |
|---|--------|------|
| 1 | O modelo Whisper era roteado só pelo idioma do **sistema**: estudo = EN ⇒ `whisper-tiny`, e o mesmo tiny decodificava o português do mic (o roteador já avisava que tiny "erra feio fora do EN"). | `sttRouter.ts`, `LiveCapture.prepareModelsInterno` |
| 2 | Sem fone, o inglês da caixa de som entrava pelo mic e era decodificado com dica `pt` → texto inventado atribuído a "você". | `LiveCapture` (sem detector) |
| 3 | Teto de geração `audioSec × 15 tokens` e filtro "6 palavras/s" calibrados em inglês; PT tokeniza pior → fala rápida truncada/descartada; "Ah." em PT caía como "token solto do silêncio". | `whisperWorker.ts`, `alucinacao.ts` |
| 4 | Mic em modo automático mandava parciais **sem dica** (o sistema tinha guarda; o mic não) → balão de "você" piscava inglês. | `LiveCapture.onPartialAudio` |
| 5 | O mic nunca alimentava o perfil de idioma: o app não aprendia que "Eu falo" estava errado. | `LiveCapture.observarIdioma` |
| 6 | MT: só `trim()` antes de traduzir; vícios ("né", "tipo assim"), contrações ("tá", "pra", "a gente") e gíria iam ao pé da letra para opus-mt/Chrome Translator/MyMemory. | `LiveCapture.translateSegment` |
| 7 | Edição full: o LLM (Groq) era o **terceiro** da cadeia — só corria se o opus-mt falhasse; prompt genérico ("tradutor profissional"), sem contexto, sem registro de fala. 402 não desligava o adaptador (uma ida ao servidor por frase). | `profiles.ts`, `mtProxy.ts`, `serverLlmMt.ts` |
| 8 | opus-mt gerava sem `num_beams`/`max_length`. | `mtWorker.ts` |

Os fluxos mic/sistema **já eram separados** (VAD próprio; `misturarAudios` só serve à gravação salva) — isso não era o problema.

Pesquisa: Whisper é monolíngue por trecho; especificar idioma, modelo ≥ base e contexto rendem +5–20% cada ([discussão openai/whisper #2009](https://github.com/openai/whisper/discussions/2009)). LLM para tradução natural precisa de brief (registro, "sentido, não palavra") + contexto + limite "não acrescente".

## O que mudou

**STT**
- `routeStt` recebe `micLang`: "inglês" só quando **todas** as fontes ativas são EN. Ouvindo EN e falando PT ⇒ `base` (leve) — o selo diz "local · base (você fala pt)". Teste: `tests/sttRouter.test.ts`.
- Teto de tokens e filtro de alucinação **por idioma** (`tokensPorSegundo`: 15/s EN, 22/s resto; teto 6→8 palavras/s fora do EN; lista de monossílabos só com dica EN). Teste: `tests/alucinacao.test.ts`.
- `lib/vazamento.ts` (puro): texto do mic detectado no idioma do sistema **e** ≥60% sobreposto a uma fala do sistema ⇒ descartado, `capMetrics.drop`, aviso único "use fone de ouvido". Só no cenário conversa. Teste: `tests/vazamento.test.ts`.
- Guarda de parcial sem dica vale para as duas fontes.
- Perfil adaptativo **do mic** (`perfilMicRef`): ao convergir em idioma ≠ "Eu falo", avisa uma vez (não troca sozinho).
- Edição leve: motor do mic padrão = Whisper (Web Speech continua opção explícita).
- `initial_prompt` por fonte **não entrou**: a versão instalada de `@huggingface/transformers` não expõe `prompt_ids` no pipeline de ASR (conferido no bundle). Documentado no worker.

**MT**
- `lib/traducao/prepararFala.ts` + `expressoes.ts` (puros): só para fala do mic em `pt` — remove hesitações isoladas e gagueira, normaliza contrações (`tá→está`, `pra→para`, `cê→você`, `a gente→nós`), parafraseia ~85 gírias/expressões em português claro, e ~50 falas inteiras ("valeu!", "pois é.") saem com tradução pronta. Chave de cache tolerante a caixa/pontuação. Teste: `tests/prepararFala.test.ts`.
- `MtOptions { falada, contexto }` no contrato; a fala manda as 3 últimas falas da conversa.
- Edição full: fala do mic vai ao `server-llm-mt` **primeiro** (se existir na cadeia, disjuntor fechado); prompt comunicativo (`lib/traducao/promptComunicativo.ts`, compartilhado com o servidor): intérprete, registro informal, sentido, sem acrescentar/omitir, delimitadores `<<< >>>` e endurecimento contra instrução embutida; temperatura 0,2. 402 agora desliga o adaptador na sessão. Testes: `tests/promptComunicativo.test.ts`, `tests/traducao-cadeia.test.ts`.
- opus-mt: `num_beams: 2, max_length: 256, no_repeat_ngram_size: 3`.

## Limites honestos
- Na edição leve não há LLM: a tradução comunicativa ali é a preparação da fala + glossário + beam. Gíria fora da lista continua literal.
- O detector de vazamento depende de detecção de idioma por texto (falas muito curtas podem não ter sinal) — nesse caso nunca acusa.
- O `small` continua opt-in ("precisa" nos Ajustes) por custo de download/CPU.
