## ADDED Requirements

### Requirement: Traduzir só o trecho estável

Enquanto uma fala está sendo reconhecida, o app SHALL traduzir o texto parcial somente quando ele estiver estável:
duas leituras seguidas iguais e terminando em fronteira de oração. O app MUST limitar a uma tradução parcial por
janela de 1,2 s por fala. O app MUST mostrar a tradução parcial em cinza, e MUST substituí-la pela tradução final
quando ela chegar. O app MUST NOT ler a tradução parcial em voz alta.

#### Scenario: Parcial estável

- **WHEN** o parcial "Eu quero comprar arroz," se repete em duas leituras
- **THEN** a metade do outro lado mostra a tradução em cinza

#### Scenario: Final substitui

- **WHEN** a fala fecha e a tradução final chega
- **THEN** o texto cinza dá lugar ao texto normal, sem ser lido em voz alta duas vezes

#### Scenario: Limite de chamadas

- **WHEN** o parcial muda a cada 300 ms
- **THEN** o app faz no máximo uma tradução parcial a cada 1,2 s

### Requirement: Custo sob controle

No plano Grátis, a tradução parcial SHALL usar só a tradução local. Na nuvem gerenciada, o app MUST respeitar o teto de
custo da sessão e MUST desligar a tradução parcial ao atingi-lo, sem afetar a tradução final.

#### Scenario: Grátis

- **WHEN** a conta é do plano Grátis
- **THEN** nenhuma tradução parcial vai para a nuvem

#### Scenario: Teto atingido

- **WHEN** a sessão atinge o teto de custo de tradução parcial
- **THEN** o app para de traduzir parciais e continua traduzindo os finais
