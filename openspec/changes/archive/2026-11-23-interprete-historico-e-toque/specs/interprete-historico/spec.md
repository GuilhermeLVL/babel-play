## ADDED Requirements

### Requirement: Histórico da conversa em cada metade

Cada metade do intérprete SHALL mostrar a conversa no idioma dela, em ordem cronológica: as falas do outro traduzidas
(com o original pequeno embaixo) e as falas dela no original. A última fala do outro MUST aparecer em destaque e as
anteriores menores e esmaecidas. A lista MUST ter rolagem própria e MUST começar presa no fim.
A tela MUST desenhar no máximo 50 itens por vez e MUST oferecer "ver mais" para subir a janela. O histórico completo
MUST continuar disponível para salvar e exportar.

#### Scenario: Frases anteriores continuam visíveis

- **WHEN** a conversa tem cinco frases finais e chega a sexta
- **THEN** a sexta aparece em destaque e as cinco anteriores aparecem menores acima dela, na ordem em que ocorreram, cada uma no idioma da metade

#### Scenario: Conversa longa

- **WHEN** a conversa passa de 50 frases
- **THEN** a tela desenha as 50 últimas e mostra "ver mais"; tocar nele desenha mais 50 sem perder a posição de leitura

#### Scenario: Parcial em andamento

- **WHEN** há uma fala ainda sendo reconhecida
- **THEN** o texto parcial aparece em cinza no fim da lista e é substituído pela versão final quando ela chega

### Requirement: Rolagem presa no fim, com retorno

A lista SHALL acompanhar o fim enquanto a pessoa não rolar para cima. Ao rolar para cima, a tela MUST parar de
acompanhar e MUST mostrar "Ir ao fim" com o número de frases novas. Tocar em "Ir ao fim" MUST voltar ao fim e
retomar o acompanhamento. Um leitor de tela MUST ouvir só a frase nova, não a lista inteira.

#### Scenario: Pessoa relê uma frase antiga

- **WHEN** a pessoa rola para cima e chegam duas frases novas
- **THEN** a posição não muda e o botão "Ir ao fim" mostra 2

#### Scenario: Volta ao fim

- **WHEN** a pessoa toca em "Ir ao fim"
- **THEN** a lista vai ao fim e volta a acompanhar as próximas frases

### Requirement: Modo de tela "Conversa"

O intérprete SHALL oferecer o modo de tela "Conversa": uma linha do tempo única, na orientação normal, com uma bolha
por frase final, original e tradução, o falante e a hora. O modo MUST poder ser trocado na faixa do meio, MUST valer
em celular, computador e Quest, e MUST lembrar a última escolha neste aparelho. O modo frente a frente atual MUST
continuar sendo o padrão.

#### Scenario: Troca para Conversa

- **WHEN** a pessoa escolhe "Conversa" na faixa do meio
- **THEN** a tela mostra uma lista única de bolhas, sem a metade virada, e os botões Falar continuam disponíveis

#### Scenario: Sem armazenamento

- **WHEN** o aparelho não permite guardar a escolha
- **THEN** o modo vale só nesta tela e a próxima abertura usa o padrão

### Requirement: Estado visível e acabamento

A linha de estado SHALL dizer em que ponto a conversa está (ouvindo, traduzindo, lendo a tradução ou parado), na mesma
ordem da máquina de estados, sem criar estado novo. Falhas (sem permissão de microfone, sem rede, tradução que estourou o
prazo) MUST dizer o que houve e oferecer uma ação. A tela MUST manter contraste legível. O nível do microfone e o
tamanho da letra ajustável ficam para uma etapa própria (dependem de dados que a captura ainda não entrega à tela).

#### Scenario: Microfone negado

- **WHEN** o navegador nega o microfone
- **THEN** a tela diz que o microfone está bloqueado e mostra como liberar, sem ficar em "ouvindo"

#### Scenario: Tradução estourou o prazo

- **WHEN** a tradução passa do prazo
- **THEN** a frase aparece com o original entre parênteses, como a captura já faz, e a tradução é refeita quando o tradutor volta
