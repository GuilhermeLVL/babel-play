## ADDED Requirements

### Requirement: SIGTERM nao corta escrita em curso

Ao receber SIGTERM ou SIGINT o servidor SHALL parar de aceitar conexoes, drenar as em curso dentro
de um teto, fechar o banco com checkpoint e sair; estourado o teto, SHALL sair com codigo diferente
de zero.

#### Scenario: Sinal durante uma escrita

- **WHEN** chega SIGTERM enquanto uma escrita esta em curso
- **THEN** a escrita termina, o processo sai com 0 e `PRAGMA integrity_check` devolve `ok`
