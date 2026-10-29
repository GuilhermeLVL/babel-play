## ADDED Requirements

### Requirement: Flags desligadas por padrão

O sistema SHALL ter as flags `avatar_3d`, `avatar_sinais` e `avatar_elenco`, semeadas DESLIGADAS e sem regra de plano.

#### Scenario: Semente

- **WHEN** a migração PG 0015 roda num banco novo ou existente
- **THEN** as três flags existem com `habilitada = false` e `regras = '{}'`, e rodar de novo não desliga o que o operador ligou

#### Scenario: Desligada, nada muda

- **WHEN** `avatar_3d` está desligada
- **THEN** nenhuma tela, rota, cota ou chunk novo é carregado

### Requirement: Núcleo e motor (M1)

O núcleo `core/avatar` SHALL validar a receita, as licenças, a política de menores, os tiers e os estados sem importar React, rede ou DOM.

#### Scenario: Receita com campo desconhecido

- **WHEN** uma receita traz um campo fora do esquema da versão
- **THEN** a validação a rejeita com motivo

#### Scenario: Avatar fora do arranque

- **WHEN** o app abre com `avatar_3d` ligada e a pessoa não visita telas de avatar
- **THEN** `three` não foi baixado (teste de orçamento de chunk)

#### Scenario: Sem WebGL

- **WHEN** o aparelho não oferece WebGL2
- **THEN** a tela mostra o fallback (foto, iniciais ou SVG) e o app segue funcional

### Requirement: Meu avatar (M2)

A pessoa SHALL poder escolher, personalizar, importar o próprio modelo, salvar localmente e apagar.

#### Scenario: Leigo em um clique

- **WHEN** a pessoa abre Ajustes > Avatar pela primeira vez
- **THEN** vê um avatar sugerido e pode aceitar ou "pular", sem termo técnico

#### Scenario: Arquivo próprio nunca vai ao servidor

- **WHEN** a pessoa importa um VRM/GLB
- **THEN** nenhuma requisição de rede leva o arquivo ou seu conteúdo, e o armazenamento é só local

#### Scenario: Licença do modelo

- **WHEN** o `meta` do VRM proíbe o uso ou é ausente
- **THEN** o validador mostra o aviso e, para perfil protegido, recusa o modelo se a licença não for explícita e sem uso sexual ou violento

#### Scenario: Perfil protegido

- **WHEN** o perfil é de menor ou de idade não declarada
- **THEN** só a coleção curada está disponível, sem importar, sem galeria de terceiros e sem compra com dinheiro

### Requirement: Fala (M3)

O avatar SHALL acompanhar a fala do `TtsEngine` com estados e boca sincronizada, sem prometer visemas reais.

#### Scenario: Estados

- **WHEN** a fala começa, termina ou falha
- **THEN** o avatar passa por falando, parado ou erro sem travar a fila de voz

#### Scenario: Movimento reduzido

- **WHEN** a pessoa pede movimento reduzido
- **THEN** a vida procedural é desligada e a boca usa só abrir e fechar discreto

### Requirement: Intérprete e PiP (M4)

O intérprete SHALL mostrar um avatar por lado e o PiP SHALL usar o tier fraco.

#### Scenario: Legenda sempre presente

- **WHEN** o avatar está visível ou falhou ao carregar
- **THEN** a legenda de texto continua presente e legível

#### Scenario: Soletração rotulada

- **WHEN** `avatar_sinais` está ligada e uma palavra é soletrada
- **THEN** o rótulo "demonstração" e o aviso de que não é tradução para Libras estão visíveis

### Requirement: Livros e personagens (M5)

Com `avatar_elenco` ligada, o leitor SHALL atribuir falante e emoção por frase, com fallback heurístico sem IA.

#### Scenario: Sem IA

- **WHEN** a IA está indisponível, sem cota ou não permitida ao perfil
- **THEN** o falante vem da heurística de aspas e travessão e a leitura segue com a voz escolhida

#### Scenario: Não inventar personagem

- **WHEN** a IA devolve um falante que não aparece no capítulo
- **THEN** o resultado é descartado para essa frase

### Requirement: Estúdio e loja (M6)

O item de loja `'avatar'` SHALL ser livre (`nivel:1`) e a acessibilidade SHALL NOT ser recompensa.

#### Scenario: Posse paga

- **WHEN** um item pago de avatar é consultado
- **THEN** a posse vem do servidor e o perfil protegido não compra com dinheiro

### Requirement: Qualidade (M7)

#### Scenario: Verificações

- **WHEN** o marco fecha
- **THEN** os três typechecks, lint, testes, `i18n:orfas`, E2E dos fluxos, axe e a medição de FPS no tier fraco passam
