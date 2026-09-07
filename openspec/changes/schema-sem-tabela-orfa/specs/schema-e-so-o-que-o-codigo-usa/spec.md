## ADDED Requirements

### Requirement: Toda tabela tem leitor e escritor
Cada tabela do schema SHALL ter ao menos um caminho de escrita e um de leitura no servidor, provados por teste.

#### Scenario: Tabela provisionada para o futuro
- **WHEN** uma migration cria uma tabela sem repositorio que a use
- **THEN** o teste de invariante falha citando a tabela

### Requirement: Coluna morta nao e escrita
Uma coluna marcada como obsoleta SHALL NOT receber valores do cliente nem do servidor.

#### Scenario: Cartao criado
- **WHEN** um cartao e criado por qualquer caminho
- **THEN** `frequency` permanece nula

### Requirement: Dificuldade calculada ou ausente
Se a faceta "dificeis" existir na interface, `difficulty_score` SHALL ser recalculado apos cada rodada para os cartoes jogados; se nao existir, a coluna, as rotas e a faceta SHALL ser removidas juntas.

#### Scenario: Rodada com erros
- **WHEN** o usuario erra um cartao em uma rodada
- **THEN** o `difficulty_score` desse cartao deixa de ser nulo e a faceta "dificeis" passa a poder seleciona-lo
