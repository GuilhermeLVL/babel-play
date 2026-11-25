## ADDED Requirements

### Requirement: Selo de onde a fala é processada

A captura e o intérprete SHALL mostrar, sempre visível, uma de três etiquetas: "No aparelho", "Pelo
navegador" ou "Nuvem do Babel". O texto SHALL vir da decisão da política de rota.

#### Scenario: Modelo local

- **WHEN** a rota efetiva é um modelo no aparelho
- **THEN** o selo diz "No aparelho" e informa que o áudio não sai dali

#### Scenario: Fala do navegador que envia áudio

- **WHEN** a rota efetiva é a fala do navegador processada pelo fabricante
- **THEN** o selo diz "Pelo navegador" e informa que o áudio sai do aparelho para um terceiro

### Requirement: O motivo ao toque

Ao tocar no selo, a pessoa SHALL ver em até duas linhas por que aquela rota foi escolhida, o que pode
trocar, e a porta para "Como isto funciona".

#### Scenario: Cota acabou

- **WHEN** a rota caiu para o aparelho porque as horas do mês acabaram
- **THEN** o motivo diz isso e oferece ver o consumo

### Requirement: Mudança de rota é anunciada

Quando a rota muda sozinha durante o uso, o app SHALL mostrar um aviso curto e não bloqueante com o que
mudou e por quê. O aviso SHALL NOT aparecer no meio de uma fala.

#### Scenario: Queda de rede

- **WHEN** a nuvem deixa de responder e a captura passa ao aparelho
- **THEN** aparece o aviso e o selo muda para "No aparelho"

### Requirement: Nunca passar a enviar áudio sem aceite

O app SHALL NOT mudar de "No aparelho" para uma rota que envia áudio sem consentimento registrado para
aquele destino. Os consentimentos de "Pelo navegador" e de "Nuvem do Babel" SHALL ser separados.

#### Scenario: Aparelho não acompanha e não há aceite

- **WHEN** o modelo local não acompanha e a pessoa não aceitou nenhum envio
- **THEN** a captura segue no aparelho com aviso de atraso e a oferta de autorizar

### Requirement: Perfil infantil travado no aparelho

No perfil protegido, o selo SHALL ficar em "No aparelho" e as opções que enviam áudio SHALL NOT ser
oferecidas.

#### Scenario: Conta de menor

- **WHEN** o perfil é protegido
- **THEN** o seletor de nível não mostra "Precisão" nem "Ao vivo" como escolha

### Requirement: Prova do modo local

A folha "Como isto funciona" SHALL oferecer "Testar sem internet", que demonstra a captura funcionando
com a rede da página desligada.

#### Scenario: Teste

- **WHEN** a pessoa aciona "Testar sem internet" num aparelho com modelo local pronto
- **THEN** uma fala de teste é transcrita sem nenhum pedido de rede
