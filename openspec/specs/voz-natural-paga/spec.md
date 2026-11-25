# voz-natural-paga Specification

## Purpose

Voz natural da nuvem via OpenRouter (Kokoro padrão, MAI desligado) com retenção zero. Criada pela change `voz-natural-openrouter` (arquivada em 2026-11-23); veja `openspec/changes/archive/2026-11-23-voz-natural-openrouter/proposal.md` para o porquê.

## Requirements

### Requirement: Voz da nuvem só para plano pago

O servidor SHALL atender `POST /api/ai/tts` só quando o plano tem a capacidade `vozNatural`, é um plano pago e a pessoa
não está no teste de 3 dias. O self-host SHALL ser atendido (a chave é do dono da instância). Grátis, convidado e teste
MUST NOT chegar ao provedor nem gastar cota: a resposta SHALL ser 402 `exige_voz_natural` com uma mensagem que diz o
fato e que a voz do aparelho segue lendo de graça, sem oferta. A tela SHALL aplicar a mesma regra antes de pedir.

#### Scenario: Pessoa no teste de 3 dias

- **WHEN** quem está no teste pede uma fala em voz natural
- **THEN** a resposta é 402 `exige_voz_natural`, nenhum provedor é chamado, nenhum caractere é contado, e a mensagem
  diz que a voz do aparelho segue lendo a tradução de graça

#### Scenario: Assinante do Plus

- **WHEN** um assinante pago do Plus, fora do teste, pede uma fala com a flag `voz_natural` ligada
- **THEN** a fala vai ao provedor e os caracteres contam na cota do mês e do dia

#### Scenario: Capacidade forjada num plano sem preço

- **WHEN** o plano é o Grátis e a capacidade `vozNatural` aparece verdadeira
- **THEN** a voz da nuvem continua recusada

### Requirement: Voz pelo OpenRouter com retenção zero obrigatória

Uma perna `tts` com base do OpenRouter SHALL chamar `POST <base>/audio/speech` com a chave que o registro nomeia
(`OPENROUTER_API_KEY`) e SHALL mandar `provider: { zdr: true, data_collection: "deny" }` em todo pedido. Um pedido sem
isso MUST NOT sair. Só modelos com endpoint de retenção zero conferido (Kokoro 82M e MAI-Voice 2.1 Flash) SHALL virar
perna, e o registro SHALL recusar voz do OpenRouter fora dessa lista. Nenhum pedido SHALL levar campo de clonagem,
`input_references` incluso.

#### Scenario: Kokoro em português

- **WHEN** o registro declara `hexgrad/kokoro-82m` com a função `tts` e a fala é em `pt-BR`
- **THEN** o pedido vai a `https://openrouter.ai/api/v1/audio/speech` com `voice: "pf_dora"`, `response_format: "mp3"`
  e `provider: { zdr: true, data_collection: "deny" }`

#### Scenario: Modelo sem retenção zero conferida

- **WHEN** o registro declara `elevenlabs/eleven-flash-v2.5` ou um modelo `:free` como voz do OpenRouter
- **THEN** a validação do registro falha dizendo que falta retenção zero conferida, e nenhuma perna de voz existe

### Requirement: A voz segue o idioma da fala

Nos modelos em que a voz decide o idioma, o servidor SHALL escolher a voz do idioma da fala (BCP-47, depois a base,
depois a primeira região da língua). Uma voz pedida SHALL valer só se é do idioma da fala. No MAI-Voice o id SHALL ser
`<região>-<voz>:MAI-Voice-2.1-Flash`.

#### Scenario: Voz pedida de outro idioma

- **WHEN** a fala é em português e a voz pedida é `af_heart` (inglês)
- **THEN** o pedido vai com `pf_dora`

#### Scenario: MAI em português

- **WHEN** a perna é o MAI-Voice e a fala é `pt-BR` com a voz `Luana`
- **THEN** o pedido vai com `voice: "pt-BR-Luana:MAI-Voice-2.1-Flash"`

### Requirement: O nível de voz do plano escolhe o modelo

A voz `boa` (MAI-Voice) SHALL atender só planos com `nivelDeVoz: 'boa'`. Planos de voz `basica` SHALL usar só as pernas
básicas, na ordem do registro; sem nenhuma, a resposta SHALL ser 501 `voz_nao_configurada`.

#### Scenario: Plano básico com o MAI primeiro no registro

- **WHEN** o registro declara o MAI antes do Kokoro e um assinante de voz `basica` pede uma fala
- **THEN** só o Kokoro é chamado

### Requirement: Custo e tetos que fecham a conta

O orçamento SHALL contar a voz do Kokoro pelo OpenRouter a US$ 4 por 1M de caracteres (o endpoint mais caro com retenção
zero) e o MAI a US$ 15. Os tetos de caracteres por plano SHALL manter a margem do anual no pior caso ≥ 0 nos planos v4
(`npm run ia:custo`). O MAI-Voice SHALL ficar fora dos registros de exemplo enquanto a margem do plano de nível `boa`
for negativa no pior caso.

#### Scenario: Margem do anual

- **WHEN** roda `npm run ia:custo`
- **THEN** a margem do anual de Plus, Família e Pro no pior caso é ≥ 0, e o bloco "VOZ BOA" mostra a margem do MAI no
  plano de nível `boa`

### Requirement: Queda para a voz do aparelho

Toda recusa da voz da nuvem (plano, teste, flag, configuração, cota do mês ou do dia, provedor fora) SHALL deixar a voz
do aparelho ler a mesma fala, e os caracteres de uma fala que não foi entregue SHALL voltar à cota.

#### Scenario: OpenRouter fora do ar

- **WHEN** o OpenRouter responde 5xx
- **THEN** a resposta é 502 dizendo que a voz do aparelho segue, e os caracteres voltam à cota
