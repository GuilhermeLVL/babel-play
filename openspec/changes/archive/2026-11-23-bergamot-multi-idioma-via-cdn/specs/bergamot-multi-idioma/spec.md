## ADDED Requirements

### Requirement: Bergamot traduz X→inglês dos idiomas publicados no CDN

Com os modelos publicados em `VITE_BERGAMOT_MODELOS_URL`, o tradutor local SHALL traduzir `X → inglês` com o Bergamot nos
idiomas de `paresDoCdn` e SHALL usá-lo como primeira perna de `X → alvo` pelo inglês quando o Opus-MT já cobria o idioma.

#### Scenario: japonês para inglês com o CDN no build

- **WHEN** o build define `VITE_BERGAMOT_MODELOS_URL` e a fala é `ja → en`
- **THEN** o worker do par `ja-en` carrega do CDN e a tradução sai com o motor `bergamot-local`

#### Scenario: japonês para português

- **WHEN** a fala é `ja → pt`
- **THEN** a primeira perna é do Bergamot e `en → pt` do Opus-MT, que já vai baixando enquanto o Bergamot carrega

#### Scenario: sem o CDN no build

- **WHEN** `VITE_BERGAMOT_MODELOS_URL` não está definida
- **THEN** só o `pt → en` usa o Bergamot e os demais idiomas seguem no Opus-MT, como antes

#### Scenario: o modelo do par não carrega

- **WHEN** o download ou a integridade do `ja-en` falha
- **THEN** o Opus-MT assume o par inteiro (ja→en→alvo) sem erro na tela e os outros pares do Bergamot continuam valendo

#### Scenario: saindo do inglês

- **WHEN** a direção é `en → X` ou `es → pt`
- **THEN** o Bergamot não é usado
