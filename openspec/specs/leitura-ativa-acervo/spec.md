# leitura-ativa-acervo Specification

## Purpose

Define o acervo de textos curtos da Leitura ativa, o que cada ficha de texto carrega (licença, autoria,
perguntas, tarefas de escrita) e como o app calcula, no aparelho, quanto de cada texto a pessoa já sabe.

## Requirements

### Requirement: O acervo inicial tem 12 textos originais em 3 níveis

O acervo do MVP SHALL ter exatamente 12 textos em inglês, 4 em cada nível (A1, A2, B1), todos originais da
equipe Frasy com licença CC BY 4.0, empacotados com o app (sem rede para abrir). Textos de acervos externos
MUST NOT entrar nesta versão.

#### Scenario: Conferência do acervo

- **WHEN** o teste do acervo lê o arquivo de textos
- **THEN** há 12 textos com `id` único, 4 por nível, todos com `licenca` CC BY 4.0 e autoria "Equipe Frasy"

#### Scenario: Abrir sem internet

- **GIVEN** o app já carregado e o aparelho sem internet
- **WHEN** a pessoa abre um texto do catálogo
- **THEN** o texto, as perguntas e as tarefas de escrita aparecem

### Requirement: Toda ficha de texto é completa e validada

Cada texto SHALL ter `id`, `titulo`, `nivel`, `categoria`, `texto`, `palavrasAlvo` (3 a 10), exatamente 3
`perguntas` de múltipla escolha com 3 opções, índice `correta` válido e `explicacao` em português, e uma
`tarefaDeEscrita` com `reescrever` e `opinar`. Uma ficha inválida SHALL quebrar o teste do acervo, nunca a tela.

#### Scenario: Pergunta com índice fora das opções

- **GIVEN** uma ficha com `correta: 3` numa pergunta de 3 opções
- **WHEN** o teste do acervo roda
- **THEN** o teste falha apontando o `id` do texto e o número da pergunta

#### Scenario: Palavra-alvo que não está no texto

- **GIVEN** uma ficha cuja `palavrasAlvo` traz uma palavra que não aparece no texto (nem como forma flexionada)
- **WHEN** o teste do acervo roda
- **THEN** o teste falha apontando a palavra

### Requirement: O texto mostra a origem e o crédito

O catálogo e a tela de antes de ler SHALL mostrar o selo "Criado com IA e revisado por pessoas" e um rodapé
de crédito gerado da ficha (autoria e licença), sem texto escrito à mão por tela.

#### Scenario: Rodapé de um texto original

- **WHEN** a pessoa abre "At the Market"
- **THEN** o rodapé diz que o texto é da equipe Frasy, criado com IA e revisado, sob CC BY 4.0

### Requirement: A cobertura é calculada no aparelho com as palavras da pessoa

A cobertura de um texto SHALL ser a fração de palavras indexáveis que a pessoa já sabe: etiqueta `dominada` ou
`aprendendo`, palavra funcional do idioma, ou nome próprio. O cálculo SHALL rodar no aparelho, por listas, sem
embeddings e sem enviar o caderno ou o texto a servidor.

#### Scenario: Texto com 40 palavras indexáveis e 38 conhecidas

- **GIVEN** um texto com 40 palavras indexáveis, das quais 30 são funcionais e 8 estão `aprendendo` ou
  `dominada` no caderno
- **WHEN** a cobertura é calculada
- **THEN** o resultado é 95%

#### Scenario: Formas flexionadas contam como a palavra

- **GIVEN** "apple" `dominada` no caderno e o texto com "apples"
- **WHEN** a cobertura é calculada
- **THEN** "apples" conta como conhecida

#### Scenario: Nenhuma chamada de rede

- **WHEN** o catálogo calcula a cobertura dos 12 textos
- **THEN** nenhuma requisição de rede é feita para isso

### Requirement: A cobertura vira um rótulo honesto ou nenhum número

Com cobertura ≥ 98% o cartão SHALL dizer "Leitura tranquila", de 95% a 97% "Bom desafio" e abaixo de 95%
"Puxado". Sem histórico suficiente (menos de 3 sessões no idioma) ou sem conta, o cartão SHALL mostrar só o
nível e MUST NOT mostrar porcentagem.

