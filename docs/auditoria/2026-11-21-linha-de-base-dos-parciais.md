# Linha de base dos parciais (Lote A de `parciais-incrementais`)

Medida com os parciais de HOJE (tique de 2 s, no máximo 3 por fala; nenhuma flag nova ligada), ANTES de qualquer variante.
Critério (commitado antes da 1ª rodada, `3773ca60`): `scripts/perf/latencia-legenda/resultados/2026-11-21/parciais-linha-de-base/criterio.md`.
Dados: a mesma pasta (`resultado.json`, `metricas/` por rodada, `saida-da-bancada.log`, `validacao-do-alinhamento.json`).

## Como foi medido

- Comando: `node scripts/perf/latencia-legenda/bancada-captura.mjs --perfis desktop,fraco --rodadas 12 --sem-comparar --porta 4181`
  (modelos em cache; 1 rodada de aquecimento por perfil, descartada; áudio `tests/fixtures/bancada-captura/fleurs-en-8.json`).
- Build: `npm run build:estatica` do commit `3773ca60` (+ instrumentação do Lote A não commitada: marca `frasy:parcial`, sem efeito na tela).
- Máquina: Apple M5 Pro, 15 núcleos, 24 GB, Chromium headless 159 (Playwright); motor `moonshine-base-ONNX` (WASM) + opus-mt.
- Perfis: `desktop` = **medido**; `fraco` = notebook de entrada **emulado** (CPU 4x, 2 núcleos, 2 GB, sem WebGPU): **emulado não aprova celular**.
- Rodadas válidas: **12 de 12 em cada perfil** (nenhuma inválida), 96 falas por perfil. Máquina livre (`npm run limpar` antes), nada rodando junto.
- Atraso por palavra e erasure: funções puras de `src/core/legendas/medidasDeParcial.ts`, a partir de `lat.dom` e do roteiro com tempo por palavra.
  A tradução usa referência PROPORCIONAL (**proxy**; só compara variantes entre si).

## Resultado

| Métrica (n = palavras ou falas, todas as rodadas somadas) | desktop (medido)                | fraco (emulado)                     |
| --------------------------------------------------------- | ------------------------------- | ----------------------------------- |
| `atrasoDePalavraMs` original p50 / p90                    | **1.166 / 2.747 ms** (n 772)    | **1.577 / 3.707 ms** (n 767)        |
| `atrasoDePalavraMs` tradução (proxy) p50 / p90            | 2.166 / 4.009 ms (n 882)        | 2.413 / 4.355 ms (n 908)            |
| `erasureOriginal` (apagadas ÷ final)                      | **0,62** (746 / 1.197)          | **0,51** (615 / 1.198)              |
| `erasureTraducao` (proxy)                                 | 0,47 (529 / 1.136)              | 0,42 (485 / 1.153)                  |
| `fimDaFalaAteLegendaMs` p50 / p75 / p95                   | 932 / **993** / 1.628 ms (n 96) | 1.143 / **1.383** / 1.974 ms (n 96) |
| taxa de falha da legenda                                  | 0                               | 0                                   |
| `primeiroTextoNaTelaMs` (mediana das rodadas)             | 3.348 ms (bimodal, ver abaixo)  | 1.922 ms                            |
| `primeiraLegendaMs` (mediana)                             | 5.461 ms                        | 5.821 ms                            |
| RTF p50                                                   | 0,035                           | 0,069                               |
| frames > 50 ms                                            | 0                               | 0                                   |
| CPU da aba no silêncio / renders por s (fala)             | 15,4% / 91,6                    | 13,5% / 102,9                       |

Falas fora do cálculo de atraso (< 90% das palavras casadas no alinhamento): 2 das 8 do fixture (`fleurs_en_1747`, `fleurs_en_1776`),
24 das 96 em cada perfil; elas entram na erasure, não no atraso. Palavras do roteiro que o STT não escreveu (sem casamento com o final): 104 (desktop), 109 (fraco).

## Coerência com a base do ciclo 1

`fimDaFalaAteLegendaMs` p75 do desktop: **993 ms** contra ~967 ms do ciclo 1 (+2,7%, dentro da regra de +-25% do critério); p75 por
rodada de 960 a 1.130 ms. Fraco emulado: **1.383 ms** contra 1.373 ms (+0,7%). A base é coerente; as marcas novas não a mexeram de forma visível.

