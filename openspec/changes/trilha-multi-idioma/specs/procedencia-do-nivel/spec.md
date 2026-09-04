## MODIFIED Requirements

### Requirement: Procedência do nível CEFR
O sistema SHALL registrar de onde veio o nível de cada palavra, e SHALL tratar "não sei" como
diferente de "chutei".

#### Scenario: Procedência conhecida
- **WHEN** a palavra está na lista curada da trilha
- **THEN** `source` é `curado` com confiança 1

#### Scenario: Procedência por wordlist
- **WHEN** a palavra está na wordlist CEFR do idioma
- **THEN** `source` é `wordlist` com confiança 0,95

#### Scenario: Procedência por frequência (NOVO)
- **WHEN** o idioma usa `escala: 'frequencia'`
- **THEN** `source` é `frequencia`, `level` é **null** e `faixa` traz o bucket
- **AND** o nível nulo impede qualquer consumidor de gravar CEFR derivado de frequência

#### Scenario: Palavra ausente
- **WHEN** a palavra não está em lista nenhuma
- **THEN** `source` é `ausente`, `level` é null e a confiança é 0 — peso zero no modelo de
  dificuldade

### Requirement: A wordlist não carrega o dado que não usa
O sistema SHALL carregar apenas o mapa palavra→nível para classificar CEFR.

#### Scenario: Classificação de inglês
- **WHEN** `nivelCefr` é chamada para inglês
- **THEN** o dado carregado é `trilha/niveis/en.json` (~40 KB), não o `en.json` completo (233 KB)
- **AND** a função permanece SÍNCRONA, porque é chamada em caminho quente

#### Scenario: Classificação de outro idioma
- **WHEN** `nivelCefr` é chamada para um idioma cujos níveis ainda não foram preparados
- **THEN** devolve `ausente` — a resposta honesta — em vez de bloquear ou chutar
