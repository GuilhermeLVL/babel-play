# legenda-segura Specification

## Purpose

TBD - created by archiving change legenda-segura-para-menores. Update Purpose after archive.

## Requirements

### Requirement: Termos sensíveis são ocultados na legenda e na tradução do perfil protegido

Para o perfil protegido (menor de 18 ou idade não declarada, inclusive sem conta), o app SHALL trocar por um marcador visível
(`•••`) cada termo das listas de legenda (pt, en, es) que apareça no texto original, na tradução ou na tradução
provisória de uma fala, seja parcial ou final. O app MUST trocar só o termo e MUST NOT trocar a frase inteira nem pôr outra
palavra no lugar. A regra vale para qualquer motor de reconhecimento e de tradução.

#### Scenario: A fala da auditoria (COMP-02)

- **WHEN** o reconhecimento entrega "reveal the porn quest together" e a tradução entrega "revelar a busca pornô juntos" a
  um perfil protegido
- **THEN** a lista mostra "reveal the ••• quest together" e "revelar a busca ••• juntos"
- **AND** o painel flutuante mostra o mesmo texto
- **AND** a fala registra 1 ocultação no original e 1 na tradução

#### Scenario: Variante com acento, leetspeak ou letra espaçada

- **WHEN** a legenda traz "p0rn0", "P O R N" ou "pornografía"
- **THEN** cada uma vira `•••`, e o resto da frase não muda (pontuação e maiúsculas preservadas)

#### Scenario: Palavra ambígua de aula passa

- **WHEN** a legenda de um perfil protegido traz "o sexo feminino", "sex education", "the fag end of the day" ou "veado"
- **THEN** o texto aparece como veio, com 0 ocultações

#### Scenario: Corpus de negativos

- **WHEN** o teste passa pela política protegida as frases de `tests/fixtures/legenda-segura/negativos.json` (pelo menos 300
  frases de aula, desenho, série e conversa em pt, en e es, incluindo todas as falas de referência da auditoria)
- **THEN** o total de ocultações é 0

#### Scenario: Corpus de positivos

- **WHEN** o teste passa pela política protegida os itens de `tests/fixtures/legenda-segura/positivos.json` (pelo menos 20 por
  idioma, com variantes de acento, leetspeak, letra espaçada e caracteres invisíveis)
- **THEN** 100% dos itens têm o termo trocado por `•••`

### Requirement: A ocultação é honesta

O app MUST indicar que houve ocultação sem fingir que o texto estava limpo. O marcador SHALL ter um rótulo acessível
traduzido dizendo que uma palavra foi ocultada e que o reconhecimento pode ter entendido errado. Na primeira ocultação de uma
sessão, o app SHALL mostrar um aviso discreto com o mesmo sentido, uma vez por sessão, sem interromper a legenda.

#### Scenario: Leitor de tela

- **WHEN** o foco de um leitor de tela chega a uma fala com `•••`
- **THEN** o leitor anuncia o rótulo "palavra ocultada" (no idioma da interface) no lugar do marcador

#### Scenario: Aviso uma vez

- **WHEN** três falas seguidas da mesma sessão têm ocultação
- **THEN** o aviso aparece uma vez só

### Requirement: Todas as superfícies leem o texto já ocultado

A lista de falas, o painel flutuante, a conversa do intérprete, a exportação e o "Guardar palavra" MUST usar o texto já
ocultado. A voz do intérprete MUST NOT pronunciar o termo ocultado. O termo ocultado MUST NOT virar palavra do vocabulário
da sessão nem cartão.

#### Scenario: Exportação

- **WHEN** um perfil protegido exporta a conversa que teve a fala da auditoria
- **THEN** o arquivo traz "•••" e nenhum termo das listas

#### Scenario: Voz do intérprete

- **WHEN** o intérprete vai ler "revelar a busca ••• juntos"
- **THEN** o texto enviado à síntese de voz não contém o termo nem o marcador

#### Scenario: Vocabulário

- **WHEN** a sessão monta o vocabulário de uma fala com ocultação
- **THEN** nenhuma palavra do vocabulário é `•••` nem um termo das listas

### Requirement: Política por perfil

Para o perfil protegido, a ocultação MUST vir ligada e MUST NOT poder ser desligada pela própria pessoa. Para o adulto
declarado e o self-host, ela SHALL vir desligada, com uma opção em Ajustes ("Ocultar palavras sensíveis na legenda") que a
liga.

#### Scenario: Adulto sem a opção

- **WHEN** um adulto declarado recebe a fala da auditoria com a opção desligada
- **THEN** o texto aparece como veio, e nenhum aviso de ocultação aparece

#### Scenario: Adulto com a opção

- **WHEN** um adulto declarado liga a opção
- **THEN** a fala da auditoria aparece com `•••`, como no perfil protegido

#### Scenario: Protegido sem a chave

- **WHEN** um perfil protegido abre Ajustes
- **THEN** a opção aparece ligada e travada, com a explicação de que é uma proteção do perfil

### Requirement: Custo desprezível e sem rede

A ocultação MUST rodar no aparelho, sem chamada de rede. Ela SHALL custar, no p95, menos de 0,2 ms por fala de 30 palavras,
medido por `vitest bench` no CI.

#### Scenario: Bench

- **WHEN** o bench roda 10 000 falas de 30 palavras do corpus de negativos
- **THEN** o p95 por fala fica abaixo de 0,2 ms

#### Scenario: Sem rede

- **WHEN** uma fala com ocultação é processada com a rede bloqueada
- **THEN** o resultado é o mesmo, e nenhuma requisição é feita
