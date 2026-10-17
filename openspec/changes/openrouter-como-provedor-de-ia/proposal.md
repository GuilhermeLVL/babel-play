## Why

O dono não tem créditos na Groq e tem no OpenRouter. O servidor só sabia chamar a transcrição no formato multipart
`/audio/transcriptions` da OpenAI, que não leva o roteamento de retenção zero (`provider.zdr`) do OpenRouter: o pedido
iria ao OpenRouter sem a garantia por requisição, que o projeto exige (o app atende menores). Medido em 17/10/2026:
o OpenRouter tem um endpoint próprio de transcrição (JSON com o áudio em base64) com 26 modelos, e o Whisper large-v3-turbo
(o modelo que o app já usava) tem provedor de retenção zero a cerca de US$ 0,012 a 0,04 por hora.

## What Changes

- **STT pelo endpoint do OpenRouter**: `montarPedidoDeStt` monta JSON (`model`, `input_audio` em base64 com `format` wav/ogg,
  `language`, `temperature: 0` e o `provider` de `parametrosDoProvedor`: `zdr`, `data_collection: deny`, sem o Google) quando a
  base é o OpenRouter. Sem repetição em `json` (isso é do multipart).
- **Registro pronto** `ops/ia-provedores.openrouter.json`: STT `openai/whisper-large-v3-turbo`; tradução e tutor
  `google/gemma-4-26b-a4b-it` (Gemma, não Gemini) e `meta-llama/llama-3.3-70b-instruct` de reserva; nuance/polimento começam
  em `openai/gpt-oss-120b`. Só precisa de `OPENROUTER_API_KEY`.
- **Testes isolados do `.env` do desenvolvedor**: `tests/setup-db-isolada.ts` aponta o `dotenv` a um arquivo que não existe.
- **Documentação**: exemplo de produção e `docs/lgpd/operadores.md` (suboperadores atrás do OpenRouter; a política de
  privacidade ainda cita a Groq).

## Non-Goals

- Qualquer modelo Gemini (o registro continua recusando) ou modelo `:free` (podem treinar com dados).
- `qwen/qwen3-asr-1.7b`: melhor em chinês, mas errou o espanhol sem dica de idioma e a 1ª chamada levou 36 s.
- Mudar o padrão `IA_EM_VOO_STT=1` em produção (decisão de capacidade; só recomendado em 2 para a captura dupla).
- Reescrever a política de privacidade (texto jurídico do dono).

## Impact

- `server/ai/cascataDeStt.ts`, `tests/integration/cascata-de-stt.test.ts`, `tests/setup-db-isolada.ts`,
  `ops/ia-provedores.openrouter.json`, `.env.production.example`, `docs/lgpd/operadores.md`.
- Sem migração de banco nem mudança de API do cliente.
