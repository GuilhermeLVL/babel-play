# Critério do A/B — V4 `parciais_vivos` com ORÇAMENTO DE PISCA absoluto (change `parciais-incrementais`, tarefa 2.6, variante nova)

Escrito ANTES de qualquer rodada de V4 (a fumaça de 1 rodada por braço, que não conta, vem depois deste commit). É uma variante NOVA, só para rodadas novas:
não reabre nem reaprova nada já medido (V1, V1b, V1c, V2 continuam com os vereditos que têm). Mesma métrica primária e mesmas guardas de V1c, exceto a guarda de erasure.

## Decisão do dono (registrada como tal)

O dono decidiu adotar um **orçamento de pisca absoluto**, porque a guarda "não piorar contra a base" (limite superior da diferença B − A <= +0,05) é impossível de cumprir
quando a base não mostra parcial (pt com o Parakeet: erasure de `atual` = 0,000, qualquer parcial "piora") e rígida demais mesmo em inglês (`atual` já tem 0,49 a 0,66).

## Hipótese

Os modos de exibição anteriores só trocaram atraso por erasure (V1/V1b: rápido e piscando; `sem-cauda`/V1c: estável e lento). V4 não tenta zerar o pisca: aceita um pisca
BOUNDED e o mede contra um orçamento absoluto, e limita o custo de renders com um limitador de atualização da tela do parcial (no máximo 1 atualização a cada 125 ms por fala,
cerca de 8/s, juntando hipóteses intermediárias: fica a última; o FINAL nunca é segurado). Em inglês a máscara é k = 1 (V1c usou k = 2) para devolver parte do ganho de atraso
que a máscara de 2 palavras tirou.

## Braços (mesmo `dist/`, um servidor; o braço muda só `babel.flags` e as chaves de laboratório do navegador)

| braço   | perfis                       | cenário                                                                               | flags                              | `babel.lab.parciaisModo` | `babel.lab.parciaisMascara` | limitador |
| ------- | ---------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------ | --------------------------- | --------- |
| `atual` | os mesmos do braço comparado | o mesmo do braço comparado                                                            | nenhuma                            | (ausente)                | (ausente)                   | não       |
| `v4-pt` | desktop                      | `fleurs-pt-12`, `--eles pt-BR --eu pt-BR --qualidade accurate` (Parakeet, pt para pt) | `parciais_vivos,parciais_parakeet` | `acrescenta-decode`      | (ausente = 2, o padrão)     | sim       |
| `v4-en` | desktop e fraco (EMULADO)    | `fleurs-en-8`                                                                         | `parciais_vivos`                   | `acrescenta-decode`      | `1`                         | sim       |

O limitador liga sozinho com `parciais_vivos`; não há chave para desligá-lo no braço `v4-*` (o `atual` não tem a flag, então não tem limitador).
Comparação: cada braço `v4-*` contra o `atual` do MESMO cenário e perfil. Números de V1/V1b/V1c/V2 entram só como linha de referência no relatório.

## Medição

`bancada-captura.mjs` + `ab-parciais.mjs --variante v4`, >= 10 rodadas válidas por braço e perfil, intercaladas, aquecimento descartado, rodada inválida refeita.
Bootstrap pareado por fala, 10.000 reamostragens, semente 20261121, IC 95% POR COMPARAÇÃO, sem correção de multiplicidade (declarado: 3 comparações; por isso a aprovação exige a primária E todas as guardas).

## Métrica primária

`atrasoDePalavraMs` p50 do ORIGINAL, por perfil: diferença pareada por fala (palavras somadas), IC 95%.

## Efeito mínimo

-20% sobre o p50 de `atual` (PROVISÓRIO, a confirmar pelo dono; tarefa 1.2 [D]). B só é "melhor" se o IC 95% inteiro ficar abaixo de 0 e o efeito for >= 20% em módulo.
IC que cruza 0, ou efeito < 20%: "sem diferença provada".

## Guardas (qualquer uma que falhe reprova B)

1. `fimDaFalaAteLegendaMs` p75: limite superior do IC 95% da diferença B − A **<= +30 ms** (igual a V1c). Vale ONDE FOR MEDÍVEL: no pt para pt não há tradução e a guarda fica
   "sem medida" (nem aprovação nem reprovação; se o resto aprovar, a aprovação do pt fica CONDICIONADA a uma métrica própria de "final do original").
2. **`erasureOriginal` de B, ORÇAMENTO ABSOLUTO** (muda em relação a V1c): a erasure de B (Σ apagadas ÷ Σ palavras finais do original, sobre as rodadas de B) tem de ter
   **média <= 0,5 E limite superior do IC 95% de B <= 0,6** (bootstrap por fala, as mesmas 10.000 reamostragens). A erasure de A e a diferença B − A são só informadas.
   Justificativa: a cauda provisória tem estilo próprio (itálico e opacidade menor), então palavra que muda na cauda é lida como "ainda em ajuste", não como erro; o leitor
   de tela só anuncia o CONFIRMADO, então o pisca não vira ruído para quem o usa; e Arivazhagan et al. (2020) usam a normalized erasure como CUSTO a orçar contra a latência,
   não como proibição. 0,5 e 0,6 são o orçamento provisório do dono (a confirmar contra percepção real, o que esta bancada não mede).
3. Texto final: **WER pareado** do final contra a referência do FLEURS, diferença B − A, limite superior do IC 95% **<= +2 pp** (+0,02). "Fora do conjunto de A" só informativo.
4. `framesLongos.n50/n100/somaMs`, `cpuSilencio.processoPct`, `rendersPorS.*` (silêncio e fala) e taxa de falha do `slo-captura.json`: regra "B > A x (1 + tolerância) + folga piora",
   sobre a mediana das rodadas (inclusive `rendersPorS.fala`, que é o que o limitador ataca). Memória de pico: o headless não expõe.

## Leitura do perfil `fraco`

O perfil leve liga o modo desempenho automático: 1 parcial por fala por desenho (V1/V1b/V1c foram quase inertes ali). Fraco EMULADO (CPU 4x, 2 núcleos, sem WebGPU, num Mac) **não aprova celular**:
só ordena e acha regressão. O fraco também não exerce o Parakeet (rota `whisper-base`), então `v4-pt` só existe no desktop.

## Decisão

APROVADO = primária (IC inteiro abaixo de 0, efeito >= 20%) E todas as guardas. REPROVADO = alguma guarda falha, ou primária pior (IC inteiro acima de 0).
SEM DIFERENÇA PROVADA = IC da primária cruza 0 ou efeito < 20%, sem guarda reprovada. Ligar a flag é decisão [D] do dono, e mesmo aprovado no desktop o ganho em celular exige a rodada [R] em
aparelho real. O critério não muda depois de ver o número.
