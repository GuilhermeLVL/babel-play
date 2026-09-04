## ADDED Requirements

### Requirement: Fonte única de planos

Planos, entitlements, quotas e rótulos SHALL viver numa única matriz, num módulo puro compartilhado
entre servidor e cliente. Nenhum outro arquivo SHALL enumerar a lista de planos à mão.

#### Scenario: Servidor e cliente concordam
- **WHEN** o teste de paridade compara os planos, flags e rótulos vistos pelo servidor e pelo cliente
- **THEN** eles são idênticos, porque ambos leem a mesma matriz

#### Scenario: Plano novo entra num lugar só
- **WHEN** um plano é adicionado à matriz
- **THEN** entitlements, quotas, validação do admin e rótulos da UI passam a conhecê-lo sem nenhuma
  outra edição de lista

### Requirement: Plano Essencial

O plano `essencial` SHALL conceder tradução de nuvem gerenciada (`managedCloudLlm`) e SHALL NOT
conceder STT de nuvem gerenciada, importação do YouTube nem modelos maiores. Quotas padrão: 12.000
chamadas/mês, 0 segundos de STT de nuvem, 1 GB de armazenamento.

#### Scenario: Essencial traduz na nuvem
- **WHEN** um usuário `essencial` chama `POST /api/ai/mt`
- **THEN** o entitlement passa e a chamada é servida (dentro da quota)

#### Scenario: Essencial não transcreve na nuvem gerenciada
- **WHEN** um usuário `essencial` chama o STT gerenciado (sem credencial BYOK)
- **THEN** recebe 402 com `entitlement: 'managedCloudStt'`

#### Scenario: Quotas do Essencial valem
- **WHEN** um usuário `essencial` consulta `GET /api/me/uso`
- **THEN** os tetos refletem a matriz (12.000 chamadas, 0 segundos), com override por env quando
  definido

### Requirement: Degradação barulhenta, nunca silenciosa

Um plano desconhecido vindo do banco SHALL degradar para `free` no servidor com log de evento, e o
cliente SHALL NOT descartar uma resposta de entitlements por conter plano que ele não conhece.

#### Scenario: Linha de assinatura corrompida
- **WHEN** `subscriptions.plan` contém um valor fora da matriz
- **THEN** o usuário opera como `free` e o servidor registra `plano_desconhecido` — nunca um 500,
  nunca silêncio

### Requirement: Disponibilidade de STT respeita o plano

`GET /api/ai/stt/available` SHALL responder disponível somente quando houver chave no servidor E o
usuário tiver o entitlement de STT gerenciado ou uma credencial BYOK própria.

#### Scenario: Essencial não é roteado para a nuvem de STT
- **WHEN** um usuário `essencial` sem BYOK consulta a disponibilidade
- **THEN** a resposta é indisponível, o roteador escolhe o modelo local, e nenhum 402 acontece no
  meio da captura

#### Scenario: BYOK continua livre
- **WHEN** um usuário de qualquer plano tem credencial BYOK de STT
- **THEN** a disponibilidade responde disponível — a chave é dele, o custo é dele

### Requirement: A tela de planos mostra os três

A tabela comparativa SHALL exibir Grátis, Essencial e Pro, com os números de qualidade medidos por
coluna e a fonte de cada número visível.

#### Scenario: Três colunas com números medidos
- **WHEN** a tela Planos renderiza
- **THEN** Essencial aparece entre Grátis e Pro, com tradução de nuvem (85% / idiomático 83%) e
  transcrição local (57% de WER)
