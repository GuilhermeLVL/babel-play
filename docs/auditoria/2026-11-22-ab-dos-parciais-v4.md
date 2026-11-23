# A/B dos parciais, V4: orçamento de pisca absoluto e limitador de 125 ms (change `parciais-incrementais`, tarefa 2.6)

Medido em 22/11/2026 no `dist/` do commit `674451b4` (`npm run build:estatica` refeito antes das rodadas). Critério escrito e commitado ANTES de qualquer rodada (commit `03bfd0de`) e não mudado depois do número:
`scripts/perf/latencia-legenda/resultados/2026-11-22/parciais-v4-orcamento/criterio.md`. Dados: `.../parciais-v4-orcamento/{desktop,fraco,desktop-pt}/` (métricas por rodada, `v4-*.md`/`.json` do `ab-parciais.mjs --variante v4`).

## Decisão do dono (registrada como tal)

A guarda de erasure "não piorar contra a base" (limite superior de B − A <= +0,05) é impossível quando a base não mostra parcial (pt com Parakeet: erasure de `atual` = 0). O dono adotou um **orçamento de pisca absoluto**: erasure do original de B com **média <= 0,5 E limite superior do IC 95% de B <= 0,6**. Justificativa no critério: a cauda provisória tem estilo próprio (itálico e opacidade), o leitor de tela só anuncia o confirmado, e Arivazhagan et al. usam a normalized erasure como custo, não como proibição. As demais guardas são as de V1c. A variante vale só para rodadas novas: nada de V1/V1b/V1c/V2 foi reaprovado.

## Veredito por braço e perfil

