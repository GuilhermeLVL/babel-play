## ADDED Requirements

### Requirement: Uma fonte só para o STT gerenciado

`GET /api/ai/stt/available` e a porta da transcrição (`POST /api/ai/stt`) SHALL consultar a mesma regra. Uma chave
vazia ou só com espaço SHALL contar como ausente. A `LLM_API_KEY` SHALL servir ao STT só quando o LLM é a Groq.

#### Scenario: Só a chave do LLM da Groq

- **WHEN** o ambiente tem só `LLM_API_KEY`, com a base da Groq ou sem base
- **THEN** a disponibilidade diz que há STT, e a transcrição segue

#### Scenario: Chave de um LLM que não é a Groq

- **WHEN** o ambiente tem só a `LLM_API_KEY` de outro provedor
- **THEN** a disponibilidade e a transcrição respondem 501

### Requirement: Registro declarativo de provedores sem segredo

O servidor SHALL ler os provedores de IA de `IA_PROVEDORES` ou de `IA_PROVEDORES_ARQUIVO`. As duas juntas SHALL ser
recusadas. Cada provedor declara formato, base, o NOME da variável da chave, retenção, limites e modelos por função com
preço, e a ordem do array SHALL ser a ordem da cascata. O registro MUST NOT conter segredo: campo com cara de segredo,
ou `chave` que não é o nome de uma variável de IA, SHALL invalidar o registro. Um provedor sem a chave no ambiente
SHALL NOT virar perna.

#### Scenario: A cascata segue o registro

- **WHEN** `IA_PROVEDORES` declara dois provedores com modelos de tradução, e as duas chaves existem no ambiente
- **THEN** a cascata da tradução tem o primeiro como primário e o segundo como reserva, cada um com a chave lida da
  variável que ele nomeia

#### Scenario: Segredo no JSON

- **WHEN** o registro traz um campo `apiKey` (ou `token`, `secret`…) em qualquer nível
- **THEN** o registro é inválido, e a mensagem diz para usar `chave` com o nome da variável

### Requirement: O legado reproduz a cascata de antes

Sem `IA_PROVEDORES` e sem `IA_PROVEDORES_ARQUIVO`, o servidor SHALL derivar o registro das `LLM_*`, `GROQ_*`,
`LLM_RESERVA_*`, `OPENROUTER_API_KEY` e `STT_*`, com as mesmas pernas, bases, chaves e modelos que a resolução
anterior ao registro produzia. A única diferença é que uma chave com espaço em volta é aparada.

#### Scenario: Ambiente de produção de hoje

- **WHEN** o ambiente não declara `IA_PROVEDORES`
- **THEN** a cascata de cada plano é a mesma de antes do registro, com o `LLM_MODEL_GRANDE` só para quem tem
  `largerModels`

### Requirement: Nunca o Gemini

O registro, declarado ou legado, SHALL recusar o Gemini pela base (API Generative Language, Vertex, AI Gateway da
Cloudflare apontando para o Google) ou pelo modelo (`gemini`, `learnlm`). Um modelo Gemma (pesos abertos) SHALL NOT
ser tratado como Gemini. Uma perna para o Gemini MUST NOT existir.

#### Scenario: Base do Gemini no legado

- **WHEN** `LLM_BASE_URL` aponta para a API Generative Language
- **THEN** o registro é inválido, nenhuma perna existe e o boot acusa o erro

#### Scenario: Gemma passa

- **WHEN** o registro declara um modelo `google/gemma-…` num provedor com retenção zero
- **THEN** o registro é válido

### Requirement: Retenção zero declarada em produção

Em produção, o registro declarado SHALL recusar o provedor sem `retencao: "zdr"` e a base sem https. O boot SHALL
abortar com o registro inválido. No legado em produção, um provedor fora da Groq e do OpenRouter SHALL gerar o aviso
`ia_provedor_sem_zdr` no boot, sem recusar.

#### Scenario: Provedor sem retenção zero

- **WHEN** `NODE_ENV=production` e o registro declara um provedor com `retencao: "desconhecida"`
- **THEN** o registro é inválido e o servidor não sobe

### Requirement: Registro inválido fecha a nuvem

Um registro declarado inválido SHALL deixar a IA de nuvem sem nenhuma perna e registrar `ia_provedores_invalido` uma
vez por erro distinto. O servidor MUST NOT voltar ao registro legado.

