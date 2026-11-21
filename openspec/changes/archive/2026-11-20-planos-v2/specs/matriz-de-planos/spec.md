## ADDED Requirements

### Requirement: Um plano pago só

A matriz SHALL ter exatamente os planos `free`, `premium` e `selfhost`. O Premium SHALL custar R$ 19,90 por mês
ou R$ 179 por ano, e SHALL conceder nuvem gerenciada (STT e LLM), `largerModels`, `traducaoNuance` e
`vozNatural`.

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

## REMOVED Requirements

### Requirement: Plano Essencial

**Reason**: o Essencial e o Pro deram lugar ao Premium (decisão do dono, 29/09/2026).
**Migration**: linhas `essencial`/`pro` viram `premium` na migração 0041; a leitura tolerante cobre o resto.

### Requirement: A tela de planos mostra os três

**Reason**: há um plano pago só; a tela nova é o C7 desta change.
**Migration**: a tela mostra Grátis e Premium.
