## ADDED Requirements

### Requirement: Transcrição pelo OpenRouter leva a retenção zero no pedido

Quando a perna de STT aponta para o OpenRouter, o servidor SHALL chamar `POST <base>/audio/transcriptions` com JSON, levando
`provider.zdr: true` e `provider.data_collection: "deny"` no corpo e ignorando os provedores do Google. O servidor MUST NOT
enviar áudio ao OpenRouter pelo multipart da OpenAI, que não leva esse roteamento.

#### Scenario: Fala em mandarim

- **WHEN** o cliente envia um trecho de fala com `language=zh` e a perna de STT é o OpenRouter
- **THEN** o pedido é JSON com `input_audio` em base64, `temperature: 0`, `language: "zh"` e o roteamento de retenção zero

#### Scenario: Áudio em Ogg Opus

- **WHEN** o trecho chega em Ogg Opus
- **THEN** `input_audio.format` é `ogg`; qualquer outro contêiner vai como `wav`

### Requirement: Os testes não leem o `.env` do desenvolvedor

A suíte de testes MUST NOT receber variáveis do `.env` do diretório, para caracterizar o servidor sem provedor configurado.

#### Scenario: `.env` com chaves reais e registro declarado

- **WHEN** o `.env` tem `OPENROUTER_API_KEY`, `IA_PROVEDORES_ARQUIVO` e `IA_EM_VOO_STT`
- **THEN** a suíte completa passa como sem eles
