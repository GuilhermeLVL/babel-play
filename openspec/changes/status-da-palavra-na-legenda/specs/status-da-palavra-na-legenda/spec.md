## ADDED Requirements

### Requirement: A legenda e o leitor pintam pela força 1 a 4

Com a flag `forca_na_legenda` ligada, a etiqueta de uma palavra com cartão na legenda, na janela flutuante, na folha da frase e no
leitor SHALL ser derivada da força de `forcaDoCartao` (estabilidade, repetições e esquecimentos), e MUST NOT depender do relógio:
força 1 vira `salva`, força 2 e 3 viram `aprendendo`, força 4 fica sem tinta. A precedência SHALL continuar: cartão do caderno,
depois marcação ("Já sei", "Ignorar"), depois o ponto "nova para você". A flag MUST nascer desligada e, desligada, as etiquetas
MUST ser as de hoje. A força MUST NOT ser editável nem gravada por esta funcionalidade.

#### Scenario: Faixas

- **WHEN** um cartão tem estabilidade 0 (sem revisão), 2,9, 3, 20,9 ou 21 dias e nenhum esquecimento
- **THEN** a etiqueta é `salva`, `aprendendo`, `aprendendo`, `aprendendo` e silenciosa, respectivamente

#### Scenario: Esquecimentos rebaixam também aqui

- **WHEN** um cartão de estabilidade 40 dias tem 3 esquecimentos
- **THEN** a força é 3 e a etiqueta é `aprendendo`, a mesma "Força 3 de 4" do catálogo

#### Scenario: Passar o tempo sem revisar

- **WHEN** um cartão de força 4 fica 60 dias sem revisão
- **THEN** a etiqueta continua silenciosa até uma nova revisão mudar a estabilidade ou os esquecimentos

#### Scenario: Flag desligada

- **WHEN** `forca_na_legenda` está desligada
- **THEN** a legenda e o leitor usam a régua de três estados de hoje e o resultado é idêntico ao da versão anterior

#### Scenario: Palavra marcada sem cartão

- **WHEN** a palavra não tem cartão e está marcada "Já sei"
- **THEN** a etiqueta é `conhecida` e a força não entra (a marcação continua sendo outra coisa)

### Requirement: A promoção é automática e silenciosa

Quando uma revisão mudar a força de um cartão, a etiqueta da palavra na legenda e no leitor SHALL ser atualizada na próxima releitura
do índice do caderno, sem ação da pessoa, sem escrita nova no banco e sem toast, som, contagem de dias seguidos ou meta. A mesma
regra MUST valer para o rebaixamento por esquecimento.

#### Scenario: Subir de nível

- **WHEN** a pessoa revisa um cartão e a estabilidade passa de 2,9 para 3,1 dias
- **THEN** a força vai de 2 para 3, a etiqueta continua `aprendendo`, a gaveta passa a mostrar "Força 3 de 4: familiar" e nenhuma linha é gravada em `palavras_marcadas`

#### Scenario: Chegar à força 4

- **WHEN** a estabilidade passa de 20,9 para 21 dias
- **THEN** a palavra deixa de ser pintada na legenda e no leitor, sem aviso

#### Scenario: Esquecer

- **WHEN** a pessoa erra uma palavra de força 4 e a estabilidade cai abaixo de 21 dias
- **THEN** a palavra volta a ser pintada na próxima releitura do índice

### Requirement: A etiqueta continua acessível sem depender de cor

A força MUST estar disponível como atributo `data-forca` (1 a 4) nos nós de palavra e como texto acessível "Força N de 4: nome" na
gaveta e no cartão da palavra. A mudança MUST NOT alterar o que a região `aria-live` da legenda anuncia, e as tintas `salva` e
`aprendendo` MUST manter contraste de pelo menos 4,5:1 nos dois temas e nos fundos da janela flutuante.

#### Scenario: Leitor de tela na legenda

- **WHEN** a legenda recebe uma fala nova com palavras de forças diferentes
- **THEN** a região `aria-live` anuncia só o texto da fala, sem anunciar etiquetas nem forças

#### Scenario: Gaveta da palavra

- **WHEN** a pessoa abre a gaveta de uma palavra com força 3
- **THEN** ela mostra "Força 3 de 4: familiar" por texto, com os tracinhos ocultos para o leitor de tela
