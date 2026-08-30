## ADDED Requirements

### Requirement: Comparação de vários modelos numa execução

A bancada SHALL aceitar uma lista de modelos e avaliar todos no mesmo gold set, numa única
execução, produzindo um resultado por modelo sob a mesma configuração de prompt, temperatura e
contexto.

#### Scenario: Vários modelos na mesma rodada
- **WHEN** a bancada é executada com uma lista de dois ou mais identificadores de modelo
- **THEN** cada modelo é avaliado sobre exatamente os mesmos casos, com o mesmo prompt de produção,
  e o resultado traz uma entrada por modelo

#### Scenario: Um modelo indisponível não derruba a bateria
- **WHEN** um dos modelos responde erro (indisponível, sem crédito, limite de requisição)
- **THEN** a bancada registra a falha para aquele modelo, com a mensagem do provedor, e **continua**
  avaliando os demais

#### Scenario: Modelo com falha parcial não entra no ranking
- **WHEN** um modelo falha em mais de 10% dos casos
- **THEN** o resultado dele é marcado como inválido e NÃO recebe posição no ranking, porque uma
  média sobre os casos que sobraram descreveria um subconjunto favorável

### Requirement: Fidelidade ao caminho de produção

A bancada SHALL usar o mesmo prompt, os mesmos parâmetros de geração e a mesma janela de contexto
que `server/ai/mtProxy.ts` usa para fala, de modo que a nota descreva o produto e não o harness.

#### Scenario: Prompt compartilhado com o servidor
- **WHEN** a bancada monta a requisição de tradução de fala
- **THEN** ela usa `systemComunicativo` e `userComunicativo` de
  `src/lib/traducao/promptComunicativo.ts`, os mesmos que o servidor importa

#### Scenario: Modelo dedicado a tradução usa o formato dos seus autores
- **WHEN** o modelo avaliado é de uma família dedicada a tradução, com template próprio documentado
- **THEN** a bancada usa o template documentado por seus autores, e o relatório registra qual
  formato foi usado para cada modelo

### Requirement: Custo medido, não tabelado

A bancada SHALL somar os tokens realmente informados pelo provedor em cada resposta e derivar o
custo por mil falas a partir deles.

#### Scenario: Tokens de raciocínio entram no custo
- **WHEN** o modelo avaliado é de raciocínio e gasta tokens de pensamento antes da resposta
- **THEN** esses tokens são contados como saída no custo, porque é assim que o provedor cobra

#### Scenario: Preço vem do catálogo, com data
- **WHEN** a bancada calcula custo
- **THEN** o preço por milhão de tokens é lido do catálogo do provedor no momento da execução, e
  gravado no resultado junto da data da consulta

#### Scenario: Preço indisponível não vira zero
- **WHEN** o catálogo não informa preço para um modelo
- **THEN** o custo daquele modelo é reportado como desconhecido, e NUNCA como zero

### Requirement: Métrica dupla com juiz independente

A bancada SHALL avaliar cada saída por chrF++ e por um juiz LLM com rubrica, e reportar as duas.

#### Scenario: O juiz não é candidato
- **WHEN** o juiz é escolhido
- **THEN** ele é o mesmo para todos os candidatos e não pertence ao conjunto avaliado

#### Scenario: Discordância entre métricas é reportada
- **WHEN** o chrF++ e o juiz ordenam dois modelos de forma diferente
- **THEN** o relatório mostra os casos em que discordam, com as saídas, em vez de escolher uma das
  métricas em silêncio

### Requirement: Ranking só quando há sinal

A bancada SHALL medir a variação entre execuções repetidas do mesmo modelo, e SHALL NOT apresentar
ordem de classificação quando essa variação for comparável à diferença entre modelos.

#### Scenario: Repetição do mesmo modelo
- **WHEN** um modelo finalista é avaliado duas vezes com a mesma configuração
- **THEN** a diferença entre as duas execuções é reportada junto do ranking

#### Scenario: Diferença dentro do ruído
- **WHEN** a diferença entre dois modelos é menor que a variação entre execuções do mesmo modelo
- **THEN** o relatório declara empate técnico, e não posições distintas

### Requirement: Resultado auditável

A bancada SHALL gravar o resultado bruto caso a caso, de forma que qualquer número do relatório
possa ser conferido sem repetir a bateria.

#### Scenario: Saída bruta por caso
- **WHEN** a bancada termina
- **THEN** ela grava um JSON contendo, por modelo e por caso, a entrada, a saída, a referência, as
  notas das duas métricas e os tokens gastos

### Requirement: Registro da política de dados do provedor

O relatório SHALL declarar, para cada provedor avaliado, o que a política dele diz sobre uso do
conteúdo enviado para treinamento.

#### Scenario: Provedor recomendado para produção
- **WHEN** um provedor é recomendado para uso em produção
- **THEN** a recomendação vem acompanhada da política de uso de dados dele, porque o app transmite
  fala de usuários e isso precisa constar na política de privacidade
