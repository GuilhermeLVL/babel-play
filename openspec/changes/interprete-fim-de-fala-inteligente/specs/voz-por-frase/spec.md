## ADDED Requirements

### Requirement: Ler a tradução frase a frase

A tradução final SHALL ser partida em frases, e a primeira frase MUST começar a ser lida sem esperar as demais ficarem
prontas. A voz MUST tocar as frases na ordem do texto. O app MUST limitar as sínteses simultâneas a duas.

#### Scenario: Primeira frase sai antes

- **WHEN** a tradução tem três frases e a voz da nuvem leva 300 ms por frase
- **THEN** a primeira frase começa a tocar sem esperar a terceira ser sintetizada

#### Scenario: Ordem

- **WHEN** a segunda frase fica pronta antes da primeira
- **THEN** a segunda espera e toca depois da primeira

### Requirement: Cancelar tudo ao falar de novo

Quando a pessoa fala ou toca em outra ação, o app SHALL cancelar as sínteses pendentes e o áudio em curso, e MUST
manter o guarda de eco. Frases canceladas MUST NOT ser lidas depois.

#### Scenario: Barge-in

- **WHEN** a pessoa toca em "Falar" durante a leitura da segunda de três frases
- **THEN** a leitura para, a terceira não é lida e o microfone abre

### Requirement: Prazos por frase e queda para a voz do aparelho

Cada frase SHALL ter o prazo da voz da nuvem (6 s). Se estourar ou falhar, a frase MUST ser lida pela voz do aparelho,
na ordem, sem repetir o que já foi lido.

#### Scenario: Nuvem falha na segunda frase

- **WHEN** a nuvem falha ao sintetizar a segunda frase
- **THEN** a segunda é lida pela voz do aparelho e a terceira segue normalmente
