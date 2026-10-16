## Context

`Metrics.tsx` (1247 linhas) hoje é 4 telas costuradas por um `useState<mainTab>` e um componente
`<Abas>`/`<PainelDeAba>` que monta as quatro só trocando `display` via classe — os cálculos
(`lowRetentionAnalysis`, `textStats`, `vozPassiva`, `corpusDoAlvo`, `levelDist`, etc.) já rodam para
a tela inteira independente da aba ativa, então a divisão em abas é puramente de apresentação, não
de dados. Isso simplifica a migração: não há fetch condicional por aba para reestruturar.

Duas telas duplicam KPIs (deckSize e wordsCaptured aparecem em "Visão geral" E "Inteligência
lexical"), duas seções inteiras de "Desempenho & fluência" são permanentemente `<SemDado>` (Radar
Acústico, Tom da Fala), e dois campos reais do `AppMetrics` (`acertoPorExercicio`, `avgStability`)
nunca aparecem em gráfico — só no `.txt` exportado e num modal secundário, respectivamente.

A spec `metricas-honestas` (existente, não modificada por esta mudança) exige que todo painel vazio
explique a população real e que todo gráfico só plote o escopo que anuncia. Isso restringe como os
dois gráficos novos podem ser escritos: sem fallback fabricado, com o mesmo tratamento de "base
insuficiente" que o resto da tela já usa (`SemDado`, `Confianca`).

## Goals / Non-Goals

**Goals:**

- Uma página por scroll único, sem clique para revelar conteúdo — friccão zero para ver o panorama.
- Zero duplicação de KPI: cada número real aparece em exatamente um lugar.
- Os dois painéis permanentemente vazios encolhem para uma nota, sem apagar a explicação honesta.
- `acertoPorExercicio` e `avgStability` ganham visualização própria, com o mesmo padrão de
  honestidade (estado vazio explica) que todo outro gráfico da tela já segue.
- Navegação por âncora (sticky) para quem quer pular direto a uma seção, sem esconder o resto.

**Non-Goals:**

- Nenhum dado novo do servidor. Não altera `AppMetrics`, nenhum endpoint, nenhuma migração.
- Não mexe no modal `MetricsExpandedKpi` além de continuar funcionando como detalhamento avançado
  dos 4 KPIs do topo (ele já existe e cobre um caso de uso diferente: aprofundar um número, não
  navegar entre seções).
- Não resolve o Radar Acústico nem o Tom da Fala de verdade (continuam sem dado — isso exigiria um
  LLM que o app propositalmente não chama; fora de escopo).
- Não muda a rota pública (`/vocabulario` continua sendo o endereço da tela).

## Decisions

### D1 — Seções em vez de abas, navegação por âncora sticky

`mainTab: 'palavras' | 'dashboard' | 'lexical' | 'fluency'` sai do estado do componente. As quatro
`<PainelDeAba>` viram `<section id="...">` sequenciais dentro do mesmo scroll. Uma barra sticky logo
abaixo do cabeçalho (mesma posição onde as abas ficavam) lista as seções como pills; clicar rola
suavemente (`scrollIntoView({behavior:'smooth', block:'start'})`) até a âncora, e um
`IntersectionObserver` marca a pill da seção visível como ativa — mesmo padrão de "aba ativa" visual,
zero JS de roteamento.

Alternativa considerada: manter abas, só remover a duplicação. Rejeitada — não atende o pedido
explícito de "unificar numa tela só", e não resolve a fricção de trocar de aba para montar o
panorama completo.

Ordem das seções (herói → analítico → funcional, do que se olha ao que se usa):

1. **Resumo** (KPIs únicos + prontas-para-revisar, herda o herói da antiga aba "palavras")
2. **Evolução** (gráfico semanal existente + NOVO: desempenho por exercício)
3. **Vocabulário** (distribuição CEFR + palavras difíceis + requer atenção — funde "dashboard" e
   "lexical")
4. **Fala & Fluência** (WPM, tempo de fala, complexidade gramatical, voz passiva, nota compacta dos
   dois painéis sem dado, NOVO: estabilidade FSRS ao lado da retenção)
5. **Meu caderno** (lista de palavras pesquisável — última seção, mais densa/funcional)

### D2 — Eliminar duplicação: um dono por número

`deckSize` e `wordsCaptured` ficam SÓ na faixa de KPIs da seção Resumo. A antiga aba "Inteligência
lexical" perde seus 3 KPI-cards redundantes; o que sobra dela de único (o donut CEFR) migra para a
seção Vocabulário. `uniqueWords` (só usado ali) ganha um lugar na mesma faixa de KPIs do Resumo, como
5º cartão opcional, OU fica só como legenda do donut — decisão de layout na implementação, não muda
requisito.

