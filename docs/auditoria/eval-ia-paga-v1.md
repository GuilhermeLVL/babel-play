# eval-ia-paga-v1 — qualidade × custo × latência da IA paga (LLM-as-judge)

> Gerado por `scripts/eval-ia/rodar.mjs --relatorio` a partir dos brutos em `docs/auditoria/eval/ia-paga-v1/` (2026-10-25, commit 81612d79). Não edite à mão: os números saem do bruto.

Fase A do plano de qualidade da IA paga: explicação da frase, resumo da sessão, outras formas e legenda ao vivo, medidas com o PEDIDO DA PRODUÇÃO ATUAL (prompts, leitores, saída estruturada `json_schema strict` + `require_parameters` e o roteamento da legenda da Fase B), um juiz LLM com rubrica binária e as métricas do que aparece na tela.

**Gasto acumulado da bancada: US$ 3,33** de US$ 5,00 (livro-caixa com reserva do pior caso antes de cada chamada).

## 1. Recomendação

Medido com o pedido ATUAL da produção (Fase B): Explicação da frase (2026-10-25), Resumo da sessão (2026-10-25), Outras formas (2026-10-25), Legenda ao vivo (2026-10-25).

**Provisória:** a planilha de calibração humana ainda não foi anotada, e o plano exige κ ≥ 0,6 entre juiz e humano antes de o juiz decidir troca.

1. **Explicação da frase: manter `openai/gpt-oss-120b`** (nenhum candidato mais barato sem piorar). Opção mais cara, só com o aceite do dono: `deepseek/deepseek-v4.1-flash@none` melhora gramatica_correta 50% → 91%, girias_corretas 85% → 95%, idioma_certo 96% → 100% (IC pareado exclui 0) e custa US$ 0,235/1M tokens (teto do modelo de custo US$ 0,25); R$ 0,25 por pagante/mês na cota cheia, contra R$ 0,12 — **cabe no modelo de custo**; `qwen/qwen3-next-80b-a3b-instruct` melhora gramatica_correta 50% → 85% (IC pareado exclui 0) e custa US$ 0,413/1M tokens (teto do modelo de custo US$ 0,25); R$ 0,41 por pagante/mês na cota cheia, contra R$ 0,12 — **ACIMA do modelo de custo: depende do dono aceitar o custo e do portão `ia:custo`**.
2. **Resumo da sessão: manter `openai/gpt-oss-120b`** (nenhum candidato mais barato sem piorar).
3. **Outras formas: manter `openai/gpt-oss-120b`** (nenhum candidato mais barato sem piorar).
4. **Legenda ao vivo: manter `google/gemma-4-26b-a4b-it`** (nenhum candidato mais barato sem piorar).

## 2. A regra de decisão

"O MAIS BARATO QUE NÃO PIORA A EXPERIÊNCIA" (dono, 24/10/2026). A referência é a PRODUÇÃO (o que o usuário tem hoje), não o melhor pontual entre os candidatos. Código: `scripts/eval-ia/estatistica.mjs#decidirFuncao`, com teste.

- **Não piora** = nota não-inferior à produção (IC 95% do bootstrap pareado da diferença inteiro acima de −0,05), nenhum critério crítico pior (IC pareado abaixo de 0, ou mais de 10 pontos de queda), no máximo 5% das respostas acima do timeout da produção (inclui as abortadas pelo relógio), latência p95 no máximo 20% pior e no máximo 5% de chamadas sem resposta do provedor (senão a cascata cai na reserva com frequência).
- **Mais barato** que a produção (pelo menos 5% a menos por 1.000 usos: abaixo disso não há economia que pague o risco de trocar) e não piora → **pode trocar**; o recomendado é o mais barato deles.
- **Mais caro (ou sem essa economia)** → só aparece como **opção**, se além de não piorar for **superior à produção num critério crítico** (explicacao: gramatica_correta, girias_corretas, idioma_certo, segura; resumo: sem_invencao, idioma_certo, segura; alternativas: idioma_certo, segura; legenda: idioma_certo, segura) com IC excluindo 0 — e a troca depende de o dono aceitar o custo.
- Ninguém passa → **manter** a produção. Onde a amostra não decide, a §4 dá o n necessário.
- A regra B5 da bancada de fala (troca por qualidade só com IC excluindo 0 para cima) sai ao lado, como referência.

## 3. Resultados por função

Nota = fração de critérios atendidos, média dos dois juízes; resposta que a leitura da produção recusa conta 0. "Sem resposta do provedor" (429/5xx depois das tentativas) fica fora da nota. Latência = espera total (a produção não usa streaming); TTFT = primeiro pedaço, se houvesse streaming. "(ajuste)" = parâmetro que a produção ainda não manda.

### Explicação da frase

