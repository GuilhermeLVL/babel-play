## ADDED Requirements

### Requirement: Um tipo por resposta, compartilhado
Toda resposta consumida pelo cliente SHALL ter um schema de saida no servidor e o tipo do cliente SHALL ser inferido dele.

#### Scenario: Campo novo no servidor
- **WHEN** o servidor passa a devolver um campo que o cliente nao declara
- **THEN** o teste de contrato da rota falha ate o tipo compartilhado ser atualizado

### Requirement: Express e efemero devolvem a mesma forma
Para cada rota implementada nos dois, o mesmo fixture SHALL produzir respostas com as mesmas chaves e tipos.

#### Scenario: Criar sessao migrada duas vezes
- **WHEN** `POST /api/sessions` recebe o mesmo `origemLocalId` duas vezes, no Express e no efemero
- **THEN** ambos devolvem `jaExistia: true` na segunda e nao criam outra sessao

### Requirement: Um envelope de erro
Toda resposta de erro SHALL ter a forma `{ error: string, code?: string, detalhes?: object }` e o cliente SHALL poder ler `code` e `detalhes`.

#### Scenario: Gasto acima do saldo
- **WHEN** `POST /seeds/gastar` responde 402
- **THEN** a tela mostra quanto falta, lido de `detalhes.falta`, e nao um erro generico

#### Scenario: Erro nao tratado
- **WHEN** um handler lanca
- **THEN** `erroGlobal` responde `{ error, code: 'erro_interno', detalhes: { requestId } }`, nunca um objeto aninhado em `error`

### Requirement: Procedencia do cartao sobrevive a edicao
`PATCH /api/vocab/:id` e `POST /api/vocab/:id/review` SHALL devolver `daTrilha`, `daAnki` e `baralhosAnki` como `GET /api/vocab`.

#### Scenario: Revisar cartao do Anki
- **WHEN** um cartao projetado de um baralho e revisado
- **THEN** a resposta mantem `daAnki: true` e o cliente nao reaplica a regua de captura a ele

### Requirement: Paginacao de notas percorre tudo
A paginacao de `GET /api/anki/decks/:id/notas` SHALL usar um cursor opaco que o cliente devolve intacto.

#### Scenario: Baralho de 3.600 notas
- **WHEN** o cliente segue `proximoCursor` ate ele ser nulo
- **THEN** recebe cada nota exatamente uma vez
