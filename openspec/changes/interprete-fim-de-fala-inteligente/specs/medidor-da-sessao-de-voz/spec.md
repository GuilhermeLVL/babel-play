## ADDED Requirements

### Requirement: Tempo por etapa em cada fala

O app SHALL medir, em cada fala do intérprete, o tempo de cada etapa (fechamento do VAD, STT, tradução e início da
voz), o motor usado em cada uma e o custo estimado. O app MUST agregar por sessão e MUST mostrar p50 e p95 no
`/diagnostico`. O medidor MUST NOT guardar nem enviar texto da conversa.

#### Scenario: Fala medida

- **WHEN** uma fala é reconhecida, traduzida e lida
- **THEN** o medidor registra o tempo de cada etapa, o motor e o custo, sem o texto

#### Scenario: Diagnóstico

- **WHEN** a pessoa abre o `/diagnostico` depois de uma conversa
- **THEN** a tela mostra p50 e p95 do tempo até a voz e a soma do custo estimado da sessão

### Requirement: Telemetria só com metadados

O envio ao servidor (`/api/metricas/captura`) SHALL conter somente números, nomes de motor e códigos de motivo, em
lotes, como o envio atual, e MUST respeitar a preferência de privacidade da pessoa.

#### Scenario: Privacidade desligada

- **WHEN** a pessoa desliga a telemetria
- **THEN** o medidor continua funcionando no aparelho e nada é enviado
