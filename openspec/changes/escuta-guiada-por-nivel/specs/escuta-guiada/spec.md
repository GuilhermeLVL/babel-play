## ADDED Requirements

### Requirement: A tela de sessão oferece três modos de escuta

A tela de análise de uma sessão gravada SHALL oferecer o seletor "Modo de escuta" com `livre`, `ouvir-primeiro` e
`ler-primeiro`. O modo inicial SHALL ser `livre` (o comportamento anterior à mudança) até a pessoa escolher outro. Sessões de
documento SHALL NOT ter escuta guiada.

#### Scenario: Modo livre

- **WHEN** o modo é `livre`
- **THEN** o texto de todas as falas fica visível e não há "Próximo passo"

#### Scenario: Ouvir antes de ler

- **WHEN** o modo é `ouvir-primeiro` e a pessoa chega a uma frase
- **THEN** o texto e a tradução dela ficam ocultos ("Texto oculto") e o passo é ouvir sem ver o texto
- **AND** "Próximo passo" ou o toque em "Texto oculto — toque para revelar" mostra o texto (passo de ler)
- **AND** o "Próximo passo" seguinte toca a frase de novo com o texto, e o seguinte passa à próxima frase, de volta ao primeiro passo

#### Scenario: Ler antes de ouvir

- **WHEN** o modo é `ler-primeiro`
- **THEN** o texto da frase fica sempre visível; os passos são ler e depois ouvir, e o "Próximo passo" seguinte passa à próxima frase

#### Scenario: Última frase

- **WHEN** a pessoa está no último passo da última frase
- **THEN** "Próximo passo" fica desabilitado

#### Scenario: Trocar de frase por outro meio

- **WHEN** a pessoa muda de frase pelo player (anterior, próxima) ou tocando numa fala
- **THEN** os passos da nova frase recomeçam no primeiro

### Requirement: O nível CEFR sugere o modo, sem impô-lo

A escuta guiada SHALL sugerir `ouvir-primeiro` para A1, A2 e para quem não tem nível estimado, e `livre` do B1 em diante,
mostrando a sugestão ao lado do seletor ("Sugerido para A2: ..."). A sugestão SHALL NOT trocar o modo sozinha.

#### Scenario: Nível A2

- **WHEN** o nível estimado é A2
- **THEN** o seletor indica "Sugerido para A2: Ouvir antes de ler" e o modo escolhido não muda

#### Scenario: Nível B2

- **WHEN** o nível estimado é B2
- **THEN** o seletor indica "Sugerido para B2: Livre"

### Requirement: A escolha de modo fica no aparelho e o teclado é seguro

O modo escolhido SHALL ser guardado neste aparelho e restaurado ao reabrir a tela; sem armazenamento, SHALL valer só na visita.
Com um modo guiado ligado, Enter SHALL acionar "Próximo passo" somente quando nenhum botão, link, campo ou diálogo tem o foco.

#### Scenario: Reabrir a tela

- **WHEN** a pessoa escolheu "Ler antes de ouvir" e reabre uma sessão
- **THEN** o seletor mostra "Ler antes de ouvir"

#### Scenario: Enter com foco num botão

- **WHEN** o foco está num botão e a pessoa aperta Enter
- **THEN** só o botão age; o passo não avança

### Requirement: A escuta guiada não mede nem premia tempo

A escuta guiada SHALL NOT medir tempo, conceder pontos, sequência ou qualquer recompensa por avançar passos (Decreto 12.880,
art. 9º). O ritmo é sempre o da pessoa.

#### Scenario: Avançar passos

- **WHEN** a pessoa avança todos os passos de uma frase
- **THEN** nenhum ponto, sequência, medalha ou contagem de tempo é registrado ou mostrado
