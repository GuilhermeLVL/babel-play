# acervo-anki Specification

## Purpose

TBD - created by archiving change motor-anki-acervo. Update Purpose after archive.

## Requirements

### Requirement: O baralho importado existe como coisa, não como resíduo

O sistema SHALL guardar cada importação como um baralho identificável, com nome, arquivo de origem,
data e contagens, consultável depois da importação.

#### Scenario: Importação bem-sucedida

- **WHEN** o usuário importa um `.apkg` com sucesso
- **THEN** existe um baralho com nome, quantidade de notas e data, e cada nota importada pertence a ele

#### Scenario: Duas importações de arquivos diferentes

- **WHEN** o usuário importa dois arquivos distintos
- **THEN** existem dois baralhos separados, e nenhuma nota fica ambígua entre eles

### Requirement: Nada do original é descartado na entrada

O sistema SHALL preservar os campos brutos de cada nota, com os nomes originais dos campos, de forma
que a classificação possa ser refeita sem reimportar o arquivo.

#### Scenario: Nota com campos que o app não usa

- **WHEN** a nota tem campos além de frente, verso e exemplo (pitch accent, frequência, notas)
- **THEN** todos os campos e seus nomes ficam guardados na nota do acervo

#### Scenario: Reclassificação

- **WHEN** o mapeamento de campos de um baralho muda depois da importação
- **THEN** o sistema recalcula frente, verso e exemplo a partir dos campos brutos, sem pedir o arquivo de novo

### Requirement: A procedência sobrevive até o cartão jogável

O sistema SHALL registrar, para todo cartão criado a partir de um baralho Anki, que ele veio do Anki
e de qual baralho.

#### Scenario: Cartão projetado

- **WHEN** uma nota do acervo é ativada e vira cartão
- **THEN** a ocorrência do cartão registra origem `anki` e a referência do baralho

#### Scenario: Palavra que também veio de uma gravação

- **WHEN** a mesma palavra existe por captura de fala e por baralho Anki
- **THEN** o cartão é um só e ambas as origens ficam registradas, sem que uma apague a outra

### Requirement: A nota entra na fila de estudo em lotes, nunca de uma vez

O sistema SHALL manter a nota importada fora da fila de revisão até ser ativada, e SHALL ativar em
lotes de tamanho limitado.

#### Scenario: Baralho grande recém-importado

- **WHEN** um baralho de 3.600 notas é importado
- **THEN** nenhum cartão novo aparece vencido para revisar, e o baralho informa quantas notas estão à espera

#### Scenario: Ativação

- **WHEN** o usuário ativa notas de um baralho
- **THEN** no máximo o tamanho do lote entra na fila, e o baralho passa a informar quantas já foram ativadas do total

#### Scenario: Ativar de novo

- **WHEN** o usuário ativa mais uma vez
- **THEN** entram as notas seguintes, e nenhuma nota já ativada entra duas vezes

### Requirement: Reimportar o mesmo baralho atualiza, não duplica

O sistema SHALL reconhecer notas já importadas pelo identificador estável da nota (`guid`) e SHALL
atualizar o que mudou em vez de criar cópias.

#### Scenario: Mesmo arquivo importado duas vezes

- **WHEN** o usuário importa de novo um arquivo já importado
- **THEN** nenhuma nota é duplicada, e o relatório do import diz quantas eram novas, quantas foram atualizadas e quantas ficaram iguais

#### Scenario: Nota que sumiu do arquivo novo

- **WHEN** uma nota presente na importação anterior não existe no arquivo novo
- **THEN** ela é marcada como ausente no arquivo, e não é apagada nem seu histórico perdido

### Requirement: Remover um baralho tem regra escrita e não apaga histórico às escondidas

O sistema SHALL oferecer desativação como padrão e purga como ação destrutiva separada, e SHALL
preservar o histórico de revisão em ambos os casos.

#### Scenario: Desativar

