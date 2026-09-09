## ADDED Requirements

### Requirement: Prontidao separada de vivacidade

O servidor SHALL responder numa rota se o PROCESSO esta vivo e noutra se ele CONSEGUE ATENDER.

#### Scenario: Banco indisponivel

- **WHEN** a instancia esta viva mas nao consegue consultar o banco
- **THEN** `/api/ready` responde 503 e `/api/health` continua descrevendo o processo
