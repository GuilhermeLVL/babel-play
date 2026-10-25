# Legenda ao vivo — chrF++ no gold de conversa (bancada/resumo.mjs)

Commit `?` · 2026-10-25T02:43:44.207Z

> **Regra de decisão:** troca só se o IC 95% do bootstrap **pareado** da diferença exclui 0, o custo cabe e o gold de conversa não piora. **sig.** = IC exclui 0. STT: Δ < 0 é melhor. MT: Δ > 0 é melhor.

## Tradução

| Corpus     | Sistema                                          |   n | COMET [IC 95%]      | chrF++ | BLEU | ms/frase p50 · p95 | US$/h | Δ pareado vs base                                                              |
| ---------- | ------------------------------------------------ | --: | ------------------- | -----: | ---: | ------------------ | ----: | ------------------------------------------------------------------------------ |
| gold:en-pt | `openrouter:google/gemma-4-26b-a4b-it`           |  60 | — (rode pontuar.py) |   77.9 |    — | —                  |     — | —                                                                              |
| gold:en-pt | `openrouter:openai/gpt-oss-120b~groq+cerebras` ★ |  60 | — (rode pontuar.py) |   73.0 |    — | —                  |     — | vs `openrouter:google/gemma-4-26b-a4b-it` (chrf): -5.0 [-11.6, 2.8]            |
| gold:en-pt | `openrouter:mistralai/mistral-small-2603` ★      |  55 | — (rode pontuar.py) |   63.9 |    — | —                  |     — | vs `openrouter:google/gemma-4-26b-a4b-it` (chrf): -13.8 [-21.8, -5.3] **sig.** |

★ = candidato. Brutos (hipóteses caso a caso) no artefato, junto deste resumo.
