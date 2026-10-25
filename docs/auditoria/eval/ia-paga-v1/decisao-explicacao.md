## explicacao

Melhor nota: `deepseek/deepseek-v4.1-flash@none` · **recomendado: `deepseek/deepseek-v4.1-flash@none`** — o mais barato entre 1 sistema(s) não-inferior(es) ao melhor (margem −0.05) e sem falha crítica — relaxados o SLO e o custo.

Autopreferência medida (nota a mais para a própria família, descontada a severidade): `mistralai/mistral-medium-3.1` -0.027 · `deepseek/deepseek-v4.1-flash` -0.025.

### Qualidade, custo e latência

| Sistema                                        |   n | Nota [IC 95%]     | Inválidas | Sem resposta | Total p50 · p95 | TTFT p50 · p95 | US$/1.000 usos | US$/1M tok | Não-inf. | No tempo | Falha crítica                                              | Custo cabe |
| ---------------------------------------------- | --: | ----------------- | --------: | -----------: | --------------- | -------------- | -------------: | ---------: | :------: | :------: | ---------------------------------------------------------- | :--------: |
| `openai/gpt-oss-120b`                          |  60 | 0.89 [0.86, 0.93] |        0% |           0% | 3.1 s · 8.0 s   | 1.6 s · 3.9 s  |          0.060 |      0.094 |   não    |   sim    | gramatica_correta: pior que o melhor (IC pareado exclui 0) |    sim     |
| `deepseek/deepseek-v4.1-flash`                 |  60 | 0.92 [0.85, 0.97] |        5% |           0% | 6.0 s · 23.7 s  | 4.9 s · 21.3 s |          0.575 |      0.477 |   não    |   não    | —                                                          |    não     |
| `deepseek/deepseek-v4.1-flash@none` ★ (ajuste) |  60 | 0.98 [0.96, 0.99] |        0% |           0% | 2.1 s · 6.3 s   | 0.8 s · 3.1 s  |          0.175 |      0.286 |   sim    |   sim    | —                                                          |    não     |
| `mistralai/mistral-small-2603`                 |  60 | 0.89 [0.86, 0.91] |        0% |           0% | 1.8 s · 3.0 s   | 0.5 s · 1.3 s  |          0.121 |      0.207 |   não    |   sim    | gramatica_correta: pior que o melhor (IC pareado exclui 0) |    sim     |
| `z-ai/glm-5.3-flash`                           |  60 | 0.95 [0.93, 0.96] |        0% |           0% | 7.1 s · 23.1 s  | 4.7 s · 19.7 s |          0.176 |      0.177 |   sim    |   não    | —                                                          |    sim     |
| `qwen/qwen3-next-80b-a3b-instruct`             |  60 | 0.95 [0.92, 0.97] |        0% |           0% | 1.7 s · 2.3 s   | 0.7 s · 1.4 s  |          0.250 |      0.424 |   não    |   sim    | gramatica_correta: pior que o melhor (IC pareado exclui 0) |    não     |

### Taxa de acerto por critério

| Sistema                             | sentido_correto | gramatica_correta (crítico) | registro_correto | girias_corretas (crítico) | idioma_certo (crítico) | adequada_aprendiz | segura (crítico) |
| ----------------------------------- | --------------: | --------------------------: | ---------------: | ------------------------: | ---------------------: | ----------------: | ---------------: |
| `openai/gpt-oss-120b`               |             96% |                         64% |             100% |                       91% |                   100% |               75% |             100% |
| `deepseek/deepseek-v4.1-flash`      |             94% |                         90% |              93% |                       90% |                    95% |               84% |              95% |
| `deepseek/deepseek-v4.1-flash@none` |             99% |                         97% |              98% |                       96% |                   100% |               94% |             100% |
| `mistralai/mistral-small-2603`      |             93% |                         67% |              97% |                       94% |                   100% |               71% |             100% |
| `z-ai/glm-5.3-flash`                |             98% |                         93% |             100% |                       98% |                    99% |               76% |             100% |
| `qwen/qwen3-next-80b-a3b-instruct`  |             96% |                         89% |              98% |                       97% |                    98% |               85% |             100% |

### Como o usuário sente

| Sistema                             | Erro na tela (502) | Passa do timeout |           Espera p95 | Caracteres p50 | Cabe sem rolar | Palavras/frase | Idioma certo | R$ por pagante/mês (cota cheia) | Extra |
| ----------------------------------- | -----------------: | ---------------: | -------------------: | -------------: | -------------: | -------------: | -----------: | ------------------------------: | ----- |
| `openai/gpt-oss-120b`               |                 0% |               0% |  8.0 s (fora do SLO) |            395 |           100% |          17.04 |          98% |                         R$ 0.10 |       |
| `deepseek/deepseek-v4.1-flash`      |                 5% |              10% | 23.7 s (fora do SLO) |            559 |           100% |          14.47 |         100% |                         R$ 0.97 |       |
| `deepseek/deepseek-v4.1-flash@none` |                 0% |               0% |  6.3 s (fora do SLO) |            476 |           100% |          13.65 |         100% |                         R$ 0.29 |       |
| `mistralai/mistral-small-2603`      |                 0% |               0% |                3.0 s |            511 |           100% |          15.04 |          98% |                         R$ 0.20 |       |
| `z-ai/glm-5.3-flash`                |                 0% |              20% | 23.1 s (fora do SLO) |            642 |           100% |          14.82 |         100% |                         R$ 0.30 |       |
| `qwen/qwen3-next-80b-a3b-instruct`  |                 0% |               0% |                2.3 s |            466 |           100% |          13.61 |          98% |                         R$ 0.42 |       |

### Contra a produção (`openai/gpt-oss-120b`) — regra B5

| Candidato                           | Δ nota [IC 95%]        | Preferência pareada (duas ordens) | Instáveis | Veredito B5                                                                      |
| ----------------------------------- | ---------------------- | --------------------------------- | --------: | -------------------------------------------------------------------------------- |
| `deepseek/deepseek-v4.1-flash`      | +0.023 [-0.037, 0.075] | 21V 35E 4D · 0.28 [0.13, 0.43]    |       48% | nao-inferior — custo de US$ 0.4773/1M tokens acima do teto de US$ 0.25/1M tokens |
| `deepseek/deepseek-v4.1-flash@none` | +0.082 [0.052, 0.115]  | 22V 32E 6D · 0.27 [0.10, 0.42]    |       27% | superior — custo de US$ 0.2864/1M tokens acima do teto de US$ 0.25/1M tokens     |
| `mistralai/mistral-small-2603`      | -0.006 [-0.042, 0.029] | 12V 31E 16D · -0.07 [-0.24, 0.10] |       41% | inconclusivo                                                                     |
| `z-ai/glm-5.3-flash`                | +0.054 [0.023, 0.087]  | 22V 32E 6D · 0.27 [0.10, 0.42]    |       42% | superior (aprovado)                                                              |
| `qwen/qwen3-next-80b-a3b-instruct`  | +0.052 [0.015, 0.090]  | 17V 34E 9D · 0.13 [-0.02, 0.30]   |       30% | nao-inferior — custo de US$ 0.4236/1M tokens acima do teto de US$ 0.25/1M tokens |
