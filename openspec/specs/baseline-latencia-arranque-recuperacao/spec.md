# baseline-latencia-arranque-recuperacao Specification

## Purpose
TBD - created by archiving change baseline-latencia-arranque-recuperacao. Update Purpose after archive.
## Requirements
### Requirement: Escrita confirmada nao se perde no restart
Sob carga de escrita e morte abrupta do processo, toda resposta 2xx SHALL corresponder a uma linha persistida.

#### Scenario: kill -9 sob carga
- **WHEN** o processo morre com SIGKILL durante `POST /api/exercises/rodada` a 10 conexoes
- **THEN** o numero de linhas novas e maior ou igual ao numero de respostas 2xx, e `PRAGMA integrity_check` devolve `ok`