| Sistema                                      |   n | Nota [IC 95%]     | Δ vs produção [IC 95%]  | gramatica_correta (crítico) | girias_corretas (crítico) | idioma_certo (crítico) | segura (crítico) | Situação                                                                                                    |
| -------------------------------------------- | --: | ----------------- | ----------------------- | --------------------------: | ------------------------: | ---------------------: | ---------------: | ----------------------------------------------------------------------------------------------------------- |
| `openai/gpt-oss-120b`                        |  60 | 0,80 [0,75, 0,84] | —                       |                         50% |                       85% |                    96% |              98% | produção                                                                                                    |
| `deepseek/deepseek-v4.1-flash`               |  60 | 0,93 [0,91, 0,95] | +0,136 [+0,092, +0,186] |                         93% |                       92% |                   100% |              99% | piora a experiência (não troca) — latência p95 mais de 20% pior                                             |
| `deepseek/deepseek-v4.1-flash@none` (ajuste) |  60 | 0,97 [0,95, 0,98] | +0,167 [+0,123, +0,217] |                         91% |                       95% |                   100% |             100% | opção MAIS CARA (melhora critério crítico; depende do dono)                                                 |
| `mistralai/mistral-small-2603`               |  54 | 0,87 [0,84, 0,90] | +0,067 [+0,018, +0,126] |                         69% |                       93% |                   100% |              99% | piora a experiência (não troca) — mais de 5% sem resposta do provedor                                       |
| `z-ai/glm-5.3-flash`                         |  60 | 0,91 [0,90, 0,93] | +0,114 [+0,071, +0,164] |                         90% |                       95% |                   100% |              99% | piora a experiência (não troca) — passa do timeout da produção em mais de 5%; latência p95 mais de 20% pior |
| `qwen/qwen3-next-80b-a3b-instruct`           |  60 | 0,92 [0,90, 0,95] | +0,125 [+0,076, +0,177] |                         85% |                       90% |                    98% |              99% | opção MAIS CARA (melhora critério crítico; depende do dono)                                                 |

Taxa de acerto por critério:

| Sistema                             | sentido_correto | gramatica_correta | registro_correto | girias_corretas | idioma_certo | adequada_aprendiz | segura |
| ----------------------------------- | --------------: | ----------------: | ---------------: | --------------: | -----------: | ----------------: | -----: |
| `openai/gpt-oss-120b`               |             86% |               50% |              90% |             85% |          96% |               54% |    98% |
| `deepseek/deepseek-v4.1-flash`      |             98% |               93% |              99% |             92% |         100% |               73% |    99% |
| `deepseek/deepseek-v4.1-flash@none` |            100% |               91% |              98% |             95% |         100% |               93% |   100% |
| `mistralai/mistral-small-2603`      |             88% |               69% |              97% |             93% |         100% |               62% |    99% |
| `z-ai/glm-5.3-flash`                |             97% |               90% |              97% |             95% |         100% |               62% |    99% |
| `qwen/qwen3-next-80b-a3b-instruct`  |             95% |               85% |              95% |             90% |          98% |               84% |    99% |

Pareado nas duas ordens contra a produção (juiz de família diferente dos dois lados):

| Candidato                           | Preferência (V · E · D) [IC 95%]  | Instáveis (viés de posição) | Regra B5 da bancada                                                          |
| ----------------------------------- | --------------------------------- | --------------------------: | ---------------------------------------------------------------------------- |
| `deepseek/deepseek-v4.1-flash`      | 21 · 31 · 8 +0,22 [+0,03, +0,38]  |                         40% | superior — custo de US$ 0.4448/1M tokens acima do teto de US$ 0.25/1M tokens |
| `deepseek/deepseek-v4.1-flash@none` | 23 · 35 · 2 +0,35 [+0,22, +0,48]  |                         37% | superior                                                                     |
| `mistralai/mistral-small-2603`      | 17 · 23 · 14 +0,06 [−0,15, +0,24] |                         39% | inconclusivo                                                                 |
| `z-ai/glm-5.3-flash`                | 22 · 30 · 8 +0,23 [+0,07, +0,40]  |                         42% | superior                                                                     |
| `qwen/qwen3-next-80b-a3b-instruct`  | 17 · 39 · 4 +0,22 [+0,08, +0,35]  |                         45% | superior — custo de US$ 0.4134/1M tokens acima do teto de US$ 0.25/1M tokens |

### Resumo da sessão

