## ADDED Requirements

### Requirement: Um toque legenda a aba atual, sem o seletor

A extensão SHALL capturar o som da aba ativa quando a pessoa tocar em "Legendar esta aba" no popup, sem exibir o seletor de
compartilhamento do navegador, e SHALL manter a aba audível.

#### Scenario: Primeira captura

- **GIVEN** a extensão instalada e uma aba com som
- **WHEN** a pessoa abre o popup e toca em "Legendar esta aba"
- **THEN** o selo "ON" aparece no ícone, nenhum seletor do navegador abre e o app abre em `/capturar?fonte=extensao` se não estava aberto

#### Scenario: A aba continua audível

- **WHEN** a captura está no ar
- **THEN** a pessoa continua ouvindo a aba normalmente

#### Scenario: Parar

- **WHEN** a pessoa toca em "Parar" ou fecha a aba capturada
- **THEN** a captura termina, o selo some e o app recebe `parou`

### Requirement: O áudio chega ao app em PCM 16 kHz por um contrato versionado

A extensão SHALL entregar quadros de 100 ms em PCM Int16 mono a 16 kHz, em mensagens `{ fonte: 'frasy-extensao', versao: 1,
tipo: 'pcm', seq, t, sr, pcm }`, e o app SHALL recusar qualquer mensagem que não passe em `validarDaExtensao`.

#### Scenario: Quadro válido

- **WHEN** o offscreen entrega um quadro de 1600 amostras
- **THEN** a mensagem tem `sr` 16000, `seq` crescente de 1 em 1 e `pcm` que decodifica para as mesmas 1600 amostras

#### Scenario: Mensagem malformada

- **WHEN** chega uma mensagem com fonte, versão, tipo, taxa ou tamanho inválidos
- **THEN** o app a descarta sem usá-la

#### Scenario: Versão diferente

- **WHEN** a extensão fala uma `versao` que o app não conhece
- **THEN** o app mostra "atualize a extensão" e segue pelo seletor do navegador

### Requirement: Retenção zero e sem rede

A extensão SHALL NOT gravar áudio, SHALL NOT guardar dados e SHALL NOT fazer requisição de rede. Sem um `pedir` do app, a
extensão SHALL descartar cada quadro ao produzi-lo.

#### Scenario: Nenhum app pediu

- **GIVEN** a captura no ar e nenhuma página do app com porta aberta
- **WHEN** o offscreen produz quadros
- **THEN** nenhum quadro é entregue nem guardado

#### Scenario: Outro site

- **WHEN** uma página que não é do app envia `{ tipo: 'pedir' }`
- **THEN** a ponte não existe nela (o content script só roda nas origens do app) e nada é entregue

#### Scenario: Código da extensão

- **WHEN** o teste varre os arquivos da extensão
- **THEN** não acha `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` nem `chrome.storage`

### Requirement: Permissões mínimas

O manifesto SHALL pedir apenas `tabCapture`, `offscreen` e `activeTab`, SHALL NOT declarar `host_permissions`, e a ponte SHALL
rodar só nas origens do app.

#### Scenario: Lista de permissões

- **WHEN** o teste lê `extensao/manifest.json`
- **THEN** as permissões são exatamente `activeTab`, `offscreen` e `tabCapture`, sem `host_permissions` nem `<all_urls>`

### Requirement: Publicação é decisão do dono

O repositório SHALL conter o esqueleto carregável sem compactação e SHALL NOT publicar a extensão em loja sem decisão
explícita do dono.

#### Scenario: Carregar em desenvolvimento

- **WHEN** a pessoa segue `extensao/README.md`
- **THEN** a extensão carrega em `chrome://extensions` com o Modo do desenvolvedor, sem empacotar
