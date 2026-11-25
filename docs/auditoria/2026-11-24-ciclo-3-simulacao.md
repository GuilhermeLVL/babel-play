# Ciclo 3: simulação das regras de exibição do parcial vivo no inglês

Data: 24/11/2026. Branch `lab/ciclo-3-simulador` (sem push, sem PR). Critério escrito e commitado antes de gravar: `scripts/perf/latencia-legenda/resultados/2026-11-24/ciclo-3-simulacao/criterio.md` (commit `c5df631d`). Dados: `.../ciclo-3-simulacao/{gravacao,simulacao.json,simulacao.md}` (sem áudio nem rodadas brutas).

## Conclusão

**Nenhuma finalista para o inglês.** No espaço de 99 políticas, nenhuma que respeite erasure média <= 0,5 melhora o atraso p50 do `atual` (regra 4 do critério: exigia -20%). A melhor elegível fica 16% PIOR que o `atual` real (1.405 ms contra 1.216 ms no desktop). O inglês continua fora da V7. Não há A/B real a rodar por este caminho.

## Gravação

- `fleurs-en-8`, en-US para pt-BR, Moonshine base (desktop) e emulado fraco. 4 rodadas medidas por perfil e por braço, intercaladas (`atual` sem flag e `grava-en` com `parciais_vivos` + modo `acrescenta-decode`), aquecimento descartado, 0 rodadas inválidas. Máquina na tomada, tampa aberta, `caffeinate -dimsu --`, servidor estático na porta 4195 (a 3100 não foi tocada). Fumaça de 1 rodada antes.
- Mudança de código (commit `feat(lab): a gravacao de hipoteses vale tambem fora da rota do Parakeet`): sem ela o inglês não gravava, porque os parciais vivos só valem na rota do Parakeet (pt/es). Agora, só com `babel.lab.gravarHipoteses=1` E `parciais_vivos`, qualquer rota grava; o pedido `parakeet: true` continua só na rota do Parakeet. Sem a chave nada muda. Teste novo em `tests/pipelineDeFala-parciaisVivos.test.ts`.

## Validação do simulador (inglês desktop; aceite: atraso p50 em +-25% e erasure em +-0,15)

| política                                     | real (relatório)                | simulado                   | veredito                                                       |
| -------------------------------------------- | ------------------------------- | -------------------------- | -------------------------------------------------------------- |
| V7: `acrescenta-decode` k2, limitador 125 ms | p50 1.873 ms, erasure 0,34 (V7) | p50 1.815 ms, erasure 0,31 | dentro (-3%, -0,03)                                            |
| V1: `cauda-token`, sem limitador             | p50 255 ms, erasure 3,60 (V1)   | p50 223 ms, erasure 3,70   | dentro (-13%, +0,10)                                           |
| V7 contra a tela real da MESMA rodada        | p50 1.827 ms, erasure 0,308     | 1.815 ms, 0,308            | dentro; texto igual em 32/32 falas, deslocamento mediano 10 ms |

Fraco emulado: atraso p50 real 1.998 contra simulado 1.979 ms e erasure 0,353 contra 0,308 (dentro), MAS a sequência de textos difere em 32/32 falas (a tela real tem sempre 1 texto distinto a mais que a simulada). A causa não foi investigada. Limite declarado: no fraco o simulador acerta os agregados, não a sequência de quadros; o fraco não entrou na regra de escolha.

## Placar (desktop, 99 políticas, regra do critério)

Linha de base real do `atual` (4 rodadas, palavras somadas): atraso p50 **1.216 ms**, p90 2.973, erasure ~0,6 a 0,8, renders/s de fala ~103. Limite do proxy de renders: 1,3 quadros/s (V7 simulada) x 123,2 / 76,1 = 2,10 quadros/s. 57 políticas elegíveis (erasure <= 0,5 e proxy <= 2,10).

| #   | política (elegível)                      | atraso p50    | p90   | erasure | quadros/s |
| --- | ---------------------------------------- | ------------- | ----- | ------- | --------- |
| 1   | `acrescenta-decode` k0, x1               | 1.405         | 3.399 | 0,351   | 1,4       |
| 2   | `acrescenta-decode` k1, x3               | 1.405         | 3.724 | 0,392   | 0,6       |
| 3   | `acrescenta-decode` k2, x3               | 1.482         | 3.724 | 0,394   | 0,5       |
| 4   | `acrescenta-decode` k1, x1               | 1.483         | 3.454 | 0,323   | 1,3       |
| 5   | `acrescenta-decode` k0/k1, x2 (vizinhas) | 1.487 a 1.533 |       |         |           |
| 6   | `sem-cauda` x1                           | 1.609         | 3.435 | 0,300   | 0,7       |
| 7   | `acrescenta-decode` k3, x1               | 1.815         | 3.499 | 0,290   | 1,3       |
| 8   | V7 (`acrescenta-decode` k2, 125 ms, x1)  | 1.815         | 3.469 | 0,308   | 1,3       |

O limitador (0/125/250 ms) não muda nada nos modos de decode (as linhas são idênticas); só pesaria nos modos de token. A tabela completa está em `simulacao.md`.

Fronteira atraso x erasure (desktop): `cauda-decode` x3 p50 1.060 com erasure 0,82; x2 790 com 1,31; x1 331 com 1,90; `cauda-token` 223 com 3,70. Ou seja, o atraso só cai abaixo do `atual` pagando erasure acima do orçamento (0,5), e o `atual` real já tem erasure ~0,6 a 0,8. A regra de escolha pelo critério daria `acrescenta-decode` k0 x1 (1.405 ms), mas ela reprova a regra 4 (nenhuma elegível chega a -20% sobre 1.216 ms, ou seja <= 973 ms).

## Por que não há ganho no inglês

O atraso do inglês é dominado pelo ritmo dos decodes completos (o Moonshine só traz texto novo a cada decode), não pela regra de exibição. Com "só acrescenta", o texto novo só entra depois que o LocalAgreement confirma, o que custa mais um decode. Regras que mostram o texto do decode na hora (`cauda-decode`, `cauda-token`) trazem o atraso para perto de 223 a 1.060 ms, mas piscam (erasure 0,8 a 3,7).

## Limites

- A gravação usa a cadência mais rápida permitida (fração 1); x2/x3 só descartam decodes e são otimistas no atraso. A finalista x1 do critério (k0) exigiria cadência mais agressiva que a de produção se o custo do decode passar de 250 ms.
- WER do final e final p75 não são simulados (o final não depende da política); seriam guardas do A/B real, que não foi rodado.
- 4 rodadas por perfil, 8 falas FLEURS de 1 voz; 6 com atraso por palavra casado. O placar ordena, não prova.
- A sequência de textos do fraco difere da real (ver acima).

## Próximos passos (para o dono decidir)

1. Manter o inglês fora da V7 (flag só na rota do Parakeet, como já entregue).
2. Se quiser ganho no inglês, a alavanca é outra: o ritmo/custo do decode (cadência, janela, modelo), não a regra de tela. Testável com o mesmo simulador, gravando em outra cadência.
3. Ou aceitar piscar maior no inglês (decisão de produto), por exemplo `cauda-decode` x3 (p50 1.060 ms, erasure 0,82), que o orçamento atual de 0,5 veta.
