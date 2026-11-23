# A/B dos parciais, V1b: exibição estável do parcial vivo (change `parciais-incrementais`, tarefa 2.6)

Medido em 21/11/2026 no commit `72369e29`. Critério (escrito e commitado ANTES de qualquer rodada, commit `9a34bcc5`, não mudou depois do número):
`scripts/perf/latencia-legenda/resultados/2026-11-21/parciais-v1b-estavel/criterio.md`. Dados: `.../parciais-v1b-estavel/{desktop,fraco}/` (métricas por rodada,
tabelas `.md` e `.json` do `ab-parciais.mjs --variante v1b`). Relatório anterior (V1 `cauda-token`, V2, V3): `2026-11-21-ab-dos-parciais.md`.

## Resumo dos vereditos (cada braço contra `atual`)

| braço (modo)       | perfil          | veredito      | motivo principal                                                                                                                                                                                                                |
| ------------------ | --------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v1b-sem-cauda`    | desktop         | **REPROVADO** | A primária PIORA: atraso do original p50 1.164 → 1.846 ms (+682, IC [+191, +1.033]); p75 do final: limite superior +166 ms (teto +30). A erasure cai (0,66 → 0,23)                                                              |
| `v1b-cauda-decode` | desktop         | **REPROVADO** | A primária ganha (1.164 → 263 ms, −77%, IC [−1.204, −717]) e o p75 e o WER passam, mas a erasure do original SOBE (0,66 → 2,25; +1,59, limite superior +2,28 contra +0,05) e `rendersPorS.fala` vai de 94 para 168 (limite 128) |
| `v1b-sem-cauda`    | fraco (EMULADO) | **REPROVADO** | Primária pior (1.677 → 2.804 ms, +1.127, IC [+463, +1.523]); p75 do final +177 ms (IC [+22, +202]); erasure zerada (0,51 → 0,00)                                                                                                |
| `v1b-cauda-decode` | fraco (EMULADO) | **REPROVADO** | Sem efeito (1.588 → 1.603 ms, IC [−140, +196]); p75 do final com limite superior +68 ms (teto +30) e WER pareado +0,9 pp com limite superior +2,8 pp (teto +2,0)                                                                |

Todas as decisões vêm do `ab-parciais.mjs`, não de leitura à mão.

**Nenhuma variante deve ser ligada.** "Fraco emulado não aprova celular": nada daqui vale para celular. No fraco o modo desempenho automático faz 1 parcial por fala por desenho
(a cadência não atua; não mudei isso): `cauda-decode` ficou inerte ali (diferença nula) e `sem-cauda` só atrasa.

## Comparação com V1 (`cauda-token`, relatório anterior, desktop)

V1: atraso p50 1.265 → 255 ms (−80%), erasure 0,59 → 3,60, `rendersPorS.fala` 91 → 223, p75 do final limite superior +4 ms (REPROVADO).
V1b `cauda-decode`: 1.164 → 263 ms (−77%), erasure 0,66 → 2,25, renders 94 → 168 (REPROVADO): o ganho de atraso se mantém e o pisca cai cerca de 40% na erasure e 25% nos
renders, mas continua muito acima do teto. V1b `sem-cauda`: erasure e renders ok, mas o ganho de atraso some (piora). Não há ponto intermediário dentro destes dois modos.

## Números por braço e perfil (A = `atual`)

Desktop, `sem-cauda`: atraso original p50 1.164 → 1.846; p90 2.753 → 3.376 (IC [+6, +841]); erasure 0,659 → 0,230 (IC [−0,659, −0,162]); p75 do final 1.015 → 1.026 (+11, IC [−76, +166]);
1º texto na tela (mediana) 3.255 → 2.781 ms; WER pareado −0,4 pp (IC [−1,6, +0,6]); SLO todos ok (renders de fala 94 → 93).

Desktop, `cauda-decode`: atraso p50 1.164 → 263 (−77%); p90 2.753 → 2.276; erasure 0,659 → 2,253; p75 do final 1.015 → 968 (−47, IC [−222, +7]); 1º texto 3.255 → 1.631 ms;
WER pareado −0,7 pp (IC [−2,0, +0,4]); `rendersPorS.fala` 94 → 168; "texto fora do conjunto de A" 4 de 88 (informativo).

Fraco, `sem-cauda`: atraso p50 1.677 → 2.804; erasure 0,510 → 0,000; p75 do final 1.226 → 1.403 (+177, IC [+22, +202]); 1º texto 1.922 → 4.971 ms; WER +0,1 pp (IC [−1,5, +1,7]).

Fraco, `cauda-decode`: atraso p50 1.588 → 1.603 (IC [−140, +196]); erasure 0,503 → 0,484; p75 do final +3 (IC [−36, +68]); WER +0,9 pp (IC [−0,5, +2,8]).

## Como foi medido

- Mesmo protocolo do relatório anterior: `bancada-captura.mjs --perfis desktop,fraco --rodadas 11 --sem-comparar --alvos atual,v1b-sem-cauda,v1b-cauda-decode` num servidor estático só,
  braços intercalados, aquecimento descartado. **11 rodadas válidas por braço e perfil, nenhuma inválida.** Áudio `fleurs-en-8` (6 falas no atraso por palavra no desktop, 5 a 6 no fraco).
- Flags por braço: `--flag-do-alvo`; a chave `babel.lab.parciaisModo` por braço: `--armazenamento-do-alvo` (novo, com teste). Modo ausente = `cauda-token` = hoje.
- Bootstrap pareado por fala (10.000 reamostragens, semente 20261121), IC 95% por comparação, sem correção de multiplicidade (declarado no critério). Com 5 a 6 falas os IC são largos.
- Máquina: Apple M5 Pro, Chromium headless; `fraco` = notebook de entrada EMULADO (CPU 4x, 2 núcleos, sem WebGPU). Memória de pico: o headless não expõe.

## O que mudou no código (flag desligada = comportamento de hoje)

- `src/core/legendas/modoDeParciais.ts` (puro, `tests/modoDeParciais.test.ts`): `sem-cauda` mostra só o confirmado; `cauda-decode` só repinta a cada decode completo e a cauda
  encolhe no máximo 2 palavras por vez (escolha simples). Ligação mínima em `pipelineDeFala.ts`; chave lida a cada parcial, só com `parciais_vivos`.
- `scripts/perf/latencia-legenda/armazenamento-do-alvo.mjs`, `--armazenamento-do-alvo` na bancada e `--armazenamento` no `medir.mjs` (`tests/armazenamentoDoAlvo.test.ts`).
- `ab-parciais.mjs --variante v1b`: p75 com teto +30 ms e WER pareado com IC no lugar do "fora do conjunto de A" (que fica só informativo); testes em `tests/abParciais.test.ts`.

## Observações e próximos passos

1. A erasure alta de `cauda-decode` mostra que o pisca não vem só dos tokens do `onUpdate`: a própria hipótese de cada decode reescreve a cauda (a medida conta palavras mostradas e depois
   trocadas). O limite de 2 palavras de encolhimento não resolve a troca de palavras no meio da cauda.
2. O atraso por palavra de `sem-cauda` piora porque a LocalAgreement-2 confirma tarde em falas de 2 a 6 s (o mesmo achado de V3).
3. Hipóteses novas (exigem critério novo): confirmar com 1 decode de antecedência só quando a cauda tem alta confiança; fixar também a cauda por palavra (nunca trocar uma palavra já mostrada,
   só acrescentar); medir se a erasure do original é percebida pela pessoa (teste manual) antes de manter o teto de +0,05 como guarda.
4. Celular real (tarefa 5.1 [R]) segue sem rodada; V2 segue não medido.
