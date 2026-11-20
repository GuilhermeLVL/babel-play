# leitura-ativa-voz-alta Specification

## Purpose

Define os modos de leitura da Leitura ativa e, no modo "Ler em voz alta", como o Frasy acompanha a voz da
pessoa palavra por palavra sem que a voz saia do aparelho e sem acusar erro de pronúncia.

## Requirements

### Requirement: Três modos de leitura, nenhum obrigatório

Antes de ler, a pessoa SHALL escolher entre "Ouvir primeiro" (narração com destaque por frase), "Ler em voz
alta" e "Ler em silêncio". "Ouvir primeiro" e "Ler em silêncio" SHALL funcionar sempre, mesmo sem microfone ou
sem reconhecimento local.

#### Scenario: Navegador sem reconhecimento local

- **GIVEN** um navegador sem `processLocally` e sem modelo de reconhecimento local pronto
- **WHEN** a pessoa abre a tela de antes de ler
- **THEN** "Ler em voz alta" aparece esmaecido com a explicação de que o navegador ainda não consegue ouvir sem
  mandar a voz para fora, e os outros dois modos funcionam

#### Scenario: Ouvir primeiro

- **WHEN** a pessoa escolhe "Ouvir primeiro" e toca em "Começar"
- **THEN** a voz do aparelho lê o texto frase a frase e a frase atual fica destacada

### Requirement: O microfone só liga por toque explícito

O microfone SHALL começar desligado. Ele SHALL ligar só depois de a pessoa tocar em "Ligar o microfone" no aviso
"O Frasy vai ouvir você ler", mostrado antes do pedido de permissão do navegador. No perfil protegido o aviso
SHALL aparecer a cada sessão. Abrir a tela, trocar de texto ou voltar de outra aba MUST NOT ligar o microfone.

#### Scenario: Primeira vez de um adulto

- **WHEN** um adulto escolhe "Ler em voz alta" pela primeira vez e toca em "Começar"
- **THEN** o aviso aparece antes de qualquer pedido de permissão do navegador, e "Agora não" volta à escolha de
  modo sem pedir a permissão

#### Scenario: Aba em segundo plano

- **GIVEN** o microfone ligado durante a leitura
- **WHEN** a aba vai para segundo plano
- **THEN** o microfone para na hora; ao voltar, a tela diz "Pausamos enquanto você estava fora." e só religa
  com o toque em "Continuar"

#### Scenario: Menor de idade

- **GIVEN** uma pessoa de 12 anos que já leu em voz alta ontem
- **WHEN** ela escolhe "Ler em voz alta" hoje
- **THEN** o aviso em versão infantil aparece de novo antes de ligar o microfone

### Requirement: A voz nunca sai do aparelho nesta tela

O reconhecimento SHALL usar só motor local: a Web Speech com `processLocally` ou um modelo local do aparelho.
Se o modo local falhar, a tela SHALL parar o microfone e oferecer "Ler em silêncio", e MUST NOT cair para
reconhecimento em nuvem, mesmo com consentimento de nuvem dado em outra tela.

#### Scenario: Modo local falha no meio da leitura

- **GIVEN** a leitura em voz alta com a Web Speech local
- **WHEN** o motor local lança erro
- **THEN** a tela mostra "O microfone parou." com "Ligar de novo" e "Seguir em silêncio", nenhuma sessão de
  reconhecimento em nuvem é aberta e o progresso das frases fica

### Requirement: O áudio vive só em memória e morre a cada frase

O áudio captado SHALL ficar só em memória e SHALL ser descartado ao fim de cada frase (ou ao pausar, sair ou
trocar de texto). A tela MUST NOT gravar áudio em disco, em armazenamento do navegador ou no servidor, MUST NOT
extrair impressão de voz e SHALL guardar só o resultado em texto: o estado de cada palavra.

#### Scenario: Fim de uma frase

- **WHEN** a pessoa termina de ler a frase 2
- **THEN** os buffers de áudio da frase 2 são liberados e só o estado das palavras da frase 2 fica

