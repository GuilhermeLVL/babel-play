## ADDED Requirements

### Requirement: Toda fase do redesign deixa o app funcional e o gate verde

Cada commit de fase SHALL passar por `scripts/redesign/gate.sh` (typecheck, lint, unitários,
build, E2E nos três viewports contra banco descartável, integridade de testes) antes de ser
considerado pronto. Nenhum arquivo de teste é removido e nenhum `.skip`/`.only` novo é introduzido.

#### Scenario: Fase entregue

- **WHEN** uma fase do plano é dada como concluída
- **THEN** o gate está verde, a contagem de testes unitários não é menor que a da fase anterior e
  as evidências da fase existem em `docs/redesign/evidencias/<fase>/`

### Requirement: Nenhuma superfície funcional some com o redesign

O `docs/redesign/INVENTARIO-FUNCIONAL.md` SHALL listar cada elemento visível ou acionável por tela
com a coluna "antes" marcada na fundação. A PR da fase que redesenha a tela SHALL marcar a coluna
"depois" de cada linha; uma linha sem "depois" bloqueia o merge.

#### Scenario: Elemento esquecido

- **WHEN** a PR de uma tela deixa uma linha do inventário sem a coluna "depois"
- **THEN** a fase não é considerada concluída até a linha ser marcada com prova (E2E, unitário,
  evidência ou verificação manual registrada)

### Requirement: A suíte E2E nunca escreve no banco de trabalho

`npm run test:e2e` e `npx playwright test` SHALL subir o servidor com `DATABASE_URL` apontando para
um arquivo descartável, apagado antes de cada corrida, numa porta própria (3301).
`scripts/e2e/preparar-banco.mjs` SHALL recusar subir se `DATABASE_URL` apontar para `data/babel.db`
ou estiver vazio.

#### Scenario: Comando digitado à mão contra o banco real

- **WHEN** alguém roda a suíte com `DATABASE_URL=file:./data/babel.db`
- **THEN** o servidor não sobe e a saída explica o motivo e o comando correto
