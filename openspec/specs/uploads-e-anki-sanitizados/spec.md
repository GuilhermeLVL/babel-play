# uploads-e-anki-sanitizados Specification

## Purpose

TBD - created by archiving change uploads-e-anki-sanitizados. Update Purpose after archive.

## Requirements

### Requirement: Conteudo de baralho importado nao vira marcacao executavel

Nenhum campo escrito pelo servidor num `.apkg` exportado SHALL conter marcacao viva.

#### Scenario: Baralho hostil importado e reexportado

- **WHEN** um `.apkg` com `<script>`, atributo de evento ou entidade codificada e importado e depois
  exportado
- **THEN** os campos do arquivo exportado trazem o texto escapado, e nenhuma tag
