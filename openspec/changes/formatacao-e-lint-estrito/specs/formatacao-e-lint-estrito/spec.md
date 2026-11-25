## ADDED Requirements

### Requirement: Formato e ordem de import sao automaticos

O que esta no indice SHALL ser formatado e ter os imports ordenados antes do commit.

#### Scenario: Import fora de ordem

- **WHEN** alguem acrescenta um import no meio do bloco
- **THEN** o `lint-staged` o reordena antes do commit

### Requirement: A CI barra arquivo alterado fora do padrao (revisao de 25/11/2026)

A CI SHALL rodar `prettier --check` nos arquivos alterados pelo PR e SHALL falhar quando algum estiver fora do padrao, sem exigir a reformatacao do repositorio inteiro.

#### Scenario: Commit sem o hook

- **WHEN** um PR traz um `.ts` mal formatado (commit com `--no-verify` ou edicao na web)
- **THEN** o job de formato falha e aponta o arquivo

#### Scenario: Arquivo antigo fora do diff

- **WHEN** um arquivo fora do padrao existe na `main` mas o PR nao o altera
- **THEN** o job de formato nao o acusa

#### Scenario: Excecoes preservadas

- **WHEN** o PR altera `public/i18n/*.json`, `src/data/i18n/*`, `src/index.css` ou uma migracao gerada
- **THEN** o job os ignora, como o `.prettierignore` ja faz

### Requirement: Passada geral e PR de so formatacao

A passada geral do Prettier SHALL ir num PR que muda apenas formatacao, sem alterar comportamento.

#### Scenario: Equivalencia

- **WHEN** o PR de formatacao e aberto
- **THEN** `git diff -w` nao mostra mudanca de codigo, e typecheck, typecheck estrito, lint, testes e build passam como na `main`

#### Scenario: Conflito com outras frentes

- **WHEN** ha outro PR aberto tocando os mesmos arquivos
- **THEN** a passada geral nao e feita ate ele ser integrado ou rebaseado
