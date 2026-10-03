## ADDED Requirements

### Requirement: Catálogo de vozes por idioma

O app SHALL listar as vozes disponíveis para o idioma de leitura, informando nome, motor (aparelho ou nuvem) e gênero
quando conhecido. O servidor MUST expor a lista em `GET /api/ai/vozes?idioma=`, e MUST informar só vozes cujo gênero
está registrado. A voz do aparelho MUST aparecer como gênero desconhecido, salvo vozes conhecidas por tabela.

#### Scenario: Lista da nuvem

- **WHEN** o app pede as vozes de `zh` com o motor Qwen3-TTS ativo
- **THEN** a resposta traz as vozes com nome, gênero e motor, e nenhuma sem gênero registrado

#### Scenario: Motor sem vozes selecionáveis

- **WHEN** o motor ativo é o Chatterbox Multilingual
- **THEN** a resposta diz que o motor não tem escolha de voz e a tela explica isso

### Requirement: Escolher e ouvir uma prévia

A pessoa SHALL poder escolher uma voz por idioma e ouvir uma prévia antes de confirmar, e escolher a velocidade da
leitura. A escolha MUST valer neste aparelho e MUST sobreviver ao fechar o app. Sem armazenamento, a escolha MUST valer
só na sessão.

#### Scenario: Prévia

- **WHEN** a pessoa toca numa voz da lista
- **THEN** uma frase curta no idioma é lida com aquela voz, sem mudar a escolha atual

#### Scenario: Escolha guardada

- **WHEN** a pessoa escolhe a voz "Serena" para chinês e reabre o intérprete
- **THEN** a leitura em chinês usa "Serena"

### Requirement: Sem clonagem de voz

O app MUST NOT aceitar nem enviar amostras de voz de pessoas para sintetizar a leitura. O servidor MUST rejeitar os campos
de clonagem e MUST validar `voz` contra o catálogo do idioma.

#### Scenario: Pedido com clonagem

- **WHEN** uma requisição de voz traz um campo de clonagem
- **THEN** o servidor rejeita o pedido

#### Scenario: Voz fora do catálogo

- **WHEN** a requisição pede uma voz que não está no catálogo do idioma
- **THEN** o servidor rejeita o pedido e não sintetiza
