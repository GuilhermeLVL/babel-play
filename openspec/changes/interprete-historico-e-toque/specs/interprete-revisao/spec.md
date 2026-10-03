## ADDED Requirements

### Requirement: Corrigir uma fala reconhecida errado

A pessoa SHALL poder tocar e segurar numa frase do original para editá-la. Ao confirmar, a tradução MUST ser refeita a
partir do texto corrigido, e a frase corrigida MUST substituir a anterior no histórico e na sessão salva. A correção
não MUST ler nada em voz alta sozinha. Se duas edições da mesma frase estiverem em andamento, só a última MUST valer.

#### Scenario: Correção refaz a tradução

- **WHEN** a pessoa corrige "arroz" para "arrozal" e confirma
- **THEN** a tradução da frase é refeita e a nova tradução aparece na metade do outro lado

#### Scenario: Sem rede

- **WHEN** a pessoa corrige uma frase sem rede
- **THEN** o texto corrigido é guardado, a tradução fica "pendente" e há um botão para tentar de novo

### Requirement: Favoritar para estudo

A pessoa SHALL poder favoritar uma palavra ou frase do histórico. O favorito MUST abrir o mesmo cartão de palavra ou
de frase que o resto do app usa, para entrar na revisão, sem criar um fluxo novo.

#### Scenario: Palavra vira cartão

- **WHEN** a pessoa favorita uma palavra da tradução
- **THEN** o cartão da palavra abre e ela pode ser adicionada à revisão

### Requirement: Exportar a conversa

O intérprete SHALL oferecer "Exportar conversa" em Markdown e em PDF, com original e tradução lado a lado, os
falantes e as horas, incluindo as correções. A exportação MUST reaproveitar o relatório da sessão. A exportação MUST
ser feita só a pedido da pessoa; o app não MUST enviar a conversa a nenhum servidor para isso.

#### Scenario: Exporta em Markdown

- **WHEN** a pessoa escolhe "Exportar conversa" e "Markdown"
- **THEN** o arquivo traz uma linha por frase, com o falante, o original e a tradução, na ordem da conversa

#### Scenario: Frase corrigida

- **WHEN** uma frase foi corrigida antes de exportar
- **THEN** o arquivo traz o texto corrigido e a tradução refeita
