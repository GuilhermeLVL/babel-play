## ADDED Requirements

### Requirement: O app diz o que funciona sem rede

A regra `capacidadesSemRede` SHALL devolver, para cada recurso (transcrição, tradução, jogos, leitor, IA na nuvem), se ele
funciona agora e, quando não funciona, o motivo. Um recurso local MUST só constar como "funciona" se o que ele precisa
está no aparelho.

#### Scenario: Offline com os modelos baixados

- **WHEN** a rede caiu, o modelo de fala e o de tradução estão baixados e o motor local está disponível
- **THEN** transcrição, tradução, jogos e leitor constam como "funciona"
- **AND** a IA na nuvem consta como "não funciona" com o motivo "precisa de internet"

#### Scenario: Offline sem modelo baixado

- **WHEN** a rede caiu e o modelo de fala não foi baixado
- **THEN** a transcrição consta como "não funciona" com o motivo "modelo não baixado"

#### Scenario: Offline em aparelho sem motor local

- **WHEN** a rede caiu e o aparelho não tem motor local disponível
- **THEN** transcrição e tradução constam como "não funciona" com o motivo "aparelho sem motor local"

#### Scenario: Online

- **WHEN** há rede
- **THEN** a IA na nuvem consta como "funciona"
- **AND** transcrição e tradução locais continuam dependendo do modelo baixado e do motor local

### Requirement: O aviso é discreto e só aparece offline

A faixa `AvisoSemRede` MUST aparecer apenas enquanto `navigator.onLine` for falso, SHALL poder ser dispensada na sessão e
MUST NOT criar item de menu. A lista completa SHALL aparecer em "Uso sem internet", no Diagnóstico.

#### Scenario: A rede cai e volta

- **WHEN** o evento `offline` dispara e depois o evento `online`
- **THEN** a faixa aparece e depois some sozinha

#### Scenario: Pessoa dispensa a faixa

- **WHEN** a pessoa dispensa a faixa e a rede continua fora
- **THEN** a faixa não reaparece até o fim da sessão do navegador
