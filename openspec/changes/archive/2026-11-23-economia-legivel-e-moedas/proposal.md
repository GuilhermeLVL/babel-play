## Why

O dono, revendo o app (31/08): *"o passe está meio estranho e tem vários itens vazios; precisamos
garantir que a cada nível o usuário vai desbloquear algo"* e *"tudo parece mudar demais, nada
parece estar ligado"* — sem conseguir apontar o quê. A investigação achou causas estruturais:

1. **O passe estava oco por falta de conteúdo**: 59 itens não-exclusivos para 100 casas, com 43
   deles nos níveis 1–5. Resultado medido: **33 casas vazias**, 29 na segunda metade, e **8 dos 10
   marcos ★ de dezena mostrando uma estrela dourada sobre o nada**.
2. **A origem do item some depois de obtido**: `estadoDaColecao` (`galeria/progressao.ts:56`) joga
   ganho-por-nível, comprado-com-Seeds e conquistado no mesmo balde `possuidos`.
3. **O ícone é sorteado**: `emojiDoItem` (`progressao.ts:87`) extrai o primeiro emoji da descrição
   por regex — o ícone depende do texto, não do que o item é.
4. **Duas perguntas, uma codificação**: o cartão colore por raridade (com hex crus `#4C9AFF` /
   `#A66CFF`, fora dos tokens do tema); a origem não tem sinal nenhum.
5. **A Loja é uma parede de 51 cadeados** para quem começa, e esvazia para quem compra.

Junto disso, a decisão do dono de **vender Passe Premium (R$ 14,90) e Créditos** — que exige o
backend de moeda comprada e expõe um **bug latente**: `server/routes/billing.ts` trata todo
`PAYMENT_CONFIRMED` como assinatura, então uma compra avulsa promoveria o comprador a plano pago.

## What Changes

1. **Conteúdo**: 25 itens novos nas décadas 5–10, montados do que já existe (packs de emoji do
   catálogo, cursores da lista, rastros `gen:<forma>:<paleta>`). Zero arte, zero sistema novo.
2. **Passe**: cofres derivados (10 − itens da década) e o marco de dezena passa a receber o item
   mais raro. Invariante travada por teste: nenhuma casa vazia.
3. **Régua das quatro origens** (nível · Seeds · conquista · créditos): ícone e cor de token
   próprios, valendo em todas as telas; raridade vira selo. A cor passa a responder "como consigo".
4. **Moedas**: cobrança avulsa no Asaas, webhook corrigido, razão de créditos por eventos, e as
   duas telas de compra.

## Não-escopo

Refatorar as telas fora da economia (Hub, Library, Analysis) para o sistema de design — o mapa
registrou as divergências, mas são mudança própria.
