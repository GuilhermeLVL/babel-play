## ADDED Requirements

### Requirement: O CI recusa arquivo, dependencia e ciclo sem uso
O CI SHALL falhar quando existir arquivo de produto sem importador, dependencia declarada e nao usada, import de pacote nao declarado, ou ciclo de importacao. As tres coisas SHALL ser cobradas por comando versionado no repositorio, com a configuracao das ferramentas junto.

#### Scenario: Arquivo orfao
- **WHEN** um PR acrescenta um arquivo que nenhum outro importa
- **THEN** o passo de codigo morto do CI falha citando o caminho

#### Scenario: Dependencia esquecida
- **WHEN** uma dependencia deixa de ter qualquer importador
- **THEN** o mesmo passo falha citando o pacote

#### Scenario: Ciclo de importacao
- **WHEN** dois modulos passam a se importar, ainda que so por tipo
- **THEN** o passo de ciclos falha citando os dois

#### Scenario: Ferramenta sem configuracao
- **WHEN** a ferramenta de codigo morto roda
- **THEN** ela roda com os pontos de entrada declarados (testes, scripts, workers, configuracoes), porque uma varredura que nao conhece as entradas chama de morto o que so elas usam

### Requirement: Export sem uso e achado, nao catraca
Export sem chamador SHALL continuar sendo detectavel por comando, e SHALL NOT derrubar o CI. Um barril reexporta o que cada tela importa da origem, e cobrar isso produziria falha por algo que nao e defeito.

#### Scenario: Barril
- **WHEN** um `index.ts` reexporta um simbolo que os consumidores importam do modulo de origem
- **THEN** o CI passa, e a ferramenta continua listando o caso para quem a rodar a mao

### Requirement: Lint sem aviso
O CI SHALL falhar com qualquer aviso de lint. Uma supressao de regra SHALL trazer, na linha acima, o motivo pelo qual seguir a regra pioraria o comportamento.

#### Scenario: Variavel nao usada
- **WHEN** um PR introduz uma variavel ou import sem uso
- **THEN** o lint falha

#### Scenario: Dependencia de efeito deliberadamente ausente
- **WHEN** incluir a dependencia que o lint pede faria o efeito re-disparar por causa da propria escrita, ou refazer um registro a cada render
- **THEN** a supressao e aceita, e o comentario acima dela diz exatamente isso

#### Scenario: Supressao que nao suprime nada
- **WHEN** uma diretiva de supressao deixa de ser necessaria
- **THEN** ela e removida — quem le uma supressao presume que ha uma regra sendo dobrada e vai procurar o motivo

### Requirement: Erro engolido tem motivo escrito
Todo `catch` vazio SHALL ter um comentario com o motivo ou tratar o erro, cobrado pela regra `catch-vazio` do ast-grep.

#### Scenario: Efeito sonoro falha
- **WHEN** a Web Audio API lanca ao tocar um efeito
- **THEN** o `catch` registra em comentario que o ambiente pode nao ter audio, e o `ast-grep scan` nao acusa

### Requirement: Codigo guardado para o futuro nao fica no repositorio
Modulo, tabela ou dependencia mantida "para quando a funcionalidade voltar" SHALL ser removida, e a intencao SHALL viver na mudanca que a define. Codigo ESTACIONADO por decisao registrada e a excecao, e SHALL trazer a decisao escrita junto dele.

#### Scenario: Motor sem tela
- **WHEN** a tela que usava um motor e removida e a mudanca que o reimplementaria nao existe
- **THEN** o motor e a dependencia dele saem, e voltam com a mudanca que os definir

#### Scenario: Codigo estacionado
- **WHEN** um conjunto de arquivos e mantido fora do alcance da aplicacao por decisao registrada
- **THEN** a pasta traz um README com o motivo, e as ferramentas de codigo morto a ignoram explicitamente — nao por acidente
