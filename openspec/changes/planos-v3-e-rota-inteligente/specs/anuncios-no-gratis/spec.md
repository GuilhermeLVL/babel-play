## ADDED Requirements

### Requirement: Anúncio só onde a política permite

Todo espaço de anúncio SHALL consultar a função pura `podeMostrar(...)`. Ela SHALL negar quando: o plano
tem `semAnuncios`; o perfil é protegido; o aparelho é o Quest; há captura ativa, intérprete aberto ou
rodada em andamento; a conta tem menos de três dias; não há consentimento de anúncios; ou, para
intersticial, o último foi há menos de cinco minutos.

#### Scenario: Assinante

- **WHEN** o plano concede `semAnuncios`
- **THEN** nenhum espaço renderiza nem pede rede

#### Scenario: Perfil protegido

- **WHEN** a pessoa é menor, não declarou idade ou está sem conta
- **THEN** nenhum anúncio é mostrado

#### Scenario: Durante a captura

- **WHEN** há captura ativa ou o intérprete está aberto
- **THEN** nenhum anúncio é mostrado, nem premiado

### Requirement: O premiado é sempre escolha

O anúncio premiado SHALL começar só por ação da pessoa, dizer antes o que ela ganha e quanto dura, e
entregar a recompensa ao terminar. Recusar SHALL NOT tirar nada.

#### Scenario: Seeds no fim da rodada

- **WHEN** a pessoa escolhe ver o anúncio no fim da rodada e assiste até o fim
- **THEN** recebe as Seeds anunciadas, creditadas pelo servidor

### Requirement: Amostra de nuvem com teto global

A amostra de nuvem do Grátis, quando existir, SHALL ser concedida só como recompensa, com teto diário
por pessoa e teto global diário; ao atingir qualquer teto a captura SHALL seguir no aparelho.

#### Scenario: Teto global atingido

- **WHEN** o teto global do dia acabou
- **THEN** a oferta de amostra não aparece

### Requirement: Flag desligada não pede nada a terceiros

Com a flag `anuncios` desligada, o app SHALL NOT carregar script, quadro ou pixel de rede de anúncios, e
a CSP SHALL continuar sem host externo em `script-src`.

#### Scenario: Estado de fábrica

- **WHEN** a flag está desligada
- **THEN** o teste da CSP estreita passa sem alteração

### Requirement: Identificação e saída

Todo anúncio SHALL ser marcado como patrocinado e SHALL ter ao lado a porta "Sem anúncios" para os
planos. Nenhum anúncio SHALL ficar colado a um botão de ação.

#### Scenario: Linha patrocinada na Biblioteca

- **WHEN** a folha de uma gravação está aberta no celular
- **THEN** a linha patrocinada não fica ao alcance do botão "Abrir"
