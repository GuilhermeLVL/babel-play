## ADDED Requirements

### Requirement: O servidor decide quanto vale
Toda escrita na economia SHALL ter seu valor derivado de um catálogo que o SERVIDOR lê. O cliente
SHALL informar apenas QUAL evento aconteceu; o `amount` e o `xp` do corpo SHALL ser ignorados.

#### Scenario: Crédito com valor inflado
- **WHEN** o cliente envia `POST /api/metrics/seeds/creditar` com `creditoId` de uma conquista real
  e `amount` maior do que a recompensa dela
- **THEN** o servidor credita o valor DA REGRA, não o do corpo
- **AND** a resposta traz o total creditado real

#### Scenario: Crédito com id inventado
- **WHEN** o `creditoId` não corresponde a nenhuma conquista do catálogo
- **THEN** o servidor responde 400 e nada é gravado

#### Scenario: Conquista ainda não cumprida
- **WHEN** o `creditoId` existe mas os contadores do servidor mostram que a condição não foi atingida
- **THEN** o servidor responde 400 e nada é gravado

### Requirement: Gasto só existe contra o catálogo
Um gasto de Seeds SHALL ser aceito apenas quando o `reason` estiver num formato conhecido, o item
referenciado existir no catálogo, e o `amount` for exatamente o preço dele.

#### Scenario: Item comprado abaixo do preço
- **WHEN** o cliente envia `amount` menor que `precoSeeds` do item citado em `reason`
- **THEN** o servidor responde 400 e a posse não é concedida

#### Scenario: Motivo em formato desconhecido
- **WHEN** o `reason` não casa com `loja:<id>` · `croma:<item>:<matiz>` · `apr-<alvo>-n<N>` ·
  `pular-rodada`
- **THEN** o servidor responde 400

#### Scenario: Exclusivo de conquista forjado como compra
- **WHEN** o `reason` cita um item com `exclusivoDe` preenchido
- **THEN** o servidor responde 400 — o que só sai de conquista nunca entra pela porta da compra

### Requirement: Não se gasta o que não se tem
O servidor SHALL conferir o saldo antes de debitar, na mesma transação do débito.

#### Scenario: Saldo insuficiente
- **WHEN** o gasto pedido é maior que `ganhas − gastas` do usuário
- **THEN** o servidor responde 402 informando quanto falta
- **AND** nenhuma linha é gravada

#### Scenario: Reenvio do mesmo gasto
- **WHEN** o mesmo `spendId` chega duas vezes
- **THEN** o segundo devolve 200 com `jaExistia: true` e não cobra de novo (comportamento atual,
  preservado)

### Requirement: A assinatura concedida é a que foi paga
O webhook SHALL conceder um plano apenas quando o pagamento confirmado corresponder à intenção
gravada, em identificador e em valor.

#### Scenario: Pagamento de um plano, intenção de outro
- **WHEN** chega `PAYMENT_CONFIRMED` cujo `payment.subscription` não é o `providerSubscriptionId`
  da assinatura gravada, ou cujo `payment.value` não bate com o preço do plano
- **THEN** o plano NÃO é promovido
- **AND** o evento é registrado para auditoria

#### Scenario: Validade deriva do ciclo pago
- **WHEN** um pagamento de assinatura confirma
- **THEN** `currentPeriodEnd` é calculado a partir do ciclo do pagamento, não de um prazo fixo

### Requirement: XP não entra por porta lateral
Todo caminho que produza XP SHALL ter teto ou verificação de propriedade no servidor.

#### Scenario: Contagem de palavras absurda
- **WHEN** `PATCH /api/sessions/:id` recebe `wordCount` acima do teto plausível de uma sessão
- **THEN** o servidor responde 400

#### Scenario: Rodada com itens de outro usuário
- **WHEN** `POST /api/exercises/rodada` cita `itemRef` que não pertence ao usuário do token
- **THEN** aqueles itens não contam para XP nem para Seeds

### Requirement: O espelho local não atesta posse em modo público
Com conta, a posse devolvida pelo servidor SHALL substituir o espelho local. Sem conta, o espelho
local continua sendo a única fonte.

#### Scenario: localStorage adulterado com conta
- **WHEN** o usuário injeta ids em `babel.loja_possuidos` e recarrega logado
- **THEN** a hidratação substitui a lista pela do servidor e os ids inventados somem

#### Scenario: Compra offline com conta
- **WHEN** uma compra foi feita e o servidor ainda não a conhece
- **THEN** ela continua visível até a próxima sincronização bem-sucedida — o espelho é otimista,
  não autoritativo

### Requirement: Destravar tudo é ferramenta de desenvolvimento
A liberação total do catálogo SHALL existir apenas em build de desenvolvimento.

#### Scenario: Chave de liberação em produção
- **WHEN** `babel.liberado` está presente num build de produção
- **THEN** ela não tem efeito nenhum sobre o estado dos itens
