# paridade-anonima Specification

## Purpose
TBD - created by archiving change modo-anonimo-em-paridade. Update Purpose after archive.
## Requirements
### Requirement: Toda rota do cliente tem resposta declarada no modo anonimo
Para cada rota `/api/...` chamada por qualquer parte do cliente, o servidor efemero SHALL implementa-la com a mesma forma do Express, OU o repositorio SHALL registrar o motivo de ela nao ser espelhada. Essa cobranca SHALL ser feita por teste, e nao por documento.

#### Scenario: Historico de XP sem conta
- **WHEN** o usuario anonimo abre a aba de progresso
- **THEN** a curva de XP e calculada sobre o IndexedDB, com a mesma forma e a mesma formula de `GET /api/metrics/xp`

#### Scenario: Rota nova sem espelho nem motivo
- **WHEN** alguem acrescenta uma chamada a uma rota que o efemero nao atende e nao a justifica
- **THEN** o teste de paridade falha citando a rota

#### Scenario: Motivo que sobreviveu ao assunto
- **WHEN** uma rota deixa de ser chamada pelo cliente mas continua na lista de motivos
- **THEN** o teste de paridade falha citando o motivo orfao

#### Scenario: Rota que exige conta
- **WHEN** o usuario anonimo tenta reetiquetar idiomas
- **THEN** a tela mostra o convite de conta; nenhuma excecao chega ao console e nenhum "501" e exibido

### Requirement: A regra que vale para as duas pontas mora no core
Quando uma regra precisa valer igual com e sem conta, ela SHALL ser extraida para uma funcao pura do core e chamada pelas duas pontas. Cada ponta SHALL manter apenas a leitura das proprias linhas.

#### Scenario: Curva de XP
- **WHEN** a formula de XP por periodo muda
- **THEN** ela muda num lugar so, e o grafico com conta e sem conta continua igual

#### Scenario: Saldo e nivel
- **WHEN** um evento novo passa a valer Seeds
- **THEN** a tela, a cobranca do servidor e o modo sem conta somam o mesmo, porque leem o mesmo mapeamento

### Requirement: Uma chave de dedup
A chave de deduplicacao de palavras SHALL ter uma unica implementacao, usada pelo cliente anonimo e pelo servidor.

#### Scenario: Migracao anonimo para conta
- **WHEN** cartoes deduplicados no navegador sao enviados ao servidor
- **THEN** o servidor nao cria nem mescla cartoes de forma diferente da que o navegador ja fez

#### Scenario: Acervo anterior a mudanca de chave
- **WHEN** o navegador ja tem cartoes gravados com a chave antiga
- **THEN** eles sao encontrados uma ultima vez e regravados na forma nova, sem duplicar

### Requirement: O modo sem conta nao herda rota que o servidor nao tem
O servidor efemero SHALL NOT atender uma rota que o Express removeu.

#### Scenario: Rota aposentada
- **WHEN** uma rota sai do Express
- **THEN** o espelho dela sai junto — senao funcionaria sem conta algo que com conta responde 404

