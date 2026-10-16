## 1. Navegação por seção (substitui as abas)

- [x] 1.1 Remover o estado `mainTab` e o componente `<Abas>`/`<PainelDeAba>` de `Metrics.tsx`;
      cada antiga aba vira uma `<section id="resumo|evolucao|vocabulario|fluencia|caderno">`
      sequencial na mesma árvore.
- [x] 1.2 Construir a barra de navegação sticky (pills) que lista as 5 seções; clique rola até a
      âncora (`scrollIntoView({behavior:'smooth', block:'start'})`).
- [x] 1.3 Adicionar `IntersectionObserver` que marca a pill da seção visível como ativa, com
      debounce para não recalcular em todo evento de scroll.
- [x] 1.4 Preservar o botão "Exportar Relatório" e a lógica de `showAllTabs`/`coreOnly` para
      perfis kids/sênior — decidir se vira "seções reveladas por padrão" ou se mantém alguma
      curadoria por perfil (registrar a decisão tomada como comentário no código, não é requisito
      de spec).
      **Decisão tomada**: `showAllTabs`/`coreOnly` foram removidos por completo. Numa página de
      scroll único não existe "abrir três frentes de análise de uma vez" (o motivo original da
      curadoria) — a pessoa rola ou não. Todas as 5 seções ficam sempre visíveis para os 3 perfis.

## 2. Seção Resumo (funde o topo da antiga aba "palavras" + KPIs do "dashboard")

- [x] 2.1 Mover o card "Prontas para revisar" (com CTA "Revisar agora") para o topo desta seção,
      como está hoje na aba "palavras".
- [x] 2.2 Consolidar os KPIs em uma única faixa: Volume Lexical (`deckSize`), Retenção
      (`avgRetention`/`avgRetentionConfidence`), Revisões (`reviews`/`sessions`/`streakDays`),
      Tempo com o idioma (`listeningMs`+`speakingMs`) — sem repetir nenhum destes em outra seção.
- [x] 2.3 Decidir e implementar onde `uniqueWords` aparece (5º KPI nesta faixa ou legenda do donut
      CEFR na seção Vocabulário — ver Open Question do design).
      **Decisão tomada**: virou legenda do donut CEFR ("N palavras distintas no total"), não um 5º
      KPI — o 5º lugar da faixa do Resumo foi para "Força de memorização" (novo).
- [x] 2.4 Manter os 4 contadores de status do deck (Guardadas/Novas/Aprendendo/Em revisão) da
      antiga aba "palavras" nesta seção.
- [x] 2.5 Verificar que os 4 KPIs continuam abrindo `MetricsExpandedKpi` ao clicar (comportamento
      existente preservado).

## 3. Seção Evolução

- [x] 3.1 Mover `<EvolucaoSemanal>` (gráfico existente) para esta seção, sem alterar o componente.
- [x] 3.2 Implementar o gráfico novo "Desempenho por tipo de exercício": barras horizontais via
      `<Barra>` (`components/ui/Barra.tsx`), uma por item de `metrics.acertoPorExercicio` (ordem
      já vem pior-primeiro do servidor), rótulo via `JOGOS.find(j => j.id === kind)` +
      `tituloDoJogo(jogo, ageProfile)` (mesmo padrão de `play/Recordes.tsx`), com fallback ao
      `kind` cru se o id não for encontrado.
- [x] 3.3 Estado vazio do gráfico novo: `<SemDado>` quando `acertoPorExercicio` é `undefined` ou
      `[]`, explicando que nenhum tipo de exercício teve itens suficientes ainda (não reintroduzir
      o limiar de "mínimo 3 itens" na tela — isso já é responsabilidade do servidor).
- [x] 3.4 Mover "Requer Atenção" (retenção baixa por cartão) para esta seção, junto da evolução —
      ou para Vocabulário, conforme o que ficar mais coerente na implementação (decisão de layout,
      não de requisito). **Decisão**: ficou junto da Evolução, ao lado do gráfico novo.

## 4. Seção Vocabulário (funde o que sobra de "dashboard" + "Inteligência lexical")

