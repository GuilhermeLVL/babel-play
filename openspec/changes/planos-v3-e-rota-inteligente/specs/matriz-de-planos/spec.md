> **Reescrita em 25/11/2026.** O texto de 21/10 fixava os preços da v3 (Essencial R$ 9,90, Premium R$ 19,90, Ao Vivo R$ 39,90). A v4
> (`docs/specs/2026-10-24-planos-v4.md`, aprovada em 24/10) os substituiu: Plus R$ 14,90 por mês ou R$ 149 por ano, Família e Pro em
> breve, Essencial, Premium e Ao Vivo com venda encerrada pela flag `venda_planos_v4`. **Não sincronizar a versão antiga com
> `openspec/specs/matriz-de-planos/`.** Os números vêm sempre de `src/core/planos.ts`; a spec não os repete além dos que o dono fixou.

## MODIFIED Requirements

### Requirement: Um plano pago só

A matriz SHALL ter os planos `free`, `plus`, `familia`, `pro4` e `selfhost` à venda ou em breve, e SHALL manter `essencial`, `premium` e
`aovivo` apenas para quem já os tem (venda encerrada, `encerradoPor: [venda_planos_v4]`). Preços do Plus: R$ 14,90 por mês e R$ 149 por
ano. Todo valor cobrável (mensal, anual, parcela) SHALL ser distinto dos demais, porque o webhook identifica o plano pelo valor pago.

#### Scenario: A matriz vendável

- **WHEN** alguém lista os planos vendáveis com a flag `venda_planos_v4` ligada
- **THEN** aparecem o Plus (R$ 14,90 e R$ 149) e nenhum dos planos da v3

#### Scenario: Venda fechada

- **WHEN** a flag `venda_planos_v4` está desligada
- **THEN** `/api/billing/assinar` recusa o Plus com 503 `plano_indisponivel`, antes de falar com o Asaas

#### Scenario: Família e Pro em breve

- **WHEN** `venda_familia` ou `venda_pro4` está desligada
- **THEN** o plano aparece como "em breve", sem preço, e `/api/billing/assinar` o recusa

#### Scenario: Pagar um valor com a intenção de outro plano

- **WHEN** a intenção gravada é Plus e o valor confirmado é de um plano encerrado da v3
- **THEN** o plano concedido é o do valor pago, nunca o da intenção

## ADDED Requirements

### Requirement: Capacidades por plano

Cada plano SHALL declarar na matriz: `semAnuncios`, nuvem por trechos, `sttAoVivo`, Nuance, intérprete automático e nível de voz. O
código SHALL decidir por essas capacidades; comparar o nome do plano fica restrito à matriz e à cobrança.

#### Scenario: Plano pago novo na admissão

- **WHEN** uma conta do Plus pede nuvem
- **THEN** entra na faixa de pagantes da admissão

#### Scenario: Cliente e servidor iguais

- **WHEN** a matriz ganha um campo
- **THEN** os entitlements do cliente o recebem sem cópia manual em outro arquivo

### Requirement: Cotas mensais por nível de serviço

A matriz SHALL declarar segundos mensais por trechos e ao vivo por plano (`sttSegundosMes`, `sttAoVivoSegundosMes`), e as cotas da IA
de estudo (`explicacoesMes`, `resumosMes`). O uso SHALL ser contado em métricas separadas, com reserva antes do provedor e estorno na falha.

#### Scenario: Reserva no nível certo

- **WHEN** um trecho de 30 s ao vivo é reservado e o provedor falha
- **THEN** os 30 s voltam ao contador ao vivo e o contador por trechos não muda

#### Scenario: A tela lê o restante

- **WHEN** a tela pede `/api/me/uso`
- **THEN** recebe o restante do mês por nível

### Requirement: Troca de plano

Quem já assina SHALL poder trocar de plano sem cancelar. A troca SHALL valer no próximo ciclo, sem pro-rata.

#### Scenario: Subir de um plano encerrado para o Plus

- **WHEN** um assinante do Essencial pede o Plus
- **THEN** a assinatura passa ao valor novo no próximo vencimento e o plano muda quando o pagamento é confirmado

### Requirement: Nada prometido que o servidor recusa

A tela de Planos SHALL mostrar só capacidades que a matriz concede e que a rota correspondente atende, com os números vindos da matriz.

#### Scenario: Ao vivo desligado

- **WHEN** a flag `stt_ao_vivo` está desligada
- **THEN** nenhuma tela promete texto durante a fala nem vende plano por ele

#### Scenario: Voz natural desligada

- **WHEN** a flag `voz_natural` está desligada
- **THEN** o site público e o app escrevem "em breve" no item de voz natural, nunca o número de caracteres
