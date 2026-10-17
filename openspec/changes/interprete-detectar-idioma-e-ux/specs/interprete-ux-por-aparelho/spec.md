## ADDED Requirements

### Requirement: Um controle de escuta no automático

No modo automático, a tela SHALL mostrar um único botão "Ouvir/Parar" em vez de um botão por metade. No celular, o
botão MUST ficar na faixa do meio. No computador, MUST ficar centrado na base, com a tecla de atalho visível. No
modo por toque, cada metade MUST manter o seu botão "Falar".

#### Scenario: Automático no celular

- **WHEN** o automático está ligado num celular
- **THEN** só existe um botão de escuta, na faixa do meio, e as metades mostram só o texto

### Requirement: Ações de voz só quando servem

"Repetir" SHALL aparecer numa metade só quando ela mostra uma tradução. "Parar voz" SHALL aparecer só enquanto a voz
lê.

#### Scenario: Conversa recém-aberta

- **WHEN** ninguém falou ainda
- **THEN** nenhuma metade mostra "Repetir" nem "Parar voz"

### Requirement: Layout que cabe na janela

No computador, as duas colunas SHALL valer só com a janela larga (760 px ou mais). Numa janela mais estreita, as
metades MUST empilhar sem rotação e sem rolagem horizontal. Enquanto o intérprete está aberto, o botão flutuante do
iChat MUST NOT cobrir os controles.

#### Scenario: Janela estreita no computador

- **WHEN** a janela do navegador tem 390 px de largura num computador
- **THEN** as duas metades aparecem inteiras, uma sobre a outra, legíveis sem virar

### Requirement: O idioma da metade é tocável

O nome do idioma de cada metade SHALL ser o botão que abre a escolha de idiomas, com alvo de pelo menos 44 px.
