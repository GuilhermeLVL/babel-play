## Why

A auditoria de acesso por plano (14/11/2026, `tests/integration/auditoria-cobranca-ponta-a-ponta.test.ts`) achou que UM
pagamento mensal comprava até TRÊS cotas mensais. A cota do plano contava por mês do calendário UTC (`currentWindow()`,
`AAAA-MM`), e o período pago é o vencimento + 35 dias (`DIAS_DO_PERIODO_MENSAL`, `server/lib/billingEventos.ts`). Pago com
vencimento em 29/11, o acesso vai até 03/01, e a cota zerava em 01/12 e em 01/01. No Essencial (sem teto no dia) é o triplo
das 5 h vendidas; nos outros, o teto do dia segura o ritmo, não o total. A pergunta do dono é "quem paga recebe exatamente o
que pagou, e nada além?" — aqui a resposta era não.

A mesma auditoria achou quatro defeitos de cobrança, corrigidos junto (sem mudança de comportamento declarado, só o código
voltando à regra que já estava escrita): o valor fora da matriz caía no `plan` gravado de outra cobrança; a reconciliação
lia `LIMIT 150` sem ordem e deixava contas novas sem olhar; o estorno com webhook perdido nunca era reconciliado; e o
estorno de uma cobrança ANTIGA derrubava o mês pago depois dela.

## What Changes

- **A janela da cota do plano passa a ser o PERÍODO PAGO** para quem paga (`janelaDaCota`, `server/lib/usageQuota.ts`),
  ancorada em `subscriptions.periodo_pago_desde` — coluna nova (PG 0019, SQLite 0061) que SÓ a aplicação de um pagamento
  grava; o cancelamento, o estorno e o admin mexem no `currentPeriodEnd` e não mudam a janela:
  - mensal: uma janela por período, que começa no vencimento da cobrança paga (`pAAAA-MM-DD`); a renovação paga abre a
    seguinte;
  - anual (à vista ou 12x): o período de 370 dias em 12 fatias iguais (~30,8 dias), 12 cotas mensais por ano pago.
  - Grátis, convidado, self-host, teste de 14 dias e plano dado pelo admin (sem período) seguem no mês do calendário.
- Valem a mesma janela: chamadas, segundos de STT (trechos e ao vivo), tokens de LLM, caracteres de voz, as subcotas do mês
  (explicações e resumos da IA de estudo, tokens do assistente ao vivo e do parceiro de leitura) e `GET /api/me/uso`.
- **Cobrança** (`server/lib/billingEventos.ts`, `server/lib/reconciliarCobrancas.ts`):
  - valor fora da matriz: vale o plano DESTA cobrança (`planoDaCobranca`) se o valor cobre o preço dele; senão,
    `nao-aplicado` (revisão humana). Nunca o `plan` gravado de outra cobrança;
  - a troca de plano que chega atualiza `planoDaCobranca`;
  - estorno/chargeback só revoga se a cobrança devolvida for a do período em vigor;
  - reconciliação: só assinaturas relevantes, em ordem determinística e rodízio diário; e também estornos e chargebacks
    sem evento.

## Non-Goals

- Mudar os números das cotas (`src/core/planos.ts` fica igual; `tests/planos-matriz.test.ts` segue passando).
- Mudar a janela do Grátis, do alívio, do convidado ou do teste (o teste que cruza a virada do mês continua podendo somar
  duas franquias, como já registrado em `teste-por-uso`).
- Teto em dólar por conta (`tetoUsdDaConta.ts`) e orçamento global (`orcamentoDeIa.ts`) seguem por mês do calendário: são
  proteção do dono, não cota vendida.

## Impact

- Migração `0019_periodo_pago_desde` (PG) e `0061_periodo_pago_desde` (SQLite): uma coluna anulável e o backfill das
  linhas do Asaas em dia ou em atraso. `usage_counters` não muda (`window` é texto).
- `server/lib/usageQuota.ts`, `server/lib/entitlements.ts` (`periodoPagoEmVigor`), `server/lib/iaDeEstudo.ts`,
  `server/lib/assistenteAoVivo.ts`, `server/lib/parceiroDeLeitura.ts`, `server/routes/me.ts`.
- Efeito para quem paga: no dia do deploy, o contador do assinante recomeça na janela do período (o uso do mês do calendário
  em curso não é levado). É no máximo uma cota a mais, uma vez — aceitável e a favor de quem pagou.
- Textos de UI que dizem "volta no dia 1º" (`IChat.tsx`, `Planos.tsx`) ficam errados para quem paga: pendência abaixo.
