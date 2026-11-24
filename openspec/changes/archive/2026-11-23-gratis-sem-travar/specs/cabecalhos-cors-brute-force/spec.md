## ADDED Requirements

### Requirement: Isolamento de origem ligado de fábrica

O servidor SHALL isolar a origem sem configuração nenhuma, para que o navegador dê `SharedArrayBuffer` e as threads do
WASM aos motores locais. Sem `CROSS_ORIGIN_ISOLATION`, ou com `1`, `true`, `on` ou `completo`, o servidor SHALL
emitir no documento, nos scripts de worker e nas respostas da API:

- `Cross-Origin-Opener-Policy: same-origin`;
- `Cross-Origin-Embedder-Policy: credentialless`;
- `Document-Isolation-Policy: isolate-and-credentialless`.

Com `dip`, o servidor SHALL emitir só o `Document-Isolation-Policy`. Com `0`, `false`, `off` ou `desligado`, SHALL
NOT emitir o COEP nem o DIP. Um valor desconhecido SHALL cair no modo completo, com aviso no log.

#### Scenario: Deploy sem a variável

- **WHEN** o servidor sobe sem `CROSS_ORIGIN_ISOLATION` e serve o documento
- **THEN** a resposta traz COOP `same-origin`, COEP `credentialless` e DIP `isolate-and-credentialless`

#### Scenario: Desligado pelo operador

- **WHEN** `CROSS_ORIGIN_ISOLATION=0`
- **THEN** a resposta não traz COEP nem DIP, e o COOP `same-origin` do helmet continua como antes

#### Scenario: Erro de digitação

- **WHEN** `CROSS_ORIGIN_ISOLATION=dpi`
- **THEN** o modo é o completo e o log registra `isolamento_valor_desconhecido`
