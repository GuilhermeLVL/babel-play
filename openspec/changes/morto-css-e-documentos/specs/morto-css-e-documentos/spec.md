## ADDED Requirements

### Requirement: Classe de estilo tem consumidor, e classe usada existe
Uma classe escrita a mao em `src/index.css` SHALL ter ao menos um consumidor no codigo, e uma classe usada no codigo SHALL estar declarada.

#### Scenario: Classe que nao produz CSS
- **WHEN** um componente usa uma classe que ninguem declarou
- **THEN** ou a declaracao entra, ou a classe sai do componente — nao fica um nome que nao faz nada
