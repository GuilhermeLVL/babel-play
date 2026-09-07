## ADDED Requirements

### Requirement: Um cliente LLM no servidor
Toda chamada a um provedor OpenAI-compatible SHALL passar por um unico cliente com timeout, teto de prompt e modelo vindos da configuracao declarada.

#### Scenario: Trocar o modelo do tutor
- **WHEN** o operador muda `LLM_MODEL` no ambiente
- **THEN** `/api/gemini/chat`, `/api/ai/mt` e `/api/ai/llm/*` passam a usar o novo modelo sem deploy de codigo

#### Scenario: Prompt acima do teto no proxy BYOK
- **WHEN** um cliente envia um corpo maior que o teto para `/api/ai/llm/chat/completions`
- **THEN** o servidor responde 413 e nao repassa ao provedor

### Requirement: Limitadores nao compartilham contador
Cada limitador de taxa SHALL contar em uma metrica propria.

#### Scenario: Escrita nao consome cota de IA
- **WHEN** um usuario faz 60 escritas em um minuto
- **THEN** a proxima chamada a `/api/ai` nao recebe 429 por causa delas

### Requirement: Um escritor por tabela de contadores
Apenas o repositorio de contadores SHALL escrever em `usage_counters`, e todas as reservas SHALL usar a mesma semantica de falha.

#### Scenario: Reserva de armazenamento
- **WHEN** a cota de armazenamento e reservada
- **THEN** a escrita passa por `usageCountersRepo.reserve` com a mesma politica das reservas de IA

### Requirement: Toda entrada e validada por schema
Todo handler SHALL validar corpo, query, params e headers que usa por schema Zod antes de ler.

#### Scenario: Id de rota invalido
- **WHEN** `PATCH /api/sessions/:id` recebe um id fora do formato
- **THEN** responde 400 antes de consultar o banco

### Requirement: Falha nao vira sucesso
Um passo que falha SHALL aparecer na resposta com codigo, nunca como 200 sem sinal.

#### Scenario: Ativacao de baralho falha apos o import
- **WHEN** a projecao em `vocab_cards` lanca depois de o acervo ter sido gravado
- **THEN** a resposta informa `ativacao: falhou` com codigo e o ledger de import termina em estado `parcial`

### Requirement: Um utilitario por responsabilidade
Normalizacao de palavra, base de idioma, leitura de `meta`, resolucao de diretorio de midia e guarda de caminho SHALL ter uma unica implementacao importada por todos.

#### Scenario: Chave de palavra
- **WHEN** trilha, qualidade, servidor e efemero calculam a chave de uma palavra
- **THEN** todos chamam a mesma funcao e obtem o mesmo resultado
