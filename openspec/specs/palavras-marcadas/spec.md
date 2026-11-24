# palavras-marcadas Specification

## Purpose
Marcar palavras como 'Já sei' ou 'Ignorar' sem cartão, com contador de palavras conhecidas. Criada pela change `vocab-conhecidas-e-ignoradas` (arquivada em 2026-11-23); veja `openspec/changes/archive/2026-11-23-vocab-conhecidas-e-ignoradas/proposal.md` para o porquê.

## Requirements

### Requirement: Marcar uma palavra como "Já sei" ou "Ignorar" sem criar cartão

A pessoa SHALL poder marcar uma palavra, por idioma, como `conhecida` ("Já sei") ou `ignorada` ("Ignorar") sem criar
cartão, e desfazer a marcação. A marcação MUST ser guardada por conta (`palavras_marcadas`) ou, sem conta, no
aparelho, com a mesma redução de idioma (base ISO) e chave (`chaveDaPalavra`) nos dois lados. O servidor MUST
recalcular idioma e chave e recusar entrada inválida (400). Cada conta MUST guardar no máximo 20.000 marcadas; acima
disso a marcação NOVA é recusada (409 `marcadas_cheio`) e trocar o estado de uma já marcada continua valendo.

#### Scenario: Marcar e trocar

- **WHEN** a pessoa marca "Hello!" em `en-US` como "Já sei" e depois como "Ignorar"
- **THEN** existe uma única marcação `en|hello`, com estado `ignorada`

#### Scenario: Entrada inválida

- **WHEN** o pedido traz idioma inválido, chave vazia, chave com mais de 100 caracteres, só pontuação ou estado
  diferente de `conhecida`/`ignorada`
- **THEN** a resposta é 400 e nada é gravado

#### Scenario: Só do dono

- **WHEN** outra conta lista ou desmarca
- **THEN** ela não vê nem apaga as marcações de ninguém; sem token a resposta é 401

#### Scenario: Sem conta

- **WHEN** a pessoa sem conta marca uma palavra
- **THEN** a marcação fica no `localStorage` do aparelho e nada vai ao servidor

### Requirement: Precedência das etiquetas

A etiqueta de uma palavra SHALL seguir a ordem: o cartão do caderno (`salva`/`aprendendo`/`dominada`) > a marcação
(`conhecida`/`ignorada`) > o ponto `nova-para-voce`. `conhecida` e `ignorada` MUST NOT pintar a palavra nem entrar no
resumo do leitor de tela, e uma palavra `ignorada` MUST NOT ganhar o ponto "nova para você".

#### Scenario: Cartão manda

- **WHEN** a palavra tem cartão novo e também está marcada "Já sei"
- **THEN** a etiqueta é `salva`

#### Scenario: Ignorada nunca é nova

- **WHEN** a palavra está marcada "Ignorar" e não aparece no índice de palavras vistas
- **THEN** a etiqueta é `ignorada`, sem o ponto

### Requirement: Contagem de palavras conhecidas e marcos por resultado

O app SHALL mostrar, por idioma, quantas palavras a pessoa conhece: as chaves `aprendendo`/`dominada` do caderno mais
as marcadas `conhecida` sem cartão, sem contar a mesma chave duas vezes. O progresso MUST ser mostrado até o próximo
marco da lista 100, 250, 500, 1000, 2000, 3000, 5000, 8000. Os marcos MUST depender só do resultado (quantas
palavras), nunca de tempo, sequência de dias ou prazo (Decreto 12.880/2026, art. 9º). A cobertura de um texto MUST
contar as marcadas `conhecida` como conhecidas.

#### Scenario: Sem duplicar

- **WHEN** "report" está `aprendendo` no caderno e também marcada "Já sei"
- **THEN** ela conta uma vez

#### Scenario: Próximo marco

- **WHEN** a pessoa conhece 375 palavras em inglês
- **THEN** o marco alcançado é 250, o próximo é 500 e a barra está na metade

#### Scenario: Cobertura

- **WHEN** a pessoa marca "orchard" como "Já sei"
- **THEN** a cobertura de um texto com "orchard" passa a contá-la como conhecida

### Requirement: Botões e atalhos no cartão da palavra

O cartão da palavra (legenda da captura, leitor de livros e leitura ativa) SHALL oferecer "Já sei" e "Ignorar" para
palavra sem cartão e, depois de marcar, dizer a marcação e oferecer "Desfazer". Com o cartão aberto, `k` SHALL marcar
"Já sei" e `x` "Ignorar"; apertar de novo a tecla da marcação atual desfaz. Os atalhos MUST NOT valer com Ctrl, ⌘ ou
Alt nem dentro de campo de texto. Os botões MUST ter como nome acessível o próprio texto visível.

#### Scenario: Atalho com o cartão aberto

- **WHEN** o cartão de "Gandalf" está aberto e a pessoa aperta `x`
- **THEN** a palavra fica marcada "Ignorar" e o cartão mostra "Desfazer"

#### Scenario: Atalho da paleta não conflita

- **WHEN** a pessoa aperta Ctrl+K ou ⌘+K com o cartão aberto
- **THEN** nada é marcado (a paleta de comandos segue com o atalho)

### Requirement: Dado do titular

As marcações SHALL ser dado do titular: MUST entrar na exportação da conta e MUST ser apagadas na exclusão da conta,
só as da pessoa.

#### Scenario: Exclusão

- **WHEN** a pessoa exclui a conta
- **THEN** as marcações dela somem e as de outras contas ficam
