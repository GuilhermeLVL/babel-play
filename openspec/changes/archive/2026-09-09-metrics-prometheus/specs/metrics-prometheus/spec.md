## ADDED Requirements

### Requirement: Metricas sem explosao de cardinalidade

A label de rota SHALL ser o padrao casado pelo roteador, nunca o caminho pedido.

#### Scenario: Duas requisicoes com ids diferentes

- **WHEN** chegam `GET /api/sessions/a` e `GET /api/sessions/b`
- **THEN** existe UMA serie `/api/sessions/:id` e nenhum id aparece no corpo do scrape

### Requirement: A rota de metricas nao se anuncia quando desligada

Com a instrumentacao desligada, o servidor SHALL responder a `/metrics` como responderia a qualquer
caminho inexistente, sem revelar que a rota existe.

#### Scenario: `METRICS_ENABLED` ausente

- **WHEN** alguem pede `/metrics`
- **THEN** a resposta e 404, igual a de qualquer caminho desconhecido
