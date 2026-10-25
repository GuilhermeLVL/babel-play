## legenda

Melhor nota: `openai/gpt-oss-120b~groq+cerebras` · **recomendado: `google/gemma-4-26b-a4b-it`** — o mais barato entre 1 sistema(s) não-inferior(es) ao melhor (margem −0.05) e sem falha crítica — relaxado o SLO de latência.

Autopreferência medida (nota a mais para a própria família, descontada a severidade): `mistralai/mistral-medium-3.1` +0.003.

### Qualidade, custo e latência

| Sistema                                      |   n | Nota [IC 95%]     | Inválidas | Sem resposta | Total p50 · p95 | TTFT p50 · p95 | US$/1.000 usos | US$/1M tok | Não-inf. | No tempo | Falha crítica | Custo cabe |
| -------------------------------------------- | --: | ----------------- | --------: | -----------: | --------------- | -------------- | -------------: | ---------: | :------: | :------: | ------------- | :--------: |
| `google/gemma-4-26b-a4b-it` ★                |  60 | 0.96 [0.93, 0.98] |        0% |           0% | 1.1 s · 2.1 s   | 1.0 s · 2.0 s  |          0.023 |      0.084 |   sim    |   sim    | —             |    sim     |
| `openai/gpt-oss-120b~groq+cerebras` (ajuste) |  60 | 0.96 [0.93, 0.98] |        0% |           0% | 0.9 s · 1.5 s   | 0.8 s · 1.4 s  |          0.059 |      0.163 |   sim    |   sim    | —             |    não     |
| `mistralai/mistral-small-2603`               |  54 | 0.91 [0.88, 0.95] |        0% |          10% | 1.0 s · 1.7 s   | 0.9 s · 1.4 s  |          0.018 |      0.060 |   não    |   sim    | —             |    sim     |

### Taxa de acerto por critério

| Sistema                             | adequacao | naturalidade | registro | idioma_certo (crítico) | segura (crítico) |
| ----------------------------------- | --------: | -----------: | -------: | ---------------------: | ---------------: |
| `google/gemma-4-26b-a4b-it`         |       87% |          96% |      97% |                   100% |             100% |
| `openai/gpt-oss-120b~groq+cerebras` |       91% |          95% |      93% |                   100% |             100% |
| `mistralai/mistral-small-2603`      |       75% |          94% |      89% |                   100% |             100% |

### Como o usuário sente

| Sistema                             | Erro na tela (502) | Passa do timeout |          Espera p95 | Caracteres p50 | Cabe sem rolar | Palavras/frase | Idioma certo | R$ por pagante/mês (cota cheia) | Extra                          |
| ----------------------------------- | -----------------: | ---------------: | ------------------: | -------------: | -------------: | -------------: | -----------: | ------------------------------: | ------------------------------ |
| `google/gemma-4-26b-a4b-it`         |                 0% |               0% | 2.1 s (fora do SLO) |             40 |              — |           5.29 |         100% |                               — | chrF++ 79.22; tamanho/ref 1.00 |
| `openai/gpt-oss-120b~groq+cerebras` |                 0% |               0% |               1.5 s |             38 |              — |           5.05 |         100% |                               — | chrF++ 74.73; tamanho/ref 0.96 |
| `mistralai/mistral-small-2603`      |                 0% |               0% | 1.7 s (fora do SLO) |             31 |              — |           4.91 |         100% |                               — | chrF++ 62.08; tamanho/ref 0.92 |

### Contra a produção (`google/gemma-4-26b-a4b-it`) — regra B5

| Candidato                           | Δ nota [IC 95%]         | Preferência pareada (duas ordens) | Instáveis | Veredito B5                                                                      |
| ----------------------------------- | ----------------------- | --------------------------------- | --------: | -------------------------------------------------------------------------------- |
| `openai/gpt-oss-120b~groq+cerebras` | +0.000 [-0.020, 0.022]  | 10V 42E 8D · 0.03 [-0.10, 0.18]   |       17% | inconclusivo — custo de US$ 0.0733/h de fala acima do teto de US$ 0.05/h de fala |
| `mistralai/mistral-small-2603`      | -0.041 [-0.069, -0.013] | 3V 29E 20D · -0.33 [-0.48, -0.17] |       25% | inferior — gold de conversa piorou em gold:legenda (IC exclui 0 para baixo)      |
