## alternativas

Melhor nota: `deepseek/deepseek-v4.1-flash@none` · **recomendado: `deepseek/deepseek-v4.1-flash@none`** — o mais barato entre 1 sistema(s) não-inferior(es) ao melhor (margem −0.05) e sem falha crítica — relaxado o SLO de latência.

Autopreferência medida (nota a mais para a própria família, descontada a severidade): `mistralai/mistral-medium-3.1` +0.022 · `deepseek/deepseek-v4.1-flash` -0.034.

### Qualidade, custo e latência

| Sistema                                        |   n | Nota [IC 95%]     | Inválidas | Sem resposta | Total p50 · p95 | TTFT p50 · p95 | US$/1.000 usos | US$/1M tok | Não-inf. | No tempo | Falha crítica                                                                                          | Custo cabe |
| ---------------------------------------------- | --: | ----------------- | --------: | -----------: | --------------- | -------------- | -------------: | ---------: | :------: | :------: | ------------------------------------------------------------------------------------------------------ | :--------: |
| `openai/gpt-oss-120b`                          |  40 | 0.94 [0.89, 0.98] |        0% |           0% | 2.9 s · 8.3 s   | 1.9 s · 8.3 s  |          0.046 |      0.099 |   não    |   sim    | —                                                                                                      |    sim     |
| `deepseek/deepseek-v4.1-flash`                 |  40 | 0.66 [0.51, 0.80] |       33% |           0% | 4.9 s · 19.8 s  | 3.7 s · 16.1 s |          0.541 |      0.560 |   não    |   não    | idioma_certo: pior que o melhor (IC pareado exclui 0); segura: pior que o melhor (IC pareado exclui 0) |    não     |
| `deepseek/deepseek-v4.1-flash@none` ★ (ajuste) |  40 | 0.97 [0.93, 1.00] |        0% |           0% | 1.7 s · 4.4 s   | 1.1 s · 3.1 s  |          0.090 |      0.233 |   sim    |   sim    | —                                                                                                      |    sim     |
| `mistralai/mistral-small-2603`                 |  40 | 0.95 [0.91, 0.98] |        0% |           0% | 1.5 s · 2.3 s   | 0.8 s · 1.3 s  |          0.068 |      0.175 |   não    |   sim    | —                                                                                                      |    sim     |
| `z-ai/glm-5.3-flash`                           |  40 | 0.96 [0.90, 0.99] |        3% |           0% | 5.0 s · 38.8 s  | 3.9 s · 37.3 s |          0.112 |      0.146 |   não    |   não    | —                                                                                                      |    sim     |
| `qwen/qwen3-next-80b-a3b-instruct`             |  40 | 0.92 [0.87, 0.96] |        0% |           0% | 1.4 s · 2.2 s   | 1.0 s · 1.7 s  |          0.147 |      0.369 |   não    |   sim    | —                                                                                                      |    não     |

### Taxa de acerto por critério

| Sistema                             | mesmo_sentido | diversidade | registro_certo | naturalidade | idioma_certo (crítico) | segura (crítico) |
| ----------------------------------- | ------------: | ----------: | -------------: | -----------: | ---------------------: | ---------------: |
| `openai/gpt-oss-120b`               |           90% |         93% |            91% |          90% |                   100% |             100% |
| `deepseek/deepseek-v4.1-flash`      |           65% |         68% |            65% |          66% |                    68% |              68% |
| `deepseek/deepseek-v4.1-flash@none` |           94% |         99% |            96% |          94% |                    99% |             100% |
| `mistralai/mistral-small-2603`      |           93% |         98% |            91% |          89% |                    99% |             100% |
| `z-ai/glm-5.3-flash`                |           94% |         98% |            95% |          94% |                    96% |              98% |
| `qwen/qwen3-next-80b-a3b-instruct`  |           84% |         98% |            89% |          84% |                    99% |              99% |

### Como o usuário sente

| Sistema                             | Erro na tela (502) | Passa do timeout |           Espera p95 | Caracteres p50 | Cabe sem rolar | Palavras/frase | Idioma certo | R$ por pagante/mês (cota cheia) | Extra                         |
| ----------------------------------- | -----------------: | ---------------: | -------------------: | -------------: | -------------: | -------------: | -----------: | ------------------------------: | ----------------------------- |
| `openai/gpt-oss-120b`               |                 0% |               0% |  8.3 s (fora do SLO) |            184 |           100% |           7.67 |         100% |                               — | 2.95 opções; nota ≤ 140: 100% |
| `deepseek/deepseek-v4.1-flash`      |                33% |              10% | 19.8 s (fora do SLO) |            206 |           100% |           8.09 |         100% |                               — | 3.00 opções; nota ≤ 140: 85%  |
| `deepseek/deepseek-v4.1-flash@none` |                 0% |               0% |  4.4 s (fora do SLO) |            202 |           100% |           8.36 |         100% |                               — | 2.95 opções; nota ≤ 140: 93%  |
| `mistralai/mistral-small-2603`      |                 0% |               0% |                2.3 s |            181 |           100% |           7.11 |         100% |                               — | 3.00 opções; nota ≤ 140: 98%  |
| `z-ai/glm-5.3-flash`                |                 3% |              13% | 38.8 s (fora do SLO) |            208 |           100% |           8.50 |         100% |                               — | 2.95 opções; nota ≤ 140: 100% |
| `qwen/qwen3-next-80b-a3b-instruct`  |                 0% |               0% |                2.2 s |            232 |           100% |           9.67 |         100% |                               — | 2.98 opções; nota ≤ 140: 75%  |

### Contra a produção (`openai/gpt-oss-120b`) — regra B5

| Candidato                           | Δ nota [IC 95%]         | Preferência pareada (duas ordens) | Instáveis | Veredito B5                                                                                                                                         |
| ----------------------------------- | ----------------------- | --------------------------------- | --------: | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deepseek/deepseek-v4.1-flash`      | -0.275 [-0.413, -0.154] | 18V 9E 13D · 0.13 [-0.13, 0.38]   |       20% | inferior — gold de conversa piorou em gold:alternativas (IC exclui 0 para baixo); custo de US$ 0.5600/1M tokens acima do teto de US$ 0.25/1M tokens |
| `deepseek/deepseek-v4.1-flash@none` | +0.029 [-0.019, 0.090]  | 25V 11E 4D · 0.53 [0.30, 0.72]    |       23% | nao-inferior (aprovado)                                                                                                                             |
| `mistralai/mistral-small-2603`      | +0.008 [-0.038, 0.063]  | 12V 17E 9D · 0.08 [-0.16, 0.29]   |       45% | inconclusivo                                                                                                                                        |
| `z-ai/glm-5.3-flash`                | +0.017 [-0.056, 0.081]  | 23V 10E 7D · 0.40 [0.15, 0.65]    |       23% | inconclusivo                                                                                                                                        |
| `qwen/qwen3-next-80b-a3b-instruct`  | -0.021 [-0.063, 0.031]  | 13V 12E 15D · -0.05 [-0.30, 0.20] |       28% | inconclusivo — custo de US$ 0.3693/1M tokens acima do teto de US$ 0.25/1M tokens                                                                    |
