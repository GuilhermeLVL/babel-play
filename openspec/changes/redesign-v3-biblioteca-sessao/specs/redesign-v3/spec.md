## ADDED Requirements

### Requirement: As abas da Sessão são um tablist acessível

As seções da Sessão SHALL ser expostas como `tablist`/`tab` (via `Abas`), navegáveis por setas,
com a mesma ordem nos três perfis e a aba de métricas atrás de "Mais" em Kids/Sênior.

#### Scenario: Troca por teclado

- **WHEN** a aba "Jogos" está focada e a pessoa aperta a seta para a direita
- **THEN** a próxima aba fica selecionada e a URL `/sessao/<id>/<aba>` acompanha
