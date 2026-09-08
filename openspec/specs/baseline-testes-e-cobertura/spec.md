# baseline-testes-e-cobertura Specification

## Purpose
TBD - created by archiving change baseline-testes-e-cobertura. Update Purpose after archive.
## Requirements
### Requirement: Cobertura medida por modulo
A suite SHALL produzir cobertura v8 por arquivo via `npm run test:cov`, e `scripts/cobertura-por-modulo.mjs` SHALL agrupa-la por diretorio.

#### Scenario: Modulo sem teste
- **WHEN** um diretorio tem arquivos com zero linhas cobertas
- **THEN** a coluna "sem teste" do relatorio os conta

