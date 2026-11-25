# teste-de-vocabulario Specification

## Purpose

Teste rápido de vocabulário em faixas CEFR para semear palavras conhecidas. Criada pela change `teste-de-vocabulario` (arquivada em 2026-11-23); veja `openspec/changes/archive/2026-11-23-teste-de-vocabulario/proposal.md` para o porquê.

## Requirements

### Requirement: O teste é montado por faixas, com pseudopalavras, de forma determinística

O teste rápido de vocabulário SHALL ser montado em faixas CEFR de A1 a C2, cada uma com cerca de 10 palavras reais
amostradas da lista de referência do idioma e 3 pseudopalavras plausíveis, na ordem das faixas e embaralhadas dentro
de cada uma. A amostra MUST ser a mesma para o mesmo idioma e a mesma semente. Idioma sem lista de níveis ou sem
pseudopalavras SHALL NOT ter teste.

#### Scenario: Mesma semente, mesma amostra

- **WHEN** o teste é montado duas vezes em inglês com a mesma semente
- **THEN** os itens e a ordem são idênticos, e uma semente diferente dá outra amostra

#### Scenario: Idioma sem lista confiável

- **WHEN** o teste é pedido em francês
- **THEN** não há teste e o botão de entrada não aparece para esse idioma

### Requirement: O teste para quando a pessoa não sabe a maioria de uma faixa

O teste SHALL ser adaptativo: ao não alcançar a metade das palavras reais de uma faixa, MUST parar sem mostrar as
palavras restantes. Responder "não sei" para pseudopalavras MUST NOT parar o teste.

#### Scenario: Parada numa faixa difícil

- **WHEN** a pessoa conhece as faixas A1 e A2 e responde "não sei" a 6 das 10 palavras reais de B1
- **THEN** o teste termina na sexta resposta, com o motivo "parou", sem mostrar B2 a C2

### Requirement: O chute corrige o resultado e pode cancelar a semeadura

A taxa de chute (pseudopalavras marcadas "sei") SHALL corrigir a taxa de acerto de cada faixa. Com taxa de chute de 40%
ou mais (e ao menos 4 pseudopalavras vistas), o resultado MUST ser não confiável e NÃO MUST semear nenhuma palavra,
avisando com gentileza. Com chute moderado (acima de 15%), SHALL semear só as palavras marcadas de faixas com taxa
corrigida de pelo menos 50%.

#### Scenario: Quem marca tudo como "sei"

- **WHEN** a pessoa responde "sei" a todas as palavras, inclusive as inventadas
- **THEN** o resultado tem o motivo "chute", nenhuma palavra a marcar, e a tela explica sem culpar

#### Scenario: Quem conhece as faixas baixas

- **WHEN** a pessoa conhece todas as palavras reais de A1 a B1, sem chute, e para em B2
- **THEN** o nível estimado é B1 e o conjunto a marcar contém todas as palavras de A1, A2 e B1 e as que ela marcou "sei"

### Requirement: Marcação em lote respeita teto, precedência e dono

`PUT /api/vocab/marcadas/lote` SHALL aceitar de 1 a 3.000 chaves de um só idioma, marcar como `conhecida` numa única
transação sob a trava do usuário e MUST NOT ultrapassar o teto de 20.000 marcadas por conta: se as chaves novas não
cabem, o servidor MUST responder 409 `marcadas_cheio` sem gravar nenhuma. O lote MUST NOT sobrescrever uma palavra
"ignorada" nem marcar palavra que já tem cartão, e MUST NOT contar de novo a que já é "conhecida". Sem token, 401;
entrada inválida, 400. Cada conta SHALL ver e desfazer só as suas marcações. `POST /api/vocab/marcadas/lote/desfazer`
SHALL apagar só as marcadas `conhecida` das chaves dadas.

#### Scenario: Lote acima do teto

- **WHEN** a conta tem 19.999 marcadas e pede um lote de 2 chaves novas
- **THEN** a resposta é 409 `marcadas_cheio` e nenhuma das duas é gravada

#### Scenario: Palavra ignorada e palavra com cartão

- **WHEN** o lote traz "bonjour" (ignorada) e "tiger" (com cartão)
- **THEN** "bonjour" continua ignorada, "tiger" não ganha marcação e a resposta conta `ignoradas: 1` e `comCartao: 1`

#### Scenario: Desfazer não apaga "ignorada"

- **WHEN** o desfazer traz uma chave "conhecida" e outra "ignorada"
- **THEN** só a "conhecida" é apagada

### Requirement: O resultado atualiza o índice de uma vez

Depois do lote, o cliente SHALL atualizar o índice de marcadas com as chaves criadas numa única publicação, sem uma
requisição por palavra. O mesmo vale para o desfazer em lote.

#### Scenario: Confirmar o teste

- **WHEN** a pessoa confirma "marcar N palavras como conhecidas"
- **THEN** é feita uma requisição de lote e o contador "Palavras que você conhece" reflete as N palavras

### Requirement: A tela é um diagnóstico acolhedor, sem tempo nem recompensa

A tela "Descubra quantas palavras você já sabe" SHALL mostrar uma palavra por vez com "Sei" e "Não sei" (botões, S/N ou
setas), uma barra de etapas e, no fim, o nível estimado e "vamos marcar N palavras como conhecidas — você pode desfazer
na lista", com confirmar e "Desfazer todas". Ela MUST NOT ter cronômetro, contagem regressiva ou pontuação, MUST NOT
dar XP nem Seeds, e SHALL avisar antes de começar que há palavras inventadas. O número N SHALL excluir o que já conta
como conhecido e o que está "ignorado".

#### Scenario: Sem tempo e sem pontos

- **WHEN** a pessoa faz o teste inteiro
- **THEN** não há temporizador na tela e nenhum XP ou Seeds é concedido

#### Scenario: Falha ao salvar

- **WHEN** a gravação do lote falha
- **THEN** a tela avisa com gentileza que nada foi alterado e mantém o botão para tentar de novo
