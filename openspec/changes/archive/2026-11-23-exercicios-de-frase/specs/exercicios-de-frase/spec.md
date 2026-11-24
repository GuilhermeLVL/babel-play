## ADDED Requirements

### Requirement: A frase escrita é corrigida no aparelho

O app SHALL corrigir a frase escrita nos exercícios de retradução e de ditado de frase sem IA, sem rede
e sem custo, comparando-a com o original palavra a palavra e devolvendo uma nota de 0 a 100.

#### Scenario: Frase igual

- **WHEN** a pessoa escreve a frase igual ao original
- **THEN** todas as palavras ficam como certas e a nota é 100

#### Scenario: Caixa e pontuação

- **WHEN** a resposta difere do original só por maiúsculas ou pontuação
- **THEN** a nota é 100

#### Scenario: Acento configurável

- **WHEN** a resposta difere só por acento e a opção "Não contar acentos como erro" está ligada (padrão)
- **THEN** a nota é 100
- **WHEN** a opção está desligada
- **THEN** a palavra sem o acento aparece como trocada

#### Scenario: Palavra trocada, faltando ou a mais

- **WHEN** a resposta tem uma palavra diferente, uma a menos ou uma a mais
- **THEN** o diff marca a palavra como trocada (com o que foi escrito), faltando ou a mais, e a nota cai
  na proporção das palavras certas

#### Scenario: Erro de digitação de uma letra

- **WHEN** uma palavra difere do original por uma única letra
- **THEN** ela conta como trocada, mas vale meio ponto na nota

#### Scenario: Idioma sem espaço

- **WHEN** o idioma é japonês, chinês ou tailandês
- **THEN** a comparação é por caractere, ignorando espaço e pontuação

### Requirement: Só entram frases que servem ao exercício

A seleção SHALL usar apenas frases de tamanho adequado, sem duplicata, e a retradução SHALL exigir
tradução disponível e diferente do texto.

#### Scenario: Tamanho

- **WHEN** a frase tem menos de 4 ou mais de 14 palavras (menos de 4 ou mais de 30 caracteres em idioma sem espaço)
- **THEN** ela não é elegível

#### Scenario: Retradução sem tradução

- **WHEN** a fala não tem tradução, ou a tradução é igual ao texto
- **THEN** ela não é elegível para a retradução, mas pode ser para o ditado de frase

### Requirement: Retradução

O jogo `retraducao` SHALL mostrar a tradução de uma frase e pedir que a pessoa a escreva no idioma-alvo.

#### Scenario: Conferir

- **WHEN** a pessoa escreve e aperta Enter ou "Conferir"
- **THEN** a tela mostra a nota, o resumo (certas, trocadas, faltando, a mais), cada palavra com marca e
  texto alternativo, e o original

#### Scenario: Dica

- **WHEN** a pessoa pede "Mostrar dica"
- **THEN** a tela revela a primeira letra de cada palavra, o combo zera e o item fica marcado como com dica

#### Scenario: Ver o original

- **WHEN** a pessoa pede "Ver o original"
- **THEN** a frase encerra, o item conta como não consegui e o diff é mostrado

### Requirement: Ditado de frase

O jogo `ditadoDeFrase` SHALL falar a frase inteira por voz sintetizada e pedir que a pessoa a digite.

#### Scenario: Ouvir de novo

- **WHEN** a pessoa aperta o botão de ouvir
- **THEN** a frase é falada, o botão passa a dizer "Ouvir de novo" e não há limite de repetições

#### Scenario: Sem voz

- **WHEN** o aparelho não tem voz para o idioma
- **THEN** o jogo aparece bloqueado no catálogo, em vez de abrir sem som

### Requirement: O resultado não depende só de cor

O diff SHALL distinguir certa, trocada, faltando e a mais por marca, forma e texto alternativo, além de cor.

#### Scenario: Leitor de tela

- **WHEN** o resultado é mostrado
- **THEN** cada palavra tem um rótulo acessível ("certa: …", "trocada: você escreveu … o certo é …",
  "faltou: …", "a mais: …") e a nota é anunciada

### Requirement: Maestria e XP só por resultado

Os dois jogos SHALL pontuar pelo resultado da escrita (nota >= 80 conta como acerto), sem relógio e sem
bônus por rapidez.

#### Scenario: Sem pressão de tempo

- **WHEN** a pessoa demora para escrever
- **THEN** nada expira, e o tempo só entra no relatório como medida

#### Scenario: Sem nota de SRS

- **WHEN** a rodada termina
- **THEN** nenhuma nota de agendamento é gravada, porque a fala não é um cartão do baralho

### Requirement: Tela vazia amigável

Quando não houver frases elegíveis, a tela SHALL dizer o motivo e oferecer a saída.

#### Scenario: Nenhuma frase

- **WHEN** a rodada abre sem itens
- **THEN** a tela explica que faltam frases com tradução (ou frases, no ditado) e mostra o botão "Voltar"