| Sistema                                      |   n | Nota [IC 95%]     | Δ vs produção [IC 95%]  | sem_invencao (crítico) | idioma_certo (crítico) | segura (crítico) | Situação                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | --: | ----------------- | ----------------------- | ---------------------: | ---------------------: | ---------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai/gpt-oss-120b`                        |  15 | 0,96 [0,91, 0,99] | —                       |                    97% |                   100% |              97% | produção                                                                                                                                                                                                                                                                    |
| `deepseek/deepseek-v4.1-flash`               |  15 | 0,67 [0,40, 0,87] | −0,289 [−0,533, −0,050] |                    67% |                    67% |              67% | piora a experiência (não troca) — sem_invencao: pior que a produção (IC pareado exclui 0); idioma_certo: pior que a produção (IC pareado exclui 0); segura: pior que a produção (IC pareado exclui 0); não-inferioridade da nota não demonstrada                            |
| `deepseek/deepseek-v4.1-flash@none` (ajuste) |  15 | 1,00 [1,00, 1,00] | +0,044 [+0,011, +0,089] |                   100% |                   100% |             100% | mais caro sem ganho crítico (não troca)                                                                                                                                                                                                                                     |
| `mistralai/mistral-small-2603`               |  15 | 0,96 [0,92, 0,99] | −0,000 [−0,044, +0,050] |                    90% |                   100% |              97% | mais caro sem ganho crítico (não troca)                                                                                                                                                                                                                                     |
| `z-ai/glm-5.3-flash`                         |  15 | 0,80 [0,60, 1,00] | −0,156 [−0,383, +0,039] |                    80% |                    80% |              80% | piora a experiência (não troca) — sem_invencao: 17 pts abaixo da produção; idioma_certo: 20 pts abaixo da produção; segura: 17 pts abaixo da produção; não-inferioridade da nota não demonstrada; passa do timeout da produção em mais de 5%; latência p95 mais de 20% pior |
| `qwen/qwen3-next-80b-a3b-instruct`           |  15 | 0,97 [0,92, 1,00] | +0,017 [−0,056, +0,078] |                    90% |                   100% |             100% | piora a experiência (não troca) — não-inferioridade da nota não demonstrada                                                                                                                                                                                                 |

Taxa de acerto por critério:

| Sistema                             | pontos_fieis | sem_invencao | cartoes_uteis | cartoes_corretos | idioma_certo | segura |
| ----------------------------------- | -----------: | -----------: | ------------: | ---------------: | -----------: | -----: |
| `openai/gpt-oss-120b`               |          93% |          97% |           93% |              93% |         100% |    97% |
| `deepseek/deepseek-v4.1-flash`      |          67% |          67% |           67% |              67% |          67% |    67% |
| `deepseek/deepseek-v4.1-flash@none` |         100% |         100% |          100% |             100% |         100% |   100% |
| `mistralai/mistral-small-2603`      |          93% |          90% |          100% |              93% |         100% |    97% |
| `z-ai/glm-5.3-flash`                |          80% |          80% |           80% |              80% |          80% |    80% |
| `qwen/qwen3-next-80b-a3b-instruct`  |          93% |          90% |          100% |             100% |         100% |   100% |

Pareado nas duas ordens contra a produção (juiz de família diferente dos dois lados):

| Candidato                           | Preferência (V · E · D) [IC 95%] | Instáveis (viés de posição) | Regra B5 da bancada                                                                                                                           |
| ----------------------------------- | -------------------------------- | --------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `deepseek/deepseek-v4.1-flash`      | 7 · 0 · 8 −0,07 [−0,60, +0,33]   |                          0% | inferior — gold de conversa piorou em gold:resumo (IC exclui 0 para baixo); custo de US$ 0.4390/1M tokens acima do teto de US$ 0.25/1M tokens |
| `deepseek/deepseek-v4.1-flash@none` | 10 · 4 · 1 +0,60 [+0,27, +0,87]  |                         27% | superior — custo de US$ 0.2584/1M tokens acima do teto de US$ 0.25/1M tokens                                                                  |
| `mistralai/mistral-small-2603`      | 3 · 4 · 8 −0,33 [−0,73, +0,13]   |                         27% | inconclusivo                                                                                                                                  |
| `z-ai/glm-5.3-flash`                | 9 · 3 · 3 +0,40 [−0,00, +0,80]   |                         20% | inconclusivo                                                                                                                                  |
| `qwen/qwen3-next-80b-a3b-instruct`  | 7 · 7 · 1 +0,40 [+0,07, +0,67]   |                         47% | inconclusivo — custo de US$ 0.4648/1M tokens acima do teto de US$ 0.25/1M tokens                                                              |

### Outras formas

| Sistema                                      |   n | Nota [IC 95%]     | Δ vs produção [IC 95%]  | idioma_certo (crítico) | segura (crítico) | Situação                                                                                                                                                            |
| -------------------------------------------- | --: | ----------------- | ----------------------- | ---------------------: | ---------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai/gpt-oss-120b`                        |  40 | 0,91 [0,85, 0,96] | —                       |                   100% |              99% | produção                                                                                                                                                            |
| `deepseek/deepseek-v4.1-flash`               |  40 | 0,87 [0,76, 0,95] | −0,046 [−0,165, +0,056] |                    90% |              90% | piora a experiência (não troca) — idioma_certo: pior que a produção (IC pareado exclui 0); não-inferioridade da nota não demonstrada; latência p95 mais de 20% pior |
| `deepseek/deepseek-v4.1-flash@none` (ajuste) |  40 | 0,98 [0,95, 1,00] | +0,065 [+0,008, +0,125] |                   100% |             100% | mais caro sem ganho crítico (não troca)                                                                                                                             |
| `mistralai/mistral-small-2603`               |  40 | 0,96 [0,92, 0,99] | +0,048 [−0,015, +0,117] |                    98% |             100% | mais caro sem ganho crítico (não troca)                                                                                                                             |
| `z-ai/glm-5.3-flash`                         |  40 | 0,95 [0,90, 0,99] | +0,040 [−0,038, +0,106] |                    98% |              98% | piora a experiência (não troca) — passa do timeout da produção em mais de 5%; latência p95 mais de 20% pior                                                         |
| `qwen/qwen3-next-80b-a3b-instruct`           |  40 | 0,91 [0,85, 0,96] | −0,006 [−0,073, +0,063] |                    99% |              99% | piora a experiência (não troca) — não-inferioridade da nota não demonstrada                                                                                         |

Taxa de acerto por critério:

| Sistema                             | mesmo_sentido | diversidade | registro_certo | naturalidade | idioma_certo | segura |
| ----------------------------------- | ------------: | ----------: | -------------: | -----------: | -----------: | -----: |
| `openai/gpt-oss-120b`               |           86% |         90% |            86% |          86% |         100% |    99% |
| `deepseek/deepseek-v4.1-flash`      |           85% |         86% |            85% |          84% |          90% |    90% |
| `deepseek/deepseek-v4.1-flash@none` |           96% |         98% |            96% |          96% |         100% |   100% |
| `mistralai/mistral-small-2603`      |           95% |        100% |            94% |          90% |          98% |   100% |
| `z-ai/glm-5.3-flash`                |           93% |         98% |            93% |          94% |          98% |    98% |
| `qwen/qwen3-next-80b-a3b-instruct`  |           80% |         96% |            88% |          83% |          99% |    99% |

Pareado nas duas ordens contra a produção (juiz de família diferente dos dois lados):

