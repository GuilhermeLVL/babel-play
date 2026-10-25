# Legenda ao vivo — chrF++ no gold de conversa (bancada/resumo.mjs)

Commit `?` · 2026-10-25T02:10:51.099Z

> **Regra de decisão:** troca só se o IC 95% do bootstrap **pareado** da diferença exclui 0, o custo cabe e o gold de conversa não piora. **sig.** = IC exclui 0. STT: Δ < 0 é melhor. MT: Δ > 0 é melhor.

## Tradução

| Corpus     | Sistema                                          |   n | COMET [IC 95%]      | chrF++ | BLEU | ms/frase p50 · p95 | US$/h | Δ pareado vs base                                                              |
| ---------- | ------------------------------------------------ | --: | ------------------- | -----: | ---: | ------------------ | ----: | ------------------------------------------------------------------------------ |
| gold:en-pt | `openrouter:google/gemma-4-26b-a4b-it`           |  60 | — (rode pontuar.py) |   79.2 |    — | —                  |     — | —                                                                              |
| gold:en-pt | `openrouter:openai/gpt-oss-120b~groq+cerebras` ★ |  60 | — (rode pontuar.py) |   74.7 |    — | —                  |     — | vs `openrouter:google/gemma-4-26b-a4b-it` (chrf): -4.5 [-9.9, 1.1]             |
| gold:en-pt | `openrouter:mistralai/mistral-small-2603` ★      |  54 | — (rode pontuar.py) |   62.1 |    — | —                  |     — | vs `openrouter:google/gemma-4-26b-a4b-it` (chrf): -15.9 [-21.7, -9.1] **sig.** |

★ = candidato. Brutos (hipóteses caso a caso) no artefato, junto deste resumo.
