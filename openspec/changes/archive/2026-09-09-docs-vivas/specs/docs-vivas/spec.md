## ADDED Requirements

### Requirement: Existe documento de operacao separado do de instalacao

O repositorio SHALL manter um runbook que responda, para quem opera, como ler saude, log e metricas,
como parar e reiniciar sem perder escrita, e o que fazer nos sintomas ja observados.

#### Scenario: Servico responde 503 em prontidao

- **WHEN** quem opera encontra `/api/ready` em 503 e `/api/health` em 200
- **THEN** o runbook nomeia as causas possiveis e o comando que as distingue

### Requirement: A lista de verificacao antes da PR e a mesma da CI

O `CONTRIBUTING.md` SHALL listar os mesmos portoes que a integracao continua executa.

#### Scenario: Portao novo no CI

- **WHEN** um portao e acrescentado ao workflow
- **THEN** ele aparece tambem na lista do CONTRIBUTING
