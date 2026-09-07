# trilha-por-idioma Specification

## Purpose
TBD - created by archiving change trilha-multi-idioma. Update Purpose after archive.
## Requirements
### Requirement: A trilha carrega só o idioma praticado
O dado da trilha SHALL conter palavra, nível e frase no idioma praticado, e SHALL NÃO conter
tradução para idioma nenhum.

#### Scenario: Arquivo de trilha novo
- **WHEN** um idioma ganha trilha
- **THEN** o arquivo `trilha/<lang>.json` traz `lang`, `versao`, `escala`, `procedencia`, `fonte` e
  `niveis`, com cada entrada sendo `[palavra]` ou `[palavra, frase]`
- **AND** a ausência do segundo elemento significa "não há exemplo", nunca string vazia

#### Scenario: Migração do inglês
- **WHEN** o `en.json` v1 é migrado
- **THEN** as traduções e as frases traduzidas vão para `glosas/en-pt.json` sem perda
- **AND** o script conta e imprime as colisões de palavra repetida entre níveis, em vez de
  colapsá-las em silêncio

### Requirement: A trilha carrega sob demanda
O sistema SHALL carregar o dado da trilha dinamicamente, e SHALL servir contagens de um índice
estático para que a escolha de idioma não baixe o JSON.

#### Scenario: Contagem antes de escolher
- **WHEN** a Sala ou o seletor mostram quantas palavras um idioma tem
- **THEN** o número vem de `trilha/indice.json`
- **AND** nenhum arquivo de trilha é baixado por causa dessa exibição

#### Scenario: Troca de idioma com trilha
- **WHEN** a pessoa escolhe um idioma cuja trilha ainda não está em memória
- **THEN** a grade de jogos mostra estado de CARREGANDO
- **AND** nunca mostra o motivo "sem material", que seria falso
- **AND** a contagem exibida nunca passa por zero antes de chegar ao valor real

### Requirement: O nível diz de onde veio
O sistema SHALL declarar a procedência do nível e SHALL NÃO apresentar faixa de frequência como
CEFR.

#### Scenario: Idioma com lista curada
- **WHEN** `escala` é `cefr`
- **THEN** a tela rotula os níveis como A1..C2

#### Scenario: Idioma com nível por frequência
- **WHEN** `escala` é `frequencia`
- **THEN** a tela rotula a etapa pela faixa ("mais comuns"), não por letra CEFR
- **AND** `nivelCefr` devolve `level: null` com `source: 'frequencia'`

