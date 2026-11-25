## ADDED Requirements

### Requirement: A fonte do conteúdo é visível sem abrir nada

A tela de jogos SHALL mostrar, sem nenhum clique, de qual fonte as palavras vêm e o que essa fonte
significa para o progresso.

#### Scenario: Trilha selecionada

- **WHEN** a fonte é a trilha
- **THEN** a tela mostra a etapa atual, quantas etapas o nível tem e quanto falta para concluí-lo

#### Scenario: Gravações selecionadas

- **WHEN** a fonte são as gravações do usuário
- **THEN** a tela mostra de quais gravações o material vem, e não promete etapa nem fim

### Requirement: Um gesto até a rodada

A tela SHALL permitir começar uma rodada com um único clique a partir do lobby, sem modal antes nem
prévia obrigatória depois.

#### Scenario: Fonte guardada válida

- **WHEN** o usuário entra na tela e a fonte guardada rende ao menos uma rodada
- **THEN** nenhum modal abre sozinho, e a ação primária leva direto à partida

#### Scenario: Fonte guardada sem material

- **WHEN** a fonte guardada não rende nenhuma rodada
- **THEN** a escolha de conteúdo aparece antes da grade, dizendo por que apareceu

#### Scenario: Usuário sem gravações

- **WHEN** o usuário não tem nenhuma gravação salva
- **THEN** a fonte guardada é restaurada mesmo assim, sem voltar silenciosamente para "Minhas palavras"

### Requirement: O botão primário faz o que o rótulo diz

Um controle rotulado como "Jogar" SHALL iniciar uma rodada.

#### Scenario: Confirmar a escolha de conteúdo

- **WHEN** o usuário confirma a escolha de conteúdo por um botão com ícone de play
- **THEN** a rodada começa; ou, se o botão apenas aplica a escolha, ele não usa o rótulo nem o ícone
  de play

### Requirement: Cada carta fala da matéria que está em jogo

Descrição, motivo de bloqueio e ficha de um jogo SHALL corresponder à fonte selecionada.

#### Scenario: Jogo de frase na trilha

- **WHEN** a fonte é a trilha e o jogo precisa de frase corrida
- **THEN** o motivo diz que a trilha traz palavras soltas, e nenhum texto promete "uma frase que você
  gravou"

### Requirement: Bloqueio mostra a saída antes da falta

Um jogo indisponível SHALL apresentar primeiro a ação que o libera, e o motivo uma única vez.

#### Scenario: Faltam itens na fonte atual

- **WHEN** a fonte atual não tem itens suficientes e outra fonte tem
- **THEN** a carta mostra a porta para a outra fonte, e o motivo aparece uma vez, em segundo plano

#### Scenario: A porta é usada

- **WHEN** o usuário aciona a porta
- **THEN** a fonte troca e o jogo fica jogável, sem reabrir a escolha de conteúdo

### Requirement: Reordenar não compete com jogar

Os controles de ordem e fixação SHALL viver num modo próprio, fora da leitura padrão da grade.

#### Scenario: Modo padrão

- **WHEN** o usuário abre a tela
- **THEN** nenhuma carta exibe controle de mover ou fixar, e a ordem escolhida antes é respeitada

#### Scenario: Modo organizar

- **WHEN** o usuário ativa "Organizar"
- **THEN** os controles de ordem aparecem em todas as cartas, e a ordem é persistida ao sair do modo

### Requirement: A prévia da rodada não mostra zeros nem revela resposta

A prévia SHALL apresentar apenas fatos diferentes de zero, e nenhum conteúdo que responda a rodada.

#### Scenario: Rodada só de itens novos

- **WHEN** todos os itens da rodada são novos
- **THEN** a prévia mostra o total e "novas", e não exibe contadores zerados de revisão

### Requirement: A recompensa chega ao jogador

O fim de uma rodada SHALL apresentar o que foi ganho, incluindo a recompensa aleatória, sem exigir
navegação extra.

#### Scenario: Rodada concluída

- **WHEN** uma rodada termina
- **THEN** o jogador vê pontos, acertos, XP e seeds ganhos, e a recompensa quando ela cai

### Requirement: Números da economia vêm da tabela viva

Todo valor de XP ou seeds mostrado ao usuário SHALL vir da tabela de regras da economia.

#### Scenario: A regra muda

