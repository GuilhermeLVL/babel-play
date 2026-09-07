## ADDED Requirements

### Requirement: Toda tabela tem leitor e escritor
Cada tabela do schema SHALL ter ao menos um caminho de escrita e um de leitura em `server/`, provados por teste. Uma tabela provisionada para uma entrega futura SHALL ser criada pela mudanca que a entrega, e nao antes.

#### Scenario: Tabela provisionada para o futuro
- **WHEN** uma migration cria uma tabela sem nenhum caminho de leitura ou escrita no servidor
- **THEN** o teste de invariante falha citando a tabela pelo nome

#### Scenario: Escrita por SQL cru
- **WHEN** a unica escrita de uma tabela e um `INSERT` em SQL cru (necessario onde o `ON CONFLICT` de indice parcial exige)
- **THEN** o invariante a reconhece como escrita — a varredura cobre o identificador do drizzle e o nome da tabela no banco

### Requirement: Coluna morta e removida, nao tolerada
Uma coluna sem escritor SHALL ser removida do schema, e nao apenas marcada como obsoleta. O mesmo vale para um campo do tipo do cliente sem leitor.

#### Scenario: Cartao criado por qualquer caminho
- **WHEN** um cartao e criado por captura, importacao Anki ou promocao da trilha
- **THEN** nao existe coluna `frequency` para receber valor; quem conta encontro de palavra e `occurrences`

### Requirement: A dificuldade e recalculada apos a rodada
`difficulty_score` SHALL ser recalculado para os cartoes jogados ao fim de cada rodada gravada, e SHALL NOT ser calculado no caminho de leitura da tela.

#### Scenario: Rodada com cartoes do baralho
- **WHEN** uma rodada e gravada com `cardId` nos itens
- **THEN** esses cartoes passam a ter `difficulty_score`, e os que nao entraram na rodada continuam como estavam

#### Scenario: Rodada de jogo de frase
- **WHEN** uma rodada e gravada so com `itemRef`, sem `cardId` (karaoke, ditado, escuta, conectores, embaralhar)
- **THEN** a rodada e gravada normalmente e nenhum recalculo acontece

#### Scenario: Falha no recalculo
- **WHEN** o recalculo posterior a resposta falha
- **THEN** a rodada continua gravada e a resposta continua 200 — a falha e registrada, nao propagada