### D3 — Gráfico novo: Desempenho por tipo de exercício

Fonte: `metrics.acertoPorExercicio` (já ordenado pior-primeiro pelo servidor). Renderização: lista de
barras horizontais reaproveitando o componente `<Barra>` (`components/ui/Barra.tsx`) — o mesmo já
usado no painel "Requer Atenção", mantém acessibilidade (`role="progressbar"`) de graça. Rótulo de
cada barra via `JOGOS.find(j => j.id === kind)` + `tituloDoJogo(jogo, ageProfile)`
(`components/views/play/jogos.tsx`, já usado para o mesmo mapeamento em `Recordes.tsx`) — sem
inventar uma segunda tabela de nomes de jogo; fallback para o `kind` cru quando o id não é
encontrado (mesmo fallback de `Recordes.tsx`).
Estado vazio: `metrics.acertoPorExercicio` ausente/vazio → `<SemDado>` explicando que nenhum
exercício teve o mínimo de itens ainda (o servidor já filtra por "mínimo 3 itens por tipo" antes de
mandar o array — a tela não reintroduz esse limiar, só relata a ausência quando ele zera a lista).

### D4 — Gráfico novo: Força de memorização (estabilidade FSRS)

Fonte: `metrics.avgStability` (dias). Cartão simples ao lado do KPI de Retenção existente (mesma
seção, para ler os dois juntos: "quão provável lembrar agora" + "quanto tempo a memória aguenta sem
revisar"). Sem fabricar confiança nova: reaproveita a mesma condição de "sem revisões ainda" que o
KPI de retenção já usa (`avgRetentionConfidence`), já que os dois vêm do mesmo filtro de cartões
revisados (`revisados` em `metricas.ts`).

### D5 — Painéis sem dado permanentes: comprimir, não remover

Radar Acústico (400px) e Tom da Fala (bloco próprio) colapsam para UM único bloco compacto na seção
Fala & Fluência: "Fluência por IA — ainda não medido", com a explicação honesta existente
(reaproveitada, não reescrita) num `<SemDado compacto>` só, em vez de dois blocos grandes separados.
Removê-los inteiramente foi cogitado e rejeitado: a explicação de POR QUE não existe (exige LLM que
o app não chama) é informação real que o usuário perguntaria por e-mail se sumisse sem aviso.

## Risks / Trade-offs

- [Página única = tudo monta de uma vez, sem esperar clique de aba] → Os dados já eram carregados
  inteiros independente da aba (ver Context); o único custo novo é DOM/render, não fetch. Mitigar
  com `content-visibility: auto` nas seções abaixo da dobra se o Lighthouse (spec
  `baseline-bundle-e-lighthouse`) apontar regressão de LCP — medir antes de otimizar.
- [Lista de vocabulário ("Meu caderno") agora vive no fim de uma página longa em vez de aba própria]
  → mitigado pela nav por âncora: um clique em "Meu caderno" pula direto, sem scroll manual.
- [`IntersectionObserver` para marcar a seção ativa pode custar re-render por scroll] → debounce/
  throttle no handler; é decoração visual (qual pill fica destacada), nunca a fonte de verdade de
  qual seção está montada — todas ficam sempre montadas.
- [Dois gráficos novos = duas novas formas de mostrar "sem dado"] → reusam os componentes
  `<SemDado>`/`<Confianca>` já existentes; nenhuma redação nova de honestidade a validar contra a
  spec, só posicionamento novo.

## Migration Plan

Mudança puramente de apresentação num único componente cliente (`Metrics.tsx` +
pequeno ajuste em `MetricsExpandedKpi.tsx` se `avgStability` sair de lá — a decidir na implementação
se o modal mantém sua própria cópia ou remove por redundância). Sem migração de dados, sem feature
flag: `git revert` do commit é o rollback. Validar manualmente pós-implementação com Playwright
(screenshot da tela em light/dark, com deck vazio e com deck populado) antes de considerar concluído
— a spec `metricas-honestas` cobre exatamente esses dois estados (vazio vs. populado) com cenários
que continuam válidos.

## Open Questions

- `uniqueWords` como 5º KPI no Resumo vs. legenda do donut CEFR — decidir durante a implementação,
  não muda nenhum requisito de spec.
- Se `avgStability` sai do modal `MetricsExpandedKpi` (para não duplicar) ou continua lá como
  detalhamento adicional do mesmo número já visível no card — tender para "continua lá": o modal
  aprofunda, o card novo só expõe o número que já existia escondido.
