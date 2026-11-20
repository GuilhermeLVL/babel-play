## Why

A voz natural da nuvem do intérprete (`POST /api/ai/tts`) existe desde a Fase E, mas o padrão dela é o Chatterbox na
DeepInfra, que pede uma chave que o dono não tem. O app já fala com o OpenRouter (`OPENROUTER_API_KEY`), e o OpenRouter
tem `POST /api/v1/audio/speech` com retenção zero. O dono autorizou (17/11/2026) a voz natural paga pelo OpenRouter,
"apenas em planos pagos e a depender do custo".

## What Changes

- Provedor `openrouter` na voz natural: o Kokoro 82M (o padrão, o mais barato) e o MAI-Voice 2.1 Flash (a voz `boa`,
  desligada por padrão) pelo mesmo núcleo de síntese (`server/ai/nucleo/sintetizarVoz.ts`), com a chave do app.
- Retenção zero obrigatória: todo pedido de voz ao OpenRouter leva `provider: { zdr: true, data_collection: "deny" }`;
  só modelos com endpoint de retenção zero conferido viram perna; o registro recusa os outros (e o `:free`).
- Vozes por idioma: o Kokoro e o MAI escolhem o idioma pela voz; a voz sai do idioma da fala.
- Só planos pagos: a voz da nuvem exige `vozNatural` E plano pago, fora do teste de 3 dias. Grátis, convidado e teste
  nunca chegam à nuvem da voz (o teste perde a franquia de 10 mil caracteres). O self-host continua (a chave é dele).
- O nível de voz do plano decide o modelo: a voz `boa` (MAI) só para `nivelDeVoz: 'boa'`.
- Custo: o Kokoro entra a US$ 4/1M no orçamento e no modelo de custo (o pior endpoint com retenção zero; o OpenRouter
  não aceita `order` na voz). Os tetos de voz de Premium, Ao Vivo, Família e Pro caem para manter a margem ≥ 0.
- `ops/ia-provedores.openrouter.json` ganha o Kokoro na função `tts` (o MAI fica de fora). A flag `voz_natural` continua
  desligada; nada muda em produção sem o dono.

## Capabilities

### New Capabilities

- `voz-natural-paga`: quem chega à voz natural da nuvem, por qual provedor e modelo, com qual retenção, teto e queda.

### Modified Capabilities

(nenhuma spec principal descreve a voz natural hoje)

## Impact

- Código: `server/ai/provedoresDeVoz.ts`, `server/ai/nucleo/sintetizarVoz.ts`, `server/ai/parametrosDoProvedor.ts`,
  `server/ai/registroDeProvedores.ts`, `server/lib/orcamentoDeIa.ts`, `src/core/vozNatural.ts`, `src/core/planos.ts`,
  `src/lib/entitlements.ts`, `src/lib/voz/vozDaNuvem.ts`, `src/components/views/LiveCapture.tsx`,
  `scripts/ia/modeloDeCusto.ts`, `scripts/ia/simular-custo.ts`, `ops/ia-provedores.openrouter.json`.
- Planos: tetos de voz menores (Premium, Ao Vivo, Família, Pro); o Plus fica com os 150 mil anunciados. O teste de 3 dias
  deixa de ter voz da nuvem.
- LGPD: o OpenRouter já é operador; ligar a flag exige registrar a voz (Kokoro na DeepInfra/Together, MAI na Azure) em
  `docs/lgpd/operadores.md` e `docs/lgpd/ropa.csv`.
