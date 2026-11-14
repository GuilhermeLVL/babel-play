## Context

- Cada pagamento confirmado grava `currentPeriodEnd = vencimento + 35 dias` (mensal) ou `+ 370 dias` (anual e 12x), e
  nunca encurta (`periodoQueVale`).
- O `currentPeriodEnd` NÃO é só do pagamento: o cancelamento fora dos 7 dias grava o fim do dia do próximo vencimento
  (`encerramentoDeAssinatura.ts`), o estorno grava "agora" e o admin pode gravar qualquer valor. Derivar a janela do fim
  deixava a PESSOA mudar a janela (cancelar zerava a cota) — achado da revisão independente do PR #131.
- As reservas são atômicas (`usageCountersRepo.reserve`: uma escrita condicional por `(user_id, metric, window)`) e falham
  fechadas (`ContadorIndisponivel`). A janela era sempre `currentWindow()`, calculada na hora.
- `resolverPlano` já lê a assinatura uma vez por requisição (`memoDoRequest(userId, 'assinatura', …)`).

## Decisions

1. **A janela é ancorada numa coluna que SÓ o pagamento grava**: `subscriptions.periodo_pago_desde` (PG 0019, SQLite
   0061), o vencimento da cobrança que concedeu o período (no 12x, o da 1ª parcela). `aplicarEvento` a grava no MESMO
   upsert do `currentPeriodEnd`, e só quando o pagamento concede o período (com "período mantido", fica a do pagamento
   anterior). Cancelamento, estorno e admin nunca a passam. `janelaDoPeriodoPago(inicio, ciclo, agora)` é pura: mensal →
   `p<data do vencimento>`; anual → `p<data do início da fatia>`, 12 fatias iguais de 370/12 dias, presas à última depois
   do fim. Alternativas descartadas: (a) derivar do `currentPeriodEnd` (a primeira versão: a pessoa movia a janela);
   (b) teto acumulado no período (duas leituras por reserva; a reserva deixaria de ser uma instrução só).
2. **Uma cota por pagamento.** Só a próxima cobrança PAGA grava âncora nova e abre a janela seguinte; os 5 dias de folga,
   o cancelamento e a prorrogação do admin continuam na mesma janela.
3. **Quem não tem âncora fica no calendário**: Grátis, convidado, self-host, o teste de 14 dias, o plano do admin (sem
   período) e a linha cancelada paga antes da 0019 (o backfill só preenche `active`/`past_due`, cujo fim ainda é o do
   pagamento). `periodoPagoEmVigor` (entitlements) decide, com o mesmo critério de `subConcede`.
4. **A reserva continua atômica e fechada.** A janela é lida antes da escrita condicional (a mesma assinatura que o plano
   já leu, memorizada); erro ao lê-la sobe dentro do `try` da reserva e vira `ContadorIndisponivel`. O estorno do mês
   dentro de `reservarNoMesENoDia` usa a MESMA janela da reserva; as subcotas guardam a janela na reserva.
5. **Prefixo `p`.** Separa as janelas novas de `AAAA-MM` e `AAAA-MM-DD` (a poda das janelas do dia compara texto por
   métrica; as métricas do mês não são podadas).
6. **Cobrança (mesma revisão)**: valor fora da matriz é lido no CICLO da cobrança registrada (`atual.ciclo`) e, com troca
   pendente, vale o mais caro entre o plano da cobrança e o da troca que o valor cobre; chargeback de cobrança antiga vai
   para revisão (`nao-aplicado`), o estorno dela fica `ignorado`; estornar uma cobrança duplicada não revoga se outra
   cobrança paga do mesmo fluxo (conferida na API) ainda cobre o período; a revogação é uma escrita condicional ao
   `currentPeriodEnd` lido (`revogarSePeriodoIgual`).

## Risks / Trade-offs

- **Virada no deploy**: quem paga em dia começa a janela do período (âncora do backfill) zerada. Uma cota extra, uma vez.
  As canceladas pagas antes da 0019 seguem no mês do calendário até o próximo pagamento (o fim delas pode ter sido mexido
  pelo cancelamento, então não serve de âncora).
- **Backfill aproximado**: para `active`/`past_due`, a âncora derivada do fim erra se o fim veio de "período mantido" ou do
  admin. Uma vez, e a favor de quem pagou ou do dono por poucos dias.
- **Estorno durante a chamada que cruza a renovação**: a reserva caiu na janela antiga e o estorno (recalculado) vai para a
  nova; o `refund` não deixa o contador negativo. O mesmo já acontecia na virada do mês.
- **Renovação paga adiantada** abre a janela nova antes do vencimento, e o que sobrou da anterior se perde — a favor do dono,
  e a pessoa já pagou o período seguinte.
- **Concessão do admin** (`concessaoDoOperador`, período nulo) põe a conta no calendário: ato humano, auditado.
- **Duplicata sem verificador** (self-host, sem `ASAAS_API_KEY`): não há API para conferir a outra cobrança; o estorno
  revoga, como antes. E os candidatos vêm dos eventos já recebidos: uma duplicata cujo `CONFIRMED` se perdeu não é achada
  até a reconciliação aplicá-lo.
- **Revogação condicional**: se um pagamento confirmar entre a leitura e a escrita, o estorno lança e volta pela
  reentrega do Asaas / próxima reconciliação, reavaliado com o período novo.
