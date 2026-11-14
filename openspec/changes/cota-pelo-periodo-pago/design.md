## Context

- Cada pagamento confirmado grava `currentPeriodEnd = vencimento + 35 dias` (mensal) ou `+ 370 dias` (anual e 12x), e
  nunca encurta (`periodoQueVale`). O início do período não é gravado, mas é derivável: `fim − duração`.
- As reservas são atômicas (`usageCountersRepo.reserve`: uma escrita condicional por `(user_id, metric, window)`) e falham
  fechadas (`ContadorIndisponivel`). A janela era sempre `currentWindow()`, calculada na hora.
- `resolverPlano` já lê a assinatura uma vez por requisição (`memoDoRequest(userId, 'assinatura', …)`).

## Decisions

1. **A janela é derivada de `currentPeriodEnd`, não gravada.** `janelaDoPeriodoPago(fim, ciclo, agora)` é pura: mensal →
   `p<data do início>`; anual → `p<data do início da fatia>`, com 12 fatias iguais de 370/12 dias. Alternativas
   descartadas: (a) teto acumulado no período (soma de vários meses de calendário) — duas leituras por reserva e a reserva
   deixaria de ser uma instrução só; (b) coluna nova com o início do período — migração PG + SQLite para um dado que já se
   deriva do fim.
2. **Uma cota por pagamento.** Como a janela sai do fim do período, a renovação paga (que estica o fim) abre a janela
   seguinte; os 5 dias de folga do mensal NÃO abrem janela nova (o fim só muda quando entra dinheiro). O "período mantido"
   (anual que segue valendo quando chega uma mensalidade antiga) não muda o fim, logo não muda a janela.
3. **Quem não tem período pago fica no calendário**: Grátis, convidado, self-host, o teste de 14 dias e o plano do admin
   (sem `currentPeriodEnd`). `periodoPagoEmVigor` (entitlements) decide, com o mesmo critério de `subConcede`.
4. **A reserva continua atômica e fechada.** A janela é lida antes da escrita condicional (a mesma assinatura que o plano
   já leu, memorizada); erro ao lê-la sobe dentro do `try` da reserva e vira `ContadorIndisponivel`. O estorno do mês
   dentro de `reservarNoMesENoDia` usa a MESMA janela da reserva; as subcotas guardam a janela na reserva.
5. **Prefixo `p`.** Separa as janelas novas de `AAAA-MM` e `AAAA-MM-DD` (a poda das janelas do dia compara texto por
   métrica; as métricas do mês não são podadas).

## Risks / Trade-offs

- **Virada no deploy**: quem paga começa a janela do período zerada. Uma cota extra, uma vez.
- **Estorno durante a chamada que cruza a renovação**: a reserva caiu na janela antiga e o estorno (recalculado) vai para a
  nova; o `refund` não deixa o contador negativo. O mesmo já acontecia na virada do mês.
- **Mudança do fim por ato do admin** (gravar outro `currentPeriodEnd`) abre janela nova. É ato humano, auditado.
- **Renovação paga adiantada** abre a janela nova antes do vencimento, e o que sobrou da anterior se perde — a favor do dono,
  e a pessoa já pagou o período seguinte.