- **WHEN** o usuário remove um baralho pela ação padrão
- **THEN** os cartões que só vinham daquele baralho saem dos jogos, o histórico de revisão é preservado, e o baralho pode voltar

#### Scenario: Cartão que também tem outra origem

- **WHEN** um cartão do baralho removido também veio de uma gravação
- **THEN** o cartão continua disponível pela outra origem

#### Scenario: Purgar

- **WHEN** o usuário escolhe a purga e confirma que é definitivo
- **THEN** as notas do baralho são apagadas, e ainda assim nenhum registro de revisão já feita é destruído

#### Scenario: Reimportar depois de desativar

- **WHEN** um baralho desativado é importado de novo
- **THEN** os cartões voltam com o histórico que tinham, sem criar cartões paralelos para as mesmas palavras

### Requirement: Um baralho curado não é medido pela régua da fala capturada

O sistema SHALL avaliar a qualidade do item conforme a origem do conteúdo, aplicando à captura de
fala uma régua diferente da aplicada a material curado.

#### Scenario: Definição de dicionário

- **WHEN** a nota tem como verso uma definição longa, típica de baralho monolíngue
- **THEN** ela é aceita como item jogável, e não descartada por comprimento

#### Scenario: Fragmento de fala

- **WHEN** o item vem de captura de fala e a pista é um fragmento sem valor ("Isso é", "rápida!!")
- **THEN** ele continua sendo descartado, com o motivo de sempre

#### Scenario: Lixo em qualquer origem

- **WHEN** a palavra tem dígitos, ruído, ou a pista é igual à palavra
- **THEN** ela é descartada independentemente da origem

### Requirement: A importação tem registro consultável e falha parcial é dita

O sistema SHALL registrar cada importação com estado e contagens por motivo, e SHALL relatar o que
não entrou em vez de falhar em silêncio ou por inteiro.

#### Scenario: Progresso durante importação longa

- **WHEN** uma importação em lotes está em andamento
- **THEN** o usuário pode consultar quantas notas já entraram e o estado do import

#### Scenario: Notas recusadas

- **WHEN** parte das notas não pode virar item jogável
- **THEN** o restante entra normalmente, e o relatório diz quantas foram recusadas e por qual motivo

#### Scenario: Erro no meio

- **WHEN** a importação falha na metade
- **THEN** o que já entrou permanece, o import fica marcado como parcial, e repetir a importação não duplica nada

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

### Requirement: Chave do AnkiConnect (apiKey)

O sistema SHALL enviar a chave no campo `key` de toda chamada ao Anki quando a pessoa a informar, e SHALL recomendar definir
uma `apiKey` junto do `webCorsOriginList` (mostrando o trecho JSON); MUST NOT pedir para apagá-la. A chave MUST ficar em
`sessionStorage` por padrão (`localStorage` só com "Lembrar neste aparelho") e MUST NOT ir ao servidor do Frasy, a log ou
telemetria.

#### Scenario: Anki exige chave

- **WHEN** o AnkiConnect exige chave e o campo está vazio
- **THEN** o painel pede a chave; com chave errada, diz que o Anki não a aceitou

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

`connect-src` SHALL incluir `http://127.0.0.1:8765` (a única que o cliente usa), e nenhuma outra origem local nova. Essas
origens MUST NOT entrar em `script-src`, `worker-src` nem `frame-src`.

#### Scenario: CSP gerada

- **WHEN** a CSP é gerada para o Express ou para `dist/_headers`, com ou sem modo público
- **THEN** `connect-src` lista só `http://127.0.0.1:8765` e as demais diretivas não as listam

### Requirement: Preferências ficam no aparelho

O baralho, o modelo e o mapeamento de campos escolhidos SHALL ser guardados só no aparelho (`localStorage`), sem ir ao
servidor, e a tela MUST funcionar quando o armazenamento falhar.

#### Scenario: Voltar depois

- **WHEN** a pessoa reabre o painel
- **THEN** baralho, modelo e mapeamento da última vez já vêm escolhidos
