## ADDED Requirements

### Requirement: Entrada de rota e validada por schema antes de qualquer efeito

Toda rota SHALL validar corpo, parametros de caminho e cabecalhos que usa, por schema, antes de
falar com o banco ou com um provedor externo.

#### Scenario: Campo desconhecido no corpo do chat

- **WHEN** o corpo de `POST /api/ai/proxy/chat/completions` traz um campo fora do schema
- **THEN** a resposta e 400 e nenhuma chamada e feita ao provedor

### Requirement: Erro de provedor externo nao chega ao cliente

A resposta de erro SHALL trazer um codigo estavel e o `requestId`, nunca o corpo ou a mensagem do
provedor.

#### Scenario: Provedor de traducao responde 500

- **WHEN** o upstream falha com corpo proprio
- **THEN** o cliente recebe `code: 'provedor_indisponivel'` e o texto do upstream aparece so no log
