> Origem: auditoria `openspec/audits/2026-09-13-pre-deploy/` (GAP-001), provado por PoC em
> `evidencias/poc-billing.txt`. Complementa `servidor-e-autoridade` (que endureceu o WEBHOOK, tarefas
> 4.1–4.2); esta change fecha o caminho `/assinar`, que ficou aberto.

## 1. `/assinar` para de conceder

- [ ] 1.1 `server/routes/billing.ts:200-206`: não gravar `plan`/`status` que concedam; registrar a
      intenção fora do que `entitlements` lê (ou derivar o plano no webhook a partir do provedor)
- [ ] 1.2 Corrigir o comentário `billing.ts:198-199` (hoje afirma que não muda plan/status — muda `plan`)

## 2. `subConcede` exige lastro

- [ ] 2.1 `server/lib/entitlements.ts:31-33`: `trialing` só concede se houver trial explícito
      (rota admin) ou pagamento; assinatura não paga não conta
- [ ] 2.2 Conferir que o caminho de trial legítimo (se existir) continua funcionando

## 3. Regressão

- [ ] 3.1 `billing-assinar.test.ts`: após `/assinar`, `getPlanForUser` = `free` até o webhook
- [ ] 3.2 Reproduzir o PoC da auditoria e ver o passo 3 voltar `free`
- [ ] 3.3 Webhook de pagamento confirmado ainda concede (não regredir `servidor-e-autoridade`)

## 4. Portões

- [ ] 4.1 `npx vitest run` · `npm run typecheck` · `npm run lint`
- [ ] 4.2 Prova no `dev:local`: assinar sem pagar não libera recurso gateado por plano