| Candidato                           | Preferência (V · E · D) [IC 95%]  | Instáveis (viés de posição) | Regra B5 da bancada                                                              |
| ----------------------------------- | --------------------------------- | --------------------------: | -------------------------------------------------------------------------------- |
| `deepseek/deepseek-v4.1-flash`      | 20 · 9 · 11 +0,23 [−0,03, +0,50]  |                         23% | inconclusivo — custo de US$ 0.5088/1M tokens acima do teto de US$ 0.25/1M tokens |
| `deepseek/deepseek-v4.1-flash@none` | 26 · 9 · 5 +0,53 [+0,30, +0,70]   |                         20% | superior                                                                         |
| `mistralai/mistral-small-2603`      | 13 · 17 · 10 +0,07 [−0,15, +0,30] |                         43% | inconclusivo                                                                     |
| `z-ai/glm-5.3-flash`                | 26 · 5 · 9 +0,42 [+0,17, +0,68]   |                         13% | nao-inferior                                                                     |
| `qwen/qwen3-next-80b-a3b-instruct`  | 16 · 14 · 10 +0,15 [−0,10, +0,40] |                         35% | inconclusivo — custo de US$ 0.3676/1M tokens acima do teto de US$ 0.25/1M tokens |

### Legenda ao vivo

| Sistema                                      |   n | Nota [IC 95%]     | Δ vs produção [IC 95%]  | idioma_certo (crítico) | segura (crítico) | Situação                                                              |
| -------------------------------------------- | --: | ----------------- | ----------------------- | ---------------------: | ---------------: | --------------------------------------------------------------------- |
| `google/gemma-4-26b-a4b-it`                  |  60 | 0,94 [0,91, 0,96] | —                       |                   100% |             100% | produção                                                              |
| `openai/gpt-oss-120b~groq+cerebras` (ajuste) |  60 | 0,94 [0,91, 0,97] | −0,004 [−0,036, +0,025] |                   100% |             100% | mais caro sem ganho crítico (não troca)                               |
| `mistralai/mistral-small-2603`               |  55 | 0,96 [0,91, 0,99] | −0,017 [−0,044, +0,000] |                   100% |             100% | piora a experiência (não troca) — mais de 5% sem resposta do provedor |

Taxa de acerto por critério:

| Sistema                             | adequacao | naturalidade | registro | idioma_certo | segura |
| ----------------------------------- | --------: | -----------: | -------: | -----------: | -----: |
| `google/gemma-4-26b-a4b-it`         |       85% |          91% |      93% |         100% |   100% |
| `openai/gpt-oss-120b~groq+cerebras` |       89% |          93% |      90% |         100% |   100% |
| `mistralai/mistral-small-2603`      |       89% |          97% |      92% |         100% |   100% |

Pareado nas duas ordens contra a produção (juiz de família diferente dos dois lados):

| Candidato                           | Preferência (V · E · D) [IC 95%] | Instáveis (viés de posição) | Regra B5 da bancada                                                              |
| ----------------------------------- | -------------------------------- | --------------------------: | -------------------------------------------------------------------------------- |
| `openai/gpt-oss-120b~groq+cerebras` | —                                |                           — | nao-inferior — custo de US$ 0.0720/h de fala acima do teto de US$ 0.05/h de fala |
| `mistralai/mistral-small-2603`      | —                                |                           — | nao-inferior                                                                     |

## 4. Onde a amostra não decide (análise de poder)

Casos PAREADOS necessários para decidir com α = 2,5% unilateral e poder de 80%, pelo desvio-padrão observado da diferença por caso:

**Explicação da frase**

- `deepseek/deepseek-v4.1-flash`, superioridade em girias_corretas: ~202 casos pareados (hoje 60)
- `deepseek/deepseek-v4.1-flash`, superioridade em segura: ~2387 casos pareados (hoje 60)
- `deepseek/deepseek-v4.1-flash@none`, superioridade em segura: ~471 casos pareados (hoje 60)
- `mistralai/mistral-small-2603`, superioridade em girias_corretas: ~114 casos pareados (hoje 54)
- `mistralai/mistral-small-2603`, superioridade em segura: ~2152 casos pareados (hoje 54)
- `z-ai/glm-5.3-flash`, superioridade em segura: ~2387 casos pareados (hoje 60)
- `qwen/qwen3-next-80b-a3b-instruct`, superioridade em girias_corretas: ~312 casos pareados (hoje 60)
- `qwen/qwen3-next-80b-a3b-instruct`, superioridade em idioma_certo: ~471 casos pareados (hoje 60)
- `qwen/qwen3-next-80b-a3b-instruct`, superioridade em segura: ~2387 casos pareados (hoje 60)

**Resumo da sessão**

- `deepseek/deepseek-v4.1-flash`, naoInferioridade: a diferença observada aponta para o outro lado — nenhuma amostra decide a favor
- `deepseek/deepseek-v4.1-flash@none`, superioridade em sem_invencao: ~118 casos pareados (hoje 15)
- `deepseek/deepseek-v4.1-flash@none`, superioridade em segura: ~118 casos pareados (hoje 15)
- `z-ai/glm-5.3-flash`, naoInferioridade: a diferença observada aponta para o outro lado — nenhuma amostra decide a favor
- `qwen/qwen3-next-80b-a3b-instruct`, naoInferioridade: ~29 casos pareados (hoje 15)
- `qwen/qwen3-next-80b-a3b-instruct`, superioridade em segura: ~118 casos pareados (hoje 15)

**Outras formas**

