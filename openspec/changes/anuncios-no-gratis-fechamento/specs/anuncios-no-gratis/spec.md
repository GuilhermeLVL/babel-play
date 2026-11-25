## ADDED Requirements

### Requirement: A flag de anúncios só liga com prova e parecer

A flag `anuncios` SHALL permanecer desligada até existirem o relatório do teste real com o isolamento ligado e o parecer jurídico anexado
em `docs/`, e a política de idade SHALL ser conferida contra o parecer.

#### Scenario: Sem relatório

- **WHEN** não há relatório de bancada com o anúncio carregado sob COOP/COEP
- **THEN** a flag `anuncios` não é ligada em nenhum ambiente

### Requirement: Nenhuma oferta para menor

Toda oferta de plano SHALL ter uma linha na tabela momento × oferta × teste, e nenhuma oferta, preço ou texto "peça aos seus pais" SHALL
aparecer para perfil protegido.

#### Scenario: Fim de cota no perfil do menor

- **WHEN** a cota acaba num perfil protegido
- **THEN** a tela diz só o que continua funcionando, sem preço nem convite de assinatura

### Requirement: Cobrança conferida antes de abrir a venda

Antes de `venda_planos_v4` abrir, o dono SHALL registrar em `docs/LANCAMENTO.md` a data da conferência de que não há cobrança nos valores
dos planos encerrados e de que o sandbox cobra o Plus mensal; o anual SHALL seguir desligado até o parecer.

#### Scenario: Valor de plano encerrado

- **WHEN** o webhook recebe o valor de um plano encerrado da v3
- **THEN** o plano concedido é o do valor pago, e a conferência anterior garante que não há cobrança real nesse valor
