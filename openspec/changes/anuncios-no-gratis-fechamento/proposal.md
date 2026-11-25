> **Só spec (25/11/2026).** Aberta no fechamento de `planos-v3-e-rota-inteligente` (decisão do dono 7). Código de anúncios, consentimento e CSP
> já está pronto e desligado (flag `anuncios`); o que falta é prova real, parecer jurídico e a conferência da cobrança antes de abrir a venda.

## Why

O Plus (R$ 14,90 mensal, R$ 149 anual) está na matriz e a venda está atrás de `venda_planos_v4`; anúncios no Grátis estão atrás da
flag `anuncios`. Os dois dependem do mesmo pedido jurídico único (decisão 6: preço v4, anual, anúncios, ECA Digital) e de um teste real que
o código não substitui. Menores veem anúncio comum, nunca premiado, e nunca oferta de plano.

## What Changes

- Teste real de um anúncio com o isolamento (COOP/COEP) ligado, em página de bancada (antiga 11.1).
- Parecer jurídico anexado e a regra de idade da política de anúncios conferida contra ele (antiga 11.6).
- Conferência no Asaas de que não há assinatura nem cobrança manual em R$ 39,90, R$ 179, R$ 9,90 ou R$ 19,90 e de que o sandbox cobra o Plus (antiga 0.3).
- Tabela momento × oferta × teste das ofertas (fim das horas, áudio difícil, celular, Quest), com copy pela skill `copy-br-etica` (antiga 9.3).
- Abrir só o mensal do Plus antes do parecer; `ANUAL_ENABLED` segue desligado até ele.

## Non-Goals

Não muda preços nem cotas (`src/core/planos.ts`), não liga flag em produção (ato do dono), não cria plano novo.