| braço                           | perfil          | veredito                                              | motivo principal                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v4-pt` (Parakeet, pt)          | desktop         | **REPROVADO (guarda 1, medida depois; ver o adendo)** | Primária ganha: 2.641 → 1.618 ms (−1.023, −38,7%, IC [−1.324, −512]); erasure de B 0,209 (IC de B [0,120, 0,306]) dentro do orçamento; renders 56,8 → 57,7; WER +0,1 pp. A guarda 1 (p75 do final do ORIGINAL, medida depois sobre os mesmos dados): +198 ms, IC [+54, +445], limite superior bem acima de +30. No dia da rodada estava SEM MEDIDA e o veredito era "aprovado condicionado" |
| `v4-en` (`parciais_vivos`, k=1) | desktop         | **SEM DIFERENÇA PROVADA**                             | Atraso p50 1.161 → 1.833 ms (+672, IC [−96, +1.157]) cruza 0; todas as guardas ok (erasure de B 0,396, IC [0,268, 0,540]; p75 do final −51 ms, limite superior +10)                                                                                                                                                                                                                         |
| `v4-en` (`parciais_vivos`, k=1) | fraco (EMULADO) | **REPROVADO**                                         | Guarda p75 do final: dif +18 ms, IC [−13, +83], limite superior +83 ms (teto +30). Primária sem efeito (+2 ms, IC [−156, +291]); erasure 0,532 → 0,434 (B dentro do orçamento)                                                                                                                                                                                                              |

Todas as decisões vêm do `ab-parciais.mjs`, não de leitura à mão. 11 rodadas válidas por braço e perfil (aquecimento descartado, nenhuma inválida). Confirmado no pt: `parakeet-local` na fumaça (rota do Parakeet).

## Números (B − A, IC 95% pareado por fala, 10.000 reamostragens, semente 20261121)

| cenário / perfil      | braço   | atraso p50 (ms)                   | p90 (ms)                       | erasure do original (B; IC de B) | p75 do final (ms)          | 1º texto (mediana, ms) | WER final B − A           | renders de fala/s |
| --------------------- | ------- | --------------------------------- | ------------------------------ | -------------------------------- | -------------------------- | ---------------------- | ------------------------- | ----------------- |
| en desktop            | `atual` | 1.161                             | 2.687                          | 0,634                            | 1.019                      | 3.202                  |                           | 91,9              |
| en desktop            | `v4-en` | 1.833 (+672, IC [−96, +1.157])    | 3.479 (+792, IC [+39, +1.108]) | 0,396 ([0,268, 0,540])           | 967 (−51, IC [−183, +10])  | 1.431                  | +0,0 pp (IC [−2,4, +1,6]) | 108,4             |
| en fraco (emulado)    | `atual` | 1.775                             | 3.793                          | 0,532                            | 1.221                      | 1.915                  |                           | 102,8             |
| en fraco (emulado)    | `v4-en` | 1.777 (+2, IC [−156, +291])       | 3.835 (+41, IC [−63, +538])    | 0,434 ([0,348, 0,547])           | 1.239 (+18, IC [−13, +83]) | 1.914                  | +0,0 pp (IC [−1,8, +1,3]) | 100,2             |
| pt desktop (Parakeet) | `atual` | 2.641                             | 4.404                          | 0,000                            | sem medida                 | 6.407                  |                           | 56,8              |
| pt desktop (Parakeet) | `v4-pt` | 1.618 (−1.023, IC [−1.324, −512]) | 4.366 (−38, IC [−631, +291])   | 0,209 ([0,120, 0,306])           | sem medida                 | 3.216                  | +0,1 pp (IC [−0,8, +0,9]) | 57,7              |

SLO (framesLongos, cpuSilencio, rendersPorS silêncio e fala, taxa de falha): todos ok nos três. Falas: 6 no atraso por palavra em inglês (10 em pt), 8 a 12 na erasure; IC largos, sem correção de multiplicidade (3 comparações).

## Comparação com V1, V1b, V1c e V2 (atraso p50 do original; erasure; renders de fala; desktop)

| variante                            | atraso p50 (ms)      | erasure     | renders de fala/s | veredito                                                                  |
| ----------------------------------- | -------------------- | ----------- | ----------------- | ------------------------------------------------------------------------- |
| V1 `cauda-token` (en)               | 1.265 → 255 (−80%)   | 0,59 → 3,60 | 91 → 223          | REPROVADO                                                                 |
| V1b `cauda-decode` (en)             | 1.164 → 263 (−77%)   | 0,66 → 2,25 | 94 → 168          | REPROVADO                                                                 |
| V1b `sem-cauda` (en)                | 1.164 → 1.846 (+59%) | 0,66 → 0,23 | 94 → 93           | REPROVADO                                                                 |
| V1c `acrescenta-decode` (en, k=2)   | 1.280 → 1.876 (+47%) | 0,63 → 0,38 | 92 → 111          | SEM DIFERENÇA PROVADA                                                     |
| **V4 `v4-en` (en, k=1, limitador)** | 1.161 → 1.833 (+58%) | 0,63 → 0,40 | 92 → 108          | SEM DIFERENÇA PROVADA                                                     |
| V2 `v1v2` cauda-token (pt)          | 2.575 → 799 (−69%)   | 0,00 → 0,72 | 57 → 134          | REPROVADO                                                                 |
| V1c `v1v2-acrescenta` (pt)          | 2.521 → 1.154 (−54%) | 0,00 → 0,41 | 57 → 113          | REPROVADO (guarda relativa)                                               |
| **V4 `v4-pt` (pt, limitador)**      | 2.641 → 1.618 (−39%) | 0,00 → 0,21 | 57 → 58           | **REPROVADO pela guarda 1** (era "aprovado condicionado" antes do adendo) |

Os vereditos de V1c e V2 não mudam (critério antigo, medido antes). O mesmo modo do pt (`acrescenta-decode`) passou de reprovado a aprovado por DOIS motivos distintos, e o relatório não os separa: (1) a guarda de erasure virou o orçamento absoluto (0,41 era 8 vezes o teto relativo de +0,05, mas já estaria dentro de 0,5/0,6); (2) o limitador de 125 ms levou os renders de 113 para 58 (o mesmo nível de `atual`) e a erasure medida caiu de 0,41 para 0,21 e o ganho de atraso de −54% para −39%. Não houve braço "V4 sem limitador" no mesmo dia, então o quanto da queda da erasure é pisca a menos na tela e quanto é menos estados intermediários amostrados pela bancada não está separado.

## Fumaça (1 rodada por braço novo, não conta)

`v4-en` desktop: erasure 0,42, renders 107,6, 1º texto 1.441 ms. `v4-en` fraco: 1º texto 1.915 ms (um parcial por fala por desenho). `v4-pt` desktop: erasure 0,34, 1º texto 3.007 ms, motor `parakeet-local`, 0 erros. Nenhum defeito de implementação: o texto mostrado só cresce e o final substitui o balão.

## O que foi implementado

- `src/core/legendas/limitadorDeParcial.ts` (+ `tests/limitadorDeParcial.test.ts`): no máximo 1 atualização a cada 125 ms por fala, junta hipóteses intermediárias (fica a última), relógio injetado. No pipeline (`pipelineDeFala.ts`) só vale com `parciais_vivos`; o final nunca passa pelo limitador (o `speechEnd`, o final, o erro e o misfire descartam o que ele segurava).
- Máscara por `babel.lab.parciaisMascara` (`lerMascaraDeParciais`, inteiro 0 a 8, padrão 2) em `modoDeParciais.ts` + teste.
- `ab-parciais.mjs --variante v4` com `guardaOrcamentoDeErasure` (o bootstrap passou a devolver `icB`) + testes. Variantes antigas intactas.
- Sem a flag `parciais_vivos` (ou sem as chaves), o comportamento é o de hoje. Com a flag ligada, o limitador entra para qualquer modo (não há chave para desligá-lo).

## Limites (leia antes de usar o número)

1. **Fraco EMULADO não aprova celular.** CPU 4x, 2 núcleos e sem WebGPU num Mac: só ordena e acha regressão. O modo desempenho automático faz 1 parcial por fala por desenho; o `v4-en` ali é quase inerte, e a guarda do p75 reprova pelo limite superior do IC (+83 ms) com diferença pontual de apenas +18 ms. O fraco não exerce o Parakeet (rota `whisper-base`); `v4-pt` só existe no desktop. A rodada [R] em aparelho real (tarefa 5.1) segue sem acontecer.
2. **Pt: guarda 1 sem medida NO DIA DA RODADA (medida depois: ver o adendo, e reprova).** `fimDaFalaAteLegendaMs` é o tempo até a TRADUÇÃO e o pt para pt não tem tradução. O critério já dizia: a aprovação do pt fica CONDICIONADA a uma métrica própria de "final do original" (que o limitador, por desenho, não deveria piorar, mas não está medido).
3. O orçamento de 0,5/0,6 é do dono, provisório, e nenhuma bancada mede se a erasure é PERCEBIDA como pisca. A erasure aqui conta também a correção legítima do final.
4. O inglês desktop não prova ganho (IC do atraso [−96, +1.157]): a máscara k=1 não devolveu o ganho de atraso que k=2 tirou; só não se pode dizer que é pior. Poucas falas (6 a 12); 1 voz FLEURS.
5. Efeito mínimo de −20% e a máscara k são provisórios (tarefa 1.2 [D]).

## Adendo (22/11/2026): a guarda 1 do pt, medida depois sobre os dados já coletados

O critério (`criterio.md`, guarda 1) já previa: no pt para pt a guarda "fica SEM MEDIDA" e, se o resto aprovar, a aprovação "fica CONDICIONADA a uma métrica própria de 'final do original'". Este adendo é essa medição, calculada DEPOIS sobre as rodadas que já existiam, **sem mudar o limite nem a regra**: limite superior do IC 95% da diferença B − A do p75 **<= +30 ms**, o mesmo bootstrap pareado por fala (10.000 reamostragens, semente 20261121) da guarda 1 de `fimDaFalaAteLegendaMs`. Nenhuma rodada nova.

**Métrica `fimDaFalaAteOriginalMs`:** do fim da fala no roteiro (convertido pelo bipe-âncora) ao PRIMEIRO quadro pintado (`tf ?? t`) em que o texto FINAL do original aparece no balão. Texto final = o último original com letras do balão; comparação por palavras (`tokenizar`, sem caixa nem pontuação). Sem tradução o original ocupa o campo `tr` até o fim, então vale o original visível (`o || tr`); um parcial que já mostrava o texto final conta (valor pode ficar negativo: a pessoa já viu). Função pura `fimDaFalaAteOriginalMs` em `palavras-da-fala.mjs` (+ teste em `tests/palavras-da-fala.test.ts`); `ab-parciais.mjs` usa a métrica como guarda 1 quando não há `fimDaFalaAteLegendaMs` (+ teste em `tests/abParciais.test.ts`). Dados: `.../parciais-v4-orcamento/final-do-original-{pt-desktop,en-desktop,en-fraco}.{md,json}` (reproduzível com `ab-parciais.mjs --variante v4` sobre as rodadas brutas, que não são versionadas; os `.json` guardam os números).

| cenário / perfil               | `atual` p75 (ms) | `v4-*` p75 (ms) | B − A (ms) | IC 95%          | limite superior <= +30?                                         |
| ------------------------------ | ---------------- | --------------- | ---------- | --------------- | --------------------------------------------------------------- |
| **pt desktop (Parakeet)**      | 951              | 1.148           | **+198**   | **[+54, +445]** | **NÃO (+445)**                                                  |
| en desktop (informativo)       | 811              | 806             | −5         | [−21, +8]       | sim (+8)                                                        |
| en fraco emulado (informativo) | 1.150            | 1.159           | +10        | [−10, +59]      | não (+59; a guarda de `fimDaFalaAteLegendaMs` já reprovava ali) |

Mediana (p50) no pt: 922 → 1.052 ms (+131, IC [−8, +345]).

**Veredito da guarda 1 no pt: REPROVA.** O texto final do original aparece cerca de 200 ms mais tarde com `v4-pt` do que com `atual` (p75), e o IC inteiro fica acima de zero (+54 a +445). Pela regra do critério, que não muda depois do número, **o `v4-pt` deixa de ser "aprovado condicionado" e fica REPROVADO pela guarda 1**; a aprovação condicionada do corpo do relatório não se sustenta. O ganho da primária (−39% no atraso por palavra) é real, mas vem junto com o final mais lento.

Causa NÃO medida (hipótese): com `parciais_vivos` + Parakeet, o worker pode estar ocupado com um decode parcial quando o final chega, e o final espera na fila (`sttEspera` da bancada). A bancada não pareou o decode final no pt (sem tradução), então isso não foi confirmado. O limitador de 125 ms não é a causa provável: ele só age na TELA do parcial e o teste de pipeline (`tests/pipelineDeFala-parciaisVivos.test.ts`) mostra que o final escreve direto, sem esperar. Para sanar o p75 seria preciso, p. ex., não decodificar parcial nos instantes finais da fala ou cancelar o parcial em voo quando o VAD fecha, e refazer o A/B (variante nova, critério novo, antes das rodadas).

Limites do adendo: 10 falas pareadas no pt, 11 rodadas por braço, 1 voz FLEURS; fraco não exerce o Parakeet; os `valores` por fala estão nos `.json`.

## Teste de percepção do dono (22/11/2026)

O dono abriu o app local com `parciais_vivos` e `parciais_parakeet` ligadas e disse: "uau, está muito rápido, continue assim". **Qual modo de exibição ele usou é desconhecido** (não foi registrado se a chave `babel.lab.parciaisModo` estava definida). É **1 pessoa, sem protocolo**: não tem peso estatístico, não mede pisca nem atraso do final e não substitui a bancada nem a rodada [R] em aparelho real. Fica como sinal qualitativo coerente com o ganho de atraso por palavra da primária (−39% no pt), que a bancada mede; não é evidência a favor da guarda 1, que reprovou.

## Se for ligar

- **Pt com Parakeet, desktop: NÃO ligar como está.** A primária ganha e a erasure cabe no orçamento, mas a guarda 1 (final do original, p75) reprova (+198 ms, IC [+54, +445]; ver o adendo). O caminho é corrigir a espera do final (hipótese acima) e refazer o A/B com critério novo. Ligar continua sendo decisão [D] do dono e exige a rodada [R] em aparelho real; o teste de percepção do dono é 1 pessoa sem protocolo.
- **Inglês (Whisper/Moonshine): nada a ligar.** Sem ganho provado no desktop e reprovado no fraco emulado.