`primeiroTextoNaTelaMs` no desktop segue **bimodal**: 1 rodada em ~1,0 s e 11 em ~3,2 a 3,4 s (a mediana de 3,3 s é o modo lento); no fraco é
estável (1,91 a 1,94 s). A bimodalidade é a do ciclo 1 e é o que o V1 (cadência) ataca.

## O que a base mostra

1. O original aparece com **~1,2 s de atraso mediano por palavra** (p90 2,7 s) no desktop: é o tique de 2 s e o decode de 30 s por parcial.
2. A **erasure é alta (0,5 a 0,6)**: o texto muda muito entre parciais e final. A guarda dos critérios dos A/B ("`erasure` <= 0,2") **não é cumprida pela
   base de hoje**; uma variante só a cumpre se cortar o flicker em ~3x. O critério já está commitado e não muda sozinho: o dono deve dizer se a guarda é
   meta absoluta ou "não piorar contra a base" (pendência).
3. A tradução (proxy) tem atraso maior que o original (+1 s no p50), esperado: ela depende do parcial e da MT.

## Precisão do alinhamento (tarefa 1.6, parte automática)

Alinhamento forçado por `return_timestamps: 'word'` (DTW) do Whisper `medium.en_timestamped` (fp32), casado à referência do FLEURS.
Modelo: `onnx-community/whisper-small` (o do app, decoder q4 mesclado) NÃO exporta atenção cruzada ("Model outputs must contain cross
attentions"); o `small_timestamped` funciona, mas casa só 4 de 8 falas a 90%; o `medium.en_timestamped` casa 6 de 8 (padrão do script).

Contra as fronteiras de voz da própria bancada (6 falas validadas, 24 fronteiras; `validar-alinhamento.mjs`):

| Fronteira                                 | mediana \|desvio\| | p95 \|desvio\| | mediana com sinal |
| ----------------------------------------- | ------------------ | -------------- | ----------------- |
| início da 1ª palavra x `iniS` do roteiro  | 230 ms             | 525 ms         | +230 ms           |
| fim da última palavra x `fimS` do roteiro | 180 ms             | 350 ms         | +40 ms            |
| início x energia do áudio (RMS >= 0,03)   | 190 ms             | 525 ms         | +190 ms           |
| fim x energia do áudio                    | 90 ms              | 345 ms         | +90 ms            |
| **todas as fronteiras**                   | **190 ms**         | **543 ms**     | +180 ms           |

Leitura: o DTW começa a 1ª palavra ~0,2 s depois do início da energia (viés sistemático de +190 a +230 ms) e o fim fica próximo (+40 a +90 ms de viés).
A precisão está no limite esperado do design (~100 a 200 ms por palavra) na mediana, com cauda de até ~0,5 s (a fala `fleurs_en_1750` tem a 1ª palavra
570 ms depois da energia). Como o viés é o mesmo nos dois lados de um A/B, ele cancela na diferença pareada; o erro absoluto do atraso por palavra
(~1,2 s) é grande em relação a ele, mas o p50 de 1,2 s não é atravessado por um erro de 0,2 s.

**A amostra manual de ~20 falas (ouvir/forma de onda) NÃO foi feita: fica PENDENTE com o dono** (tarefa 1.6 [D], e a decisão do plano B MFA/wav2vec2 só se reprovar).
Com 8 falas no fixture só há 6 validáveis; para ~20 falas seria preciso um fixture maior.

## Limites

- Perfil `fraco` é emulado: não aprova celular. Sem aparelho real (tarefa 5.1 [R]).
- Memória de pico: o Chromium headless não a expõe (`memoriaPicoMb` sem base).
- Fixture de 8 falas, 6 com alinhamento válido: os A/B terão poucas falas distintas por rodada (o IC se apoia nas 12 rodadas).
- O atraso por palavra carrega o erro de alinhamento (viés ~ +0,2 s na 1ª palavra); compara-se variante contra variante, não contra o absoluto.
- A tradução usa referência proporcional (proxy).
