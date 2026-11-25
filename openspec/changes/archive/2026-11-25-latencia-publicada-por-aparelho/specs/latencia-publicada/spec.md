## ADDED Requirements

### Requirement: Só se publica agregado com amostra suficiente

O sistema SHALL publicar a latência de campo da legenda apenas como arquivo agregado por classe de aparelho e idioma de origem,
somando os baldes da telemetria `rum_latencia` dos últimos 28 dias. Uma célula com menos de 200 falas contadas MUST sair como
`insuficiente`, sem p50 nem p75. O arquivo MUST NOT conter texto, identificador de conta ou de sessão, hora individual,
endereço de rede nem valor por pessoa. Os percentis MUST ser calculados pela soma dos baldes, nunca pela média de percentis, e
MUST ser declarados como o limite do balde.

#### Scenario: Célula com amostra suficiente

- **WHEN** a célula `celular-bom x en` tem 1.200 falas contadas e 62% delas no balde de 1.000 ms ou menos
- **THEN** o arquivo traz `estado: ok`, o p50 como o limite do balde que cruza 50% e a taxa de falha da mesma célula

#### Scenario: Célula pequena

- **WHEN** a célula `quest x es` tem 199 falas contadas
- **THEN** o arquivo traz `estado: insuficiente` sem p50, p75 nem taxa

#### Scenario: Percentil de dois lotes

- **WHEN** dois lotes da mesma célula têm p75 de 1.000 e 5.000 ms
- **THEN** o p75 publicado vem da soma dos baldes dos dois lotes, não da média (3.000 ms)

### Requirement: A publicação respeita o consentimento e o perfil protegido

O agregado SHALL conter apenas dados enviados por clientes que já podiam enviar métricas (consentimento "Métricas de uso
anônimas", conta ou self-host, adulto com idade declarada). O perfil protegido MUST NOT contribuir. A flag `latencia_publicada`
MUST nascer desligada e MUST NOT ter efeito enquanto `rum_latencia` estiver desligada. Com a flag desligada, o app MUST NOT pedir
o arquivo e a página `/desempenho` MUST NOT ser gerada.

#### Scenario: Flag desligada

- **WHEN** `latencia_publicada` está desligada
- **THEN** o app não faz requisição ao arquivo, não mostra selo e o site não gera `/desempenho`

#### Scenario: Telemetria desligada

- **WHEN** `latencia_publicada` está ligada e `rum_latencia` está desligada
- **THEN** não há arquivo novo, o último agregado deixa de ser servido depois de 35 dias e o selo some

### Requirement: O selo diz o que mediu e não promete

O selo SHALL aparecer só para a célula `ok` do tipo de aparelho da pessoa, dizer "metade das legendas" (p50), mostrar a taxa de
falha ao lado e trazer a ressalva de que descreve adultos que aceitaram métricas anônimas. O selo MUST NOT usar linguagem de
garantia, urgência ou comparação com outro produto. Sem célula `ok`, com falha de rede ou arquivo inválido, o selo MUST NOT
aparecer e a captura MUST funcionar igual.

#### Scenario: Aparelho com célula ok

- **WHEN** o aparelho é `celular-bom`, o idioma de origem é `en` e a célula está `ok` com p50 de 1.500 ms
- **THEN** o selo mostra "metade das legendas aparece em até 1,5 s" com a taxa de falha e a ressalva, com texto acessível

#### Scenario: Sem número

- **WHEN** a célula está `insuficiente` ou o arquivo não carrega
- **THEN** não há selo, não há "estimativa" no lugar e o botão de iniciar a captura não muda

### Requirement: O painel do dono mostra mais, com o mesmo piso

O painel do admin SHALL mostrar p50, p75, taxa de falha e `n` por célula, o p95 somente com `n` de pelo menos 1.000, e o tempo
de carga de modelo por fase (download, compilação, aquecimento). A regra de `insuficiente` MUST valer também no painel.

#### Scenario: p95 com amostra pequena

- **WHEN** a célula tem 600 falas
- **THEN** o painel mostra p50 e p75, e o p95 aparece como "amostra pequena"
