- [x] 1.1 tabela `nome | arquivo:linha | categoria | acao | evidencia` para os 33 itens
- [x] 1.2 remocoes aplicadas, bateria verde
- [x] 1.3 divergencias registradas para a Fase 3

## Resultado (2026-09-09)

33 itens apontados pelo knip, verificados um a um contra o repositorio inteiro:

| categoria | quantos | acao |
|---|---:|---|
| (a) morto de verdade | 8 | removidos, com o que so eles usavam (cascata) |
| (b) re-export de barril | 19 | mantidos, com o consumidor real anotado |
| (c) copia sem consumidor | 2 | `ehPlanoDeAssinatura` e `temDadosLocais`: o re-export saiu, a origem ficou |
| (c) DIVERGENTES | 2 | `ExerciseResult` e `LeituraAnki`: nao sao o mesmo tipo — Fase 3 |
| (d) so testes usam | 2 | mantidos (`bootStatus`, ja documentado no arquivo) |
| (e) named + default | 2 | o named saiu; os consumidores usam o default |

Removidos: `calculateMultiplier` (gameFeel), `LearningMetric` + `MetricSource`, `Flashcard` +
`CefrBadge` (contract), `isModelCached`, `bytesFaltando` (modelCache), `StatPill` (ShellBits, com
quatro imports que ficaram orfaos). Saldo: **10 insercoes, 155 delecoes**.

knip depois: 8 exports / 13 tipos / 0 duplicados — e os 21 sao exatamente os barris, os dois
divergentes e os dois de teste.

## As duas divergencias (entram na Fase 3 como ADR)

1. **`ExerciseResult`** (`src/core/learning/contract.ts:144` x `server/db/repositories/exerciseResults.ts:8`).
   Nao sao o mesmo tipo: o do contrato e um DTO de resultado (`kind` de seis valores, `correct`
   booleano); o do servidor e a LINHA da tabela (`$inferSelect`), com `score` real guardando TRES
   unidades conforme `exercise_kind`. Unificar exige decidir se o DTO vira o `insert` ou some.
2. **`LeituraAnki`** (`src/data/api.ts:494` x `server/import/anki.ts:73`). A copia do cliente e
   subconjunto vencido: faltam `baralhos`, `truncado`, `totalNoArquivo`, `mapaDeMidia`. A remocao
   ja estava pendente na change arquivada `contratos-alinhados-nas-tres-pontas` (tarefa 3.3), e
   depende da reescrita da tela de import (`motor-anki-mapeador`).
