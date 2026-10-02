> Origem: auditoria `openspec/audits/2026-09-13-pre-deploy/` (GAP-001), provado por PoC em
> `evidencias/poc-billing.txt`. Complementa `servidor-e-autoridade` (que endureceu o WEBHOOK, tarefas
> 4.1–4.2); esta change fecha o caminho `/assinar`, que ficou aberto.
>
> **STATUS 2026-09-13: IMPLEMENTADO** na branch `fix/pre-deploy-p0` (commit `92cfb98`). `subConcede`
> não concede em `trialing`; `/assinar` não sobrescreve plan/status de assinatura existente. Teste
> `tests/integration/billing-assinar-nao-concede.test.ts` (verde); PoC volta `free`; webhook (38) intacto.
> Ver `IMPLEMENTATION_REPORT.md`.

> **Conferido no código em 2026-10-02** (origin/main `9573ab38`), task por task; o arquivo que prova cada uma
> está na própria linha. Portões e PoCs não foram rodados de novo nesta conferência: a evidência é a de 13/09,
> em `openspec/audits/2026-09-13-pre-deploy/IMPLEMENTATION_REPORT.md`.

## 1. `/assinar` para de conceder

- [x] 1.1 `server/routes/billing.ts:200-206`: não gravar `plan`/`status` que concedam; registrar a
      intenção fora do que `entitlements` lê (ou derivar o plano no webhook a partir do provedor)
      — feito: `server/routes/billing.ts` (`POST /assinar`, o `subscriptionsRepo.upsert` final): linha nova
      nasce `trialing`, linha existente só troca os ids da tentativa; quem concede é o webhook, pelo valor
      (`server/lib/billingEventos.ts`, `planoPeloPagamento`)
- [x] 1.2 Corrigir o comentário `billing.ts:198-199` (hoje afirma que não muda plan/status — muda `plan`)
      — feito: o comentário "NÃO conceder aqui (GAP-001...)" acima do `upsert` descreve os dois ramos

## 2. `subConcede` exige lastro

- [x] 2.1 `server/lib/entitlements.ts:31-33`: `trialing` só concede se houver trial explícito
      (rota admin) ou pagamento; assinatura não paga não conta
      — feito: `server/lib/entitlements.ts` (`subConcede`): `trialing` NUNCA concede; só `active`, ou
      `past_due`/`canceled` com período pago à frente
- [x] 2.2 Conferir que o caminho de trial legítimo (se existir) continua funcionando
      — a rota admin grava `status: 'active'` (`server/routes/admin.ts`); o teste de 14 dias tem tabela
      própria (`testes_premium`, `server/lib/testePremium.ts`) e é lido depois da assinatura em `resolverPlano`

## 3. Regressão

- [x] 3.1 `billing-assinar.test.ts`: após `/assinar`, `getPlanForUser` = `free` até o webhook
      — o arquivo se chama `tests/integration/billing-assinar-nao-concede.test.ts`
- [x] 3.2 Reproduzir o PoC da auditoria e ver o passo 3 voltar `free`
      — registrado no `IMPLEMENTATION_REPORT.md` (`poc-billing` → `free`); não reproduzido em 02/10
- [x] 3.3 Webhook de pagamento confirmado ainda concede (não regredir `servidor-e-autoridade`)
      — `tests/integration/billing-webhook.test.ts` e o caso "pagamento confirmado (status active) concede"

## 4. Portões

- [x] 4.1 `npx vitest run` · `npm run typecheck` · `npm run lint`
      — `IMPLEMENTATION_REPORT.md`, "Portões verdes na base" (tsc 0, eslint 0, suítes afetadas 50/50)
- [x] 4.2 Prova no `dev:local`: assinar sem pagar não libera recurso gateado por plano
      — SEM registro de execução manual no `dev:local`; o que existe é o equivalente automático (o PoC do
      3.2 e o teste do 3.1: `trialing` → `getPlanForUser` = `free`, e todo portão lê `getPlanForUser`)
