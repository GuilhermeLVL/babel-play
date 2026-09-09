## Why

`largerModels` esta na matriz de planos desde a Fatia 1 e e devolvido ao cliente — e nenhuma linha
do servidor o lia (medido com `grep largerModels server/`). Todo plano recebia o mesmo modelo: o Pro
pagava por uma diferenca que nao existia e o free usava o modelo caro sem nada o impedir.

## What Changes

- `LLM_MODEL_GRANDE` e `modeloDoPlano()` em `server/ai/provedores.ts`; `llmDeNuvem` e
  `cascataDeTraducao` recebem `{ modelosGrandes }`.
- `mtProxy` e `routes/gemini` resolvem o plano UMA vez (`getEntitlementsForUser`) e usam os dois
  entitlements: o que deixa entrar e o que escolhe o modelo.
- Variavel ausente mantem o comportamento anterior — qual modelo vale a diferenca de preco e decisao
  de produto.

## Nao-escopo

Mexer na quota. O diagnostico do plano ("o cap mensal degrada aberto") foi conferido e e falso: o
teto responde 402 e vale sob concorrencia; so a falha de INFRA degrada aberto, com log e teste
proprios. Os testes de overshoot que o plano pedia ja existiam em dois niveis.
