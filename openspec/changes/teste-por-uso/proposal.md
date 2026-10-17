## Why

O teste de 14 dias do Premium dava o Premium INTEIRO: 20 h de nuvem no mês, 3 M de tokens e 600 mil caracteres de voz, sem
teto próprio em dólar. No teto isso custa US$ 1,16 a US$ 1,76 por pessoa (conservador), sem nenhuma receita, e quem testa e
some é a maioria (mapa do código de 17/10/2026: "teto próprio do teste em horas ou US$: ausente"). O dono pediu que nem o
grátis nem o teste gerem gasto demais. Com 100 testes por mês o teto era US$ 116 a US$ 176; com o teto novo, US$ 20.

## What Changes

- **`FRANQUIA_DO_TESTE`** (`src/core/planos.ts`): 3 h de nuvem por trechos (10.800 s), 450 mil tokens, 4.000 chamadas e 30.000
  caracteres de voz natural. A conta está no código: ≤ US$ 0,20 por teste.
- **O teste acaba no que vier primeiro**: os 14 dias ou este teto. Os entitlements continuam os do Premium (nuance, voz,
  intérprete); só a NUVEM é amostra.
- **Em teste, o teto é o menor entre o do plano e o do teste** (`server/lib/usageQuota.ts`: chamadas, segundos de STT, tokens e
  caracteres de voz). Os mesmos contadores do plano, então o estorno e o acerto continuam consistentes; quem assina no meio do
  teste segue com o mês do plano, descontado do que gastou.
- **`GET /api/me/uso`** mostra o teto real do teste, para a tela não prometer horas que o servidor não dá.

## Non-Goals

- Mudar o que o assinante do Premium recebe (20 h, 2 h por dia) ou a duração de 14 dias.
- Teto em dólar por conta nos planos pagos e texto próprio de "fim do teste por uso" (o aviso atual de fim de cota segue;
  a cota recomeça no dia 1º).
- Limite por dispositivo no teste (hoje a marca é o HMAC do e-mail normalizado).

## Impact

- `src/core/planos.ts`, `server/lib/usageQuota.ts`, `server/routes/me.ts`, `tests/integration/teste-premium.test.ts`.
- Sem migração: os contadores são os de sempre.
- Risco: um teste que cruza a virada do mês recomeça o contador (no pior caso, 2 × 3 h).