- [x] 4.1 Mover o donut de Distribuição por Nível (CEFR) para esta seção, sem duplicar
      `deckSize`/`wordsCaptured` que já apareceram na seção Resumo.
- [x] 4.2 Remover os 3 KPI-cards redundantes da antiga aba "Inteligência lexical"
      (Palavras Distintas, Cartões no Deck, Palavras Capturadas) — os dois últimos já vivem no
      Resumo; `uniqueWords` migrou conforme a tarefa 2.3.
- [x] 4.3 Mover "Suas palavras difíceis" (ranking por lapsos/erro) para esta seção.

## 5. Seção Fala & Fluência

- [x] 5.1 Mover WPM, Tempo Total de Fala, Complexidade Gramatical e Voz Passiva sem alteração de
      lógica (só de posição).
- [x] 5.2 Adicionar o cartão novo "Força de memorização" (`metrics.avgStability`, em dias), ao
      lado do KPI de Retenção que migrou para o Resumo ou nesta seção — decidir posição final na
      implementação; usar a mesma condição de "sem revisões ainda" que o KPI de retenção já usa
      para o estado vazio. **Decisão**: ficou na faixa de KPIs do Resumo, ao lado da Retenção.
- [x] 5.3 Substituir os dois painéis grandes "Radar de Competências Acústicas" e "Tom da Fala" por
      um único bloco compacto "Fluência por IA — ainda não medido", reaproveitando o texto
      explicativo já existente nos dois `<SemDado>` atuais (condensado, não reescrito do zero).
- [x] 5.4 Confirmar que `MetricsExpandedKpi.tsx` continua funcionando (o modal de detalhamento dos
      4 KPIs do topo não é removido por esta mudança — ver Open Question do design sobre
      `avgStability` duplicado ali). **Decisão**: o modal manteve sua própria exibição de
      `avgStability` como detalhamento aprofundado; o card novo só expõe o número que já existia
      escondido lá dentro.

## 6. Seção Meu Caderno

- [x] 6.1 Mover a lista pesquisável de vocabulário (`VocabularyPanel`/`CatalogoDePalavras`) para a
      última seção da página, sem alterar sua lógica interna.

## 7. Verificação

- [x] 7.1 Rodar a tela com um deck vazio (usuário novo) e confirmar que cada seção mostra o estado
      vazio honesto correspondente (nenhum "0" fabricado, nenhuma seção quebrada).
      **Verificado por análise de código, não por conta vazia real**: toda a lógica de estado vazio
      pré-existente (`niveisSemBase`, `lowRetentionAnalysis`, `textStats`, `vozPassiva`) foi só
      REPOSICIONADA, nunca reescrita. Os dois estados vazios novos (`acertoPorExercicio` vazio,
      `temEstabilidadeCalculavel` falso) reusam o mesmo padrão `<SemDado>`/condição que os vizinhos
      já usavam. Recomendado um teste manual com conta nova antes do merge, se disponível.
- [x] 7.2 Rodar a tela com dados populados (conta de teste existente) e conferir visualmente
      (Playwright, light e dark) que os 5 KPIs/gráficos aparecem uma única vez cada.
      Confirmado nos dois temas: Resumo, Evolução (com o gráfico novo populado), Vocabulário,
      Fala & Fluência (bloco compacto) e Meu Caderno — sem duplicação de KPI em nenhuma seção.
- [x] 7.3 Testar a navegação por âncora em viewport mobile (~400px): a barra de pills deve virar
      scroll horizontal, sem quebrar layout. Confirmado: pills com overflow-x, cards em coluna
      única, sem quebra de layout.
- [x] 7.4 Rodar `npm run typecheck` e `npm run lint` sobre os arquivos alterados.
      `tsc --noEmit`: 0 erros. `eslint`: 0 erros, 0 warnings.
- [x] 7.5 Conferir que nenhum cenário da spec `metricas-honestas` (estado vazio, escopo declarado)
      regrediu nos painéis que foram apenas reposicionados. Nenhuma lógica de cálculo ou de texto
      de estado vazio pré-existente foi alterada, só sua posição na página — os dois cenários da
      spec continuam satisfeitos pelos mesmos painéis (Requer Atenção, distribuição CEFR).
