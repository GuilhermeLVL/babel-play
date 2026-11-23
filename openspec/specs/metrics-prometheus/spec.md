# metrics-prometheus Specification

## Purpose

TBD - created by archiving change metrics-prometheus. Update Purpose after archive.

## Requirements

### Requirement: Metricas sem explosao de cardinalidade

A label de rota SHALL ser o padrao casado pelo roteador, nunca o caminho pedido. Todo label vindo do cliente (classe de aparelho,
idioma, motor, modelo, fase da carga) SHALL ser validado contra uma lista fechada; o valor fora da lista SHALL virar `outro`, e
nenhum texto livre do cliente SHALL criar uma serie. Os histogramas de latencia da legenda e de carga de modelo SHALL ter no
maximo as series do produto das listas fechadas.

#### Scenario: Duas requisicoes com ids diferentes

- **WHEN** chegam `GET /api/sessions/a` e `GET /api/sessions/b`
- **THEN** existe UMA serie `/api/sessions/:id` e nenhum id aparece no corpo do scrape

#### Scenario: Classe de aparelho inventada

- **WHEN** um lote `v: 2` chega com `classe` fora dos 5 perfis
- **THEN** o valor vira `outro` (ou o lote e recusado) e nenhuma serie com o texto enviado aparece no scrape

### Requirement: A rota de metricas nao se anuncia quando desligada

Com a instrumentacao desligada, o servidor SHALL responder a `/metrics` como responderia a qualquer
caminho inexistente, sem revelar que a rota existe.

#### Scenario: `METRICS_ENABLED` ausente

- **WHEN** alguem pede `/metrics`
- **THEN** a resposta e 404, igual a de qualquer caminho desconhecido
