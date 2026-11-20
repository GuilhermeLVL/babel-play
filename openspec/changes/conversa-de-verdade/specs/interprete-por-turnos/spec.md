## ADDED Requirements

### Requirement: Uma pausa no meio da frase não encerra o turno

No modo por toque, o turno SHALL terminar no segundo toque ("Terminei") ou depois de 2,5 s de silêncio. Uma pausa de até 2 s
no meio da frase MUST NOT encerrar o turno. A leitura em voz alta da tradução MUST começar só depois de o microfone do turno
fechar.

#### Scenario: Pausa de 1,5 s (CONV-02)

- **WHEN** a rodada `desktop-cache-pausa` de `conversa/jantar.mjs` fala "Então, [1,5 s] acho que vou pedir a sobremesa de
  chocolate."
- **THEN** a lista tem uma fala só, contendo "de chocolate"
- **AND** `tMicFechou` é maior ou igual a `falaFim` (a auditoria mediu 1,4 s antes)
- **AND** o início da leitura em voz alta é maior ou igual a `tMicFechou`

#### Scenario: Segundo toque

- **WHEN** a pessoa toca "Terminei" logo depois de falar
- **THEN** o microfone fecha em até 300 ms, sem esperar o silêncio

### Requirement: Toda fala vai para a pessoa e a direção certas

Cada fala MUST ser atribuída à pessoa e à direção vigentes no instante em que foi dita, inclusive a fala guardada durante o
download do reconhecimento. Trocar os lados MUST NOT mudar o autor das falas anteriores. A exportação SHALL usar o mesmo
autor da lista.

#### Scenario: Fala dita durante o download (CONV-01)

- **WHEN** a rodada `desktop-vazio-limpo` fala pt1 do lado "Você" enquanto o reconhecimento baixa, e en1 do lado do inglês
  depois do download
- **THEN** pt1 aparece com dono "Você", idioma pt e tradução em inglês
- **AND** en1 aparece inteira (a auditoria a cortou em "Thank you so much."), e `fimDaFalaAteMicFecharMs` de en1 é maior ou
  igual a 0 (a auditoria mediu −3013)

#### Scenario: Trocar os lados (CONV-07)

- **WHEN** a rodada `desktop-cache-limpo` faz 2 trocas pt/en, toca "Trocar os lados", faz mais 2 e abre "Conversa"
- **THEN** 100% das falas da lista têm o autor de quando foram ditas (as 2 primeiras em pt continuam "Você")
- **AND** o Markdown exportado traz os mesmos autores

### Requirement: Fala em idioma fora do par não vira tradução inventada

No modo por toque, quando a fala do turno tem pelo menos 2 s e o idioma detectado difere do idioma do lado com confiança de
pelo menos 0,8, o app MUST NOT traduzi-la nem lê-la em voz alta, e SHALL mostrar "Não parece {idioma do lado} — repetir?".

#### Scenario: Espanhol no lado do inglês (CONV-03)

- **WHEN** a rodada `desktop-cache-ruido` fala "Perdón, ¿alguien quiere más pan?" no lado English
- **THEN** a metade mostra "Não parece inglês — repetir?"
- **AND** nenhuma leitura em voz alta acontece nesse turno, e a lista não tem "Desculpe, quero ir ao banheiro."

#### Scenario: Sem falso bloqueio nas falas do par

- **WHEN** as 20 falas do conjunto de teste (10 pt e 10 en) são ditas nos lados certos
- **THEN** no máximo 1 é marcada como fora do par

### Requirement: O primeiro uso não diz que está ouvindo antes de poder ouvir

Enquanto o reconhecimento não está pronto, o lado ativo MUST NOT mostrar "Ouvindo…". Ele SHALL mostrar "Preparando N%" e
dizer que a fala fica guardada. O microfone do turno SHALL fechar pelo mesmo critério de fim de turno, com ou sem modelo.

#### Scenario: Primeiro uso no desktop (CONV-09)

- **WHEN** a rodada `desktop-vazio-limpo` toca Falar e "Baixar e iniciar" e fala logo
- **THEN** `tela.json` não registra "Ouvindo…" antes do evento de modelo pronto (a auditoria registrou aos 3772 ms com 0%)
- **AND** o microfone fecha sozinho em até 3 s depois do fim da fala, sem toque extra

### Requirement: As metades são legíveis no celular

Em 412×915 e 375×667, a frase de cada metade SHALL caber inteira na sua área (fonte reduzida até 18 px, com rolagem de
reserva), e a barra de navegação inferior MUST NOT aparecer enquanto o Intérprete está em curso.

#### Scenario: Tradução de 2 frases na metade de baixo (CONV-08)

- **WHEN** a rodada `celular-cache-limpo` recebe en1 (2 frases)
- **THEN** a frase da metade de baixo cabe ou rola (`scrollHeight` menor ou igual a `clientHeight`, ou rolagem
  disponível), sem corte no topo
- **AND** não há nenhum botão de microfone fora das metades

### Requirement: O reconhecimento em português no celular é confiável

No perfil celular, o Intérprete SHALL usar o modelo que, no conjunto de teste em pt, tenha WER de no máximo 20%, 0 frases
constrangedoras, 1ª tradução p50 de no máximo 3 s depois do fim da fala e memória da aba abaixo de 2,0 GB. Sem modelo que
atenda, o app MUST mostrar a transcrição para a pessoa conferir antes de ler a tradução em voz alta. O diálogo de download
SHALL anunciar o tamanho do modelo que vai ser usado neste aparelho.

#### Scenario: Conjunto de pt no Pixel 7 emulado (CONV-04)

- **WHEN** as 10 frases em pt do conjunto passam por `conversa/jantar.mjs` no perfil celular
- **THEN** o WER fica em no máximo 20% e nenhuma saída é da lista de constrangedoras (a auditoria teve 2 de 3 frases
  erradas)

#### Scenario: Tamanho anunciado (CONV-11)

- **WHEN** o diálogo de download abre no celular
- **THEN** o número em MB é o do modelo escolhido para o celular (não os 353 MB do desktop)
