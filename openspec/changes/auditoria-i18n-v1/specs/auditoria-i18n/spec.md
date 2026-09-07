## ADDED Requirements

### Requirement: A auditoria de i18n termina com veredito medido
A auditoria SHALL fechar as fases 4 a 7 do seu proprio plano (arquitetura contra o padrao da industria, performance e custo, licenciamento, veredito) antes de qualquer achado virar change; cada achado cita `arquivo:linha` ou comando reproduzivel com saida.

#### Scenario: Fase sem execucao
- **WHEN** uma fase nao foi executada
- **THEN** o relatorio diz "NAO EXECUTADA" e nenhum veredito e afirmado para ela

#### Scenario: Achado com evidencia
- **WHEN** um achado entra em `RESUMO.md`
- **THEN** ele aponta o arquivo e a linha, ou o comando e a saida, que o sustentam
