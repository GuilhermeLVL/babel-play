# eval-ia-paga-v1 — qualidade × custo × latência da IA paga (LLM-as-judge)

> Gerado por `scripts/eval-ia/rodar.mjs --relatorio` a partir dos brutos em `docs/auditoria/eval/ia-paga-v1/` (2026-10-25, commit e2352548). Não edite à mão: os números saem do bruto.

Fase A do plano de qualidade da IA paga: explicação da frase, resumo da sessão, outras formas e legenda ao vivo, medidas com o PEDIDO DA PRODUÇÃO ATUAL (prompts, leitores, saída estruturada `json_schema strict` + `require_parameters` e o roteamento da legenda da Fase B), um juiz LLM com rubrica binária e as métricas do que aparece na tela.

**Gasto acumulado da bancada: US$ 1,99** de US$ 5,00 (livro-caixa com reserva do pior caso antes de cada chamada).

## 1. Recomendação

**Atenção — medido com o pedido ANTERIOR à Fase B:** Explicação da frase (2026-10-25), Resumo da sessão (2026-10-25), Outras formas (2026-10-25). Sem `json_schema strict` + `require_parameters` (estudo) ou sem o roteamento da legenda. A repetição com o pedido atual parou no limite de gasto da chave do OpenRouter (§9); a taxa de resposta inválida, em especial, pode cair com a saída estruturada.

Medido com o pedido ATUAL da produção (Fase B): Legenda ao vivo (2026-10-25).

**Provisória:** a planilha de calibração humana ainda não foi anotada, e o plano exige κ ≥ 0,6 entre juiz e humano antes de o juiz decidir troca.

1. **Explicação da frase: manter `openai/gpt-oss-120b`** (nenhum candidato mais barato sem piorar). Opção mais cara, só com o aceite do dono: `deepseek/deepseek-v4.1-flash@none` melhora gramatica_correta 64% → 97% (IC pareado exclui 0) e custa US$ 0,286/1M tokens (teto do modelo de custo US$ 0,25); R$ 0,29 por pagante/mês na cota cheia, contra R$ 0,10 — **ACIMA do modelo de custo: depende do dono aceitar o custo e do portão `ia:custo`**; `qwen/qwen3-next-80b-a3b-instruct` melhora gramatica_correta 64% → 89% (IC pareado exclui 0) e custa US$ 0,424/1M tokens (teto do modelo de custo US$ 0,25); R$ 0,42 por pagante/mês na cota cheia, contra R$ 0,10 — **ACIMA do modelo de custo: depende do dono aceitar o custo e do portão `ia:custo`**.
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

| Sistema                                      |   n | Nota [IC 95%]     | Δ vs produção [IC 95%]  | gramatica_correta (crítico) | girias_corretas (crítico) | idioma_certo (crítico) | segura (crítico) | Situação                                                    |
| -------------------------------------------- | --: | ----------------- | ----------------------- | --------------------------: | ------------------------: | ---------------------: | ---------------: | ----------------------------------------------------------- |
| `openai/gpt-oss-120b`                        |  60 | 0,89 [0,86, 0,93] | —                       |                         64% |                       91% |                   100% |             100% | produção                                                    |
| `deepseek/deepseek-v4.1-flash`               |  60 | 0,92 [0,85, 0,97] | +0,023 [−0,037, +0,075] |                         90% |                       90% |                    95% |              95% | piora a experiência: não                                    |
| `deepseek/deepseek-v4.1-flash@none` (ajuste) |  60 | 0,98 [0,96, 0,99] | +0,082 [+0,052, +0,115] |                         97% |                       96% |                   100% |             100% | opção MAIS CARA (melhora critério crítico; depende do dono) |
| `mistralai/mistral-small-2603`               |  60 | 0,89 [0,86, 0,91] | −0,006 [−0,042, +0,029] |                         67% |                       94% |                   100% |             100% | mais caro sem ganho crítico: não                            |
| `z-ai/glm-5.3-flash`                         |  60 | 0,95 [0,93, 0,96] | +0,054 [+0,023, +0,087] |                         93% |                       98% |                    99% |             100% | piora a experiência: não                                    |
| `qwen/qwen3-next-80b-a3b-instruct`           |  60 | 0,95 [0,92, 0,97] | +0,052 [+0,015, +0,090] |                         89% |                       97% |                    98% |             100% | opção MAIS CARA (melhora critério crítico; depende do dono) |

Taxa de acerto por critério:

