## ADDED Requirements

### Requirement: A nota da sombra funciona sem Web Speech, no aparelho

Com a flag `sombra_local` ligada, quando o navegador não tem reconhecimento de fala utilizável (Firefox, Quest, perfil
protegido sem permissão de nuvem), a sombra SHALL gravar a frase, transcrevê-la UMA vez com um modelo que roda no aparelho
e mostrar a nota de 0 a 100 de `scorePronunciation` e as palavras que saíram e as que escaparam. A flag SHALL nascer
desligada; desligada, a sombra SHALL se comportar como hoje.

#### Scenario: Firefox com a flag ligada

- **GIVEN** o Firefox, a flag `sombra_local` ligada e o modelo local já baixado
- **WHEN** a pessoa grava a frase em inglês e toca em "Parar"
- **THEN** a tela mostra "Comparando..." e depois a nota e as palavras, marcada como palpite

#### Scenario: Flag desligada

- **WHEN** a flag `sombra_local` está desligada e o navegador não tem reconhecimento de fala
- **THEN** aparece a gravação sem nota e o aviso de hoje, sem nenhum download de modelo

### Requirement: A voz nunca sai do aparelho nesta prática

A transcrição local SHALL usar só motor no aparelho. No perfil protegido, a sombra MUST NOT usar reconhecimento de nuvem,
mesmo com consentimento de nuvem dado em outra tela. Nenhuma requisição SHALL levar áudio ou texto da fala, e o áudio SHALL
ficar só em memória e ser descartado ao fim de cada tentativa, ao cancelar e ao sair da tela.

#### Scenario: Menor de idade

- **GIVEN** um perfil protegido sem Web Speech local
- **WHEN** a pessoa pratica a sombra com a flag ligada
- **THEN** a transcrição roda no aparelho e nenhuma requisição de rede leva áudio ou transcrição

#### Scenario: Fim da tentativa

- **WHEN** a nota aparece
- **THEN** os buffers de áudio da transcrição são liberados e só a gravação para "Ouvir minha gravação" fica, em memória

### Requirement: O modelo só baixa com o consentimento da pessoa

O primeiro uso SHALL mostrar o tamanho do modelo (tiny 32 MB, base 67 MB ou Whisper 117 MB) e só baixar depois de a pessoa
aceitar. No Quest e com economia de dados, o modelo SHALL ser o menor disponível para o idioma.

#### Scenario: Não aceitou

- **WHEN** a pessoa toca em "Agora não"
- **THEN** nenhuma requisição ao Hub é feita e a sombra segue só com a gravação

#### Scenario: Quest

- **GIVEN** o Meta Quest e o idioma inglês
- **WHEN** o modelo é escolhido
- **THEN** o modelo é o Moonshine tiny

### Requirement: Nota honesta, sem reprovar

A tela SHALL rotular a nota como palpite do aparelho, mostrar "O aparelho entendeu: ..." e MUST NOT usar vermelho, som de
erro nem a palavra "errado". Quando o VAD não achar fala ou o texto vier vazio, SHALL dizer que não ouviu e oferecer
"Tentar de novo", sem nota.

#### Scenario: Gravação sem fala

- **WHEN** a pessoa grava sem falar
- **THEN** nenhum modelo decodifica o silêncio e a tela diz "Não ouvi sua voz. Tente de novo."

#### Scenario: Idioma sem modelo aprovado

- **GIVEN** um idioma que não passou na régua de qualidade
- **WHEN** a pessoa abre a sombra
- **THEN** a tela oferece só a gravação comparável e diz o motivo, sem nota
