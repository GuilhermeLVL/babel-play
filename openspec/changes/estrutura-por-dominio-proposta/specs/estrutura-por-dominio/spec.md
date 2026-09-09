## ADDED Requirements

### Requirement: Portao sobrevive a movimentacao

Toda regra de lint ou de arquitetura SHALL usar um padrao de caminho que continue casando depois da reorganizacao, e a prova disso SHALL ser registrada: introduzir a violacao, ver o portao falhar, reverter.

#### Scenario: Rota muda de pasta

- **WHEN** os arquivos de rota saem de `server/routes/` para `server/dominios/<d>/rotas/`
- **THEN** as regras `env-fora-de-config` e `rota-fala-com-o-banco` continuam acusando uma violacao introduzida de proposito

### Requirement: Arquivo de mais de um dominio se divide, nao se move

Um arquivo cujo conteudo pertence a tres ou mais dominios SHALL ser dividido antes de qualquer movimentacao.

#### Scenario: Arquivo-deus

- **WHEN** um arquivo com mais de mil linhas serve a cinco dominios
- **THEN** ele e cortado nas faixas registradas no `mapa.csv`, e cada parte vai para o seu dominio