| Sistema                             | sentido_correto | gramatica_correta | registro_correto | girias_corretas | idioma_certo | adequada_aprendiz | segura |
| ----------------------------------- | --------------: | ----------------: | ---------------: | --------------: | -----------: | ----------------: | -----: |
| `openai/gpt-oss-120b`               |             96% |               64% |             100% |             91% |         100% |               75% |   100% |
| `deepseek/deepseek-v4.1-flash`      |             94% |               90% |              93% |             90% |          95% |               84% |    95% |
| `deepseek/deepseek-v4.1-flash@none` |             99% |               97% |              98% |             96% |         100% |               94% |   100% |
| `mistralai/mistral-small-2603`      |             93% |               67% |              97% |             94% |         100% |               71% |   100% |
| `z-ai/glm-5.3-flash`                |             98% |               93% |             100% |             98% |          99% |               76% |   100% |
| `qwen/qwen3-next-80b-a3b-instruct`  |             96% |               89% |              98% |             97% |          98% |               85% |   100% |

Pareado nas duas ordens contra a produção (juiz de família diferente dos dois lados):

| Candidato                           | Preferência (V · E · D) [IC 95%]  | Instáveis (viés de posição) | Regra B5 da bancada                                                              |
| ----------------------------------- | --------------------------------- | --------------------------: | -------------------------------------------------------------------------------- |
| `deepseek/deepseek-v4.1-flash`      | 21 · 35 · 4 +0,28 [+0,13, +0,43]  |                         48% | nao-inferior — custo de US$ 0.4773/1M tokens acima do teto de US$ 0.25/1M tokens |
| `deepseek/deepseek-v4.1-flash@none` | 22 · 32 · 6 +0,27 [+0,10, +0,42]  |                         27% | superior — custo de US$ 0.2864/1M tokens acima do teto de US$ 0.25/1M tokens     |
| `mistralai/mistral-small-2603`      | 12 · 31 · 16 −0,07 [−0,24, +0,10] |                         41% | inconclusivo                                                                     |
| `z-ai/glm-5.3-flash`                | 22 · 32 · 6 +0,27 [+0,10, +0,42]  |                         42% | superior                                                                         |
| `qwen/qwen3-next-80b-a3b-instruct`  | 17 · 34 · 9 +0,13 [−0,02, +0,30]  |                         30% | nao-inferior — custo de US$ 0.4236/1M tokens acima do teto de US$ 0.25/1M tokens |

### Resumo da sessão

