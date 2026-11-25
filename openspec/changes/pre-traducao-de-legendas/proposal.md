## Why

A importação de legendas (`importar-legendas`) transforma um .srt/.vtt/.ass numa sessão de texto: uma fala por linha, SEM tradução.
Quem estuda com a legenda de uma série só vê a tradução quando abre cada fala, e a tradução local (Bergamot/opus-mt no aparelho)
atende uma fala por vez, no ritmo da tela. A pesquisa do core (X5) apontou o atalho: traduzir a legenda INTEIRA de uma vez, no
aparelho, em segundo plano, para a pessoa estudar a legenda bilíngue sem esperar fala a fala. O texto já existe e o motor local já
existe; falta o laço de lote, com progresso honesto e cancelamento, e a garantia de que nada disso sai do aparelho.

## What Changes

- **Núcleo puro** (`src/core/traducao/preTraducaoDeLegendas.ts`): divide as falas em lotes, traduz uma fala por vez por uma função
  injetada, cede a vez entre lotes (a tela não trava), conta o que foi feito de verdade (traduzidas, repetidas, vazias, falhas),
  reporta progresso, aceita cancelamento e devolve o parcial. Aplica a política de legenda segura (`legenda-segura-para-menores`)
  no original e na tradução de cada fala.
- **Adaptador local** (`src/gateway/preTraducaoLocal.ts`): embrulha SÓ um tradutor local (`opus-mt-local`, `bergamot-local`).
  Recusa qualquer outro provedor ao ser criado e descarta toda resposta cujo `engine` não seja local. Nunca passa `nuvemPrimeiro`
  nem `escalarSeRuim`. Modelo ainda baixando vira "aguardando o motor", nunca nuvem.
- **Flag nova `pre_traducao_de_legendas`**, DESLIGADA, sem regra de plano (migrações PG 0032 e SQLite 0072). Ligar é ato do dono.

## Capabilities

### New Capabilities

- `pre-traducao-de-legendas`: tradução em lote das falas de uma legenda importada, só no aparelho, cancelável, com progresso
  honesto e a legenda segura aplicada.

## Non-Goals

- Tela: botão, barra de progresso e coluna bilíngue ficam para a etapa seguinte (precisam de textos i18n e do A/B de UX). Esta
  change entrega o núcleo, o adaptador e a flag.
- Qualquer caminho de nuvem, mesmo com consentimento: a legenda é material do usuário e a retenção é zero.
- Guardar a tradução no servidor. A tradução fica na sessão do aparelho, como o texto importado.
- Melhorar o motor: a qualidade é a do Bergamot/opus-mt já medidos (`traducao-local-por-direcao`).

## Impact

- `src/core/traducao/preTraducaoDeLegendas.ts`, `src/gateway/preTraducaoLocal.ts` (novos), `src/core/planos.ts` (constante),
  `PainelFlags.tsx`, `docs/flags.md`, migrações PG 0032 / SQLite 0072 com snapshots e journals, `schema-pg-baseline.test.ts`.
- Sem mudança de servidor além da semente da flag; sem custo de nuvem.