- `deepseek/deepseek-v4.1-flash`, naoInferioridade: ~56504 casos pareados (hoje 40)
- `deepseek/deepseek-v4.1-flash@none`, superioridade em segura: ~314 casos pareados (hoje 40)
- `mistralai/mistral-small-2603`, superioridade em segura: ~314 casos pareados (hoje 40)
- `qwen/qwen3-next-80b-a3b-instruct`, naoInferioridade: ~203 casos pareados (hoje 40)

**Legenda ao vivo**

- (a amostra decidiu todas as comparações relevantes)

## 5. Como o usuário sente

Cada métrica e o que aparece na tela: **inválida** = "não deu para explicar agora" (502 `resposta_invalida`, uso consumido); **passa do timeout** = a folha gira e cai na reserva ou em erro; **espera** = quanto a folha fica carregando; **TTFT** = quando o texto começaria a aparecer com streaming; **caracteres / cabe sem rolar** = se cabe na folha do celular (limites declarados em `funcoes.mjs`); **palavras por frase** = leitura de aprendiz; **idioma certo** = explicação em português (heurística; o juiz também julga); **R$ por pagante/mês** = custo da cota cheia de estudo.

### Explicação da frase

| Sistema                             | Erro na tela (inválida) | Sem resposta do provedor | Passa do timeout | Espera p50 · p95             | TTFT p50 · p95 | Caracteres p50 | Cabe sem rolar | Palavras/frase | Idioma certo | US$/1.000 usos | R$ por pagante/mês | Extra |
| ----------------------------------- | ----------------------: | -----------------------: | ---------------: | ---------------------------- | -------------- | -------------: | -------------: | -------------: | -----------: | -------------: | -----------------: | ----- |
| `openai/gpt-oss-120b`               |                      2% |                       0% |               0% | 2,6 s · 6,9 s (fora do SLO)  | 1,3 s · 4,2 s  |            380 |           100% |           15,5 |          98% |      US$ 0,070 |            R$ 0,12 |       |
| `deepseek/deepseek-v4.1-flash`      |                      0% |                       0% |               2% | 4,8 s · 9,0 s (fora do SLO)  | 3,8 s · 7,9 s  |            582 |            98% |           14,0 |         100% |      US$ 0,519 |            R$ 0,87 |       |
| `deepseek/deepseek-v4.1-flash@none` |                      0% |                       0% |               0% | 1,8 s · 3,0 s                | 0,7 s · 1,7 s  |            444 |           100% |           13,7 |         100% |      US$ 0,151 |            R$ 0,25 |       |
| `mistralai/mistral-small-2603`      |                      0% |                      10% |               0% | 1,9 s · 3,1 s                | 0,6 s · 1,3 s  |            548 |           100% |           15,2 |         100% |      US$ 0,118 |            R$ 0,20 |       |
| `z-ai/glm-5.3-flash`                |                      0% |                       0% |               8% | 4,2 s · 29,9 s (fora do SLO) | 3,2 s · 23,0 s |            642 |            98% |           14,4 |         100% |      US$ 0,174 |            R$ 0,29 |       |
| `qwen/qwen3-next-80b-a3b-instruct`  |                      0% |                       0% |               0% | 1,7 s · 2,6 s                | 0,7 s · 1,3 s  |            452 |           100% |           13,7 |         100% |      US$ 0,244 |            R$ 0,41 |       |

### Resumo da sessão

| Sistema                             | Erro na tela (inválida) | Sem resposta do provedor | Passa do timeout | Espera p50 · p95             | TTFT p50 · p95 | Caracteres p50 | Cabe sem rolar | Palavras/frase | Idioma certo | US$/1.000 usos | R$ por pagante/mês | Extra                              |
| ----------------------------------- | ----------------------: | -----------------------: | ---------------: | ---------------------------- | -------------- | -------------: | -------------: | -------------: | -----------: | -------------: | -----------------: | ---------------------------------- |
| `openai/gpt-oss-120b`               |                      0% |                       0% |               0% | 5,5 s · 23,9 s (fora do SLO) | 1,9 s · 8,0 s  |            666 |           100% |            8,0 |         100% |      US$ 0,137 |            R$ 0,05 | 7,5 cartões; 58% das palavras-alvo |
| `deepseek/deepseek-v4.1-flash`      |                     33% |                       0% |               0% | 5,9 s · 12,4 s (fora do SLO) | 4,2 s · 6,3 s  |            816 |           100% |            8,8 |         100% |      US$ 0,942 |            R$ 0,32 | 9,3 cartões; 89% das palavras-alvo |
| `deepseek/deepseek-v4.1-flash@none` |                      0% |                       0% |               0% | 2,2 s · 4,2 s                | 0,8 s · 2,0 s  |            725 |           100% |            8,8 |         100% |      US$ 0,359 |            R$ 0,12 | 9,3 cartões; 80% das palavras-alvo |
| `mistralai/mistral-small-2603`      |                      0% |                       0% |               0% | 2,2 s · 2,9 s                | 0,6 s · 1,1 s  |            451 |           100% |            6,6 |         100% |      US$ 0,282 |            R$ 0,09 | 8,1 cartões; 64% das palavras-alvo |
| `z-ai/glm-5.3-flash`                |                     20% |                       0% |              13% | 7,0 s · 43,0 s (fora do SLO) | 4,3 s · 23,2 s |            691 |           100% |            8,5 |         100% |      US$ 0,296 |            R$ 0,10 | 8,8 cartões; 74% das palavras-alvo |
| `qwen/qwen3-next-80b-a3b-instruct`  |                      0% |                       0% |               0% | 2,8 s · 3,5 s                | 0,7 s · 1,3 s  |            697 |           100% |            7,9 |         100% |      US$ 0,613 |            R$ 0,21 | 8,6 cartões; 68% das palavras-alvo |