#### Scenario: Nada vai à rede

- **WHEN** a pessoa lê um texto inteiro em voz alta
- **THEN** nenhuma requisição de rede leva áudio ou transcrição, e nada é gravado no `localStorage` ou no
  IndexedDB além do estado das palavras e do texto marcado como lido

### Requirement: O destaque segue a voz com um cursor que só avança

Cada parcial do reconhecimento SHALL ser comparado com as palavras do texto numa janela curta à frente do
cursor (até 6 palavras). O cursor SHALL só avançar: uma palavra que casa dentro da janela vira `lida`, as
palavras entre o cursor e ela viram `pulada`, e a próxima vira `atual`. Comparação sem acento, sem pontuação e
sem caixa.

#### Scenario: Leitura completa de uma frase

- **GIVEN** a frase "Lia likes apples."
- **WHEN** o reconhecimento entrega os parciais "lia", "lia likes", "lia likes apples"
- **THEN** as três palavras ficam `lida`, nessa ordem, e o cursor passa para a frase seguinte

#### Scenario: Palavra pulada

- **GIVEN** a frase "She picks six red apples."
- **WHEN** o reconhecimento entrega "she picks red apples"
- **THEN** "six" fica `pulada` e as outras quatro ficam `lida`

#### Scenario: O reconhecimento repete ou volta atrás

- **GIVEN** o cursor depois de "picks"
- **WHEN** um parcial novo repete "she picks" ou corrige uma palavra já lida
- **THEN** nenhuma palavra volta a `pendente` e o cursor não recua

#### Scenario: Palavra fora da janela

- **GIVEN** o cursor em "six" e a próxima ocorrência de "apples" a 9 palavras de distância
- **WHEN** o reconhecimento entrega "apples"
- **THEN** nada muda (a palavra está fora da janela de 6)

### Requirement: Pulada não é erro

Uma palavra `pulada` SHALL aparecer com pontilhado neutro e o texto "O Frasy não ouviu bem", nunca em vermelho,
nunca com som de erro e nunca com a palavra "errado". A tela MUST NOT mostrar nota de pronúncia, precisão em
porcentagem nem marcar palavra "trocada".

#### Scenario: Cartão de uma palavra pulada

- **GIVEN** "six" marcada `pulada`
- **WHEN** a pessoa toca em "six"
- **THEN** o cartão da palavra abre com a linha "Praticar esta palavra no fim" já marcada

### Requirement: A pessoa pode corrigir onde o Frasy está

Tocar numa palavra durante a leitura em voz alta SHALL abrir o cartão da palavra sem pausar o microfone. Quando o
cursor ficar parado com fala ativa por 4 s, a tela SHALL dizer "O Frasy se perdeu um pouco. Toque na palavra
onde você está." e o toque seguinte numa palavra SHALL reposicionar o cursor nela, sem marcar como `pulada` as
palavras saltadas por esse toque.

#### Scenario: Reposicionar o cursor

- **GIVEN** o cursor parado em "market" há 4 s com fala ativa
- **WHEN** a pessoa toca em "Lia" duas frases à frente
- **THEN** o cursor vai para "Lia", e as palavras entre "market" e "Lia" ficam `pendente`

### Requirement: Estrela por frase e marcas acessíveis

Ao fim de uma frase com pelo menos 80% das palavras `lida`, a tela SHALL mostrar uma estrela discreta no fim da
frase. As marcas SHALL ser distinguíveis sem cor (sublinhado sólido para lida, pontilhado para pulada), e o
leitor de tela SHALL anunciar só o fim de cada frase, não cada palavra.

#### Scenario: Frase com 4 de 5 palavras lidas

- **WHEN** a pessoa termina uma frase de 5 palavras com 4 `lida` e 1 `pulada`
- **THEN** a frase ganha a estrela e a região `aria-live="polite"` anuncia a frase concluída uma vez