#### Scenario: Conta nova

- **GIVEN** uma pessoa com 1 sessão em inglês
- **WHEN** ela abre o catálogo
- **THEN** os cartões mostram "Nível 1 · A1" (e assim por diante) sem "Você já sabe", e a seção do topo se
  chama "Comece por aqui" com 3 textos de A1

#### Scenario: Pessoa com histórico

- **GIVEN** uma pessoa com 5 sessões em inglês e um texto com cobertura de 96%
- **WHEN** ela abre o catálogo
- **THEN** o cartão mostra "Você já sabe 96%" e "Bom desafio"

### Requirement: O catálogo sugere textos na faixa de bom desafio

A seção "Para você agora" SHALL listar até 3 textos não lidos com cobertura entre 95% e 98%; sem nenhum na
faixa, os 3 não lidos de maior cobertura abaixo de 98%. Os filtros SHALL ser por nível e por categoria.

#### Scenario: Filtro sem resultado

- **WHEN** a pessoa filtra por "Nível 3" e uma categoria sem texto B1
- **THEN** a tela diz "Nenhum texto com esses filtros." e oferece "Limpar filtros"

#### Scenario: Texto já lido

- **GIVEN** a pessoa terminou "At the Market"
- **WHEN** ela volta ao catálogo
- **THEN** o cartão mostra "Lido ✓", vai para o fim da lista e não aparece em "Para você agora"

### Requirement: A cobertura aparece na sessão e no capítulo do livro

O app SHALL mostrar, no topo da sessão e no leitor de livros, a cobertura do conteúdo (o percentual de palavras que a pessoa já
conhece) com o nível por extenso (Leitura tranquila, Bom desafio ou Puxado) e "cerca de N palavras novas". Na sessão, a conta SHALL
usar o texto original das falas no idioma da fala, nunca a tradução; no livro, os parágrafos do capítulo em exibição. A conta MUST
rodar no aparelho e fora do caminho crítico da tela.

#### Scenario: Sessão em espanhol de quem tem histórico

- **WHEN** a pessoa com conta e 3 sessões ou mais em espanhol abre uma sessão em espanhol com 96% das palavras conhecidas
- **THEN** o topo mostra "Você já sabe 96% desta sessão", o nível "Bom desafio" e "cerca de N palavras novas"

#### Scenario: Capítulo de um livro

- **WHEN** a pessoa vira para outro capítulo de um livro em francês
- **THEN** a linha é recalculada com os parágrafos do novo capítulo e diz "deste capítulo"

#### Scenario: Sessão bilíngue

- **WHEN** a sessão tem falas em dois idiomas
- **THEN** a conta usa só as falas no idioma da sessão

### Requirement: Sem número, nada na tela

O app MUST NOT mostrar a cobertura quando o número não seria honesto: sem conta, com menos de `SESSOES_MINIMAS_PARA_NOVA`
sessões no idioma, em idioma que não separa palavras por espaço (ja, zh, th, lo, km, my) ou com menos de 30 palavras no conteúdo.

#### Scenario: Conta nova

- **WHEN** a pessoa tem 2 sessões no idioma
- **THEN** a linha de cobertura não aparece

#### Scenario: Japonês

- **WHEN** a sessão é em japonês, mesmo com histórico
- **THEN** a linha de cobertura não aparece

### Requirement: A conta não trava a tela e respeita o idioma

A cobertura SHALL ser calculada em tempo ocioso e, acima de 60 mil caracteres, sobre uma amostra espalhada pelo conteúdo; com amostra,
"cerca de N palavras novas" MUST NOT aparecer. Em idiomas com elisão (francês, italiano, catalão, português), a elisão SHALL sair antes
da conta, e a lematização SHALL valer só onde há regra (nos outros, a chave exata).

#### Scenario: Conteúdo muito grande

- **WHEN** o capítulo passa de 60 mil caracteres
- **THEN** a porcentagem usa a amostra e o número de palavras novas não é mostrado