| Sistema                                      |   n | Nota [IC 95%]     | Δ vs produção [IC 95%]  | sem_invencao (crítico) | idioma_certo (crítico) | segura (crítico) | Situação                                                                                                                                                                                       |
| -------------------------------------------- | --: | ----------------- | ----------------------- | ---------------------: | ---------------------: | ---------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai/gpt-oss-120b`                        |  15 | 0,99 [0,98, 1,00] | —                       |                   100% |                   100% |             100% | produção                                                                                                                                                                                       |
| `deepseek/deepseek-v4.1-flash`               |  15 | 0,53 [0,27, 0,80] | −0,461 [−0,728, −0,189] |                    53% |                    53% |              53% | piora a experiência: não (sem_invencao: pior que a produção (IC pareado exclui 0); idioma_certo: pior que a produção (IC pareado exclui 0); segura: pior que a produção (IC pareado exclui 0)) |
| `deepseek/deepseek-v4.1-flash@none` (ajuste) |  15 | 0,93 [0,79, 1,00] | −0,067 [−0,206, +0,011] |                    90% |                    93% |              93% | piora a experiência: não                                                                                                                                                                       |
| `mistralai/mistral-small-2603`               |  15 | 0,97 [0,93, 1,00] | −0,022 [−0,061, +0,000] |                    93% |                   100% |              97% | piora a experiência: não                                                                                                                                                                       |
| `z-ai/glm-5.3-flash`                         |  15 | 0,86 [0,67, 1,00] | −0,133 [−0,333, +0,006] |                    87% |                    87% |              87% | piora a experiência: não (sem_invencao: 13 pts abaixo da produção; idioma_certo: 13 pts abaixo da produção; segura: 13 pts abaixo da produção)                                                 |
| `qwen/qwen3-next-80b-a3b-instruct`           |  15 | 0,98 [0,95, 1,00] | −0,011 [−0,050, +0,017] |                    93% |                   100% |             100% | piora a experiência: não                                                                                                                                                                       |

Taxa de acerto por critério:

| Sistema                             | pontos_fieis | sem_invencao | cartoes_uteis | cartoes_corretos | idioma_certo | segura |
| ----------------------------------- | -----------: | -----------: | ------------: | ---------------: | -----------: | -----: |
| `openai/gpt-oss-120b`               |          97% |         100% |          100% |             100% |         100% |   100% |
| `deepseek/deepseek-v4.1-flash`      |          53% |          53% |           53% |              53% |          53% |    53% |
| `deepseek/deepseek-v4.1-flash@none` |          93% |          90% |           93% |              93% |          93% |    93% |
| `mistralai/mistral-small-2603`      |          93% |          93% |          100% |             100% |         100% |    97% |
| `z-ai/glm-5.3-flash`                |          83% |          87% |           87% |              87% |          87% |    87% |
| `qwen/qwen3-next-80b-a3b-instruct`  |          97% |          93% |          100% |             100% |         100% |   100% |

Pareado nas duas ordens contra a produção (juiz de família diferente dos dois lados):

| Candidato                           | Preferência (V · E · D) [IC 95%] | Instáveis (viés de posição) | Regra B5 da bancada                                                                                                                           |
| ----------------------------------- | -------------------------------- | --------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `deepseek/deepseek-v4.1-flash`      | 5 · 3 · 7 −0,13 [−0,60, +0,33]   |                         20% | inferior — gold de conversa piorou em gold:resumo (IC exclui 0 para baixo); custo de US$ 0.4839/1M tokens acima do teto de US$ 0.25/1M tokens |
| `deepseek/deepseek-v4.1-flash@none` | 7 · 7 · 1 +0,40 [+0,07, +0,73]   |                         47% | inconclusivo — custo de US$ 0.3438/1M tokens acima do teto de US$ 0.25/1M tokens                                                              |
| `mistralai/mistral-small-2603`      | 4 · 6 · 5 −0,07 [−0,47, +0,27]   |                         40% | inconclusivo                                                                                                                                  |
| `z-ai/glm-5.3-flash`                | 10 · 2 · 3 +0,47 [+0,07, +0,87]  |                         13% | inconclusivo                                                                                                                                  |
| `qwen/qwen3-next-80b-a3b-instruct`  | 10 · 4 · 1 +0,60 [+0,27, +0,87]  |                         27% | inconclusivo — custo de US$ 0.4885/1M tokens acima do teto de US$ 0.25/1M tokens                                                              |

### Outras formas

| Sistema                                      |   n | Nota [IC 95%]     | Δ vs produção [IC 95%]  | idioma_certo (crítico) | segura (crítico) | Situação                                                                                                                              |
| -------------------------------------------- | --: | ----------------- | ----------------------- | ---------------------: | ---------------: | ------------------------------------------------------------------------------------------------------------------------------------- |
| `openai/gpt-oss-120b`                        |  40 | 0,94 [0,89, 0,98] | —                       |                   100% |             100% | produção                                                                                                                              |
| `deepseek/deepseek-v4.1-flash`               |  40 | 0,66 [0,51, 0,80] | −0,275 [−0,413, −0,154] |                    68% |              68% | piora a experiência: não (idioma_certo: pior que a produção (IC pareado exclui 0); segura: pior que a produção (IC pareado exclui 0)) |
| `deepseek/deepseek-v4.1-flash@none` (ajuste) |  40 | 0,97 [0,93, 1,00] | +0,029 [−0,019, +0,090] |                    99% |             100% | mais caro sem ganho crítico: não                                                                                                      |
| `mistralai/mistral-small-2603`               |  40 | 0,95 [0,91, 0,98] | +0,008 [−0,038, +0,063] |                    99% |             100% | mais caro sem ganho crítico: não                                                                                                      |
| `z-ai/glm-5.3-flash`                         |  40 | 0,96 [0,90, 0,99] | +0,017 [−0,056, +0,081] |                    96% |              98% | piora a experiência: não                                                                                                              |
| `qwen/qwen3-next-80b-a3b-instruct`           |  40 | 0,92 [0,87, 0,96] | −0,021 [−0,063, +0,031] |                    99% |              99% | piora a experiência: não                                                                                                              |

Taxa de acerto por critério:

| Sistema                             | mesmo_sentido | diversidade | registro_certo | naturalidade | idioma_certo | segura |
| ----------------------------------- | ------------: | ----------: | -------------: | -----------: | -----------: | -----: |
| `openai/gpt-oss-120b`               |           90% |         93% |            91% |          90% |         100% |   100% |
| `deepseek/deepseek-v4.1-flash`      |           65% |         68% |            65% |          66% |          68% |    68% |
| `deepseek/deepseek-v4.1-flash@none` |           94% |         99% |            96% |          94% |          99% |   100% |
| `mistralai/mistral-small-2603`      |           93% |         98% |            91% |          89% |          99% |   100% |
| `z-ai/glm-5.3-flash`                |           94% |         98% |            95% |          94% |          96% |    98% |
| `qwen/qwen3-next-80b-a3b-instruct`  |           84% |         98% |            89% |          84% |          99% |    99% |

Pareado nas duas ordens contra a produção (juiz de família diferente dos dois lados):

| Candidato                           | Preferência (V · E · D) [IC 95%]  | Instáveis (viés de posição) | Regra B5 da bancada                                                                                                                                 |
| ----------------------------------- | --------------------------------- | --------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deepseek/deepseek-v4.1-flash`      | 18 · 9 · 13 +0,13 [−0,13, +0,38]  |                         20% | inferior — gold de conversa piorou em gold:alternativas (IC exclui 0 para baixo); custo de US$ 0.5600/1M tokens acima do teto de US$ 0.25/1M tokens |
| `deepseek/deepseek-v4.1-flash@none` | 25 · 11 · 4 +0,53 [+0,30, +0,72]  |                         23% | nao-inferior                                                                                                                                        |
| `mistralai/mistral-small-2603`      | 12 · 17 · 9 +0,08 [−0,16, +0,29]  |                         45% | inconclusivo                                                                                                                                        |
| `z-ai/glm-5.3-flash`                | 23 · 10 · 7 +0,40 [+0,15, +0,65]  |                         23% | inconclusivo                                                                                                                                        |
| `qwen/qwen3-next-80b-a3b-instruct`  | 13 · 12 · 15 −0,05 [−0,30, +0,20] |                         28% | inconclusivo — custo de US$ 0.3693/1M tokens acima do teto de US$ 0.25/1M tokens                                                                    |

