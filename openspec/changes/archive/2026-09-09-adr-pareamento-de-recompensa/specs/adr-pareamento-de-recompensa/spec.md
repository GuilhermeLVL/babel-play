## ADDED Requirements

### Requirement: O par XP-Seeds nao diverge entre telas
Um evento presente em mais de uma tabela de recompensa SHALL ter o mesmo par (XP, Seeds).

#### Scenario: Excecao legitima
- **WHEN** uma tela anuncia um par que nao corresponde a uma regra
- **THEN** a excecao entra no teste com o motivo escrito
