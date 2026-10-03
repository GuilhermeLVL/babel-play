## ADDED Requirements

### Requirement: Ouvir uma palavra ou frase tocando

Tocar numa palavra ou numa frase do histórico, do original ou da tradução, SHALL ler o trecho em voz alta no idioma
do próprio trecho. O idioma MUST vir da palavra (como em `examineWord`), e não do lado da tela. A leitura MUST passar
pela fila de fala e pelo guarda de eco. Quando o aparelho não tem voz para o idioma, a tela MUST avisar, como já
acontece nas demais telas.

#### Scenario: Palavra da tradução

- **WHEN** a pessoa toca em "arroz" na metade em português
- **THEN** a voz lê "arroz" em português e a palavra fica marcada enquanto é lida

#### Scenario: Frase inteira

- **WHEN** a pessoa toca no ícone de ouvir de uma bolha
- **THEN** a voz lê a frase inteira no idioma dela

#### Scenario: Idioma sem voz

- **WHEN** o aparelho não tem voz para o idioma do trecho
- **THEN** a tela diz que não há voz para esse idioma e não fica em silêncio sem explicação

### Requirement: Modo lento

A leitura de um trecho tocado SHALL poder ser repetida em modo lento (0,7×), no mesmo gesto que o modo lento da
captura (toque longo ou botão "devagar").

#### Scenario: Devagar

- **WHEN** a pessoa pede a leitura devagar
- **THEN** o trecho é lido a 0,7× da velocidade normal

### Requirement: Toque não atrapalha o turno

Durante a escuta, ou seja, com o microfone aberto, o toque para ouvir MUST ser ignorado e a tela MUST dizer por quê,
em uma linha. Fora da escuta, o toque MUST cortar a voz em curso e ler o trecho tocado, e ao terminar a conversa MUST
voltar ao estado parado, pronto para o próximo "Falar".

#### Scenario: Toque com o microfone aberto

- **WHEN** a pessoa toca numa palavra enquanto o app está ouvindo
- **THEN** nada é lido e a tela mostra "Espere a escuta terminar para ouvir"

#### Scenario: Toque durante a leitura da tradução

- **WHEN** a tradução está sendo lida e a pessoa toca em outra frase
- **THEN** a leitura atual para e a frase tocada é lida em seguida

### Requirement: Palavras separadas por idioma

O app SHALL separar as palavras com o segmentador do idioma. Em idiomas sem espaço entre palavras (chinês, japonês,
tailandês), quando o aparelho não tem segmentador, o alvo do toque MUST ser a frase inteira, e não um caractere solto.

#### Scenario: Chinês sem segmentador

- **WHEN** o aparelho não tem `Intl.Segmenter` e a pessoa toca num texto em chinês
- **THEN** a frase inteira é lida