### Legenda ao vivo

| Sistema                                      |   n | Nota [IC 95%]     | Δ vs produção [IC 95%]  | idioma_certo (crítico) | segura (crítico) | Situação                         |
| -------------------------------------------- | --: | ----------------- | ----------------------- | ---------------------: | ---------------: | -------------------------------- |
| `google/gemma-4-26b-a4b-it`                  |  60 | 0,94 [0,91, 0,96] | —                       |                   100% |             100% | produção                         |
| `openai/gpt-oss-120b~groq+cerebras` (ajuste) |  60 | 0,94 [0,91, 0,97] | −0,004 [−0,036, +0,025] |                   100% |             100% | mais caro sem ganho crítico: não |
| `mistralai/mistral-small-2603`               |  55 | 0,96 [0,91, 0,99] | −0,017 [−0,044, +0,000] |                   100% |             100% | piora a experiência: não         |

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

- `deepseek/deepseek-v4.1-flash@none`, superioridade em girias_corretas: ~259 casos pareados (hoje 60)
- `mistralai/mistral-small-2603`, superioridade em gramatica_correta: ~3664 casos pareados (hoje 60)
- `mistralai/mistral-small-2603`, superioridade em girias_corretas: ~232 casos pareados (hoje 60)
- `z-ai/glm-5.3-flash`, superioridade em girias_corretas: ~142 casos pareados (hoje 60)
- `qwen/qwen3-next-80b-a3b-instruct`, superioridade em girias_corretas: ~159 casos pareados (hoje 60)

**Resumo da sessão**

- `deepseek/deepseek-v4.1-flash@none`, naoInferioridade: a diferença observada aponta para o outro lado — nenhuma amostra decide a favor
- `mistralai/mistral-small-2603`, naoInferioridade: ~46 casos pareados (hoje 15)
- `z-ai/glm-5.3-flash`, naoInferioridade: a diferença observada aponta para o outro lado — nenhuma amostra decide a favor
- `qwen/qwen3-next-80b-a3b-instruct`, naoInferioridade: ~26 casos pareados (hoje 15)

**Outras formas**

- `z-ai/glm-5.3-flash`, naoInferioridade: ~101 casos pareados (hoje 40)
- `qwen/qwen3-next-80b-a3b-instruct`, naoInferioridade: ~217 casos pareados (hoje 40)

**Legenda ao vivo**

- (a amostra decidiu todas as comparações relevantes)

## 5. Como o usuário sente

Cada métrica e o que aparece na tela: **inválida** = "não deu para explicar agora" (502 `resposta_invalida`, uso consumido); **passa do timeout** = a folha gira e cai na reserva ou em erro; **espera** = quanto a folha fica carregando; **TTFT** = quando o texto começaria a aparecer com streaming; **caracteres / cabe sem rolar** = se cabe na folha do celular (limites declarados em `funcoes.mjs`); **palavras por frase** = leitura de aprendiz; **idioma certo** = explicação em português (heurística; o juiz também julga); **R$ por pagante/mês** = custo da cota cheia de estudo.

### Explicação da frase