### Outras formas

| Sistema                             | Erro na tela (inválida) | Sem resposta do provedor | Passa do timeout | Espera p50 · p95             | TTFT p50 · p95 | Caracteres p50 | Cabe sem rolar | Palavras/frase | Idioma certo | US$/1.000 usos | R$ por pagante/mês | Extra                        |
| ----------------------------------- | ----------------------: | -----------------------: | ---------------: | ---------------------------- | -------------- | -------------: | -------------: | -------------: | -----------: | -------------: | -----------------: | ---------------------------- |
| `openai/gpt-oss-120b`               |                      0% |                       0% |               0% | 1,8 s · 4,0 s (fora do SLO)  | 1,0 s · 3,0 s  |            182 |           100% |            7,5 |         100% |      US$ 0,033 |                  — | 2,9 opções; nota ≤ 140: 100% |
| `deepseek/deepseek-v4.1-flash`      |                     10% |                       0% |               0% | 4,4 s · 8,4 s (fora do SLO)  | 3,6 s · 5,6 s  |            216 |           100% |            7,6 |         100% |      US$ 0,500 |                  — | 2,9 opções; nota ≤ 140: 83%  |
| `deepseek/deepseek-v4.1-flash@none` |                      0% |                       0% |               0% | 0,9 s · 2,1 s                | 0,5 s · 1,6 s  |            195 |           100% |            8,1 |         100% |      US$ 0,099 |                  — | 2,9 opções; nota ≤ 140: 100% |
| `mistralai/mistral-small-2603`      |                      0% |                       0% |               0% | 1,2 s · 1,7 s                | 0,5 s · 0,8 s  |            214 |           100% |            9,0 |         100% |      US$ 0,064 |                  — | 3,0 opções; nota ≤ 140: 85%  |
| `z-ai/glm-5.3-flash`                |                      3% |                       0% |               8% | 4,5 s · 17,8 s (fora do SLO) | 4,1 s · 16,6 s |            202 |           100% |            7,6 |         100% |      US$ 0,109 |                  — | 2,9 opções; nota ≤ 140: 87%  |
| `qwen/qwen3-next-80b-a3b-instruct`  |                      0% |                       0% |               0% | 1,3 s · 2,0 s                | 0,9 s · 1,1 s  |            231 |           100% |           10,0 |         100% |      US$ 0,147 |                  — | 3,0 opções; nota ≤ 140: 70%  |

### Legenda ao vivo

| Sistema                             | Erro na tela (inválida) | Sem resposta do provedor | Passa do timeout | Espera p50 · p95            | TTFT p50 · p95 | Caracteres p50 | Cabe sem rolar | Palavras/frase | Idioma certo | US$/1.000 usos | R$ por pagante/mês | Extra                    |
| ----------------------------------- | ----------------------: | -----------------------: | ---------------: | --------------------------- | -------------- | -------------: | -------------: | -------------: | -----------: | -------------: | -----------------: | ------------------------ |
| `google/gemma-4-26b-a4b-it`         |                      0% |                       0% |               0% | 1,0 s · 4,3 s (fora do SLO) | 1,0 s · 4,2 s  |             40 |              — |            5,3 |         100% |      US$ 0,018 |                  — | chrF++ 77,9; US$ 0,023/h |
| `openai/gpt-oss-120b~groq+cerebras` |                      0% |                       0% |               0% | 0,9 s · 1,5 s               | 0,8 s · 1,4 s  |             38 |              — |            5,1 |         100% |      US$ 0,058 |                  — | chrF++ 73,0; US$ 0,072/h |
| `mistralai/mistral-small-2603`      |                      0% |                       8% |               0% | 1,0 s · 1,6 s (fora do SLO) | 0,9 s · 1,3 s  |             35 |              — |            4,9 |         100% |      US$ 0,018 |                  — | chrF++ 63,9; US$ 0,022/h |

## 6. Robustez: só o juiz de família diferente do candidato

A nota principal é a média dos dois juízes, e cada um deles é da família de algum candidato (DeepSeek, Mistral). Aqui a decisão é refeita, para cada candidato, só com o juiz de família DIFERENTE da dele (o Mistral para o DeepSeek e os demais; o DeepSeek para o Mistral Small):

