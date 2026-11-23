> **Estado em 2026-09-07** (auditoria `openspec/audits/2026-09-07-coerencia.md`): 1 tarefa aberta (2.5, cartao unico nas 4 abas). A change nao tinha delta em `specs/economia-legivel/`; um delta com os invariantes testados (`tests/passe.test.ts`) foi adicionado em 2026-09-07. Achado A10 (tres reguas de posse) e tratado em `posse-de-cosmeticos-uma-regua`, que deve absorver 2.5.

## 1. Conteúdo: nenhuma casa vazia

- [x] 1.1 25 itens novos nas décadas 5–10 (packs, cursores e rastros do que já existe)
- [x] 1.2 `passe.ts`: cofres derivados (10 − itens) e marco de dezena = item mais raro
- [x] 1.3 Teste que reprova casa vazia e marco oco

## 2. A régua das quatro origens

- [x] 2.1 `origemDoItem` no core: nível · Seeds · conquista · créditos
- [x] 2.2 `estadoDaColecao` separa os três baldes que hoje viram "possuidos"
- [x] 2.3 Ícone por tipo/origem (fim do emoji sorteado da descrição por regex)
- [x] 2.4 `COR_DA_RARIDADE` sai dos hex crus e passa a token; cor do cartão = origem
- [ ] 2.5 Um cartão único usado pelas 4 abas — PENDENTE: a régua já vale em Meu visual e
      no Passe; unificar o componente é refactor visual maior, fica para a rodada seguinte

## 3. Moedas (backend antes da tela)

- [x] 3.1 `criarCobrancaAvulsa` no cliente Asaas (POST /payments)
- [x] 3.2 Webhook discrimina avulso × assinatura (hoje uma compra promoveria a plano)
- [x] 3.3 Tabelas `credit_purchases` / `credit_spends` (evento, nunca saldo mutável)
- [x] 3.4 Saldo de créditos derivado no perfil
- [x] 3.5 Testes de idempotência espelhando billing-webhook

## 4. Telas de compra

- [x] 4.1 Passe Premium com CTA real (R$ 14,90, devolve 1.134 créditos)
- [x] 4.2 Comprar Créditos (100/R$9,90 · 300/R$24,90 · 700/R$49,90)
- [x] 4.3 Verificado: rotas respondem no servidor real (saldo derivado, 501 honesto sem
      chave) e a tela tem 7 testes de componente — a UI só aparece com billing configurado,
      que depende da conta Asaas do dono