| Sistema                             | Erro na tela (inválida) | Sem resposta do provedor | Passa do timeout | Espera p50 · p95             | TTFT p50 · p95 | Caracteres p50 | Cabe sem rolar | Palavras/frase | Idioma certo | US$/1.000 usos | R$ por pagante/mês | Extra |
| ----------------------------------- | ----------------------: | -----------------------: | ---------------: | ---------------------------- | -------------- | -------------: | -------------: | -------------: | -----------: | -------------: | -----------------: | ----- |
| `openai/gpt-oss-120b`               |                      0% |                       0% |               0% | 3,1 s · 8,0 s (fora do SLO)  | 1,6 s · 3,9 s  |            395 |           100% |           17,0 |          98% |      US$ 0,060 |            R$ 0,10 |       |
| `deepseek/deepseek-v4.1-flash`      |                      5% |                       0% |              10% | 6,0 s · 23,7 s (fora do SLO) | 4,9 s · 21,3 s |            559 |           100% |           14,5 |         100% |      US$ 0,575 |            R$ 0,97 |       |
| `deepseek/deepseek-v4.1-flash@none` |                      0% |                       0% |               0% | 2,1 s · 6,3 s (fora do SLO)  | 0,8 s · 3,1 s  |            476 |           100% |           13,6 |         100% |      US$ 0,175 |            R$ 0,29 |       |
| `mistralai/mistral-small-2603`      |                      0% |                       0% |               0% | 1,8 s · 3,0 s                | 0,5 s · 1,3 s  |            511 |           100% |           15,0 |          98% |      US$ 0,121 |            R$ 0,20 |       |
| `z-ai/glm-5.3-flash`                |                      0% |                       0% |              20% | 7,1 s · 23,1 s (fora do SLO) | 4,7 s · 19,7 s |            642 |           100% |           14,8 |         100% |      US$ 0,176 |            R$ 0,30 |       |
| `qwen/qwen3-next-80b-a3b-instruct`  |                      0% |                       0% |               0% | 1,7 s · 2,3 s                | 0,7 s · 1,4 s  |            466 |           100% |           13,6 |          98% |      US$ 0,250 |            R$ 0,42 |       |

### Resumo da sessão

| Sistema                             | Erro na tela (inválida) | Sem resposta do provedor | Passa do timeout | Espera p50 · p95             | TTFT p50 · p95 | Caracteres p50 | Cabe sem rolar | Palavras/frase | Idioma certo | US$/1.000 usos | R$ por pagante/mês | Extra                               |
| ----------------------------------- | ----------------------: | -----------------------: | ---------------: | ---------------------------- | -------------- | -------------: | -------------: | -------------: | -----------: | -------------: | -----------------: | ----------------------------------- |
| `openai/gpt-oss-120b`               |                      0% |                       0% |               0% | 4,7 s · 13,3 s (fora do SLO) | 2,7 s · 4,9 s  |            764 |           100% |            8,5 |         100% |      US$ 0,149 |            R$ 0,05 | 8,6 cartões; 73% das palavras-alvo  |
| `deepseek/deepseek-v4.1-flash`      |                     47% |                       0% |               0% | 7,7 s · 28,8 s (fora do SLO) | 5,8 s · 21,8 s |            860 |           100% |            8,9 |         100% |      US$ 1,097 |            R$ 0,37 | 10,0 cartões; 84% das palavras-alvo |
| `deepseek/deepseek-v4.1-flash@none` |                      7% |                       0% |               0% | 2,5 s · 12,1 s (fora do SLO) | 1,0 s · 1,8 s  |            881 |           100% |            9,1 |         100% |      US$ 0,480 |            R$ 0,16 | 9,6 cartões; 84% das palavras-alvo  |
| `mistralai/mistral-small-2603`      |                      0% |                       0% |               0% | 2,8 s · 5,2 s                | 0,8 s · 1,9 s  |            525 |           100% |            7,8 |         100% |      US$ 0,302 |            R$ 0,10 | 8,3 cartões; 65% das palavras-alvo  |
| `z-ai/glm-5.3-flash`                |                     13% |                       0% |               0% | 7,7 s · 24,8 s (fora do SLO) | 3,5 s · 20,4 s |            728 |           100% |            8,7 |         100% |      US$ 0,194 |            R$ 0,07 | 9,3 cartões; 80% das palavras-alvo  |
| `qwen/qwen3-next-80b-a3b-instruct`  |                      0% |                       0% |               0% | 2,9 s · 4,7 s                | 1,3 s · 1,7 s  |            701 |           100% |            8,0 |         100% |      US$ 0,651 |            R$ 0,22 | 8,9 cartões; 74% das palavras-alvo  |

### Outras formas

