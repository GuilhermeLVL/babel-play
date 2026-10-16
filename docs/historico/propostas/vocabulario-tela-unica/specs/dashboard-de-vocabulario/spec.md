## ADDED Requirements

### Requirement: Página única, sem abas que escondem conteúdo

A tela de Vocabulário SHALL apresentar todo o conteúdo (resumo, evolução, vocabulário, fala &
fluência, meu caderno) como seções sequenciais de uma única página, nunca atrás de uma aba que
precise ser clicada para existir no DOM.

#### Scenario: Todas as seções chegam montadas

- **WHEN** a tela de Vocabulário termina de carregar as métricas
- **THEN** as seções Resumo, Evolução, Vocabulário, Fala & Fluência e Meu Caderno estão todas
  presentes na página, sem exigir clique em aba para aparecer

#### Scenario: Sem índice de navegação no topo

- **WHEN** a tela de Vocabulário é renderizada
- **THEN** não existe barra de abas nem de âncoras para as seções: o que separa uma seção da outra
  é o espaço entre elas e o título de cada uma, e a leitura é por rolagem contínua

### Requirement: Cada métrica real aparece em exatamente um lugar

A tela SHALL exibir cada número derivado de `AppMetrics` (tamanho do deck, palavras capturadas,
palavras distintas) em exatamente um cartão de KPI, nunca repetido em mais de um lugar da página.

#### Scenario: Tamanho do deck sem duplicata

- **WHEN** a tela de Vocabulário renderiza a faixa de KPIs do topo e a seção de Vocabulário
- **THEN** o valor de `deckSize` aparece em exatamente um cartão de KPI na página inteira

### Requirement: Desempenho por tipo de exercício visualizado

Quando o servidor retornar `acertoPorExercicio` com pelo menos um item, a tela SHALL exibir uma
barra de progresso por tipo de exercício, ordenada do pior para o melhor desempenho, com o nome
amigável do jogo (não o id técnico) e o percentual de acerto.

#### Scenario: Lista de exercícios com dado suficiente

- **WHEN** `metrics.acertoPorExercicio` contém itens
- **THEN** cada item vira uma barra com o título amigável do jogo (via `JOGOS`/`tituloDoJogo`) e o
  percentual de acerto, na mesma ordem (pior primeiro) recebida do servidor

#### Scenario: Nenhum exercício com base suficiente ainda

- **WHEN** `metrics.acertoPorExercicio` é `undefined` ou um array vazio
- **THEN** a seção mostra uma explicação de que nenhum tipo de exercício teve itens suficientes
  ainda, em vez de um gráfico vazio ou zerado

### Requirement: Estabilidade de memorização (FSRS) visível

A tela SHALL exibir `metrics.avgStability` (estabilidade média, em dias, dos cartões já revisados)
como um cartão próprio, visível sem exigir abrir um modal de detalhamento.

#### Scenario: Cartões já revisados

- **WHEN** existe pelo menos um cartão revisado (mesma população que alimenta `avgRetention`)
- **THEN** o cartão de estabilidade mostra o valor de `metrics.avgStability` em dias

#### Scenario: Nenhum cartão revisado ainda

- **WHEN** nenhum cartão do deck foi revisado ainda
- **THEN** o cartão de estabilidade usa a mesma explicação de "sem revisões ainda" que o cartão de
  retenção usa para a mesma condição, em vez de mostrar `0d`

### Requirement: Painéis sem dado real ficam compactos, sem desaparecer

A tela SHALL manter a explicação de por que as métricas que dependem de um modelo de linguagem
(avaliação acústica multidimensional, classificação de tom de voz) não existem, em um único bloco
compacto no lugar dos dois painéis de tamanho de conteúdo real que existiam antes desta mudança.

#### Scenario: Explicação preservada

- **WHEN** o usuário chega à seção Fala & Fluência
- **THEN** o bloco de "ainda não medido" explica que avaliação acústica e classificação de tom
  exigiriam um modelo de linguagem que o app não chama — a mesma razão já comunicada antes desta
  mudança, sem reescrita que enfraqueça a honestidade da explicação

### Requirement: Corpus vazio por descasamento de idioma tem diagnóstico e saída

A tela SHALL mostrar a distribuição real das falas por idioma e um caminho de conserto sempre que
houver fala capturada e nenhuma dela estiver no idioma de estudo configurado — em vez de apenas
declarar a ausência e deixar as medidas de fala vazias sem causa aparente.

#### Scenario: Nenhuma fala no idioma estudado

- **WHEN** existem falas capturadas e nenhuma no idioma que o usuário estuda
- **THEN** a seção Fala & Fluência mostra quantas falas existem em cada idioma do acervo, contadas
  das etiquetas reais das falas, e oferece tanto trocar o idioma de estudo quanto abrir Ajustes

#### Scenario: A sugestão nunca é o idioma do próprio usuário

- **WHEN** o idioma mais falado do acervo é o idioma que o usuário fala (`mine`)
- **THEN** a troca sugerida é o idioma mais falado que NÃO é o dele, e o dele aparece na lista
  marcado como "(o seu)"; se só existir o dele no acervo, nenhuma troca é sugerida

#### Scenario: A troca pede confirmação

- **WHEN** o usuário aciona a troca de idioma a partir desta tela
- **THEN** uma confirmação declara que a mudança vale para todo o app antes de qualquer gravação, e
  as medidas da tela se recalculam sem recarregar a página depois de confirmada
