## 1. Pré-requisitos (outras mudanças)

- [ ] 1.1 Asaas validado em sandbox (dependência do dono)
- [x] 1.2 Inventário server-side de posse (fecha a brecha B4) — sem tabela nova: a compra
      sempre foi evento (`seed_spends.reason = 'loja:<id>'`); o perfil agora devolve
      `itensComprados` derivado do log e o cliente hidrata o espelho local por UNION
      (compra offline preservada). Servidor real + efêmero em paridade; verificado ao vivo.

## 2. Implementação futura (não desta rodada)

- [ ] 2.1 Tabelas de eventos de crédito
- [ ] 2.2 Compra única via Asaas + webhook
- [ ] 2.3 Mesada mensal por plano
- [ ] 2.4 Catálogo premium
