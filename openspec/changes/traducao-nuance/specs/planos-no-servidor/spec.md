## ADDED Requirements

### Requirement: O nível da tradução pedido passa pela capacidade do plano

`POST /api/ai/mt` SHALL aceitar `nivel` com os valores `rapida` e `nuance`. O servidor SHALL decidir o nível
pelo entitlement `traducaoNuance`, resolvido no servidor, e MUST NOT decidir pelo nome do plano. Quem não tem
`traducaoNuance` SHALL receber a rápida, sem erro, qualquer que seja o pedido. Sem `nivel` (a legenda ao
vivo), o nível SHALL ser a rápida também para quem tem a capacidade, salvo com `NUANCE_AO_VIVO=1`. O valor
`polimento` e qualquer outro nome MUST ser 400, sem chamar provedor.

#### Scenario: Plano pago sem a capacidade

- **WHEN** uma conta de plano pago cujos entitlements não têm `traducaoNuance` pede `nivel: 'nuance'`
- **THEN** a tradução sai pelo modelo da rápida, com status 200

#### Scenario: Quem tem a Nuance toca numa frase

- **WHEN** quem tem `traducaoNuance` pede `nivel: 'nuance'`
- **THEN** a cascata começa pelo modelo marcado para a nuance e cai na rápida se ele falhar

#### Scenario: Legenda ao vivo

- **WHEN** quem tem `traducaoNuance` pede uma tradução sem `nivel` e `NUANCE_AO_VIVO` não é `1`
- **THEN** a tradução sai pelo modelo da rápida

#### Scenario: Nuance ao vivo ligada

- **WHEN** `NUANCE_AO_VIVO=1` e quem não tem `traducaoNuance` pede sem `nivel`
- **THEN** a tradução continua saindo pelo modelo da rápida

#### Scenario: Pedir o polimento frase a frase

- **WHEN** o corpo do `/mt` traz `nivel: 'polimento'`
- **THEN** a resposta é 400 e nenhum provedor é chamado

#### Scenario: Nenhum modelo marcado para a nuance

- **WHEN** o registro de provedores não marca nenhum modelo com o nível `nuance`
- **THEN** o pedido de nuance é atendido pelos modelos da rápida
