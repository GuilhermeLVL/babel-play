## Why

Visão de longo prazo do dono (31/08): além das assinaturas, vender CRÉDITOS (moeda comprada)
para personalização premium — temas/efeitos com acabamento profissional, conteúdo exclusivo,
mesada mensal de créditos inclusa nos planos pagos. Esta mudança é SÓ especificação: nenhum
código até o Asaas estar validado em sandbox e o inventário server-side existir.

## What Changes (quando for implementado — pré-requisitos primeiro)

- Separação estrita: seeds (ganhas, client-friendly) e créditos (comprados, SEMPRE
  server-side). Nada comprado com dinheiro pode viver só em localStorage — a posse atual
  (`babel.loja_possuidos`, brecha B4) precisa migrar para inventário no servidor ANTES.
- Compra via Asaas (pagamento único, não assinatura), com a mesma idempotência por evento do
  webhook de assinaturas; crédito entra só na confirmação, como a promoção de plano.
- Catálogo premium separado do catálogo de seeds; preços em BRL definidos pelo dono.
- Planos pagos incluem mesada mensal de créditos (creditada idempotente por mês, padrão
  `seed_credits`).
- Segurança: saldo por eventos (crédito/débito), nunca saldo mutável; reembolso via evento
  inverso; LGPD igual ao billing atual (CPF direto ao processador).

## Não-escopo

Preços finais, arte dos itens premium, e qualquer tela — decisões do dono na hora de ativar.
