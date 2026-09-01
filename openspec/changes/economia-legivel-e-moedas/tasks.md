## 1. Conteúdo: nenhuma casa vazia

- [x] 1.1 25 itens novos nas décadas 5–10 (packs, cursores e rastros do que já existe)
- [x] 1.2 `passe.ts`: cofres derivados (10 − itens) e marco de dezena = item mais raro
- [x] 1.3 Teste que reprova casa vazia e marco oco

## 2. A régua das quatro origens

- [ ] 2.1 `origemDoItem` no core: nível · Seeds · conquista · créditos
- [ ] 2.2 `estadoDaColecao` separa os três baldes que hoje viram "possuidos"
- [ ] 2.3 Ícone por tipo/origem (fim do emoji sorteado da descrição por regex)
- [ ] 2.4 `COR_DA_RARIDADE` sai dos hex crus e passa a token; cor do cartão = origem
- [ ] 2.5 Um cartão único usado pelas 4 abas

## 3. Moedas (backend antes da tela)

- [ ] 3.1 `criarCobrancaAvulsa` no cliente Asaas (POST /payments)
- [ ] 3.2 Webhook discrimina avulso × assinatura (hoje uma compra promoveria a plano)
- [ ] 3.3 Tabelas `credit_purchases` / `credit_spends` (evento, nunca saldo mutável)
- [ ] 3.4 Saldo de créditos derivado no perfil
- [ ] 3.5 Testes de idempotência espelhando billing-webhook

## 4. Telas de compra

- [ ] 4.1 Passe Premium com CTA real (R$ 14,90, devolve 1.134 créditos)
- [ ] 4.2 Comprar Créditos (100/R$9,90 · 300/R$24,90 · 700/R$49,90)
- [ ] 4.3 Verificação no navegador das duas telas