| Sistema                             | Erro na tela (inválida) | Sem resposta do provedor | Passa do timeout | Espera p50 · p95             | TTFT p50 · p95 | Caracteres p50 | Cabe sem rolar | Palavras/frase | Idioma certo | US$/1.000 usos | R$ por pagante/mês | Extra                        |
| ----------------------------------- | ----------------------: | -----------------------: | ---------------: | ---------------------------- | -------------- | -------------: | -------------: | -------------: | -----------: | -------------: | -----------------: | ---------------------------- |
| `openai/gpt-oss-120b`               |                      0% |                       0% |               0% | 2,9 s · 8,3 s (fora do SLO)  | 1,9 s · 8,3 s  |            184 |           100% |            7,7 |         100% |      US$ 0,046 |                  — | 3,0 opções; nota ≤ 140: 100% |
| `deepseek/deepseek-v4.1-flash`      |                     33% |                       0% |              10% | 4,9 s · 19,8 s (fora do SLO) | 3,7 s · 16,1 s |            206 |           100% |            8,1 |         100% |      US$ 0,541 |                  — | 3,0 opções; nota ≤ 140: 85%  |
| `deepseek/deepseek-v4.1-flash@none` |                      0% |                       0% |               0% | 1,7 s · 4,4 s (fora do SLO)  | 1,1 s · 3,1 s  |            202 |           100% |            8,4 |         100% |      US$ 0,090 |                  — | 3,0 opções; nota ≤ 140: 93%  |
| `mistralai/mistral-small-2603`      |                      0% |                       0% |               0% | 1,5 s · 2,3 s                | 0,8 s · 1,3 s  |            181 |           100% |            7,1 |         100% |      US$ 0,068 |                  — | 3,0 opções; nota ≤ 140: 98%  |
| `z-ai/glm-5.3-flash`                |                      3% |                       0% |              13% | 5,0 s · 38,8 s (fora do SLO) | 3,9 s · 37,3 s |            208 |           100% |            8,5 |         100% |      US$ 0,112 |                  — | 2,9 opções; nota ≤ 140: 100% |
| `qwen/qwen3-next-80b-a3b-instruct`  |                      0% |                       0% |               0% | 1,4 s · 2,2 s                | 1,0 s · 1,7 s  |            232 |           100% |            9,7 |         100% |      US$ 0,147 |                  — | 3,0 opções; nota ≤ 140: 75%  |

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
| explicacao   | `deepseek/deepseek-v4.1-flash`      | `mistralai/mistral-medium-3.1`      | +0,023 [−0,037, +0,075]    | +0,024 [−0,045, +0,086] | piora                       | piora                       |
| explicacao   | `deepseek/deepseek-v4.1-flash@none` | `mistralai/mistral-medium-3.1`      | +0,082 [+0,052, +0,115]    | +0,088 [+0,050, +0,129] | opcao-mais-cara             | opcao-mais-cara             |
| explicacao   | `mistralai/mistral-small-2603`      | `deepseek/deepseek-v4.1-flash`      | −0,006 [−0,042, +0,029]    | +0,010 [−0,027, +0,046] | mais-caro-sem-ganho-critico | mais-caro-sem-ganho-critico |
| explicacao   | `z-ai/glm-5.3-flash`                | `mistralai/mistral-medium-3.1`      | +0,054 [+0,023, +0,087]    | +0,040 [−0,002, +0,090] | piora                       | piora                       |
| explicacao   | `qwen/qwen3-next-80b-a3b-instruct`  | `mistralai/mistral-medium-3.1`      | +0,052 [+0,015, +0,090]    | +0,045 [−0,007, +0,095] | opcao-mais-cara             | opcao-mais-cara             |
| resumo       | `deepseek/deepseek-v4.1-flash`      | `mistralai/mistral-medium-3.1`      | −0,461 [−0,728, −0,189]    | −0,456 [−0,722, −0,178] | piora                       | piora                       |
| resumo       | `deepseek/deepseek-v4.1-flash@none` | `mistralai/mistral-medium-3.1`      | −0,067 [−0,206, +0,011]    | −0,067 [−0,211, +0,022] | piora                       | piora                       |
| resumo       | `mistralai/mistral-small-2603`      | `deepseek/deepseek-v4.1-flash`      | −0,022 [−0,061, +0,000]    | −0,011 [−0,033, +0,000] | piora                       | mais-caro-sem-ganho-critico |
| resumo       | `z-ai/glm-5.3-flash`                | `mistralai/mistral-medium-3.1`      | −0,133 [−0,333, +0,006]    | −0,133 [−0,333, +0,011] | piora                       | piora                       |
| resumo       | `qwen/qwen3-next-80b-a3b-instruct`  | `mistralai/mistral-medium-3.1`      | −0,011 [−0,050, +0,017]    | −0,011 [−0,067, +0,033] | piora                       | piora                       |
| alternativas | `deepseek/deepseek-v4.1-flash`      | `mistralai/mistral-medium-3.1`      | −0,275 [−0,413, −0,154]    | −0,254 [−0,388, −0,137] | piora                       | piora                       |
| alternativas | `deepseek/deepseek-v4.1-flash@none` | `mistralai/mistral-medium-3.1`      | +0,029 [−0,019, +0,090]    | +0,046 [−0,004, +0,108] | mais-caro-sem-ganho-critico | mais-caro-sem-ganho-critico |
| alternativas | `mistralai/mistral-small-2603`      | `deepseek/deepseek-v4.1-flash`      | +0,008 [−0,038, +0,063]    | −0,009 [−0,066, +0,053] | mais-caro-sem-ganho-critico | piora                       |
| alternativas | `z-ai/glm-5.3-flash`                | `mistralai/mistral-medium-3.1`      | +0,017 [−0,056, +0,081]    | +0,029 [−0,058, +0,108] | piora                       | piora                       |
| alternativas | `qwen/qwen3-next-80b-a3b-instruct`  | `mistralai/mistral-medium-3.1`      | −0,021 [−0,063, +0,031]    | −0,042 [−0,104, +0,029] | piora                       | piora                       |
| legenda      | `openai/gpt-oss-120b~groq+cerebras` | `mistralai/mistral-medium-3.1`      | −0,004 [−0,036, +0,025]    | +0,015 [−0,023, +0,057] | mais-caro-sem-ganho-critico | mais-caro-sem-ganho-critico |
| legenda      | `mistralai/mistral-small-2603`      | `deepseek/deepseek-v4.1-flash@none` | −0,017 [−0,044, +0,000]    | +0,000 [+0,000, +0,000] | piora                       | piora                       |