- **WHEN** um peso de XP ou seeds muda em `core/learning/xp.ts`
- **THEN** o texto exibido na tela de jogos acompanha, sem edição manual

### Requirement: Nível declarado só quando medido

A tela SHALL rotular como CEFR apenas os níveis que vêm de uma fonte CEFR real.

#### Scenario: Idioma sem wordlist CEFR

- **WHEN** a trilha de um idioma foi construída por frequência de uso
- **THEN** a tela chama as divisões de faixas de frequência, nunca de A1–C2

#### Scenario: Trilha de inglês

- **WHEN** a trilha é a de inglês, cujos níveis vêm do CEFR-J
- **THEN** a tela usa A1–C2 e cita a fonte

### Requirement: A trilha declara para quem ela é

Uma trilha SHALL registrar o idioma estudado e o idioma nativo a que suas traduções pertencem.

#### Scenario: Trilha exibida a um falante de outro idioma nativo

- **WHEN** o idioma nativo do usuário difere do idioma das traduções embutidas
- **THEN** a tela diz de qual par a trilha é, em vez de apresentá-la como se servisse a qualquer um

### Requirement: O item carrega o próprio idioma

Um item de rodada SHALL declarar seu idioma, e os jogos SHALL usá-lo para voz, teclado e comparação.

#### Scenario: Rodada com itens de idiomas diferentes

- **WHEN** uma rodada contém itens de mais de um idioma
- **THEN** cada item é falado na voz do seu idioma, e nenhum distrator revela a resposta por ser o
  único do idioma do alvo

#### Scenario: Jogo de escrita em alfabeto não latino

- **WHEN** o item pertence a um idioma de alfabeto não latino
- **THEN** o jogo oferece o teclado daquele alfabeto, ou declara que ainda não atende esse idioma —
  nunca apresenta um tabuleiro impossível

### Requirement: Folha de detalhe com fatos, sem revelar resposta (revisão de 25/11/2026)

A folha de detalhe do jogo SHALL mostrar o nome, o que o jogo treina em uma linha e apenas os fatos diferentes de zero, e SHALL passar toda prévia por `previaSegura`.

#### Scenario: Rodada só de itens novos

- **WHEN** a prévia da rodada tem zero itens já vistos e zero para repetir
- **THEN** a folha mostra só a contagem de novas e nenhum campo zerado

#### Scenario: Prévia de jogo fora da tabela

- **WHEN** a folha pede a prévia de um jogo ausente de `REVELAVEL`
- **THEN** `previaSegura` lança erro e a folha não é montada com a resposta

#### Scenario: Sem promessa de bônus de velocidade

- **WHEN** o bônus de velocidade está desligado (`BONUS_RAPIDO = 0`)
- **THEN** nenhum texto da folha, da ficha ou da raspadinha o promete

### Requirement: Um componente só para a trilha

A tela SHALL mostrar etapa, nível e porcentagem por nível da Trilha num único componente, sem um segundo seletor.

#### Scenario: Trilha selecionada

- **WHEN** a fonte é a Trilha
- **THEN** existe um só lugar com etapa N de M, nível sugerido e % por nível, e não há dois controles que mudem o mesmo nível

### Requirement: Teclado do Termo respeita o idioma

O Termo SHALL oferecer as letras do idioma da palavra, de modo que toda palavra aceita possa ser digitada só pela tela.

#### Scenario: Palavra com letra fora do QWERTY

- **WHEN** a palavra do dia em espanhol tem `ñ`, ou em alemão tem `ä`, `ö`, `ü` ou `ß`
- **THEN** o teclado da tela tem essas teclas e a palavra pode ser completada sem teclado físico

### Requirement: Idiomas sem espaço só entram com segmentação e teclado

Os jogos de frase em ja, zh e ko SHALL só abrir quando houver segmentação de palavras e entrada por teclado do script, e SHALL dizer o motivo quando bloqueados.

#### Scenario: Japonês e chinês

- **WHEN** a fonte é uma frase em ja ou zh e o aparelho tem `Intl.Segmenter`
- **THEN** o jogo de frase abre sem o motivo `escrita-sem-separacao`

#### Scenario: Coreano ainda sem suporte

- **WHEN** a fonte é uma frase em ko e não há segmentação nem teclado de hangul previstos
- **THEN** o jogo fica bloqueado com o motivo escrito na carta