#### Scenario: Registro inválido com o legado configurado

- **WHEN** `IA_PROVEDORES` não passa na validação, as variáveis legadas do LLM estão configuradas e `NODE_ENV` não é
  `production`
- **THEN** `POST /api/ai/mt` responde 501, e nenhuma chamada sai para o provedor legado

### Requirement: OpenRouter sempre com retenção zero e sem o Google

Todo pedido ao OpenRouter, direto ou pelo AI Gateway da Cloudflare, SHALL levar `provider` com
`data_collection: "deny"`, `zdr: true` e `ignore` contendo `google-ai-studio` e `google-vertex`. Um roteamento
declarado SHALL poder acrescentar (`only`, `order`, mais `ignore`) e MUST NOT tirar esse mínimo nem pedir um provedor
`google*`. Um OpenRouter declarado sem `roteamento` SHALL invalidar o registro.

#### Scenario: Reserva legada no OpenRouter

- **WHEN** a reserva é o atalho `OPENROUTER_API_KEY` e a tradução cai nela
- **THEN** o corpo do pedido traz o `provider` com `data_collection: "deny"`, `zdr: true` e o `ignore` do Google

### Requirement: Custo pelo fornecedor e modelo de quem respondeu

O custo de uma chamada SHALL usar o preço de `fornecedor:modelo`, nesta precedência: o declarado no registro; o de
`AI_PRECOS_MODELOS` por `fornecedor:modelo` e depois por modelo; o da tabela oficial nas mesmas duas chaves; e, sem
nenhum, o preço conservador. Os tokens de entrada servidos do cache de prompt SHALL custar o preço de cache, e, sem
ele, o da entrada. O custo SHALL ser calculado uma vez, sobre a perna que de fato respondeu, e o mesmo valor SHALL ir
ao orçamento, à métrica e ao rastro.

#### Scenario: A reserva responde

- **WHEN** o primário responde 429 e a reserva entrega a tradução
- **THEN** o orçamento soma o preço da reserva, com os tokens de cache dela

#### Scenario: Mesmo modelo em dois provedores

- **WHEN** `openai/gpt-oss-120b` responde pela Groq e depois pela DeepInfra, com os mesmos tokens
- **THEN** os dois custos são diferentes, cada um pelo preço do seu fornecedor

### Requirement: O mínimo faturado do STT é do provedor

O custo de uma transcrição SHALL usar o mínimo faturado por pedido do provedor que respondeu. Sem mínimo declarado,
SHALL valer 10 s.

#### Scenario: Provedor que cobra por segundo

- **WHEN** um provedor declarado com `minimoFaturadoS: 0` transcreve 2 s de áudio
- **THEN** o custo registrado é o de 2 s

### Requirement: Rótulos de custo em lista fechada

As métricas `ia_provedor_custo_usd_total` e `ia_provedor_latencia_ms` SHALL ter os rótulos `fornecedor` e `modelo`,
tirados de uma lista fechada: os fornecedores conhecidos mais os ids e modelos do registro ativo. Um valor fora dela
SHALL virar `outro`.

#### Scenario: Modelo não declarado

- **WHEN** uma chamada é observada com um modelo que o registro não declara
- **THEN** o rótulo `modelo` é `outro`

### Requirement: Nível do modelo pela capacidade do plano

O nível de cada função de IA SHALL ser `rapida` para quem não tem o entitlement `traducaoNuance` e o da tabela
`IA_NIVEIS` para quem tem. A decisão MUST NOT comparar o nome do plano. A cascata de um nível SHALL começar pelos
modelos declarados para ele no registro e descer a escada (polimento → nuance → rápida). A cascata da `rapida` MUST NOT
conter um modelo declarado só para níveis acima dela. O nível que o cliente pede no `POST /api/ai/mt` (D1) está no
delta de `planos-no-servidor` da change `traducao-nuance` e não é repetido aqui.

#### Scenario: Quem não paga

- **WHEN** a cascata da tradução é montada para o Grátis, e o registro marca um modelo como `niveis: ["nuance"]`
- **THEN** a cascata tem só os modelos da rápida

#### Scenario: O tutor de quem paga

- **WHEN** um usuário com `traducaoNuance` fala com o tutor, e o registro marca um modelo do tutor para a nuance
- **THEN** a cascata do tutor começa por esse modelo e segue com os da rápida como reserva

#### Scenario: Declaração ambígua