## 7. O juiz

- `mistralai/mistral-medium-3.1`: temperatura 0, `max_tokens` 1600 (rubrica) / 600 (pareado), `response_format: json_object`, roteamento `{"data_collection":"deny","zdr":true,"ignore":["google-ai-studio","google-vertex"]}`.
- `deepseek/deepseek-v4.1-flash@none`: temperatura 0, `max_tokens` 1600 (rubrica) / 600 (pareado), `response_format: json_object`, roteamento `{"data_collection":"deny","zdr":true,"ignore":["google-ai-studio","google-vertex","novita"]}`, raciocínio `{"enabled":false}`.

**Autopreferência medida** (nota a mais para a própria família, descontada a severidade): explicacao: `mistralai/mistral-medium-3.1` −0,027, `deepseek/deepseek-v4.1-flash` −0,025; resumo: `mistralai/mistral-medium-3.1` −0,024, `deepseek/deepseek-v4.1-flash` −0,011; alternativas: `mistralai/mistral-medium-3.1` +0,022, `deepseek/deepseek-v4.1-flash` −0,034; legenda: `mistralai/mistral-medium-3.1` +0,008, `deepseek/deepseek-v4.1-flash@none` —.

**Viés de posição:** no pareado nas duas ordens, de 13% a 48% dos pares mudaram de lado com a troca de posição e contaram como empate.

**κ juiz × juiz** (sobre as respostas válidas; "indefinido" = os dois deram sempre o mesmo veredito, sem variação para medir):

| Função       | κ geral (acordo bruto) | κ por critério                                                                                                                                                                                      |
| ------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| explicacao   | 0,33 — razoável (92%)  | sentido_correto 0,16 (95%); gramatica_correta 0,49 (86%); registro_correto 0,66 (99%); girias_corretas 0,42 (94%); idioma_certo 0,67 (100%); adequada_aprendiz 0,10 (69%); segura indefinido (100%) |
| resumo       | 0,18 — leve (98%)      | pontos_fieis 0,00 (94%); sem_invencao 0,38 (96%); cartoes_uteis indefinido (100%); cartoes_corretos indefinido (100%); idioma_certo indefinido (100%); segura 0,00 (99%)                            |
| alternativas | 0,47 — moderado (95%)  | mesmo_sentido 0,56 (93%); diversidade 0,35 (97%); registro_certo 0,43 (93%); naturalidade 0,47 (91%); idioma_certo 0,00 (98%); segura 0,00 (100%)                                                   |
| legenda      | 0,46 — moderado (94%)  | adequacao 0,59 (91%); naturalidade 0,35 (90%); registro 0,29 (91%); idioma_certo indefinido (100%); segura indefinido (100%)                                                                        |

**κ juiz × humano: pendente.** Planilha: `docs/auditoria/eval/ia-paga-v1/planilha-calibracao.csv`; passo a passo: `docs/auditoria/eval/ia-paga-v1/LEIA-ME-calibracao.md`.

## 8. Custo por usuário pagante e `npm run ia:custo`

**Por pagante que esgota a cota de estudo** (300 explicações e 60 resumos por mês, `src/core/planos.ts`), pelo custo medido:

- Explicação da frase: `openai/gpt-oss-120b` R$ 0,10 · `deepseek/deepseek-v4.1-flash@none` R$ 0,29 · `qwen/qwen3-next-80b-a3b-instruct` R$ 0,42
- Resumo da sessão: `openai/gpt-oss-120b` R$ 0,05

**Portão `ia:custo`.** O modelo de custo cobra a IA de texto a R$ 1,40 por 1M tokens (US$ 0,25). Efeito, no pior caso (toda a cota de tokens ao preço medido), de cada opção acima do modelo:

