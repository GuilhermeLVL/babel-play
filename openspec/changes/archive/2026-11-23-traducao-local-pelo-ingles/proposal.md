## Why

A mudança `traducao-do-chines-pelo-ingles` resolveu o chinês: sem o tradutor nativo do navegador e sem consentimento de nuvem, a
fala saía transcrita e SEM tradução. O mesmo vale para japonês e coreano (anime e dramas são parte do que brasileiros
assistem), russo, árabe e outros: o `it.todo` dela dizia "ja/ko/ar/ru/hi → pt: o mesmo pivô, se houver modelo X→en".

Medido em 17/10/2026, com a mesma frase em 16 idiomas no motor real (q8): ja, ko, ru, ar, tr, pl, nl, uk, sv, fi, cs, hu, id e th
saem em inglês sensato. O hindi ("Today's weather good, let's walk in park") e o vietnamita ("I loved learning the language")
saem piores que a internet, que hoje os atende, e ficam de fora.

## What Changes

- **Uma tabela** `src/core/traducao/viaIngles.ts` (zh, ja, ko, ru, ar, tr, pl, nl, uk, sv, fi, cs, hu, id, th →
  `Xenova/opus-mt-<idioma>-en`) lida pelo worker, pelo adaptador, pela lista de download e pela cobertura da tela. Antes o chinês
  estava fixo em quatro arquivos.
- **Alvos**: pt, es, fr, it e de (o `en → alvo` que já existia). O sentido contrário (→ X) segue dependendo da internet.
- **Revisão fixada** de cada modelo novo (`revisoesDosModelos.ts`), como os demais.
- **`separarEmFrases`** entende idiomas sem maiúscula: o ponto seguido de hangul, árabe ou outra letra sem caixa separa a
  frase, e o `؟` árabe termina a frase. Sem isso, uma fala de duas frases em coreano ia inteira ao tradutor, que descarta a segunda.

## Non-Goals

- Pares entre idiomas que já têm modelo direto (pt↔es, de↔fr…): o inglês no meio piora o que o tradutor da web faz bem.
- Hindi e vietnamita (qualidade), e o tailandês sem pontuação entre frases (o modelo traduz o trecho inteiro).
- Mudar a transcrição: a do japonês e a do coreano pelo Whisper local continua a de sempre.

## Impact

- `src/core/traducao/viaIngles.ts` (novo), `opusMtLocal.ts`, `mtWorker.ts`, `modelCache.ts`, `languages.ts`,
  `revisoesDosModelos.ts`, `src/core/texto/frases.ts` e os testes (`traducao-zh-pivo`, `outros-idiomas`, `modelCache`).
- Download novo só para quem usa o idioma: ~110 MB do X→en, além do en→alvo.
