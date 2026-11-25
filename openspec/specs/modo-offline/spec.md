# modo-offline Specification

## Purpose

O app já funciona em parte sem internet (transcrição e tradução no aparelho com modelo baixado, jogos com o que já está no aparelho, leitor), mas ninguém diz isso à pessoa. Quando a rede cai, ela não sabe se vale tentar ou esperar, e a IA na nuvem simplesmente falha. A pesquisa do core (X6) pede um "modo offline declarado": dizer, com honestidade, o que funciona e o que não funciona sem rede. Criada pela change `modo-offline-declarado` (arquivada em 2026-11-25); veja `openspec/changes/archive/2026-11-25-modo-offline-declarado/proposal.md` para o porquê.

## Requirements

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
