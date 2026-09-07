# gating-da-galeria Specification

## Purpose
TBD - created by archiving change galeria-gating-fechado. Update Purpose after archive.
## Requirements
### Requirement: Todo caminho de aplicar passa pela régua
Qualquer caminho que aplique um visual (tema, paleta, cursor, rastro, estúdio) SHALL validar o
acesso pelo mesmo `estadoDoItem`/`acessoAoItem` que a Loja usa.

#### Scenario: Paleta não entrega o tema custom
- **WHEN** um usuário de nível 1 aplica uma paleta da galeria
- **THEN** o tema `custom` só é ativado se o item `tema-custom` estiver liberado; caso
  contrário a UI mostra o que falta (nível/seeds), como o cadeado da Loja

#### Scenario: Item desconhecido não passa
- **WHEN** um id de item/categoria não existe no catálogo
- **THEN** o acesso é negado (fail-closed), nunca liberado por ausência

