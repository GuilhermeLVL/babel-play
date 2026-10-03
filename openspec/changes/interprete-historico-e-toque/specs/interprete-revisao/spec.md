## ADDED Requirements

### Requirement: Corrigir uma fala reconhecida errado

A pessoa SHALL poder tocar e segurar numa frase do original (ou tocar no lápis ao lado dela) para editá-la. Ao confirmar, a tradução MUST ser refeita a
partir do texto corrigido, e a frase corrigida MUST substituir a anterior no histórico e na sessão salva. A correção
não MUST ler nada em voz alta sozinha. Se duas edições da mesma frase estiverem em andamento, só a última MUST valer.

#### Scenario: Correção refaz a tradução

- **WHEN** a pessoa corrige "arroz" para "arrozal" e confirma
- **THEN** a tradução da frase é refeita e a nova tradução aparece na metade do outro lado

#### Scenario: Sem rede

- **WHEN** a pessoa corrige uma frase sem rede
- **THEN** o texto corrigido é guardado e a tradução fica "…" até o tradutor responder, pelo mesmo caminho de retradução da captura

### Requirement: Favoritar para estudo

A pessoa SHALL poder guardar uma frase do histórico, tocando na estrela ao lado do original. A estrela MUST abrir a
mesma folha da frase que a captura usa, de onde as palavras abrem o cartão da palavra e entram na revisão, sem
criar um fluxo novo. Dentro do intérprete, as folhas MUST NOT oferecer "Falar eu", porque o microfone é do intérprete.

#### Scenario: Frase vira folha de estudo

- **WHEN** a pessoa toca na estrela de uma frase
- **THEN** a folha da frase abre, com as palavras que abrem o cartão para a revisão, e sem o botão "Falar eu"

### Requirement: Exportar a conversa

O intérprete SHALL oferecer "Exportar" na tela "Conversa", que baixa um arquivo Markdown com original e tradução, o
falante e a hora de cada fala, incluindo as correções. A exportação MUST ser feita só a pedido da pessoa e MUST
acontecer no próprio aparelho, sem enviar a conversa a nenhum servidor. O relatório em PDF e as métricas continuam
sendo os da sessão salva, na Análise.

#### Scenario: Exporta em Markdown

- **WHEN** a pessoa toca em "Exportar" na tela "Conversa"
- **THEN** o arquivo Markdown traz uma entrada por frase, com o falante, o original e a tradução, na ordem da conversa

#### Scenario: Frase corrigida

- **WHEN** uma frase foi corrigida antes de exportar
- **THEN** o arquivo traz o texto corrigido e a tradução refeita
