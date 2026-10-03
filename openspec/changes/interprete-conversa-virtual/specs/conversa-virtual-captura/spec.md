## ADDED Requirements

### Requirement: Modo de conversa virtual com duas fontes rotuladas

O intérprete SHALL oferecer o modo "Conversa virtual", com duas fontes rotuladas: "Eles" (áudio do PC) e "Você"
(microfone). A direção de cada fonte MUST ser fixa: "Eles" traduz do idioma do outro para o meu, "Você" traduz do meu para
o do outro, sem detectar idioma. Cada fonte MUST ter o seu próprio reconhecimento. A tela MUST mostrar as falas em
bolhas rotuladas com o nível de cada fonte.

#### Scenario: Duas fontes em paralelo

- **WHEN** a pessoa inicia a conversa virtual e o outro fala em chinês
- **THEN** a tradução em português aparece numa bolha "Eles" e a pessoa pode falar em português, que aparece numa bolha "Você"

#### Scenario: Nível de cada fonte

- **WHEN** só o outro está falando
- **THEN** o nível de "Eles" se mexe e o de "Você" fica parado

### Requirement: Captura do áudio do PC

Para "Eles", o app SHALL preferir o áudio de uma aba compartilhada e MUST aceitar o áudio do sistema no Chrome e no Edge
do Windows quando a pessoa confirmar que usa fone. O app MUST pedir o áudio sem processamento de voz (sem cancelamento de
eco, supressão de ruído nem ganho automático) e MUST restringir o áudio do próprio app quando o navegador suportar. Se o
navegador não devolver faixa de áudio, o app MUST dizer à pessoa para marcar "compartilhar áudio".

#### Scenario: Aba compartilhada

- **WHEN** a pessoa compartilha a aba da chamada com "compartilhar áudio da aba"
- **THEN** o app recebe a faixa de áudio e começa a traduzir "Eles"

#### Scenario: Sem áudio compartilhado

- **WHEN** a pessoa compartilha a aba sem marcar o áudio
- **THEN** o app mostra "Marque 'compartilhar áudio da aba' e tente de novo" e não finge que está ouvindo

#### Scenario: Navegador sem suporte

- **WHEN** o navegador é Safari ou Firefox
- **THEN** o modo explica que o áudio do computador só funciona em Chrome ou Edge

### Requirement: Sem laço de eco

O app MUST impedir que a própria leitura da tradução volte para "Eles". Com a captura de aba, o app MUST suprimir a
reprodução local do original e reproduzi-lo por um controle de volume, abaixando-o durante a leitura da tradução. Com a
captura de sistema e sem restrição do áudio do próprio app, o app MUST pausar a escuta de "Eles" durante a leitura e a
cauda de eco, e MUST processar depois o que foi dito nesse intervalo.

#### Scenario: Original abaixa durante a tradução

- **WHEN** a tradução de "Eles" está sendo lida e a captura é de aba
- **THEN** o volume do original cai e volta ao normal ao terminar a leitura

#### Scenario: Fala do outro durante a leitura

- **WHEN** o outro volta a falar enquanto a tradução está sendo lida, no modo de sistema sem restrição
- **THEN** o que ele disse é processado quando a leitura termina, sem se perder

### Requirement: Só legenda

A pessoa SHALL poder usar a conversa virtual só com legenda, sem leitura em voz alta, a qualquer momento.

#### Scenario: Só legenda

- **WHEN** a pessoa liga "só legenda"
- **THEN** as traduções aparecem em texto e nenhuma voz é lida
