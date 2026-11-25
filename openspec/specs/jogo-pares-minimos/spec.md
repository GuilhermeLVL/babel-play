# jogo-pares-minimos Specification

## Purpose

Minigame de pares mínimos para treino de ouvido em 6 idiomas, sem IA nem rede. Criada pela change `jogo-pares-minimos` (arquivada em 2026-11-23); veja `openspec/changes/archive/2026-11-23-jogo-pares-minimos/proposal.md` para o porquê.

## Requirements

### Requirement: Listas curadas de pares mínimos por idioma

O app SHALL manter, para inglês, espanhol, francês, alemão, italiano e português, uma lista curada de pelo
menos 15 pares mínimos (duas palavras comuns que só diferem num som), cada um com o contraste fonético
rotulado.

#### Scenario: Dados válidos

- **WHEN** as listas são validadas
- **THEN** nenhum par se repete (nem invertido), as duas palavras de cada par são diferentes e o contraste
  tem dois sons preenchidos e diferentes entre si

### Requirement: A rodada sorteia pares do idioma-alvo, de forma equilibrada

O sorteio SHALL usar só pares do idioma-alvo, SHALL NOT repetir par nem palavra dentro da rodada e SHALL
equilibrar qual palavra toca e qual fica à esquerda.

#### Scenario: Idioma-alvo

- **WHEN** o idioma-alvo é `en-US`
- **THEN** todos os pares vêm da lista do inglês
- **WHEN** o idioma não tem lista
- **THEN** a rodada sai vazia

#### Scenario: Sem repetição

- **WHEN** a rodada tem 8 pares
- **THEN** os 8 pares são distintos e nenhuma palavra aparece em dois pares

#### Scenario: Equilíbrio

- **WHEN** a rodada é sorteada
- **THEN** a diferença entre quantas vezes toca cada lado do par é de no máximo 1, e a mesma regra vale
  para a posição (esquerda ou direita) da palavra que toca

#### Scenario: O que caiu há pouco

- **WHEN** há pares recentes
- **THEN** eles saem da frente do sorteio, mas voltam se faltar par para completar a rodada

### Requirement: Escolher qual palavra foi ouvida

O jogo SHALL tocar uma palavra do par por voz sintetizada, mostrar as duas opções e conferir a escolha no
aparelho, sem IA, sem rede e sem custo.

#### Scenario: Ouvir

- **WHEN** a pessoa aperta "Ouvir" ou "Ouvir devagar"
- **THEN** a palavra é lida no idioma-alvo, em velocidade normal ou lenta, sem limite de vezes

#### Scenario: Teclas

- **WHEN** a pessoa aperta 1 ou 2
- **THEN** a opção na posição correspondente é escolhida

#### Scenario: Feedback com os dois sons

- **WHEN** a pessoa escolhe
- **THEN** o jogo mostra as duas palavras com o som de cada uma, o contraste (`/ɪ/ × /iː/`), quem tocou e
  qual foi a escolha, por texto e ícone além da cor, e deixa ouvir as duas palavras

### Requirement: Resumo dos contrastes confundidos

No fim da rodada o jogo SHALL dizer quais contrastes o ouvido confundiu.

#### Scenario: Com erros

- **WHEN** a pessoa erra ship/sheep e bit/beat
- **THEN** o resumo traz uma linha "Seu ouvido confunde /ɪ/ e /iː/" com 2 erros e os dois pares

#### Scenario: Sem erros

- **WHEN** a pessoa acerta todos os pares
- **THEN** o resumo diz que o ouvido separou todos os sons da rodada

### Requirement: O jogo é do idioma, não do baralho

O jogo SHALL abrir com qualquer fonte de conteúdo, inclusive a Trilha e um baralho vazio, desde que haja
lista e voz para o idioma.

#### Scenario: Qualquer fonte

- **WHEN** o idioma tem lista e há voz
- **THEN** o gate libera o jogo para baralho, sessão, Trilha e Difíceis, e a montagem entrega a rodada

#### Scenario: Sem voz

- **WHEN** o aparelho não tem voz para o idioma
- **THEN** o jogo fica preso com o motivo `sem-voz`

#### Scenario: Sem lista

- **WHEN** o idioma não tem lista de pares
- **THEN** o jogo fica preso com o motivo `sem-lista-do-idioma`

### Requirement: Nada vale por tempo

O jogo SHALL NOT ter relógio nem pontuar rapidez (Decreto 12.880, art. 9º).

#### Scenario: Resposta rápida

- **WHEN** a pessoa acerta em poucos milissegundos
- **THEN** não há bônus de velocidade e a pontuação é a mesma de uma resposta lenta

#### Scenario: Avanço

- **WHEN** a pessoa responde
- **THEN** o jogo só avança quando ela aperta "Próximo par"
