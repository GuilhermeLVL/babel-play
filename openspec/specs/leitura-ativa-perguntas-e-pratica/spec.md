# leitura-ativa-perguntas-e-pratica Specification

## Purpose

Define as perguntas de compreensão de cada texto, a lista de palavras para praticar que sai da leitura e como
ela chega à revisão espaçada, ao XP e à missão do dia.

## Requirements

### Requirement: Três perguntas por texto, corrigidas no aparelho

Cada texto SHALL ter 3 perguntas de múltipla escolha, mostradas uma por vez depois do trecho que as responde
(ou ao tocar em "Terminei"), corrigidas no aparelho sem IA. O enunciado fica em inglês com "Ver em português";
no nível A1 os dois idiomas aparecem por padrão. "Pular" SHALL estar sempre visível.

#### Scenario: Acerto de primeira

- **WHEN** a pessoa escolhe "To the market" em "Where do Lia and her dad go?"
- **THEN** a tela mostra "Isso!" com "Continuar", e a pergunta conta como certa de primeira

#### Scenario: Erro e segunda tentativa

- **WHEN** a pessoa escolhe "To school"
- **THEN** a opção some, a tela diz "Quase. Releia o trecho destacado." e a segunda tentativa fica liberada

#### Scenario: Erro duas vezes

- **WHEN** a pessoa erra também a segunda tentativa
- **THEN** a tela mostra a resposta certa com a `explicacao` da ficha e "Continuar", sem as palavras "errado"
  ou "errou" e sem som de erro

### Requirement: Só o resultado das perguntas vai ao servidor

Ao terminar o texto, o app SHALL enviar ao servidor só, por pergunta, se acertou de primeira, de segunda ou
não acertou, pelo mesmo caminho das rodadas de jogo, com o tipo `leituraAtiva` e um id de rodada por leitura.
As respostas escolhidas e o tempo por palavra MUST NOT ser enviados.

#### Scenario: Envio do resultado

- **GIVEN** uma pessoa com conta que acertou 2 de primeira e pulou 1
- **WHEN** ela chega ao resumo
- **THEN** o servidor recebe 2 linhas certas e 1 sem resposta, com o mesmo id de rodada, e nenhum texto da
  pessoa

### Requirement: A leitura gera até 5 palavras para praticar

O resumo SHALL listar até 5 palavras para praticar, sem repetir, nesta ordem: as `pulada` na voz alta, as que a
pessoa tocou, e as palavras-alvo que ela não conhece ainda. Cada uma SHALL vir marcada "Vai para a sua
revisão", com desmarcar em um toque. A lista vazia diz "Nenhuma palavra para praticar. Você leu tudo com
clareza!".

#### Scenario: Ordem da lista

- **GIVEN** "six" pulada, "borrow" tocada e "morning" e "friend" palavras-alvo desconhecidas
- **WHEN** o resumo abre
- **THEN** a lista é "six", "borrow", "morning", "friend", nessa ordem, todas marcadas

#### Scenario: Palavra já dominada

- **GIVEN** "happy" pulada mas `dominada` no caderno
- **WHEN** o resumo abre
- **THEN** "happy" aparece na lista desmarcada, porque já está no caderno

### Requirement: As palavras marcadas viram cartões da revisão

Ao confirmar o resumo, cada palavra marcada SHALL virar um cartão do caderno com a frase do texto como
contexto, pelo mesmo caminho de salvar palavra do leitor, e passar a ter a etiqueta `salva`. Uma palavra já no
caderno MUST NOT virar um cartão duplicado.

#### Scenario: Salvar três palavras

- **GIVEN** três palavras marcadas, uma delas já no caderno
- **WHEN** a pessoa toca em "Praticar estas palavras"
- **THEN** dois cartões novos entram na fila da revisão com a frase do texto, e a terceira fica como estava

#### Scenario: Sem conta

- **GIVEN** uma pessoa sem conta
- **WHEN** ela chega ao resumo
- **THEN** a tela diz "Entre para guardar estas palavras e ganhar XP." e nenhum cartão é criado no servidor

### Requirement: Ler um texto conta para a missão do dia

Com a flag `leitura_ativa` ligada, o sorteio das missões SHALL poder incluir o tipo `leitura` com alvo 1 ("Leia
1 texto"), cumprido quando há no dia uma rodada `leituraAtiva` gravada. Com a flag desligada, o tipo `leitura`
MUST NOT ser sorteado e as outras missões SHALL ficar como hoje.

#### Scenario: Missão cumprida

- **GIVEN** a flag ligada e a missão `leitura` sorteada hoje
- **WHEN** a pessoa termina um texto
- **THEN** o resumo mostra "Missão do dia: Leia 1 texto ✓"

#### Scenario: Flag desligada

- **GIVEN** a flag desligada
- **WHEN** as missões do dia são sorteadas para qualquer semente
- **THEN** nenhuma missão é do tipo `leitura`

### Requirement: O resumo mostra fatos, não nota

O resumo SHALL mostrar frases lidas, tempo, estrelas e perguntas certas. Palavras por minuto SHALL aparecer só
para adultos no modo voz alta, como "cerca de N palavras por minuto". O resumo MUST NOT mostrar nota 0–100 nem
precisão de pronúncia.

#### Scenario: Adulto em voz alta

- **WHEN** um adulto termina um texto de 72 palavras em voz alta em 45 s
- **THEN** o resumo mostra "cerca de 96 palavras por minuto" e nenhuma porcentagem de precisão
