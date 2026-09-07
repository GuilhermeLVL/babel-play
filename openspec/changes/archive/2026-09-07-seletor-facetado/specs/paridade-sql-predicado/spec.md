## ADDED Requirements

### Requirement: O predicado do cliente e a consulta do servidor concordam
O sistema SHALL garantir que `passaNoFiltro` (predicado puro em TypeScript, usado no fallback local
e nos testes) e a consulta SQL de `selecionarParaJogo` (servidor) devolvam o mesmo conjunto de
cartões para o mesmo `FiltroDaPratica`.

#### Scenario: Bateria de filtros representativos
- **WHEN** dez filtros representativos (combinando fontes, recorte, mídia e idioma) são avaliados
  tanto pelo SQL do servidor quanto por `passaNoFiltro` sobre os mesmos dados
- **THEN** os dois caminhos devolvem conjuntos de ids idênticos
- Coberto por: `tests/integration/filtro-composicao.test.ts` — describe "paridade SQL × passaNoFiltro — a mesma verdade dos dois lados", teste "dez filtros representativos devolvem conjuntos idênticos"

### Requirement: O filtro novo preserva o comportamento dos chamadores antigos
O sistema SHALL, para requisições que ainda usam `fonte`/`fonteRef` (a forma anterior a esta
mudança) em vez de `filtro`, devolver o mesmo conjunto de cartões que devolvia antes.

#### Scenario: Fonte baralho com ref de deck Anki
- **WHEN** a requisição usa `fonte: 'baralho', fonteRef: 'anki:<deckA>'`
- **THEN** o conjunto devolvido é idêntico ao que `fontes: ['baralho'], baralhos: [deckA]` devolve
  no filtro novo
- Coberto por: `tests/integration/filtro-composicao.test.ts` — "fonte:'baralho', fonteRef:'anki:<deckA>' — mesmo conjunto que o filtro equivalente"

#### Scenario: Fonte trilha
- **WHEN** a requisição usa `fonte: 'trilha'` (forma antiga)
- **THEN** o conjunto é idêntico ao de `fontes: ['trilha']` no filtro novo
- Coberto por: `tests/integration/filtro-composicao.test.ts` — "fonte:'trilha' — mesmo conjunto que filtro fontes:[trilha]"

#### Scenario: Ausência de fonte
- **WHEN** nenhuma fonte é especificada na requisição (default histórico)
- **THEN** o resultado exclui a trilha, preservando o significado de "minhas gravações" de sempre
- Coberto por: `tests/integration/filtro-composicao.test.ts` — "sem fonte (default) — exclui trilha, o comportamento 'minhas gravações' intacto"

### Requirement: A coluna de idioma normalizado é sargável e mantém a semântica antiga
O sistema SHALL indexar a base do idioma (`src_lang_base`, coluna gerada a partir de `src_lang`) de
forma que o filtro por idioma use índice, com o mesmo resultado que o cálculo não-indexado anterior
produzia.

#### Scenario: Filtrar por idioma após a migração
- **WHEN** um filtro especifica `idiomas: ['en']` sobre o esquema pós-migração 0019
- **THEN** o resultado é idêntico ao que `LOWER(SUBSTR(src_lang,1,2)) = 'en'` produzia antes,
  agora resolvido via `idx_vocab_src_lang_base`
- Coberto por: `tests/integration/filtro-composicao.test.ts` — "lang continua funcionando (coluna sargável nova, mesma semântica)"

### Requirement: Filtro sem nenhuma fonte é rejeitado no contrato da rota
O sistema SHALL exigir pelo menos uma fonte marcada em `fontes` na validação da requisição — um
filtro sem fonte nenhuma não é "sem restrição", é uma composição vazia declarada.

#### Scenario: Fontes vazio na requisição ao servidor
- **WHEN** a requisição chega com `filtro.fontes: []`
- **THEN** a validação Zod da rota recusa antes de consultar o banco
- Coberto por: `tests/integration/filtro-composicao.test.ts` — "filtro vazio de fontes é recusado — Zod exige >=1 (contrato da rota, não do predicado)"
