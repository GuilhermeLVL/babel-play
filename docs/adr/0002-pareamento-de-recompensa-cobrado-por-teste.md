# ADR 0002 — Cobrar por teste o pareamento entre XP e Seeds, em vez de unificar as tabelas

- **Data:** 2026-09-09
- **Estado:** aceito
- **Change OpenSpec:** `adr-pareamento-de-recompensa`

## Contexto

A auditoria de 2026-09-07 (achado A55) e a medição da Fase 2 apontaram "cálculo de seeds
duplicado" em três lugares. Ao abrir os três, a duplicação é de outra natureza:

| lugar                                                             | o que faz                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `src/core/learning/xp.ts:63` (`PESOS_SEEDS`) e `:20` (`PESOS_XP`) | **a fonte única dos valores**                                   |
| `src/core/learning/economia.ts:31` (`REGRAS`)                     | pareia peso de XP com peso de Seeds para a tela "como eu ganho" |
| `src/lib/progress.ts:76-126` (`deriveProgress`)                   | pareia os mesmos pesos para os cartões de missão do Hub         |
| `src/components/views/Conquistas.tsx:230`                         | terceira leitura, para a tela de conquistas                     |

Os valores **não** estão duplicados: os três importam `PESOS_XP` e `PESOS_SEEDS` do núcleo. O que
se repete é o **pareamento** — qual peso de XP anda junto de qual peso de Seeds em cada evento. E
o pareamento é fácil de errar: `revisaoCerta` vale `PESOS_XP.revisao + PESOS_XP.revisaoCerta` de
XP e só `PESOS_SEEDS.revisaoCerta` de Seeds, porque a revisão certa acumula os dois de XP e um só
de Seeds. Hoje os três lugares escrevem essa soma à mão, e nada os obriga a concordar.

## Decisão

**As tabelas continuam separadas, e um teste cobra que elas concordem.**

`REGRAS` (núcleo) é a tabela canônica de pareamento. `deriveProgress` e a tela de conquistas
continuam com a sua estrutura própria — cada uma tem campos que as outras não têm (`view`,
`pending`, `done` numa; `como`, `teto`, `unidade` na outra) — e um teste cruza as três, exigindo
que, para cada evento presente em mais de uma, o par (XP, Seeds) seja o mesmo.

## Alternativas consideradas

**Unificar numa estrutura só.** Exigiria que `REGRAS` carregasse `view`, `pending` e `done`, que
são estado de tela, dentro do núcleo isomórfico — que não tem DOM nem React por decisão
(`src/core/tsconfig.json`). O núcleo passaria a conhecer a navegação do cliente para economizar
três linhas de pareamento. Custo maior que o problema.

**`deriveProgress` ler `REGRAS` e mapear.** Os ids não coincidem (`capture` × `captura`,
`practice` × `revisaoCerta`), então seria preciso uma tabela de tradução de ids — que é
exatamente o tipo de indireção que esconde a divergência que se quer evitar.

**Deixar como está.** É o que havia, e a auditoria mediu o resultado: três lugares que ninguém
compara. Uma alteração de economia que passe por dois deles e esqueça o terceiro não falha em
lugar nenhum.

## Consequências

Melhora: uma mudança de economia que desalinhe as tabelas falha na suíte, com o nome do evento e
os dois valores. O custo de adicionar um evento novo continua sendo tocar em dois arquivos — o
teste diz isso na hora, em vez de a tela dizer meses depois.

Piora: há um teste a mais para manter, e ele precisa ser atualizado quando um evento legitimamente
tiver pares diferentes em contextos diferentes. Nesse caso a exceção entra no teste **com o motivo
escrito**, que é justamente o registro que faltava.

Fica proibido: escrever um valor numérico de XP ou de Seeds fora de `PESOS_XP`/`PESOS_SEEDS`.

## Como isto é cobrado

`tests/economia-pareamento.test.ts`: para cada evento que aparece em mais de uma das três tabelas,
o par (XP, Seeds) tem de ser idêntico. Um evento novo em `REGRAS` sem par em `deriveProgress` é
aceito (nem todo ganho vira missão); um par **divergente** falha.
