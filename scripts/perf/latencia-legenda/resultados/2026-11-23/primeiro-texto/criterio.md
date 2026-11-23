# Critério do A/B: primeiro texto na tela (bimodalidade do desktop)

Escrito e commitado ANTES de qualquer rodada do A/B (as rodadas de diagnóstico, em pasta fora do git, não contam e já terminaram).

## Diagnóstico que motiva a variante (medido, não é rodada do A/B)

No desktop, `primeiroTextoNaTelaMs` é bimodal (~1,0 s ou ~3,2 a 3,4 s). Em 6 rodadas de diagnóstico (3 de cada modo) a carga do modelo é idêntica (`sttProntoMs` ~0,9 s). O que muda:
o 1º parcial (~0,8 s de fala, 10 752 a 12 288 amostras) ou volta com texto (modo rápido: "all the more all", 1,0 s) ou volta VAZIO (`descartado: true`, o filtro de alucinação do worker; modo lento).
No vazio, a captura deveria devolver a cota e liberar o próximo parcial sem esperar o espaçamento de 2 s (`devolverCota` em `systemAudio.ts`), mas o adaptador de fonte do sistema
(`fontesDeAudio.ts`, `onPartialAudio`) descarta o valor de retorno do pipeline: `devolverCota` nunca roda e o 2º parcial só sai 2 s depois (~2,2 s a mais).

## Variantes

- `antes`: `origin/main` no commit do dia, `npm run build:estatica`.
- `depois`: o mesmo mais UMA mudança: o adaptador do sistema repassa o retorno de `sysHandlers.onPartialAudio`.
- Mesmo áudio (`fleurs-en-8.json`, padrão da bancada), modelos em cache, rodadas INTERCALADAS (`--alvos`), aquecimento descartado, rodada inválida refeita.
  Perfis: `desktop` (medido) e `fraco` (CPU 4x, EMULADO; não aprova celular). >= 10 rodadas VÁLIDAS por braço e perfil.

## Métrica primária

`primeiroTextoNaTelaMs`: mediana das rodadas válidas de cada braço. Diferença `depois − antes` das medianas com IC 95% por bootstrap das RODADAS (10 000 reamostragens, semente 20261123).
Efeito mínimo: -20% sobre a mediana de `antes`. Decisão no desktop (onde a bimodalidade existe): `depois melhor` só se o IC fica inteiro abaixo de 0 E o efeito é >= 20%; `depois pior` se o IC fica inteiro acima de 0;
senão `sem diferença provada`. O fraco emulado (já estável em ~1,9 s) é SÓ NÃO-REGRESSÃO nesta métrica: o limite superior do IC da diferença deve ser <= +100 ms. Informativo: fração de rodadas com 1º texto >= 2,5 s.

## Guardas (qualquer uma que falhe reprova `depois`)

1. `fimDaFalaAteLegendaMs` p75 (`ab.mjs`, pareado por fala): limite superior do IC 95% de `depois − antes` <= +30 ms, em cada perfil.
2. SLO da bancada: `comparar.mjs --ambiente local-darwin` sobre o resultado de `depois` não reprova (inclui frames longos, CPU, renders/s, `primeiroTextoNaTelaMs`).
3. Taxa de falha de legenda de `depois` <= a de `antes`.

## Decisão

APROVADO = primária no desktop `depois melhor` E não-regressão no fraco E todas as guardas. REPROVADO = alguma guarda falha ou primária pior. SEM DIFERENÇA PROVADA = demais casos; a mudança então não é aprovada por latência.
Nenhum limiar muda depois de ver o número.
