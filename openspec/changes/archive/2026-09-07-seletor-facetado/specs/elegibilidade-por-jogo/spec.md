## ADDED Requirements

### Requirement: Cada jogo declara por que está indisponível, nunca em silêncio
O sistema SHALL calcular, para cada `MinigameId`, um `EstadoDoJogo` com `ok`, `disponiveis`,
`faltam`, `fonte` e — quando bloqueado ou degradado — um `MotivoBloqueio` do vocabulário fechado da
casa, nunca um número sem explicação.

#### Scenario: Acervo insuficiente numa fonte de frase
- **WHEN** um jogo de frase é avaliado sobre uma trilha (sem frases)
- **THEN** o estado é indisponível com `motivo: 'trilha-sem-frase'`, não apenas "0 disponíveis"

#### Scenario: Áudio ainda baixando
- **WHEN** a gravação selecionada tem áudio, mas ele ainda não terminou de carregar
- **THEN** o motivo é `'audio-carregando'`, distinto de "sem áudio" — a carta não pede uma gravação
  que já existe

### Requirement: Pool suficiente por contagem não basta se o alfabeto não é digitável/representável
O sistema SHALL distinguir "faltam itens" de "há itens de sobra, mas em alfabeto que este jogo não
suporta", com o motivo `alfabeto-nao-suportado`.

#### Scenario: Baralho 100% num alfabeto não-latino, jogo de digitação
- **WHEN** o acervo filtrado tem material de sobra por contagem, mas nenhuma palavra é digitável no
  teclado do jogo (ex.: Termo sobre um deck 100% japonês)
- **THEN** o jogo aparece com `motivo: 'alfabeto-nao-suportado'`, não com uma rodada que só permite
  "Revelar tudo"

#### Scenario: Baralho 100% não-latino, jogo de grade de letras
- **WHEN** o acervo filtrado é homogêneo em um alfabeto que o Caça-palavras não normaliza para a
  grade
- **THEN** o mesmo motivo se aplica, e o jogo não é oferecido como se tivesse pool jogável

### Requirement: O rótulo humano de cada motivo é declarado uma única vez
O sistema SHALL manter uma tabela única (`ROTULO_DO_MOTIVO`) de título e explicação por
`MotivoBloqueio`, consumida por toda superfície que precisa exibir o motivo — não reescrita por
tela.

#### Scenario: Dois lugares mostram o mesmo bloqueio
- **WHEN** a carta de jogo e o painel facetado precisam mostrar por que um jogo está indisponível
  pelo mesmo motivo
- **THEN** os dois consultam `ROTULO_DO_MOTIVO[motivo]` — o texto nunca diverge entre telas

### Requirement: Um jogo pode degradar em vez de bloquear
O sistema SHALL, quando parte do pool passa no requisito do jogo e parte não, expor o estado como
degradado (com contagem de aptos e o motivo do resto) em vez de tudo-ou-nada.

#### Scenario: Pool misto de alfabetos
- **WHEN** o acervo filtrado mistura palavras digitáveis e não-digitáveis no teclado do jogo
- **THEN** o estado é `'degradado'` com `aptos`, `total` e `inaptosPor: 'alfabeto-nao-suportado'` —
  o jogo continua oferecido com o subconjunto que funciona
