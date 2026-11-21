## ADDED Requirements

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
