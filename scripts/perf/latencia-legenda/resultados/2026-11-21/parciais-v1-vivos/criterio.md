# Critério do A/B — V1 `parciais_vivos` (change `parciais-incrementais`, tarefa 2.6)

Escrito ANTES de qualquer rodada deste A/B (e antes de qualquer rodada do Lote A).

## Hipótese

Usar o `onUpdate` do worker, cadência adaptativa por RTF/ocupação e LocalAgreement-2 (cauda provisória mostrada de imediato) reduz o atraso por palavra sem atrasar o final.

## Variantes

- A = mesmo commit com a flag `parciais_vivos` DESLIGADA; B = flag `parciais_vivos` LIGADA.
- Mesmo aparelho (este Mac, Chromium headless do Playwright; perfis `desktop` medido e `fraco` EMULADO), mesmo áudio
  (`fleurs-en-8.json` com tempo por palavra), modelos em cache. >= 10 rodadas válidas por lado, intercaladas (A, B, A, B...);
  aquecimento descartado; rodada inválida refeita (`bancada-captura.mjs --alvos --flag-do-alvo`, `ab.mjs`).

## Métrica primária

`atrasoDePalavraMs` p50 (original), por perfil: diferença pareada por fala, bootstrap 10 000, IC 95%, semente fixa.

## Efeito mínimo

-20% sobre o p50 de A (PROVISÓRIO, a confirmar pelo dono; tarefa 1.2 [D]). B só é "melhor" se o IC 95% inteiro ficar abaixo de 0 e o
efeito for >= 20% em módulo. Se o IC cruza 0: "sem diferença provada".

## Guardas (qualquer uma que falhe reprova B)

1. `fimDaFalaAteLegendaMs` p75: limite superior do IC 95% da diferença B - A <= 0 (a fila que esperava prefixo estável foi reprovada
   no ciclo 1 por atrasar o final).
2. `erasureOriginal` <= 0,2 (média das rodadas de B; NE de Arivazhagan et al.).
3. WER do final não piora (o final é intocado; qualquer diferença de texto final reprova).
4. framesLongos.n50/n100/somaMs, cpuSilencio.processoPct, rendersPorS.\* e taxa de falha dentro das tolerâncias de `slo-captura.json`
   (regra "B > A x (1 + tol) + folga piora"); memória de pico quando o perfil a expõe (o headless não expõe: fica sem base).

## Decisão

Aprovação exige métrica primária e TODAS as guardas. Resultado no perfil `fraco` emulado NUNCA aprova celular: o relatório diz que o
ganho em aparelho real depende da rodada [R]. Ligar a flag é decisão [D] do dono, só com este A/B aprovado. O critério não muda depois
de ver o número.

## Emenda 1 (21/11/2026, antes de qualquer rodada de variante)

A linha de base (`docs/auditoria/2026-11-21-linha-de-base-dos-parciais.md`) mediu erasure de 0,62 (original) e 0,47 (tradução)
no desktop, e 0,51 / 0,42 no fraco emulado. Por isso o teto absoluto de 0,2 reprovaria qualquer variante pelo que já existe
hoje. A guarda de erasure passa a ser **não piorar contra A**: o IC 95% pareado da diferença B − A de cada erasure precisa ter
limite superior ≤ +0,05. O teto de 0,2 continua como META, e o relatório informa se foi atingida.
Essa emenda é PROVISÓRIA: o dono pode decidir que a meta absoluta vale como guarda (tarefa 1.2 [D]).
Nenhuma rodada de V1, V2 ou V3 foi feita antes desta emenda.
