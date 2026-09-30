# Bancada — Etapa 5 (29/09/2026): Parakeet v3 e Bergamot

Rodada no GitHub Actions (`bancada.yml`, run 36571688198, commit `abb1407`, ubuntu-latest 4 vCPU),
com a mesma metodologia da bancada de 24–25/09 (`bancada-2026-09.md`): FLEURS pt/en (300 falas),
FLEURS pt a 5 dB SNR (100), ESC-50 sem fala (126), gold de conversa (60), FLEURS en↔pt e WMT24++
en→pt_BR; VAD de 800 ms igual ao do navegador; COMET `wmt22-comet-da`; bootstrap **pareado** de
1000 reamostras. Brutos no artefato `bancada-etapa5` do run.

> Regra de decisão: troca só se o IC 95% da diferença pareada exclui 0, o custo cabe e o gold de
> conversa não piora.

## Transcrição (WER %, menor é melhor; RTF em CPU Node, não navegador)

| Conjunto              | Parakeet v3 int8  | TAGARELA int8 | Whisper base | Whisper small | Moonshine base                    |
| --------------------- | ----------------- | ------------- | ------------ | ------------- | --------------------------------- |
| FLEURS pt             | **6,6** [5,7–7,6] | 8,6           | 19,0         | 10,6          | —                                 |
| FLEURS pt, ruído 5 dB | 9,9               | **8,5**       | 29,8         | 16,5          | —                                 |
| FLEURS en             | 10,3              | —             | —            | —             | 10,9 (empate: Δ −0,6 [−2,2; 1,2]) |
| Alucinação sem fala   | **7,9%**          | 9,5%          | 22,2%        | 16,7%         | —                                 |
| RTF                   | 0,045             | 0,048         | 0,096        | 0,268         | 0,045                             |

- **Parakeet v3 × Whisper base em pt: −12,4 pontos** [−13,6; −11,3], significativo; também vence o
  small (−4,0 [−4,8; −3,2]) sendo ~6× mais rápido que ele. Menos alucinação em trechos sem fala.
- **TAGARELA** (ajuste pt-BR) perde para o v3 no áudio limpo e ganha pouco no ruidoso. O modelo é
  CC-BY-4.0, mas foi treinado sobre um conjunto **CC-BY-NC-SA** — fora do produto sem parecer jurídico.
- **Inglês:** Parakeet empata com o Moonshine base (IC cruza 0). Fica o Moonshine (67 MB contra ~650 MB).
- Ressalvas: o Parakeet não aceita dica de idioma (detecta sozinho); ~650 MB em int8 não cabem no
  celular/iPhone; o RTF medido é de CPU em Node — o do navegador (WASM/WebGPU) precisa ser medido.

## Tradução (COMET, maior é melhor)

| Corpus                       | opus-mt (atual) | Bergamot  | Δ pareado                  |
| ---------------------------- | --------------- | --------- | -------------------------- |
| FLEURS pt→en                 | 0,855           | **0,882** | +0,028 [0,020; 0,034] sig. |
| FLEURS en→pt                 | 0,860           | **0,883** | +0,023 [0,016; 0,030] sig. |
| WMT24++ en→pt_BR             | 0,757           | **0,786** | +0,029 [0,021; 0,037] sig. |
| **Gold de conversa en→pt**   | **0,847**       | 0,826     | −0,021 [−0,045; 0,002]     |
| Latência p50 por frase (CPU) | 133–464 ms      | 14–44 ms  | ~10× mais rápido           |

Leitura caso a caso do gold (en→pt): o Bergamot escreve **português de Portugal** ("Por favor,
fecha-o", "Está a chover", "Vivo numa pequena casa", "Agradecia que pudesse") e erra coloquial
("Hey, what's up?" → "Ei, o que é o quê?"; opus-mt: "Oi, e aí?"). A nota automática não pune o
europeu o bastante; para quem aprende no Brasil, isso importa.

## Decisões

1. **Transcrição pt no computador:** Parakeet v3 int8 substitui o Whisper base/small onde couber
   (desktop com memória; WebGPU quando o benchmark do aparelho provar). Celular/iPhone/Quest seguem
   com Whisper base q8 até haver uma variante menor (w4a8) medida. Próximo passo: integrar no
   navegador (parakeet.js / onnxruntime-web) e medir RTF e memória reais antes de ligar.
2. **Transcrição en:** fica o Moonshine base.
3. **Tradução pt→en:** Bergamot substitui o opus-mt (+0,028 sig., 36 MB contra 113 MB, ~10× mais
   rápido, saída em inglês — sem o problema do europeu).
4. **Tradução en→pt:** fica o opus-mt (gold de conversa não pode piorar; europeu no Bergamot).
5. **TAGARELA:** não entra (dados de treino não comerciais).
6. **Nuvem (Cloudflare Workers AI, DeepInfra):** aguardam as chaves do dono.
