# matriz-de-planos Specification

## Purpose
TBD - created by archiving change planos-essencial. Update Purpose after archive.
## Requirements
### Requirement: Fonte única de planos

Planos, entitlements, quotas e rótulos SHALL viver numa única matriz, num módulo puro compartilhado
entre servidor e cliente. Nenhum outro arquivo SHALL enumerar a lista de planos à mão.

#### Scenario: Servidor e cliente concordam
- **WHEN** o teste de paridade compara os planos, flags e rótulos vistos pelo servidor e pelo cliente
- **THEN** eles são idênticos, porque ambos leem a mesma matriz

#### Scenario: Plano novo entra num lugar só
- **WHEN** um plano é adicionado à matriz
- **THEN** entitlements, quotas, validação do admin e rótulos da UI passam a conhecê-lo sem nenhuma
  outra edição de lista

### Requirement: Um plano pago só

A matriz SHALL ter exatamente os planos `free`, `premium` e `selfhost`. O Premium SHALL custar R$ 19,90 por mês
ou R$ 179 por ano, e SHALL conceder nuvem gerenciada (STT e LLM), `largerModels`, `traducaoNuance`,
`vozNatural` e `interpreteAutomatico`.

#### Scenario: A matriz vendável

- **WHEN** alguém lista os planos vendáveis
- **THEN** só o Premium aparece, com preço mensal 19,90 e anual 179

### Requirement: Nome antigo vira Premium

Um nome de plano antigo (`essencial`, `pro`) vindo do banco, de uma flag, do admin ou do cache do cliente
SHALL ser lido como `premium`. Um nome desconhecido SHALL continuar degradando para `free` com log.

#### Scenario: Assinante antigo do Pro

- **WHEN** `subscriptions.plan` ainda diz `pro` e a assinatura está ativa
- **THEN** `getPlanForUser` devolve `premium`

#### Scenario: Pagamento no valor antigo

- **WHEN** o webhook confirma um pagamento de R$ 39,90 ou de R$ 19,90 de assinatura
- **THEN** o plano concedido é `premium`, ciclo mensal

### Requirement: O plano e o ciclo saem do dinheiro

`planoPeloPagamento(valor, { parcelas })` SHALL devolver o plano e o ciclo que aquele valor paga: o preço mensal
é mensal; o anual inteiro é anual; com `parcelas: 12`, a parcela do Asaas (truncada, com a diferença na última)
é anual. Qualquer outro valor SHALL devolver `null`.

#### Scenario: Doze parcelas

- **WHEN** chega a parcela de R$ 14,91 (ou a última, de R$ 14,99) de um parcelamento em 12x
- **THEN** o resultado é Premium anual

### Requirement: Uso justo por dia

O Premium SHALL ter um teto DIÁRIO de nuvem (7.200 s de STT e o teto de tokens do dia), contado no dia local da
pessoa. A reserva SHALL conferir o mês e depois o dia, devolvendo o mês quando o dia recusar. A recusa do dia
SHALL ser 429 `uso_justo_do_dia` com `Retry-After`, e SHALL NOT virar oferta de venda.

#### Scenario: Duas horas no dia

- **WHEN** um assinante Premium passa de 2 h de transcrição na nuvem no mesmo dia local
- **THEN** a próxima fala recebe 429 `uso_justo_do_dia`, o cliente pausa a nuvem, a legenda segue no aparelho
  e nenhum banner, modal ou selo de plano aparece

#### Scenario: O dia recusou

- **WHEN** a reserva do dia recusa
- **THEN** a reserva do mês feita para a mesma fala é devolvida

#### Scenario: O consumo de hoje

- **WHEN** um assinante Premium consulta `GET /api/me/uso`
- **THEN** a resposta traz `hoje` com a janela do dia, o fuso e os contadores do dia com os tetos

### Requirement: Teto mensal honesto com o custo

Até o custo da cascata barata ser medido (B7), o teto mensal de STT do Premium SHALL ser 40 h (o empate de custo
na pilha atual), com override por `PREMIUM_MONTHLY_STT_SECONDS`.

#### Scenario: Sem env

- **WHEN** `PREMIUM_MONTHLY_STT_SECONDS` não está definida
- **THEN** o teto mensal é 144.000 s

### Requirement: Degradação barulhenta, nunca silenciosa

Um plano desconhecido vindo do banco SHALL degradar para `free` no servidor com log de evento, e o
cliente SHALL NOT descartar uma resposta de entitlements por conter plano que ele não conhece.

#### Scenario: Linha de assinatura corrompida
- **WHEN** `subscriptions.plan` contém um valor fora da matriz
- **THEN** o usuário opera como `free` e o servidor registra `plano_desconhecido` — nunca um 500,
  nunca silêncio

### Requirement: Disponibilidade de STT respeita o plano

`GET /api/ai/stt/available` SHALL responder disponível somente quando houver chave no servidor E o
usuário tiver o entitlement de STT gerenciado ou uma credencial BYOK própria.

#### Scenario: Grátis não é roteado para a nuvem de STT
- **WHEN** um usuário `free` sem BYOK consulta a disponibilidade (sem pedir a nuvem de alívio)
- **THEN** a resposta é indisponível, o roteador escolhe o modelo local, e nenhum 402 acontece no
  meio da captura

#### Scenario: BYOK continua livre
- **WHEN** um usuário de qualquer plano tem credencial BYOK de STT
- **THEN** a disponibilidade responde disponível — a chave é dele, o custo é dele
