## ADDED Requirements

### Requirement: Toda rota privada de escrita passa por limitador

O servidor SHALL montar um limitador de taxa antes de toda rota privada que escreve, e a
classificacao SHALL ser lida da montagem em tempo de execucao, nao do texto dos arquivos.

#### Scenario: Rota nova de escrita sem limitador

- **WHEN** um router novo com verbo de escrita e montado depois do `authMiddleware` e fora de
  qualquer `app.use([...], limitador)`
- **THEN** `tests/seguranca/matriz-de-rotas.test.ts` falha, nomeando a rota

#### Scenario: Rota publica nova

- **WHEN** um router e montado ANTES do `authMiddleware`
- **THEN** a suite falha ate a rota entrar na allowlist de publicas com a razao escrita