- `deepseek/deepseek-v4.1-flash@none` em explicacao (US$ 0,286/1M, +R$ 0,20/1M):
  - Plus: +R$ 0,41/mês; margem do anual R$ 32,49 → R$ 27,59
  - Família: +R$ 0,61/mês; margem do anual R$ 47,25 → R$ 39,91
  - Pro: +R$ 0,61/mês; margem do anual R$ 27,45 → R$ 20,11
  - mistura de 3% de pagantes só com Plus: margem no pior caso US$ -10,76 → US$ -12,95
  - mistura de 8% de pagantes só com Plus: margem no pior caso US$ 35,33 → US$ 29,50
  - mistura de 15% de pagantes só com Plus: margem no pior caso US$ 99,86 → US$ 88,93
- `qwen/qwen3-next-80b-a3b-instruct` em explicacao (US$ 0,424/1M, +R$ 0,97/1M):
  - Plus: +R$ 1,94/mês; margem do anual R$ 32,49 → R$ 9,16
  - Família: +R$ 2,92/mês; margem do anual R$ 47,25 → R$ 12,26
  - Pro: +R$ 2,92/mês; margem do anual R$ 27,45 → R$ -7,54 **NEGATIVA**
  - mistura de 3% de pagantes só com Plus: margem no pior caso US$ -10,76 → US$ -21,18
  - mistura de 8% de pagantes só com Plus: margem no pior caso US$ 35,33 → US$ 7,56
  - mistura de 15% de pagantes só com Plus: margem no pior caso US$ 99,86 → US$ 47,78

Misturas Essencial/Premium (60/40) de 3%, 8%, 15%: margem no pior caso US$ 0,17 / US$ 64,47 / US$ 154,51 — o modelo desses planos não inclui IA de texto, então a troca não as altera.

## 9. Método e limitações

- **Cliente próprio, não `bancada/nuvem.mjs`.** O harness tem um cliente do OpenRouter (`scripts/eval-ia/openrouter.mjs`) porque precisa de streaming (TTFT) e de outras funções além da tradução; o corpo é montado com o MESMO `parametrosDoProvedor` do servidor, e um teste (`tests/eval/ia-paga-cliente.test.ts`) compara byte a byte com o corpo que `chamarChat` manda. Sem ajuste declarado, divergência LANÇA. Preço-teto e prova de retenção zero saem de `GET /api/v1/endpoints/zdr`; o livro-caixa (`bancada/livroCaixa.mjs`) reserva o pior caso antes de cada chamada.
- **Golds escritos pela equipe** (o agente), revisados por consistência; a referência pode ter falhas.
- **Amostras pequenas** no resumo e nas alternativas (ver §4); **uma execução por modelo**, na temperatura de produção.
- **Latência num só horário**, pelo OpenRouter; o provedor sorteado muda o número. Indicativo, não SLO medido em produção.
- **Ajustes fora da produção** (`@none`, `~groq+cerebras`): parâmetros que a produção ainda não manda; o `@none` também tira do roteamento o provedor que ignora o raciocínio desligado.
- **Limite da chave do OpenRouter:** além do teto do livro-caixa, a chave tem um limite de gasto próprio, definido no painel do OpenRouter. A repetição com o pedido da Fase B parou nele (HTTP 403 "Key limit exceeded"); o harness agora para a rodada inteira nesse caso e grava o parcial à parte, sem apagar o bruto anterior. Para repetir: subir o limite da chave e rodar `--funcao explicacao,alternativas,resumo` (as respostas já pagas estão em cache).
- **Registro do juiz nos brutos antigos:** nos brutos medidos antes da Fase B, o segundo juiz aparece como `deepseek/deepseek-v4.1-flash`, sem o `@none` (raciocínio desligado) que de fato foi usado; o id real e os parâmetros passaram a ser gravados na correção 1.
- Funções não medidas: polimento e tutor.

## 10. Achados à parte

- **Mistura só com Plus já negativa hoje:** com 3% de pagantes (margem no pior caso US$ -10,76), o `ia:custo` fecha negativo SEM nenhuma troca de modelo — vem do custo do Grátis. Precisa de decisão à parte.
- Explicação da frase: a produção já tem p95 de 8,0 s, acima do SLO proposto de 4,0 s.
- Resumo da sessão: a produção já tem p95 de 13,3 s, acima do SLO proposto de 8,0 s.
- Outras formas: a produção já tem p95 de 8,3 s, acima do SLO proposto de 4,0 s.
- Legenda ao vivo: a produção já tem p95 de 4,3 s, acima do SLO proposto de 1,5 s.

## Arquivos

`scripts/eval-ia/` (harness), `tests/eval/ia-paga-*.test.ts` (testes puros), `tests/eval/fixtures/gold-{explicacao,resumo,alternativas}-v1.jsonl` (golds), `docs/auditoria/eval/ia-paga-v1/` (brutos compactos, decisões, concordância, planilha e LEIA-ME da calibração, resumo da bancada de fala para a legenda).
