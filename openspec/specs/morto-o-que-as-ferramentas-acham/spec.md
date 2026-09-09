# morto-o-que-as-ferramentas-acham Specification

## Purpose
TBD - created by archiving change morto-o-que-as-ferramentas-acham. Update Purpose after archive.
## Requirements
### Requirement: Export sem consumidor e removido ou explicado
Um simbolo exportado que nao aparece em nenhum arquivo do repositorio SHALL ser removido; um que so aparece por re-export de barril SHALL permanecer, com o consumidor real citado.

#### Scenario: Nome declarado em dois arquivos
- **WHEN** o mesmo nome existe em dois modulos e os consumidores usam apenas um
- **THEN** a copia sem consumidor sai, ou a divergencia entre as duas fica registrada para consolidacao

