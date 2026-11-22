## ADDED Requirements

### Requirement: Enviar cartões ao Anki aberto no computador

No computador, o sistema SHALL oferecer "Anki no computador", que envia os cartões escolhidos ao Anki aberto pelo
complemento AnkiConnect (versão 6, `http://127.0.0.1:8765`). O envio MUST acontecer no navegador: o servidor do Frasy
MUST NOT falar com o Anki, e nenhum dado MUST ir a servidor de terceiros. A opção MUST NOT aparecer no celular nem no Quest.

#### Scenario: Envio com sucesso

- **WHEN** a pessoa, no computador, testa a conexão, escolhe baralho, modelo e campos e envia 3 cartões
- **THEN** os cartões novos entram no baralho, o progresso é mostrado e o resumo traz adicionados, já existentes e erros

#### Scenario: Celular ou Quest

- **WHEN** o dispositivo é celular ou Quest
- **THEN** o diálogo de exportar não lista "Anki no computador"

### Requirement: Erros de conexão com o Anki são acionáveis

O sistema SHALL distinguir Anki fechado ou sem o complemento, origem não liberada, permissão negada, chave de API ligada,
versão antiga e tempo esgotado, cada um com uma mensagem que diz o que fazer. Para origem não liberada, a mensagem MUST
trazer a linha exata `"webCorsOriginList": ["http://localhost", "<origem atual>"]`.

#### Scenario: Origem não liberada

- **WHEN** o Anki responde na porta mas recusa a origem do Frasy
- **THEN** o painel mostra a linha de `webCorsOriginList` com `location.origin` e pede para reiniciar o Anki

#### Scenario: Anki fechado

- **WHEN** nada responde em `127.0.0.1:8765`
- **THEN** o painel pede para abrir o Anki e conferir o AnkiConnect

#### Scenario: Permissão negada

- **WHEN** a pessoa nega a janela de permissão do Anki
- **THEN** o envio não começa e o painel explica como tentar de novo

### Requirement: Campos seguros e mapeamento por papel

O sistema SHALL escapar `&`, `<` e `>` do texto da pessoa antes de gravá-lo nos campos HTML do Anki, limitar o tamanho de
campos e etiquetas e montar as etiquetas como as do cartão mais `frasy`. O modelo padrão (Basic) MUST receber a palavra na
frente e, no verso, a tradução mais a frase de contexto em itálico com a palavra em negrito; a pessoa SHALL poder escolher
deck, modelo e o papel de cada campo (palavra, tradução, frase, cloze, nota, nível).

#### Scenario: Texto com HTML

- **WHEN** a frase do cartão contém `<script>`
- **THEN** o campo enviado contém `&lt;script&gt;`, nunca a marcação

#### Scenario: Cloze sem a palavra na frase

- **WHEN** um campo cloze está mapeado e a palavra não aparece na frase
- **THEN** a nota não é enviada e conta como erro no resumo

### Requirement: Duplicatas não se repetem

O sistema SHALL enviar com `allowDuplicate: false` e `duplicateScope: "deck"`, perguntar ao Anki (`canAddNotes`) o que ele
aceita e contar as já existentes à parte no resumo.

#### Scenario: Palavra já no baralho

- **WHEN** uma das palavras enviadas já existe no baralho de destino
- **THEN** ela não é duplicada e aparece em "Já estavam no baralho"

### Requirement: A CSP libera só o AnkiConnect local

`connect-src` SHALL incluir `http://127.0.0.1:8765` e `http://localhost:8765`, e nenhuma outra origem local nova. Essas
origens MUST NOT entrar em `script-src`, `worker-src` nem `frame-src`.

#### Scenario: CSP gerada

- **WHEN** a CSP é gerada para o Express ou para `dist/_headers`, com ou sem modo público
- **THEN** `connect-src` lista as duas origens da porta 8765 e as demais diretivas não as listam

### Requirement: Preferências ficam no aparelho

O baralho, o modelo e o mapeamento de campos escolhidos SHALL ser guardados só no aparelho (`localStorage`), sem ir ao
servidor, e a tela MUST funcionar quando o armazenamento falhar.

#### Scenario: Voltar depois

- **WHEN** a pessoa reabre o painel
- **THEN** baralho, modelo e mapeamento da última vez já vêm escolhidos
