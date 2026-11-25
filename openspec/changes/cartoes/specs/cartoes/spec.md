## ADDED Requirements

### Requirement: Limite diário guardado na conta

O sistema SHALL contar novas e revisões por dia no fuso da pessoa e guardar o contador na conta, de modo que o limite valha em todos os aparelhos e não por rodada.

#### Scenario: Duas rodadas no mesmo dia

- **WHEN** a pessoa faz uma rodada de 10 cartões novos e depois outra, com limite diário de 15
- **THEN** a segunda rodada oferece no máximo 5 novos

#### Scenario: Virada do dia

- **WHEN** passa a meia-noite no fuso da pessoa
- **THEN** o contador volta a zero e a tela mostra o teto cheio de novo

#### Scenario: Dois aparelhos

- **WHEN** a pessoa revisa 20 cartões no celular e abre a revisão no computador no mesmo dia
- **THEN** o computador já desconta os 20 do limite

#### Scenario: Limite não é cota de plano

- **WHEN** o limite diário é lido ou gravado
- **THEN** nenhum valor de plano é consultado e nenhuma constante nova é criada fora de `src/core/planos.ts`

### Requirement: Nota de revisão não se perde em silêncio

O sistema SHALL avisar quando uma nota não foi gravada e SHALL oferecer nova tentativa enquanto a tela estiver aberta, sem guardar nada depois de fechada.

#### Scenario: Sem rede

- **WHEN** a gravação de uma nota falha por falta de rede
- **THEN** a tela mostra "Sem rede" com a quantidade pendente, e as notas são reenviadas quando a rede volta

#### Scenario: Tela fechada

- **WHEN** a pessoa fecha a tela com notas pendentes
- **THEN** nada fica guardado no aparelho e a próxima abertura não reenvia nada

### Requirement: Quem erra revê na mesma sessão

O sistema SHALL recolocar na fila da rodada o cartão respondido com Errei, sem alterar o agendamento calculado pelo FSRS.

#### Scenario: Errei volta

- **WHEN** a pessoa responde Errei
- **THEN** o cartão reaparece antes do fim da rodada e a segunda resposta não cria uma segunda penalidade na agenda

### Requirement: Estudo livre é escolha explícita

O sistema SHALL separar o estudo livre da agenda: o que a pessoa faz ali não muda datas de vencimento.

#### Scenario: Nada vence

- **WHEN** nenhum cartão vence hoje e a pessoa escolhe "Estudo livre"
- **THEN** a rodada abre fora da agenda e nenhuma data de próxima revisão muda

### Requirement: Palavra difícil tem saída

O sistema SHALL avisar da palavra difícil e oferecer três saídas (trocar a frase, rever a cena, descansar 30 dias), com o limiar de erros configurável.

#### Scenario: Limiar atingido

- **WHEN** a palavra chega ao limiar de erros
- **THEN** o aviso mostra as três saídas, e "Descansar 30 dias" grava só a data de vencer, sem linha de revisão

### Requirement: Tempo por cartão só com tempo medido

O sistema SHALL mostrar tempo por cartão e tempo estimado apenas quando o cliente enviar o tempo de resposta, e SHALL tratar esse dado como comportamento: fora de anúncio e de perfil.

#### Scenario: Poucas respostas

- **WHEN** há menos de 10 respostas com tempo medido
- **THEN** a Memória não mostra o número de tempo

### Requirement: Recortes de revisão pela ficha de conteúdo

O sistema SHALL permitir revisar por idioma, baralho do Anki, Trilha, sessão e difíceis, e SHALL excluir baralho desativado da fila de Hoje e dos jogos.

#### Scenario: Baralho desativado

- **WHEN** a pessoa desativa um baralho do Anki
- **THEN** ele sai da fila de Hoje e de Jogar sem apagar notas nem cartões, e pode ser reativado

#### Scenario: Seleção de outro usuário

- **WHEN** uma ação em massa recebe ids de cartões de outra conta
- **THEN** o servidor responde 404 para eles e não revela que existem
