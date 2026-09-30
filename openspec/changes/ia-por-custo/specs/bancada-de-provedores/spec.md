## ADDED Requirements

### Requirement: A bancada manda o pedido da produção

A bancada de nuvem SHALL montar o pedido de cada candidato com as mesmas funções que o servidor usa
(`systemComunicativo`/`userComunicativo`, `maxTokensDaTraducao`, `parametrosDoProvedor`), importadas e não copiadas,
e com a temperatura da fala da produção. Um ajuste que a produção não manda (sufixo `@esforço`) SHALL ser marcado
`foraDaProducao` no bruto e SHALL gerar um aviso na decisão.

#### Scenario: Candidato sem ajuste

- **WHEN** a bancada monta o pedido de `deepinfra:openai/gpt-oss-20b`
- **THEN** o pedido tem o prompt comunicativo, a temperatura 0,2, o `max_tokens` proporcional e o
  `reasoning_effort: "low"`, os mesmos que a produção mandaria

#### Scenario: Candidato com ajuste

- **WHEN** o sistema é `deepinfra:Qwen/Qwen3.5-9B@none`
- **THEN** o bruto marca `foraDaProducao`, e a decisão avisa que o parâmetro precisa ir para `parametrosDoProvedor`
  antes da troca

### Requirement: O teto de gasto vale antes da chamada

Antes de cada tentativa paga, a bancada SHALL reservar o pior caso da chamada no livro-caixa: saída igual ao
`max_tokens` inteiro, entrada de até 1 token por caractere mais o cabeçalho e, no STT, o mínimo faturado. A reserva
SHALL ser recusada quando o gasto registrado, mais as reservas em voo, mais ela passaria do teto, e então a chamada
MUST NOT sair. A resposta SHALL acertar a reserva pelo custo real. Uma recusa do provedor SHALL cancelar a reserva. Uma
queda de rede SHALL cobrar o valor reservado. Um modelo sem preço na tabela MUST NOT ser chamado.

#### Scenario: Chamada que passaria do teto

- **WHEN** o gasto mais as reservas em voo estão a menos de uma chamada do teto
- **THEN** a reserva é recusada e o `fetch` não é chamado

#### Scenario: Workflow do Actions

- **WHEN** o dono dispara a bancada de nuvem no GitHub
- **THEN** o teto é US$ 3, o disparo é só manual, os segredos entram só nas etapas que chamam provedor e uma execução
  paga não é cancelada por outra

### Requirement: A bancada nunca chama o Gemini

A bancada SHALL recusar qualquer modelo `gemini` em qualquer provedor. No OpenRouter, SHALL usar o mesmo roteamento de
retenção zero da produção.

#### Scenario: Gemini pedido

- **WHEN** o sistema pedido tem um modelo `gemini`
- **THEN** a bancada recusa antes de qualquer chamada

### Requirement: A regra de troca é código

A decisão SHALL classificar, por corpus, o IC pareado do Δ orientado em superior, não-inferior (dentro de uma margem
declarada), inferior ou inconclusivo, e o veredito SHALL ser o pior corpus. A decisão SHALL reprovar o candidato
quando o gold de conversa piora (IC exclui 0 para baixo, mesmo dentro da margem) ou quando o custo por hora passa do
teto. Custo desconhecido MUST NOT aprovar, e MT sem o gold de conversa SHALL ser inconclusivo. As margens e os tetos
usados SHALL sair impressos em toda decisão. "Aprovado" SHALL significar só que a regra permite a troca.

#### Scenario: O gold de conversa piorou

- **WHEN** o candidato é não-inferior no FLEURS, mas o IC do gold de conversa exclui 0 para baixo
- **THEN** o veredito é REPROVADO

#### Scenario: Custo desconhecido

- **WHEN** a qualidade é superior, mas o custo por hora do candidato não é conhecido
- **THEN** o candidato não é aprovado

### Requirement: Sonda de contrato antes da bancada

A sonda SHALL mandar um pedido mínimo, montado como o da produção, a cada provedor × modelo, e conferir o que o
servidor lê: conteúdo, `usage`, tokens de cache e raciocínio separado na tradução; `text`, `language` e os três números
da triagem nos `segments` do STT. Modelo fora do catálogo, chave recusada, outro 4xx, `usage` ausente, segmentos sem os
números da triagem e pensamento vazando SHALL ser violações, e a violação SHALL parar o workflow antes da bancada,
salvo com `seguir_apesar_da_sonda`. Um 429 ou 5xx SHALL ser só aviso. Sem a chave de um provedor, a sonda SHALL pular
esse provedor e dizer qual variável falta.

#### Scenario: Modelo retirado do catálogo

- **WHEN** um provedor responde que o modelo não existe
- **THEN** a sonda registra violação e sai com código 1

### Requirement: Interrupção sem perder o que já respondeu

Quando o teto ou a cota diária de um provedor param a fila, os casos já respondidos SHALL ficar no bruto. A cota SHALL
tirar só aquele sistema das rodadas seguintes. O teto SHALL parar tudo e registrar `paradoPeloTeto`.

#### Scenario: Cota da Groq no meio

- **WHEN** a cota diária da Groq acaba no meio de um corpus
- **THEN** os casos que a Groq já respondeu ficam no bruto, a Groq sai das rodadas seguintes e os outros provedores
  continuam