| Função       | Candidato                           | Juiz único (família diferente)      | Δ nota, média dos 2 juízes | Δ nota, juiz único      | Situação (2 juízes)         | Situação (juiz único)       |
| ------------ | ----------------------------------- | ----------------------------------- | -------------------------- | ----------------------- | --------------------------- | --------------------------- |
| explicacao   | `deepseek/deepseek-v4.1-flash`      | `mistralai/mistral-medium-3.1`      | +0,136 [+0,092, +0,186]    | +0,136 [+0,083, +0,198] | piora                       | piora                       |
| explicacao   | `deepseek/deepseek-v4.1-flash@none` | `mistralai/mistral-medium-3.1`      | +0,167 [+0,123, +0,217]    | +0,198 [+0,140, +0,260] | opcao-mais-cara             | opcao-mais-cara             |
| explicacao   | `mistralai/mistral-small-2603`      | `deepseek/deepseek-v4.1-flash@none` | +0,067 [+0,018, +0,126]    | +0,063 [+0,011, +0,119] | piora                       | piora                       |
| explicacao   | `z-ai/glm-5.3-flash`                | `mistralai/mistral-medium-3.1`      | +0,114 [+0,071, +0,164]    | +0,102 [+0,052, +0,155] | piora                       | piora                       |
| explicacao   | `qwen/qwen3-next-80b-a3b-instruct`  | `mistralai/mistral-medium-3.1`      | +0,125 [+0,076, +0,177]    | +0,140 [+0,076, +0,202] | opcao-mais-cara             | opcao-mais-cara             |
| resumo       | `deepseek/deepseek-v4.1-flash`      | `mistralai/mistral-medium-3.1`      | −0,289 [−0,533, −0,050]    | −0,267 [−0,511, −0,011] | piora                       | piora                       |
| resumo       | `deepseek/deepseek-v4.1-flash@none` | `mistralai/mistral-medium-3.1`      | +0,044 [+0,011, +0,089]    | +0,067 [+0,011, +0,133] | mais-caro-sem-ganho-critico | mais-caro-sem-ganho-critico |
| resumo       | `mistralai/mistral-small-2603`      | `deepseek/deepseek-v4.1-flash@none` | −0,000 [−0,044, +0,050]    | +0,011 [−0,022, +0,044] | mais-caro-sem-ganho-critico | mais-caro-sem-ganho-critico |
| resumo       | `z-ai/glm-5.3-flash`                | `mistralai/mistral-medium-3.1`      | −0,156 [−0,383, +0,039]    | −0,133 [−0,389, +0,078] | piora                       | piora                       |
| resumo       | `qwen/qwen3-next-80b-a3b-instruct`  | `mistralai/mistral-medium-3.1`      | +0,017 [−0,056, +0,078]    | +0,033 [−0,056, +0,122] | piora                       | piora                       |
| alternativas | `deepseek/deepseek-v4.1-flash`      | `mistralai/mistral-medium-3.1`      | −0,046 [−0,165, +0,056]    | −0,050 [−0,167, +0,062] | piora                       | piora                       |
| alternativas | `deepseek/deepseek-v4.1-flash@none` | `mistralai/mistral-medium-3.1`      | +0,065 [+0,008, +0,125]    | +0,096 [+0,033, +0,167] | mais-caro-sem-ganho-critico | mais-caro-sem-ganho-critico |
| alternativas | `mistralai/mistral-small-2603`      | `deepseek/deepseek-v4.1-flash@none` | +0,048 [−0,015, +0,117]    | +0,037 [−0,025, +0,104] | mais-caro-sem-ganho-critico | mais-caro-sem-ganho-critico |
| alternativas | `z-ai/glm-5.3-flash`                | `mistralai/mistral-medium-3.1`      | +0,040 [−0,038, +0,106]    | +0,050 [−0,033, +0,129] | piora                       | piora                       |
| alternativas | `qwen/qwen3-next-80b-a3b-instruct`  | `mistralai/mistral-medium-3.1`      | −0,006 [−0,073, +0,063]    | −0,013 [−0,092, +0,058] | piora                       | piora                       |
| legenda      | `openai/gpt-oss-120b~groq+cerebras` | `mistralai/mistral-medium-3.1`      | −0,004 [−0,036, +0,025]    | +0,015 [−0,023, +0,057] | mais-caro-sem-ganho-critico | mais-caro-sem-ganho-critico |
| legenda      | `mistralai/mistral-small-2603`      | `deepseek/deepseek-v4.1-flash@none` | −0,017 [−0,044, +0,000]    | +0,000 [+0,000, +0,000] | piora                       | piora                       |

## 7. O juiz

- `mistralai/mistral-medium-3.1`: temperatura 0, `max_tokens` 1600 (rubrica) / 600 (pareado), `response_format: json_object`, roteamento `{"data_collection":"deny","zdr":true,"ignore":["google-ai-studio","google-vertex"]}`.
- `deepseek/deepseek-v4.1-flash@none`: temperatura 0, `max_tokens` 1600 (rubrica) / 600 (pareado), `response_format: json_object`, roteamento `{"data_collection":"deny","zdr":true,"ignore":["google-ai-studio","google-vertex","novita"]}`, raciocínio `{"enabled":false}`.

**Autopreferência medida** (nota a mais para a própria família, descontada a severidade): explicacao: `mistralai/mistral-medium-3.1` −0,005, `deepseek/deepseek-v4.1-flash@none` −0,027; resumo: `mistralai/mistral-medium-3.1` −0,056, `deepseek/deepseek-v4.1-flash@none` −0,031; alternativas: `mistralai/mistral-medium-3.1` +0,008, `deepseek/deepseek-v4.1-flash@none` −0,020; legenda: `mistralai/mistral-medium-3.1` +0,008, `deepseek/deepseek-v4.1-flash@none` —.

**Viés de posição:** no pareado nas duas ordens, de 0% a 47% dos pares mudaram de lado com a troca de posição e contaram como empate.

**κ juiz × juiz** (sobre as respostas válidas; "indefinido" = os dois deram sempre o mesmo veredito, sem variação para medir):

