## ADDED Requirements

### Requirement: O lobby de Jogar veste o protótipo sem mudar o contrato

O lobby SHALL manter os mesmos nomes acessíveis, rotas e comportamentos (facetas na URL, gating por
jogo com motivo, Partida Rápida, Recordes) ao adotar o cabeçalho único, o painel escuro e as pílulas
em ink.

#### Scenario: Facetas continuam funcionando

- **WHEN** a pessoa abre "Fonte" e marca um recorte
- **THEN** a linha "jogando com" e a grade refletem o mesmo conjunto, e a URL `/jogar?…` persiste