- **WHEN** um modelo declara `grande: true` e `niveis` ao mesmo tempo, ou `niveis` num modelo só de STT
- **THEN** o registro é inválido

### Requirement: O cache de tradução grava sob o modelo que respondeu

Uma tradução SHALL ir para o cache sob o modelo que de fato respondeu, e não sob o modelo planejado.

#### Scenario: A nuance fora do ar

- **WHEN** o modelo da nuance falha e o modelo barato entrega a tradução
- **THEN** a tradução fica no cache sob o modelo barato, e o próximo pedido da nuance volta a tentar o modelo da
  nuance em vez de sair do cache

### Requirement: Admissão pelos limites declarados

A admissão SHALL usar os `limites` do modelo como o balde dele. Os `limites` declarados no provedor SHALL formar um
balde só, compartilhado pelos modelos daquele provedor. Sem limite declarado, SHALL valer as `IA_ADMISSAO_*`. Um `tpm`
declarado SHALL limitar os tokens por minuto.

#### Scenario: Limite da conta

- **WHEN** o provedor declara `rpm: 4` e tem dois modelos
- **THEN** passam 4 pedidos no minuto no total, e não 4 por modelo

### Requirement: Degradação suave pelo orçamento

A política de custo SHALL usar a maior fração gasta do orçamento entre o mês e o dia:

- com 90% ou mais, toda cascata SHALL começar pela perna mais barata;
- com 70% ou mais (e abaixo de 90%), a cascata de um nível acima de `rapida` SHALL começar pela perna mais barata só
  quando o balde da primeira perna estiver abaixo de 20%;
- a perna mais barata SHALL ser escolhida pelo preço de `fornecedor:modelo` para o pedido, com empate para a que vem
  antes, e o resto da cascata SHALL seguir na ordem original;
- degradado, o `max_tokens` SHALL cair para 75% nas pernas sem raciocínio, e MUST NOT mudar nas pernas de modelo com
  raciocínio;
- a 100%, o portão SHALL continuar fechando a nuvem (503).

#### Scenario: 70% com o balde folgado

- **WHEN** o orçamento está em 70%, o usuário tem a nuance e o balde do modelo da nuance está cheio
- **THEN** a cascata começa pela nuance, com o `max_tokens` inteiro

#### Scenario: 70% com o balde baixo

- **WHEN** o orçamento está em 70%, o usuário tem a nuance e o balde do modelo da nuance está abaixo de 20%
- **THEN** a cascata começa pelo modelo mais barato, com 75% do `max_tokens` se ele não raciocina

#### Scenario: A rápida aos 70%

- **WHEN** o orçamento está em 70% e o usuário está no nível `rapida`
- **THEN** a cascata não muda

#### Scenario: 90% do dia com o mês folgado

- **WHEN** o gasto do dia está em 90% do teto diário e o do mês está baixo
- **THEN** toda cascata começa pelo modelo mais barato

#### Scenario: A perna barata raciocina

- **WHEN** a cascata degradada chama um modelo com raciocínio
- **THEN** o `max_tokens` dessa perna fica inteiro

### Requirement: Cascata do STT pelo custo efetivo

As pernas de STT SHALL ser tentadas da mais barata para a mais cara para o áudio do pedido, com a duração arredondada
para cima, elevada ao mínimo faturado de cada perna e multiplicada pelo preço dela. Um empate SHALL manter a ordem do
registro. Uma falha por 429, 5xx, timeout, rede ou outro 4xx SHALL passar para a próxima perna. A retentativa de 5xx
SHALL acontecer só na última perna. O disjuntor SHALL ser por perna. Uma perna no formato `cloudflare` SHALL receber o
áudio em base64 em `…/ai/run/<modelo>`, e a resposta dela SHALL passar pela mesma triagem de segmentos do
`verbose_json`.

#### Scenario: Clipe curto

- **WHEN** uma fala de 2 s chega, com a Groq (10 s de mínimo) e um provedor que cobra por segundo no registro
- **THEN** o provedor que cobra por segundo é chamado primeiro, e o custo registrado é o dele

#### Scenario: Clipe longo

- **WHEN** um áudio de 30 s chega com as mesmas pernas
- **THEN** o preço por hora decide a ordem

#### Scenario: Todas em 429

- **WHEN** todas as pernas chamadas respondem 429
- **THEN** a rota responde 429 `nuvem_ocupada` com a menor espera entre elas
