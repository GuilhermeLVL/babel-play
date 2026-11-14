## 1. Cota pelo período pago

- [x] 1.1 `periodoPagoEmVigor` (`server/lib/entitlements.ts`) e `janelaDoPeriodoPago`/`janelaDaCota` (`server/lib/usageQuota.ts`)
- [x] 1.2 Reservas, estornos e acertos do plano na janela do período (chamadas, STT trechos e ao vivo, tokens, voz)
- [x] 1.3 Subcotas do mês: IA de estudo, assistente ao vivo, parceiro de leitura
- [x] 1.4 `GET /api/me/uso` lê a mesma janela
- [x] 1.5 Testes: `auditoria-cobranca-ponta-a-ponta` (o `it.fails` virou `it`) e `cobranca-e-cota-por-periodo` (12 janelas no
      anual, renovação, Grátis/admin no calendário, reserva e estorno na mesma janela)

## 2. Cobrança (defeitos da mesma auditoria)

- [x] 2.1 Valor fora da matriz: plano desta cobrança se o valor cobre o preço; senão `nao-aplicado`
- [x] 2.2 Troca de plano que chega atualiza `planoDaCobranca`
- [x] 2.3 Estorno/chargeback de cobrança antiga não revoga o período pago depois dela
- [x] 2.4 Reconciliação: filtro de relevância, ordem determinística e rodízio diário
- [x] 2.5 Reconciliação de estornos e chargebacks sem evento

## 2b. Revisão independente do PR #131

- [x] 2b.1 Âncora `periodo_pago_desde` gravada só pelo pagamento (PG 0019, SQLite 0061, com backfill); cancelar, estornar
      ou o admin mexer no fim não muda a janela
- [x] 2b.2 Valor fora da matriz no ciclo da cobrança registrada (anual sem cobrir o anual → `nao-aplicado`)
- [x] 2b.3 Troca pendente + valor fora da matriz: o mais caro coberto entre o plano da cobrança e o da troca
- [x] 2b.4 Chargeback de cobrança antiga → `nao-aplicado`; só o estorno dela fica `ignorado`
- [x] 2b.5 Estorno de cobrança duplicada: não revoga se outra paga do mesmo fluxo (na API) cobre o período
- [x] 2b.6 Revogação condicional ao período lido (`revogarSePeriodoIgual`)
- [x] 2b.7 Reconciliação: `active`/`past_due` também precisam de período recente; cobrança atribuída à lista de origem

## 3. Pendências

- [ ] 3.1 Textos "volta no dia 1º" (`src/components/IChat.tsx`, `src/components/views/Planos.tsx`): para quem paga, dizer a
      data em que a cota renova (o fim da janela), com i18n
- [ ] 3.2 Expor em `GET /api/me/uso` quando a janela renova (`renovaEm`) para a tela
- [ ] 3.3 Medir o tamanho do conjunto relevante da reconciliação em produção: com mais de 45 × 150 linhas o rodízio passa
      de 45 dias e convém subir `LIMITE_DE_ASSINATURAS`
