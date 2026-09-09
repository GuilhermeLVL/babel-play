# dividir-arquivos-deus Specification

## Purpose
TBD - created by archiving change dividir-arquivos-deus. Update Purpose after archive.
## Requirements
### Requirement: Arquivo de mais de um dominio se divide
Um arquivo cujo conteudo serve a tres ou mais dominios SHALL ser dividido, e a ordem das chamadas de hook SHALL ser identica antes e depois.

#### Scenario: Divisao muda a ordem dos efeitos
- **WHEN** um bloco extraido nao e contiguo aos hooks vizinhos
- **THEN** ele fica no componente, com o motivo escrito

