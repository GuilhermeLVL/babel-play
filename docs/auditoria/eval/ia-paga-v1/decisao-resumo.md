## resumo

Melhor nota: `openai/gpt-oss-120b` · **recomendado: `openai/gpt-oss-120b`** — o mais barato entre 1 sistema(s) não-inferior(es) ao melhor (margem −0.05) e sem falha crítica — relaxado o SLO de latência.

Autopreferência medida (nota a mais para a própria família, descontada a severidade): `mistralai/mistral-medium-3.1` -0.024 · `deepseek/deepseek-v4.1-flash` -0.011.

### Qualidade, custo e latência

| Sistema                                      |   n | Nota [IC 95%]     | Inválidas | Sem resposta | Total p50 · p95 | TTFT p50 · p95 | US$/1.000 usos | US$/1M tok | Não-inf. | No tempo | Falha crítica                                                                                                                                                       | Custo cabe |
| -------------------------------------------- | --: | ----------------- | --------: | -----------: | --------------- | -------------- | -------------: | ---------: | :------: | :------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------: |
| `openai/gpt-oss-120b` ★                      |  15 | 0.99 [0.98, 1.00] |        0% |           0% | 4.7 s · 13.3 s  | 2.7 s · 4.9 s  |          0.149 |      0.104 |   sim    |   sim    | —                                                                                                                                                                   |    sim     |
| `deepseek/deepseek-v4.1-flash`               |  15 | 0.53 [0.27, 0.80] |       47% |           0% | 7.7 s · 28.8 s  | 5.8 s · 21.8 s |          1.097 |      0.484 |   não    |   sim    | sem_invencao: pior que o melhor (IC pareado exclui 0); idioma_certo: pior que o melhor (IC pareado exclui 0); segura: pior que o melhor (IC pareado exclui 0)       |    não     |
| `deepseek/deepseek-v4.1-flash@none` (ajuste) |  15 | 0.93 [0.79, 1.00] |        7% |           0% | 2.5 s · 12.1 s  | 1.0 s · 1.8 s  |          0.480 |      0.344 |   não    |   sim    | —                                                                                                                                                                   |    não     |
| `mistralai/mistral-small-2603`               |  15 | 0.97 [0.93, 1.00] |        0% |           0% | 2.8 s · 5.2 s   | 0.8 s · 1.9 s  |          0.302 |      0.250 |   não    |   sim    | —                                                                                                                                                                   |    sim     |
| `z-ai/glm-5.3-flash`                         |  15 | 0.86 [0.67, 1.00] |       13% |           0% | 7.7 s · 24.8 s  | 3.5 s · 20.4 s |          0.194 |      0.111 |   não    |   sim    | sem_invencao: 13 pts abaixo do melhor na taxa de acerto; idioma_certo: 13 pts abaixo do melhor na taxa de acerto; segura: 13 pts abaixo do melhor na taxa de acerto |    sim     |
| `qwen/qwen3-next-80b-a3b-instruct`           |  15 | 0.98 [0.95, 1.00] |        0% |           0% | 2.9 s · 4.7 s   | 1.3 s · 1.7 s  |          0.651 |      0.488 |   não    |   sim    | —                                                                                                                                                                   |    não     |

### Taxa de acerto por critério

| Sistema                             | pontos_fieis | sem_invencao (crítico) | cartoes_uteis | cartoes_corretos | idioma_certo (crítico) | segura (crítico) |
| ----------------------------------- | -----------: | ---------------------: | ------------: | ---------------: | ---------------------: | ---------------: |
| `openai/gpt-oss-120b`               |          97% |                   100% |          100% |             100% |                   100% |             100% |
| `deepseek/deepseek-v4.1-flash`      |          53% |                    53% |           53% |              53% |                    53% |              53% |
| `deepseek/deepseek-v4.1-flash@none` |          93% |                    90% |           93% |              93% |                    93% |              93% |
| `mistralai/mistral-small-2603`      |          93% |                    93% |          100% |             100% |                   100% |              97% |
| `z-ai/glm-5.3-flash`                |          83% |                    87% |           87% |              87% |                    87% |              87% |
| `qwen/qwen3-next-80b-a3b-instruct`  |          97% |                    93% |          100% |             100% |                   100% |             100% |

