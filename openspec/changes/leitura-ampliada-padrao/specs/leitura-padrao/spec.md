## ADDED Requirements

### Requirement: Primeira visita em Leitura ampliada
Na primeira visita (sem preferência gravada) o app SHALL carregar no perfil de exibição
`senior` com escala de fonte `lg`.

#### Scenario: Preferência do usuário vence
- **WHEN** existe `babel.age_profile` gravado (local ou vindo do servidor)
- **THEN** o valor gravado é usado e o padrão novo não interfere
