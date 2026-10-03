## ADDED Requirements

### Requirement: Enviar a minha tradução falada para a chamada

A pessoa SHALL poder escolher um microfone virtual como saída da leitura da **sua** tradução, de modo que o outro lado da
chamada ouça a tradução. O app MUST reproduzir essa leitura por uma saída de áudio que ele controla, direcionada ao
dispositivo escolhido, e MUST usar uma voz do app (nuvem ou voz do site). A leitura local da própria tradução MUST ser
opcional e vir desligada.

#### Scenario: Tradução vai para a chamada

- **WHEN** a pessoa fala em português com "Enviar à chamada" ligado e o microfone virtual escolhido
- **THEN** a tradução em chinês é tocada no microfone virtual e a pessoa não a ouve nos alto-falantes, salvo se ligar "ouvir também aqui"

#### Scenario: Voz do aparelho não serve

- **WHEN** a conta não tem voz natural e o aparelho só tem a voz do aparelho
- **THEN** o botão "Enviar à chamada" explica que precisa da voz natural e a conversa continua só local

### Requirement: Guia, detecção e teste do microfone virtual

O app SHALL detectar dispositivos de saída conhecidos por nome (VB-Cable, VoiceMeeter, BlackHole), explicar como instalar e
como escolher o dispositivo como microfone na chamada, e oferecer um tom de teste. O app MUST NOT assumir que o teste
funcionou: a pessoa confirma que o outro lado ouviu. Sem dispositivo virtual, o modo MUST seguir funcionando só localmente.

#### Scenario: Dispositivo detectado

- **WHEN** a lista de saídas tem "CABLE Input (VB-Audio Virtual Cable)"
- **THEN** o app o sugere como saída da chamada

#### Scenario: Sem dispositivo

- **WHEN** nenhuma saída virtual é encontrada
- **THEN** o app mostra o guia de instalação e a conversa virtual continua sem a saída para a chamada

#### Scenario: Teste

- **WHEN** a pessoa toca em "Testar"
- **THEN** o app toca um tom curto no dispositivo e pergunta se o outro lado ouviu

### Requirement: Portão do spike

A saída para a chamada MUST permanecer desligada por padrão até o spike com microfone virtual, Meet e Zoom mostrar: nenhum
laço de eco, atraso do fim da fala até a chegada na chamada de até 3 s no p50 e áudio inteligível para o outro lado em
teste cego. O resultado MUST ser registrado em `docs/auditoria/eval/`.

#### Scenario: Spike reprova

- **WHEN** o spike encontra laço de eco
- **THEN** a chave continua desligada e o relatório descreve a causa e o que falta
