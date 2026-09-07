# economia Specification

## Purpose
Descreve a economia como ela funciona HOJE: Seeds derivadas, nunca armazenadas; credito idempotente com valor decidido pelo servidor; gasto autorizado por catalogo; creditos comprados em razao propria. Escrita a partir do codigo em 2026-09-07 (auditoria, secao 2.5); cada requirement cita o `arquivo:linha` que o implementa. As lacunas de posse e de creditos de passe/drop estao nas changes `posse-de-cosmeticos-uma-regua` e `seeds-e-creditos-fonte-unica`.

## Requirements

### Requirement: O saldo de Seeds e derivado, com a mesma formula nos dois lados
O saldo SHALL ser `max(0, ganhas - gastas)`, onde `ganhas` sai de `seedsGanhasDeEventos` (`src/core/learning/xp.ts:112`) com os pesos de `PESOS_SEEDS` (`xp.ts:61`) sobre os eventos do perfil (`computeProfile`, `server/db/repositories/metrics.ts`), e `gastas` e a soma de `seed_spends`. O servidor calcula em `economiaDoUsuario` (`metrics.ts:471`); o cliente reproduz em `deriveProgress` (`src/lib/progress.ts:106-109`). Nenhuma tabela guarda saldo.

#### Scenario: Rodada terminada
- **WHEN** uma rodada e gravada em `exercise_results`
- **THEN** nenhum credito e escrito; o saldo sobe porque a proxima leitura do perfil conta o evento

### Requirement: Todo credito e idempotente e tem valor decidido pelo servidor
`POST /api/metrics/seeds/creditar` (`server/routes/metrics.ts:156`) SHALL aceitar so `creditoId` que o servidor reconhece: `conquistaDoCreditoId` (`src/core/economiaAutoridade.ts:127`) decide a conquista e o valor; `seed_credits` e unico por `creditoId` (`server/db/repositories/economia.ts`), entao repetir o pedido nao credita duas vezes. O cliente so informa o id (`src/App.tsx:457` → `src/data/api.ts:882`).

#### Scenario: Conquista repetida
- **WHEN** o mesmo `creditoId` chega duas vezes
- **THEN** a segunda resposta e `repetido` e o saldo nao muda

#### Scenario: Lacuna conhecida — passe e drop
- **WHEN** o cliente envia `passe:t1:cofre-dN-K` ou `drop-partida-bau-<ts>`
- **THEN** hoje o servidor responde 400 porque `seedsDoCofreDoPasse` (`economiaAutoridade.ts:134`) nao tem chamador (achado A03; change `seeds-e-creditos-fonte-unica`)

### Requirement: Todo gasto e autorizado por catalogo e saldo
`POST /api/metrics/seeds/gastar` (`server/routes/metrics.ts:83`) SHALL passar por `autorizarGasto` (`src/core/economiaAutoridade.ts:67`), que valida o `reason` e o preco de catalogo, e depois pelo saldo derivado; grava em `seed_spends` com `spendId` idempotente. O unico debito vivo na tela e `pular-rodada` (`src/components/views/Play.tsx:1101`).

#### Scenario: Saldo insuficiente
- **WHEN** o saldo derivado e menor que o preco
- **THEN** a resposta e 402 e nada e gravado

### Requirement: Presenca e creditada uma vez por dia
`registrarPresencaHoje` (`src/App.tsx:443`) SHALL chamar `POST /api/metrics/presenca` (`server/routes/metrics.ts:122`), que insere em `presencas` com chave por dia; o valor entra pelo peso de presenca em `PESOS_SEEDS`.

#### Scenario: Duas aberturas no mesmo dia
- **WHEN** o app monta duas vezes no mesmo dia
- **THEN** existe uma linha em `presencas` para o dia

### Requirement: Creditos comprados sao uma razao propria, so no servidor
O saldo de Creditos SHALL ser `comprado - gasto` sobre `credit_purchases` (estado `pago`) e `credit_spends` (`server/db/repositories/credits.ts`); a compra nasce `pendente` em `POST /api/billing/comprar` (`server/routes/billing.ts:71`) e vira `pago` pelo webhook (spec `pagamento-nunca-perdido`); o gasto passa por `autorizarGastoDeCredito` (`src/core/economiaAutoridade.ts:115`) em `POST /api/billing/gastar` (`billing.ts:139`).

#### Scenario: Compra confirmada pelo Asaas
- **WHEN** o webhook confirma o `providerPaymentId` de uma compra pendente
- **THEN** a compra fica `paga` e o saldo de Creditos sobe pelo valor da compra, uma vez so

### Requirement: Posse de cosmeticos hoje tem tres reguas
Ate `posse-de-cosmeticos-uma-regua` chegar, o leitor SHALL tratar a posse como decidida por tres reguas paralelas: `estadoDoItem` (`src/lib/loja.ts:105-126`), `desbloqueado` (`src/lib/desbloqueios.ts:83-89`) e a do Cofre (na branch `gamificacao-v2-wip`); os setters de tema/particulas/cursores gravam localStorage sem checar posse (achado A10). Este requirement documenta o estado real, nao o desejado.

#### Scenario: Estado atual
- **WHEN** um item da loja e comprado com Seeds
- **THEN** a posse deriva de `seed_spends.reason` no servidor (`server/db/repositories/seedSpends.ts`) e de `babel.loja_possuidos` no cliente, sem reconciliacao automatica (achado A12)
