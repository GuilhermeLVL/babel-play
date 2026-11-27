## ADDED Requirements

### Requirement: Ajustar o nível de A1 a C2

Com a flag `ia_ajustar_nivel` ligada e a ferramenta disponível, a pessoa SHALL poder reescrever uma palavra, um trecho, um parágrafo ou um
capítulo num nível de A1 a C2, e o painel SHALL mostrar o original ao lado do ajustado.

#### Scenario: Simplificar um parágrafo

- **WHEN** a pessoa pede "Ajustar nível" B1 num parágrafo C1
- **THEN** o painel mostra o original e o texto ajustado lado a lado (abas no celular)

#### Scenario: Flag desligada

- **WHEN** `ia_ajustar_nivel` está desligada
- **THEN** nenhuma entrada de "Ajustar nível" aparece e nenhuma rota é chamada

### Requirement: O vocabulário da pessoa é preservado

O pedido SHALL levar as formas já conhecidas (no máximo 300, sem dado pessoal); o resultado MUST preservar as palavras conhecidas e SHALL
reescrever as desconhecidas acima do nível alvo. Se uma palavra conhecida sumir, o sistema SHALL reescrever uma vez e, persistindo, avisar.

#### Scenario: Conhecida some

- **WHEN** a primeira resposta troca uma palavra conhecida
- **THEN** há no máximo uma reescrita; se ainda faltar, o painel avisa que algumas palavras foram trocadas

### Requirement: Nível medido, não presumido

Depois de gerar, o sistema SHALL medir o nível com o classificador local e reescrever UMA vez se estiver fora do alvo, com no máximo 2 chamadas
de modelo por ajuste; o painel MUST NOT afirmar que o texto é exatamente do nível pedido.

#### Scenario: Primeira geração fora do nível

- **WHEN** o classificador local acusa nível acima do alvo +1
- **THEN** ocorre uma reescrita e o painel mostra o nível medido, não o prometido

### Requirement: Custo declarado, modelo barato, cota no plano

Cada resposta SHALL declarar o custo (tokens de entrada e saída e valor estimado) e o painel SHALL exibi-lo; o ajuste SHALL usar o nível mais
barato da cascata; as cotas `ajustesDeNivelMes` e `ajustesDeCapituloMes` SHALL existir só em `src/core/planos.ts`, com 0 no Grátis e no
convidado; Gemini MUST NOT ser usado.

#### Scenario: Plano sem a capacidade

- **WHEN** o plano tem `ajustesDeNivelMes` igual a 0
- **THEN** a ferramenta mostra o motivo `plano` e nenhuma chamada é feita

#### Scenario: Cota esgotada

- **WHEN** a cota mensal acabou
- **THEN** a ferramenta mostra o motivo `cota` com a janela do mês

### Requirement: Capítulo inteiro só sob demanda

O ajuste de capítulo SHALL mostrar a estimativa de custo e pedir confirmação antes de começar, processar por parágrafo, poder ser cancelado e
consumir a cota de capítulo.

#### Scenario: Cancelar no meio

- **WHEN** a pessoa cancela após 3 de 10 parágrafos
- **THEN** o processamento para, os 3 ficam disponíveis e só os 3 contam no custo

### Requirement: Proteção de menores e retenção zero

Toda saída SHALL passar por `saidaFiltrada` com o perfil protegido quando aplicável; o servidor MUST NOT persistir o texto enviado nem o resultado;
o cache SHALL ficar só no aparelho.

#### Scenario: Saída bloqueada

- **WHEN** o filtro bloqueia a saída para um perfil protegido
- **THEN** o painel mostra o motivo e mantém o original, sem exibir o texto bloqueado

#### Scenario: Pedido repetido

- **WHEN** a pessoa repete o mesmo ajuste (mesmo texto, nível e conhecidas)
- **THEN** o resultado vem do cache do aparelho, sem rede e sem consumir cota

### Requirement: Ações de IA de 1 toque

O painel SHALL oferecer "Explicar a gramática", "Resumo até aqui", "Dar um exemplo", "Simplificar" (um nível abaixo) e "Elevar" (um nível acima),
cada uma passando pelo mesmo estado de ferramenta (flag, entrar, idade, plano, cota, conexão).

#### Scenario: Simplificar

- **WHEN** a pessoa toca "Simplificar" num texto ajustado para B2
- **THEN** o novo ajuste é pedido com alvo B1

### Requirement: Interface entre as fatias

A fatia B SHALL abrir o painel apenas por `abrirAjustarNivel(trecho, escopo, nivelInicial?)`, e a fatia D SHALL ler o estado das palavras apenas por `statusDaPalavra`.

#### Scenario: Chamada pelo balão

- **WHEN** o balão chama `abrirAjustarNivel` com um `TrechoDoLeitor`
- **THEN** o painel abre com o escopo e o nível indicados e não altera o texto do livro
