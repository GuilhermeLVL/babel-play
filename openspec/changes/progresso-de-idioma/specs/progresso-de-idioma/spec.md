## ADDED Requirements

### Requirement: Tempo de fala distingue ativo de passivo
O perfil de métricas SHALL separar o tempo de fala do usuário (mic) do tempo de áudio ouvido
(tab).

#### Scenario: Sessão mista
- **WHEN** uma sessão tem falas de 'mic' e de 'tab'
- **THEN** o relatório mostra os dois tempos separadamente e o WPM usa apenas 'mic'

### Requirement: Palavras difíceis visíveis e acionáveis
O usuário SHALL ver as palavras que mais erra e poder praticá-las diretamente.

#### Scenario: Do ranking ao exercício
- **WHEN** o usuário abre "Suas palavras difíceis" e escolhe praticar
- **THEN** o exercício é montado com essas palavras
