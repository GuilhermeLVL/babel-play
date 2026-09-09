## ADDED Requirements

### Requirement: E2E em tres viewports
Cada fluxo critico com tela SHALL ter um cenario Playwright que passa em 375, 768 e 1280 px de largura.

#### Scenario: Elemento fora da tela no mobile
- **WHEN** um controle do fluxo fica inalcancavel em 375 px
- **THEN** o projeto `mobile-375` falha e os outros dois passam
