## ADDED Requirements

### Requirement: Existe uma spec principal por capacidade central
`openspec/specs/` SHALL conter uma spec por fluxo do mapa da logica central (ciclo do usuario, conteudo e trilha, rodada e FSRS, economia, i18n, modo anonimo, planos e billing), e cada requirement SHALL citar o codigo que o implementa.

#### Scenario: Requirement sem implementacao
- **WHEN** um requirement de uma spec principal nao cita `arquivo:linha`
- **THEN** `openspec validate` (ou o revisor) recusa a spec ate a citacao existir

### Requirement: Change concluida e arquivada
Uma change cujo `tasks.md` nao tem tarefa pendente SHALL ter seus deltas sincronizados nas specs principais e ser movida para `openspec/changes/archive/` no mesmo PR que fecha a ultima tarefa.

#### Scenario: Ultima tarefa fechada
- **WHEN** um PR marca a ultima tarefa de uma change como concluida
- **THEN** o mesmo PR contem o sync dos deltas e o arquivamento; `openspec list` deixa de listar a change

### Requirement: A spec descreve o codigo, nao a intencao
Quando o codigo e a spec divergem, a spec principal SHALL registrar o comportamento atual e a divergencia SHALL virar uma change, nunca uma frase na spec sobre o que "deveria" acontecer.

#### Scenario: Montagem de rodada
- **WHEN** a spec de rodada e escrita
- **THEN** ela afirma que a rodada e montada no cliente (`Play.tsx:717-995`) e que o servidor apenas ordena e corta o pool, citando `GET /api/vocab/para-jogo`
