## Why

A tela de Vocabulário (`src/components/views/Metrics.tsx`) está fragmentada em 4 abas ("Minhas
palavras", "Visão geral", "Inteligência lexical", "Desempenho & fluência") que forçam o usuário a
clicar entre telas para montar uma visão do próprio progresso. Duas dessas abas duplicam os mesmos
números (tamanho do deck e palavras capturadas aparecem em "Visão geral" E em "Inteligência
lexical"), e dois painéis inteiros ("Radar de Competências Acústicas", "Tom da Fala") mostram
permanentemente "sem dado" — não há plano de alimentá-los (exigiriam um LLM que o app propositalmente
não chama), mas ocupam ~400px de altura cada, fingindo ser conteúdo. Ao mesmo tempo, dados REAIS já
calculados pelo servidor nunca aparecem em gráfico nenhum: `acertoPorExercicio` (taxa de acerto por
tipo de jogo) só existe no `.txt` exportado, e `avgStability` (estabilidade média FSRS) só aparece
dentro de um modal secundário de detalhamento.

## What Changes

- Substituir as 4 abas por uma única página em scroll contínuo, dividida em seções visualmente
  distintas, com uma barra de navegação por âncoras (sticky) para pular direto a uma seção sem
  perder o resto do conteúdo — em vez de escondê-lo atrás de uma aba.
- Eliminar a duplicação de KPIs entre as antigas abas "Visão geral" e "Inteligência lexical":
  cada número real (tamanho do deck, palavras capturadas, palavras distintas) aparece em UM lugar
  só, na faixa de KPIs do topo.
- Substituir os dois painéis permanentemente vazios (Radar Acústico, Tom da Fala) por uma
  única nota compacta de "ainda não medido" — libera o espaço vertical que hoje finge ser conteúdo
  sem apagar a explicação honesta de por que não existe.
- Adicionar dois gráficos novos com dados 100% reais que já existem no backend e nunca foram
  visualizados:
  - **Desempenho por tipo de exercício** — barras horizontais a partir de `metrics.acertoPorExercicio`
    (pior primeiro), hoje só disponível no relatório `.txt` exportado.
  - **Força de memorização (estabilidade FSRS)** — `metrics.avgStability`, hoje só visível dentro do
    modal de detalhamento do KPI de retenção, ganha um cartão próprio ao lado da retenção média.
- Manter a lista de vocabulário pesquisável (antiga aba "Minhas palavras") como a última seção da
  página — é a mais densa/funcional e continua servindo quem quer só filtrar palavras.
- Manter todas as regras de honestidade existentes (estado vazio explica a população real, escopo
  declarado = escopo aplicado, nunca fabricar retenção/nível sem base) — nenhum dado novo é
  inventado, apenas dados reais que já existiam ganham visualização.
- **BREAKING** (interno, não de API): a navegação por `mainTab` (`palavras`/`dashboard`/`lexical`/
  `fluency`) deixa de existir como estado de aba; vira navegação por âncora dentro de uma página só.
  Nenhuma rota pública (`/vocabulario`) muda de endereço.

## Capabilities

### New Capabilities

- `dashboard-de-vocabulario`: a tela de Vocabulário como página única com seções navegáveis por
  âncora, KPIs sem duplicação, e os dois gráficos novos (desempenho por exercício e estabilidade
  FSRS) construídos sobre dados já existentes no `AppMetrics`.

### Modified Capabilities

(nenhuma — `metricas-honestas` é respeitada como está, sem mudança de requisito: os cenários
existentes de "estado vazio diz a verdade" e "escopo declarado é escopo aplicado" continuam valendo
e passam a se aplicar também aos dois gráficos novos.)

## Impact

- `src/components/views/Metrics.tsx` — reescrita do layout (abas → seções únicas), mantendo os
  cálculos derivados existentes (`lowRetentionAnalysis`, `textStats`, `vozPassiva`, etc.).
- `src/components/views/MetricsExpandedKpi.tsx` — o conteúdo de "estabilidade FSRS" que hoje só
  existe aqui ganha visibilidade direta na página principal; o modal continua existindo para o
  detalhamento aprofundado dos outros KPIs.
- Nenhuma mudança de schema, endpoint ou contrato de API: `AppMetrics` já expõe todos os campos
  necessários (`acertoPorExercicio`, `avgStability`) — o trabalho é 100% de apresentação.
- Nenhum novo dado é buscado do servidor; nenhuma migração de banco.
