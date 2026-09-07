## ADDED Requirements

### Requirement: A conta e definida pelo schema
O conjunto de tabelas exportadas e apagadas por titular SHALL ser derivado de toda tabela do schema que possua a coluna `user_id`, mais as linhas de `usage_counters` com prefixo `u:<id>`.

#### Scenario: Tabela nova com user_id
- **WHEN** uma migration adiciona uma tabela com coluna `user_id` sem atualizar a ordem de exclusao
- **THEN** o teste de invariante falha no CI citando o nome da tabela

### Requirement: Exclusao deixa zero linhas do titular
Apos `DELETE /api/me`, nenhuma tabela SHALL conter linha cujo `user_id` seja o id do titular ou `u:<id>`.

#### Scenario: Usuario com dado em todas as tabelas
- **WHEN** um usuario possui ao menos uma linha em cada tabela com `user_id` e chama `DELETE /api/me`
- **THEN** a resposta lista cada tabela com o numero de linhas removidas e uma contagem posterior devolve zero em todas

### Requirement: Exportacao contem tudo o que a exclusao apaga
`GET /api/me/exportar` SHALL devolver uma chave por tabela do conjunto acima, mesmo quando vazia.

#### Scenario: Chaves da exportacao
- **WHEN** o titular exporta a conta
- **THEN** o JSON contem `seed_credits`, `credit_purchases`, `credit_spends`, `presencas`, `anki_media` e `anki_note_media` alem das tabelas ja exportadas

### Requirement: Historico de revisao nao vive no navegador
O cliente SHALL NOT persistir historico de revisao (cartao, palavra, nota, data) em `localStorage`.

#### Scenario: Revisao concluida
- **WHEN** o usuario conclui uma revisao na tela de estudo
- **THEN** o registro vai para `POST /api/vocab/:id/review` (ou o efemero) e nenhuma chave `reviewLogs` e escrita
