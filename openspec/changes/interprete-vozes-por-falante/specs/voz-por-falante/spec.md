## ADDED Requirements

### Requirement: Estimar a faixa de tom localmente

O app SHALL estimar a faixa de tom (F0) de cada falante a partir de pelo menos 1,5 s de fala com voz, no próprio aparelho,
e devolver um gênero aproximado ou "indeterminado" quando o tom cai entre as faixas de cada gênero. O áudio MUST NOT ser
gravado nem enviado para essa estimativa. O app MUST guardar na memória da sessão só o rótulo.

#### Scenario: Tom grave

- **WHEN** a mediana de F0 de um falante fica abaixo de ~155 Hz
- **THEN** a estimativa é "masculino aproximado" com a confiança pelo número de quadros

#### Scenario: Zona de sobreposição

- **WHEN** a mediana de F0 fica entre ~155 Hz e ~185 Hz
- **THEN** a estimativa é "indeterminado" e a voz padrão é usada

#### Scenario: Pouca fala

- **WHEN** o falante disse menos de 1,5 s de fala com voz
- **THEN** a estimativa fica pendente e a voz padrão é usada

### Requirement: Escolher a voz mais próxima e fixar por falante

Com o gênero estimado, o app SHALL escolher, no idioma da leitura, a voz do catálogo do mesmo gênero e de tom mais
próximo, e MUST fixar essa voz para o falante até o fim da sessão. Sem voz do gênero no idioma, o app MUST usar a voz
padrão e MUST dizer que não há voz parecida. Um gênero "indeterminado" MUST NOT fixar a voz; o app MUST tentar de novo
até três vezes.

#### Scenario: Voz fixa

- **WHEN** a primeira fala de um falante fixou a voz "Kore"
- **THEN** as falas seguintes dele usam "Kore", mesmo que a estimativa mude

#### Scenario: Sem voz parecida

- **WHEN** o idioma da leitura não tem voz do gênero estimado
- **THEN** a leitura usa a voz padrão e a tela diz "sem voz parecida neste idioma"

### Requirement: A escolha manual vence

A pessoa SHALL poder trocar a voz de um falante pelo chip "Voz" na faixa do meio. A escolha manual MUST substituir a
automática, MUST ficar fixa e MUST valer para as próximas falas do mesmo falante. O app MUST oferecer "Sempre a mesma
voz" para desligar a escolha automática.

#### Scenario: Troca manual

- **WHEN** a pessoa escolhe outra voz para o lado "outro"
- **THEN** as próximas falas desse lado são lidas com a voz escolhida e o rótulo diz "voz escolhida"

#### Scenario: Desligar a automática

- **WHEN** a pessoa escolhe "Sempre a mesma voz"
- **THEN** nenhuma estimativa de tom é feita e a voz padrão do idioma é usada

### Requirement: Rótulos honestos

A tela SHALL dizer "voz aproximada" quando a voz foi escolhida automaticamente e "voz escolhida" quando foi manual. A
tela MUST NOT afirmar o gênero da pessoa.

#### Scenario: Rótulo automático

- **WHEN** a voz foi escolhida pela estimativa
- **THEN** a faixa do meio mostra "voz aproximada" e nenhum texto diz o gênero da pessoa