| Função       | κ geral (acordo bruto) | κ por critério                                                                                                                                                                               |
| ------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| explicacao   | 0,28 — razoável (87%)  | sentido_correto 0,28 (92%); gramatica_correta 0,40 (81%); registro_correto 0,50 (96%); girias_corretas 0,34 (90%); idioma_certo -0,00 (99%); adequada_aprendiz 0,07 (54%); segura 0,00 (99%) |
| resumo       | 0,27 — razoável (97%)  | pontos_fieis 0,32 (95%); sem_invencao 0,26 (94%); cartoes_uteis 1,00 (100%); cartoes_corretos -0,02 (95%); idioma_certo indefinido (100%); segura 0,00 (98%)                                 |
| alternativas | 0,49 — moderado (95%)  | mesmo_sentido 0,58 (93%); diversidade 0,23 (95%); registro_certo 0,38 (91%); naturalidade 0,55 (92%); idioma_certo 0,66 (100%); segura 0,00 (99%)                                            |
| legenda      | 0,46 — moderado (94%)  | adequacao 0,59 (91%); naturalidade 0,35 (90%); registro 0,29 (91%); idioma_certo indefinido (100%); segura indefinido (100%)                                                                 |

**κ juiz × humano: pendente.** Planilha: `docs/auditoria/eval/ia-paga-v1/planilha-calibracao.csv`; passo a passo: `docs/auditoria/eval/ia-paga-v1/LEIA-ME-calibracao.md`.

## 8. Custo por usuário pagante e `npm run ia:custo`

**Por pagante que esgota a cota de estudo** (300 explicações e 60 resumos por mês, `src/core/planos.ts`), pelo custo medido:

- Explicação da frase: `openai/gpt-oss-120b` R$ 0,12 · `deepseek/deepseek-v4.1-flash@none` R$ 0,25 · `qwen/qwen3-next-80b-a3b-instruct` R$ 0,41
- Resumo da sessão: `openai/gpt-oss-120b` R$ 0,05

**Portão `ia:custo`.** O modelo de custo cobra a IA de texto a R$ 1,40 por 1M tokens (US$ 0,25). Efeito, no pior caso (toda a cota de tokens ao preço medido), de cada opção acima do modelo:

- `qwen/qwen3-next-80b-a3b-instruct` em explicacao (US$ 0,413/1M, +R$ 0,92/1M):
  - Plus: +R$ 1,83/mês; margem do anual R$ 32,49 → R$ 10,53
  - Família: +R$ 2,75/mês; margem do anual R$ 47,25 → R$ 14,30
  - Pro: +R$ 2,75/mês; margem do anual R$ 27,45 → R$ -5,50 **NEGATIVA**
  - mistura de 3% de pagantes só com Plus: margem no pior caso US$ -10,76 → US$ -20,57
  - mistura de 8% de pagantes só com Plus: margem no pior caso US$ 35,33 → US$ 9,18
  - mistura de 15% de pagantes só com Plus: margem no pior caso US$ 99,86 → US$ 50,83

Misturas Essencial/Premium (60/40) de 3%, 8%, 15%: margem no pior caso US$ 0,17 / US$ 64,47 / US$ 154,51 — o modelo desses planos não inclui IA de texto, então a troca não as altera.

## 9. Método e limitações

- **Cliente próprio, não `bancada/nuvem.mjs`.** O harness tem um cliente do OpenRouter (`scripts/eval-ia/openrouter.mjs`) porque precisa de streaming (TTFT) e de outras funções além da tradução; o corpo é montado com o MESMO `parametrosDoProvedor` do servidor, e um teste (`tests/eval/ia-paga-cliente.test.ts`) compara byte a byte com o corpo que `chamarChat` manda. Sem ajuste declarado, divergência LANÇA. Preço-teto e prova de retenção zero saem de `GET /api/v1/endpoints/zdr`; o livro-caixa (`bancada/livroCaixa.mjs`) reserva o pior caso antes de cada chamada.
- **Golds escritos pela equipe** (o agente), revisados por consistência; a referência pode ter falhas.
- **Amostras pequenas** no resumo e nas alternativas (ver §4); **uma execução por modelo**, na temperatura de produção.
- **Latência num só horário**, pelo OpenRouter; o provedor sorteado muda o número. Indicativo, não SLO medido em produção.
- **Ajustes fora da produção** (`@none`, `~groq+cerebras`): parâmetros que a produção ainda não manda; o `@none` também tira do roteamento o provedor que ignora o raciocínio desligado.
- **Limite da chave do OpenRouter:** além do teto do livro-caixa, a chave tem um limite de gasto próprio (painel do OpenRouter). A primeira tentativa de repetir com o pedido da Fase B parou nele (HTTP 403); a medição foi refeita depois que o dono subiu o limite. O harness para a rodada inteira nesse caso e grava o parcial à parte, sem apagar o bruto anterior.
- Funções não medidas: polimento e tutor.

## 10. Achados à parte

- **Mistura só com Plus já negativa hoje:** com 3% de pagantes (margem no pior caso US$ -10,76), o `ia:custo` fecha negativo SEM nenhuma troca de modelo — vem do custo do Grátis. Precisa de decisão à parte.
- Explicação da frase: a produção já tem p95 de 6,9 s, acima do SLO proposto de 4,0 s.
- Resumo da sessão: a produção já tem p95 de 23,9 s, acima do SLO proposto de 8,0 s.
- Outras formas: a produção já tem p95 de 4,0 s, acima do SLO proposto de 4,0 s.
- Legenda ao vivo: a produção já tem p95 de 4,3 s, acima do SLO proposto de 1,5 s.

## Arquivos

`scripts/eval-ia/` (harness), `tests/eval/ia-paga-*.test.ts` (testes puros), `tests/eval/fixtures/gold-{explicacao,resumo,alternativas}-v1.jsonl` (golds), `docs/auditoria/eval/ia-paga-v1/` (brutos compactos, decisões, concordância, planilha e LEIA-ME da calibração, resumo da bancada de fala para a legenda).