### Como o usuário sente

| Sistema                             | Erro na tela (502) | Passa do timeout |           Espera p95 | Caracteres p50 | Cabe sem rolar | Palavras/frase | Idioma certo | R$ por pagante/mês (cota cheia) | Extra                                |
| ----------------------------------- | -----------------: | ---------------: | -------------------: | -------------: | -------------: | -------------: | -----------: | ------------------------------: | ------------------------------------ |
| `openai/gpt-oss-120b`               |                 0% |               0% | 13.3 s (fora do SLO) |            764 |           100% |           8.49 |         100% |                         R$ 0.05 | 8.60 cartões; 73% das palavras-alvo  |
| `deepseek/deepseek-v4.1-flash`      |                47% |               0% | 28.8 s (fora do SLO) |            860 |           100% |           8.92 |         100% |                         R$ 0.37 | 10.00 cartões; 84% das palavras-alvo |
| `deepseek/deepseek-v4.1-flash@none` |                 7% |               0% | 12.1 s (fora do SLO) |            881 |           100% |           9.09 |         100% |                         R$ 0.16 | 9.57 cartões; 84% das palavras-alvo  |
| `mistralai/mistral-small-2603`      |                 0% |               0% |                5.2 s |            525 |           100% |           7.77 |         100% |                         R$ 0.10 | 8.33 cartões; 65% das palavras-alvo  |
| `z-ai/glm-5.3-flash`                |                13% |               0% | 24.8 s (fora do SLO) |            728 |           100% |           8.71 |         100% |                         R$ 0.07 | 9.31 cartões; 80% das palavras-alvo  |
| `qwen/qwen3-next-80b-a3b-instruct`  |                 0% |               0% |                4.7 s |            701 |           100% |           8.05 |         100% |                         R$ 0.22 | 8.87 cartões; 74% das palavras-alvo  |

### Contra a produção (`openai/gpt-oss-120b`) — regra B5

| Candidato                           | Δ nota [IC 95%]         | Preferência pareada (duas ordens) | Instáveis | Veredito B5                                                                                                                                   |
| ----------------------------------- | ----------------------- | --------------------------------- | --------: | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `deepseek/deepseek-v4.1-flash`      | -0.461 [-0.728, -0.189] | 5V 3E 7D · -0.13 [-0.60, 0.33]    |       20% | inferior — gold de conversa piorou em gold:resumo (IC exclui 0 para baixo); custo de US$ 0.4839/1M tokens acima do teto de US$ 0.25/1M tokens |
| `deepseek/deepseek-v4.1-flash@none` | -0.067 [-0.206, 0.011]  | 7V 7E 1D · 0.40 [0.07, 0.73]      |       47% | inconclusivo — custo de US$ 0.3438/1M tokens acima do teto de US$ 0.25/1M tokens                                                              |
| `mistralai/mistral-small-2603`      | -0.022 [-0.061, 0.000]  | 4V 6E 5D · -0.07 [-0.47, 0.27]    |       40% | inconclusivo                                                                                                                                  |
| `z-ai/glm-5.3-flash`                | -0.133 [-0.333, 0.006]  | 10V 2E 3D · 0.47 [0.07, 0.87]     |       13% | inconclusivo                                                                                                                                  |
| `qwen/qwen3-next-80b-a3b-instruct`  | -0.011 [-0.050, 0.017]  | 10V 4E 1D · 0.60 [0.27, 0.87]     |       27% | inconclusivo — custo de US$ 0.4885/1M tokens acima do teto de US$ 0.25/1M tokens                                                              |
