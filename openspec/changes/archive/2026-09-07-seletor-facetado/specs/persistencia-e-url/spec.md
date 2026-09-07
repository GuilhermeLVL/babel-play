## ADDED Requirements

### Requirement: O filtro sobrevive entre visitas
O sistema SHALL persistir o filtro facetado escolhido, e SHALL reconstruir fielmente a partir da
escolha legada quando a chave nova ainda não existir.

#### Scenario: Primeira leitura sem a chave nova
- **WHEN** `babel.filtro_da_pratica` não existe no `localStorage` mas `babel.fonte_da_pratica`
  (chave legada) existe
- **THEN** o filtro é reconstruído fielmente a partir da escolha legada, sem misturar fontes que a
  tela antiga não misturava
- Coberto por: `src/lib/filtroDaPratica.ts` (`filtroDaLegada`) — sem teste dedicado localizado
  nesta auditoria; **não verificado por teste automatizado**

#### Scenario: Gravação espelha a chave legada
- **WHEN** o filtro é gravado
- **THEN** a chave nova é escrita E a chave legada é atualizada via `escolhaDaFonte(fonteDominante(filtro))`,
  garantindo rollback coerente por um release
- Coberto por: `src/lib/filtroDaPratica.ts` (`gravarFiltro`) — não verificado por teste automatizado
  nesta auditoria

### Requirement: O filtro padrão produz URL limpa
O sistema SHALL serializar o filtro na query string de `/jogar` de forma legível, e SHALL produzir
string vazia quando o filtro é o padrão.

#### Scenario: Filtro padrão
- **WHEN** `queryDoFiltro` recebe `FILTRO_PADRAO`
- **THEN** o resultado é a string vazia
- Coberto por: `tests/filtro-na-url.test.ts` — "o filtro padrão é URL limpa — sem ruído na barra"

#### Scenario: Padrão com `false` explícitos
- **WHEN** o filtro tem os mesmos valores do padrão, mas com flags booleanas explicitamente `false`
  (a forma que o saneador da persistência materializa)
- **THEN** o resultado ainda é URL limpa — a comparação é sobre a serialização, não sobre a
  identidade do objeto
- Coberto por: `tests/filtro-na-url.test.ts` — "o padrão com `false` explícitos… também é URL limpa"

#### Scenario: Filtro com facetas marcadas
- **WHEN** o filtro tem fontes, recorte e mídia marcados
- **THEN** a query usa segmentos legíveis (`recorte=pedindo-revisao`, não `recorte[pedindoRevisao]=true`)
- Coberto por: `tests/filtro-na-url.test.ts` — "fala a língua de quem lê a URL"

### Requirement: Serializar e ler devolve o mesmo filtro
O sistema SHALL garantir que `filtroDaQuery(queryDoFiltro(f))` reproduza `f` quando toda referência
(sessão, deck) ainda existe.

#### Scenario: Ida e volta com tudo existente
- **WHEN** um filtro é serializado e imediatamente lido de volta, com as mesmas listas de sessões e
  decks existentes usadas na leitura
- **THEN** o filtro resultante é igual ao original
- Coberto por: `tests/filtro-na-url.test.ts` — describe "ida-e-volta", "serializar e ler devolve o MESMO filtro quando tudo ainda existe"

### Requirement: A leitura da URL nunca deriva para um padrão que apague a escolha guardada
O sistema SHALL devolver `null` de `filtroDaQuery` quando a query não descreve um filtro, e SHALL
ignorar campo a campo referências que não existem mais, sem descartar a leitura inteira.

#### Scenario: Query sem parâmetro `fonte`
- **WHEN** a query da URL não tem o parâmetro `fonte`
- **THEN** `filtroDaQuery` devolve `null`, e o chamador cai na persistência local em vez de um
  padrão vazio
- Coberto por: `tests/filtro-na-url.test.ts` — "query sem `fonte` é null — quem decide é a persistência local"

#### Scenario: `fonte` só com lixo
- **WHEN** o parâmetro `fonte` só contém valores desconhecidos
- **THEN** o resultado também é `null` — lixo não é uma escolha válida
- Coberto por: `tests/filtro-na-url.test.ts` — "`fonte` só com valores desconhecidos também é null — lixo não é uma escolha"

#### Scenario: Link antigo com deck ou sessão apagados
- **WHEN** a query referencia um `baralho` ou `sessao` que não existe mais na lista fornecida
- **THEN** essa referência cai fora da lista resultante, mas o restante do filtro (outras facetas)
  é preservado
- Coberto por: `tests/filtro-na-url.test.ts` — "deck e sessão apagados caem fora sem derrubar o resto do link"

#### Scenario: Nível ou recorte desconhecido
- **WHEN** a query tem um valor de nível CEFR fora da escala ou um segmento de recorte não
  reconhecido
- **THEN** só esse campo é ignorado, campo a campo — nunca derruba a leitura inteira
- Coberto por: `tests/filtro-na-url.test.ts` — "nível fora da escala e recorte desconhecido são ignorados campo a campo"

### Requirement: A query de `/jogar` sobrevive à dança de boot do App
O sistema SHALL capturar a query string de `/jogar` na avaliação do módulo de rotas, antes de
qualquer reescrita de URL causada pelo boot do `App`, e SHALL consumi-la uma única vez.

#### Scenario: Abertura de link com filtro
- **WHEN** o usuário abre um link `/jogar?fonte=baralho&baralho=deckA` e o `App` monta
- **THEN** `consumirQueryDoBoot()` devolve a query original mesmo que o efeito de boot do `App`
  já tenha reescrito a URL sem ela
- Coberto por: `tests/filtro-na-url.test.ts` — "a query capturada no boot sobrevive à reescrita
  da barra, e o consumo é único" (módulo re-avaliado com `window` stub)

#### Scenario: Segunda leitura não repete o link
- **WHEN** `consumirQueryDoBoot()` já foi chamado uma vez nesta sessão do módulo
- **THEN** chamadas seguintes devolvem string vazia — o link vale só para a abertura que o causou
- Coberto por: `tests/filtro-na-url.test.ts` — mesmo teste acima (a segunda chamada devolve '')

### Requirement: A query de `/jogar` não vaza para outras rotas
O sistema SHALL escrever ou limpar a query do filtro somente enquanto `/jogar` está na barra de
endereço, e SHALL usar `replaceState` para não empilhar histórico por ajuste de faceta.

#### Scenario: Fora de `/jogar`
- **WHEN** `publicarQueryDoJogar` é chamado com o caminho atual diferente de `/jogar`
- **THEN** a chamada é não-op — a barra de endereço não muda
- Coberto por: `tests/filtro-na-url.test.ts` — "publicarQueryDoJogar só age com /jogar na barra,
  e limpa com string vazia"
