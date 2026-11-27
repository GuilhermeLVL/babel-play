## ADDED Requirements

### Requirement: As palavras são destacadas pela força no vocabulário

Com a flag `leitor_destaque_vocab` ligada, o leitor SHALL destacar as palavras do texto: as novas (sem cartão) numa só cor, com intensidade
crescente conforme a frequência da palavra; as que estão aprendendo (força 1 a 3) em gradiente, mais forte na força 1; e as conhecidas, a
força 4 e as ignoradas SHALL ficar sem cor. O destaque MUST NOT alterar o DOM do livro nem o texto selecionável.

#### Scenario: Palavra nova

- **WHEN** a pessoa abre um capítulo com uma palavra sem cartão
- **THEN** a palavra aparece na cor das novas, com sublinhado tracejado

#### Scenario: Palavra em aprendizado

- **WHEN** duas palavras têm cartão, uma com força 1 e outra com força 3
- **THEN** a de força 1 tem destaque mais forte que a de força 3

#### Scenario: Palavra conhecida ou ignorada

- **WHEN** a palavra está marcada "Já sei", "Ignorar" ou tem força 4
- **THEN** ela não recebe destaque

#### Scenario: Navegador sem a API de destaque

- **WHEN** `CSS.highlights` não existe
- **THEN** o capítulo abre normalmente, sem destaque e sem erro

### Requirement: Legenda e densidade

O leitor SHALL oferecer uma legenda de 3 itens (nova, aprendendo, conhecida), a densidade de palavras novas do capítulo e a porcentagem de
palavras conhecidas antes de abrir o capítulo.

#### Scenario: Antes de abrir o capítulo

- **WHEN** a pessoa vê o capítulo no sumário
- **THEN** a porcentagem de palavras conhecidas aparece, calculada no aparelho

### Requirement: Cartão da palavra de 1 toque

Tocar numa palavra destacada SHALL abrir um cartão com "Não sei", forças 1 a 4, "Já sei", "Ignorar" e "Revisar agora"; cada ação SHALL
atualizar o destaque da palavra em todo o capítulo em até 100 ms. A força MUST ser derivada do cartão (FSRS) e não gravada como status à parte.

#### Scenario: Marcar "Já sei"

- **WHEN** a pessoa toca "Já sei" no cartão de uma palavra nova
- **THEN** a palavra perde o destaque em todas as ocorrências do capítulo

#### Scenario: Escolher força 2

- **WHEN** a pessoa escolhe "2" para uma palavra nova
- **THEN** o cartão é criado com a estabilidade inicial da força 2 e a palavra passa ao destaque de aprendendo

#### Scenario: Flag da força na legenda desligada

- **WHEN** `forca_na_legenda` está desligada
- **THEN** o destaque do leitor continua funcionando, pois a força é calculada por `forcaDoCartao`

### Requirement: Paginar NÃO marca como conhecida por padrão

A opção "marcar como conhecidas as palavras não clicadas ao virar a página" SHALL nascer desligada, avisar o que faz, afetar só palavras novas
não clicadas acima de um piso de frequência, poder ser desfeita ("Desfazer última página") e MUST NOT estar disponível para perfil protegido.

#### Scenario: Padrão

- **WHEN** a pessoa vira a página sem ter ativado a opção
- **THEN** nenhuma palavra muda de status

#### Scenario: Opção ligada

- **WHEN** a opção está ligada e a pessoa vira a página tendo clicado em duas palavras
- **THEN** as duas clicadas não são marcadas, e as novas comuns não clicadas passam a conhecidas, com opção de desfazer

#### Scenario: Perfil protegido

- **WHEN** o perfil é protegido
- **THEN** a opção não aparece

### Requirement: Cinco cartões no fim do capítulo

Ao terminar o capítulo, a pessoa SHALL poder praticar até 5 palavras que destacou naquele capítulo.

#### Scenario: Fim do capítulo

- **WHEN** a pessoa chega ao fim do capítulo com palavras em aprendizado
- **THEN** é oferecida uma prática de até 5 cartões, sem iniciar sozinha
