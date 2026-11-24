## ADDED Requirements

### Requirement: A cota de quem paga vale pelo período pago

Para quem tem um período pago em vigor (assinatura que concede um plano pago e tem `currentPeriodEnd`), o servidor SHALL
contar a cota do plano numa janela derivada do PERÍODO PAGO, e não do mês do calendário: no mensal, uma janela por
período; no anual (à vista ou 12x), 12 janelas iguais ao longo do período. Um pagamento MUST liberar no máximo uma cota
mensal (doze no anual). Grátis, convidado, self-host, teste de 14 dias e plano sem período MUST seguir no mês do
calendário. A reserva MUST continuar decidida e contabilizada numa única escrita condicional e falhar fechada.

#### Scenario: Um pagamento mensal que atravessa duas viradas de mês

- **WHEN** o Plus é pago com vencimento em 29/11 (acesso até 03/01) e a pessoa esgota a cota em 30/11
- **THEN** em 15/12 e em 02/01 a reserva é recusada, porque a janela é a mesma do período pago

#### Scenario: Cancelar não zera a cota

- **WHEN** a pessoa esgota a cota e cancela fora dos 7 dias (o fim do período passa a ser o próximo vencimento), ou o
  admin muda o fim do período
- **THEN** a janela não muda e a reserva segue recusada, porque a âncora da janela só é gravada por um pagamento

#### Scenario: A renovação paga abre a janela seguinte

- **WHEN** o pagamento seguinte confirma e estica o fim do período
- **THEN** a janela muda e a cota mensal recomeça

#### Scenario: O anual tem doze cotas

- **WHEN** a pessoa paga o anual
- **THEN** ao longo dos 370 dias existem exatamente 12 janelas de cota

#### Scenario: Grátis e plano do admin

- **WHEN** a conta é Grátis, ou tem plano concedido pelo admin sem período
- **THEN** a janela é o mês do calendário, como antes

## MODIFIED Requirements

### Requirement: O webhook do Asaas e idempotente, server-authoritative e com estado

O webhook SHALL ser montado antes do auth (`server.ts:150-151`), validar o token, marcar o evento em `billing_events` uma vez por id e aplicar via `aplicarEvento` (`server/lib/billingEventos.ts`), que decide pelo valor cobrado e pelo `externalReference`, nunca pelo corpo enviado pelo cliente. Todo evento fica com `estado` (`aplicado`, `nao-aplicado`, `ignorado`) e `motivo`; os pendentes aparecem em `GET /api/admin/billing/pendentes` e podem ser reaplicados por `POST /api/admin/billing/reprocessar/:id` (`server/routes/admin.ts`). Um valor pago que não casa com a matriz MUST conceder no máximo o plano da cobrança registrada, e só se cobrir o preço dele; caso contrário o evento MUST ficar `nao-aplicado`. Um estorno ou chargeback MUST revogar só o período concedido pela cobrança devolvida. A reconciliação diária MUST olhar só as assinaturas relevantes, em rodízio determinístico com custo limitado por passada, e reaplicar também estornos e chargebacks sem evento.

#### Scenario: Evento repetido

- **WHEN** o Asaas reenvia o mesmo `event.id`
- **THEN** a resposta e `repetido` e nada e reaplicado (`tests/integration/billing-webhook.test.ts`)

#### Scenario: Avulso que chega antes da compra

- **WHEN** um `PAYMENT_CONFIRMED` referencia um `providerPaymentId` que ainda nao existe em `credit_purchases`
- **THEN** o evento fica `nao-aplicado` com motivo, aparece na fila do admin e credita quando reprocessado apos a compra existir (`tests/integration/rbac-admin-endpoints.test.ts`)

#### Scenario: Juros no boleto do plano assinado

- **WHEN** o pagamento do Plus chega com R$ 15,37 (preço + multa) numa linha que já foi do Premium
- **THEN** concede o Plus, nunca o Premium gravado de outra cobrança

#### Scenario: Estorno de uma cobrança antiga

- **WHEN** a mensalidade de outubro é estornada e a de novembro segue paga
- **THEN** o plano continua até o fim do período de novembro e o evento fica `ignorado` com o porquê

#### Scenario: Estorno com webhook perdido

- **WHEN** a cobrança está `REFUNDED` no Asaas e nenhum evento de estorno foi registrado
- **THEN** a reconciliação em `apply` reaplica o estorno pelo mesmo `aplicarEvento`, uma vez só
