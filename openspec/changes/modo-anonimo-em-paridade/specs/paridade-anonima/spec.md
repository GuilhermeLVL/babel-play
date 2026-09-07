## ADDED Requirements

### Requirement: Toda rota do cliente tem resposta declarada no modo anonimo
Para cada rota chamada pelo cliente, o efemero SHALL implementa-la com a mesma forma do Express ou responder 501 com `codigo: 'EXIGE_CONTA'` que a tela traduz em convite de conta.

#### Scenario: Historico de XP sem conta
- **WHEN** o usuario anonimo abre a aba de progresso
- **THEN** a curva de XP e calculada sobre o IndexedDB, com a mesma forma de `GET /api/metrics/xp`

#### Scenario: Rota que exige conta
- **WHEN** o usuario anonimo tenta reetiquetar idiomas
- **THEN** a tela mostra o convite de conta; nenhuma excecao chega ao console e nenhum "501" e exibido

### Requirement: Perfil calculado pela mesma funcao
`computeProfile` (servidor) e `metricas` (efemero) SHALL derivar de uma unica funcao pura do core, de modo que emitam os mesmos campos.

#### Scenario: Campo novo no perfil
- **WHEN** um campo e adicionado a funcao pura
- **THEN** Express e efemero passam a emiti-lo sem alteracao em cada um

### Requirement: Uma chave de dedup
A chave de deduplicacao de palavras SHALL ter uma unica implementacao, usada pelo cliente anonimo e pelo servidor.

#### Scenario: Migracao anonimo → conta
- **WHEN** cartoes deduplicados no navegador sao enviados ao servidor
- **THEN** o servidor nao cria nem mescla cartoes de forma diferente da que o navegador ja fez

### Requirement: Rotas da leve nao renderizam tela vazia
Na edicao leve, rotas de conta ou de cobranca SHALL redirecionar ao hub com aviso.

#### Scenario: URL de perfil na leve
- **WHEN** o usuario abre `/perfil` na edicao leve
- **THEN** ve o hub e um aviso de que a tela nao existe nesta edicao
