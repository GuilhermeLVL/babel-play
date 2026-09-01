## 1. O catálogo passa a ser do core (pré-requisito de tudo)

- [ ] 1.1 `CATALOGO_DA_LOJA` e os tipos (`ItemDaLoja`, `Raridade`) saem de `src/lib/loja.ts` para
      `src/core/loja.ts` — módulo puro, sem DOM e sem localStorage, no molde de `core/planos.ts`.
      `src/lib/loja.ts` passa a reexportar, para nenhum import de tela quebrar
- [ ] 1.2 `src/core/economia-servidor.ts`: `precoDoItem(id)`, `itemDoCatalogo(id)`,
      `recompensaDaConquista(id)` e `condicaoDaConquista(id)` — as funções que o servidor consulta
- [ ] 1.3 `npm run typecheck:core` continua passando (o core não pode ganhar dependência de browser)

## 2. `/seeds/creditar` — o valor vem da regra

- [ ] 2.1 A rota resolve `creditoId` no catálogo e usa `amount`/`xp` DA REGRA
- [ ] 2.2 `creditoId` desconhecido → 400
- [ ] 2.3 Condição conferida contra os contadores do servidor (`computeProfile`) → não cumprida = 400
- [ ] 2.4 `seedCreditSchema` deixa de aceitar `amount`/`xp` do cliente (campos saem do contrato)

## 3. `/seeds/gastar` — motivo, preço e saldo

- [ ] 3.1 `reason` validado por formato fechado: `loja:<id>` · `croma:<item>:<matiz>` ·
      `apr-<alvo>-n<N>` · `pular-rodada`
- [ ] 3.2 O id citado tem de existir no catálogo, e `amount` tem de ser o preço dele
- [ ] 3.3 Item com `exclusivoDe` nunca é comprável por esta porta → 400
- [ ] 3.4 Saldo conferido na mesma transação do débito → 402 com quanto falta
- [ ] 3.5 A idempotência por `spendId` continua intacta (o caminho feliz não muda)

## 4. A assinatura concedida é a que foi paga

- [ ] 4.1 O webhook confere `payment.subscription` contra `providerSubscriptionId` da intenção
- [ ] 4.2 E o `payment.value` contra `PLAN_MATRIX[plano].precoMensalBrl`
- [ ] 4.3 Divergência não promove e fica registrada em `billing_events` para auditoria
- [ ] 4.4 `currentPeriodEnd` deriva do ciclo pago, não dos +35 dias fixos (`billing.ts:280`)

## 5. Portas laterais de XP e de posse

- [ ] 5.1 Teto em `wordCount` no `patchSessionSchema` (`server/validation.ts:306`)
- [ ] 5.2 `/api/exercises/rodada`: itens têm de referenciar cartões do próprio usuário
- [ ] 5.3 `writeLimiter` também no webhook (hoje montado antes de tudo, `server.ts:144`)
- [ ] 5.4 `liberadoTudo()` só com `import.meta.env.DEV` (`src/lib/desbloqueios.ts:46`)
- [ ] 5.5 Aprimoramentos derivam do ledger (`reason LIKE 'aprimoramento:%'`), não do localStorage
- [ ] 5.6 Hidratação de posse e cromas substitui o espelho local em modo público; UNION continua
      no modo sem conta (`src/lib/loja.ts:196`, `src/lib/galeria/cromas.ts:70`)

## 6. A invariante declarada passa a valer

- [ ] 6.1 `computeXpHistory` soma `xpCreditado`, presença, sequências e rodadas perfeitas — ou o
      comentário de `server/db/repositories/metrics.ts:282-285` deixa de afirmar o que não cumpre

## 7. Testes que reprovam o ataque

- [ ] 7.1 `tests/integration/economia-autoridade.test.ts`, no molde dos `mt1-tenant-*` (Express real,
      dois tokens): valor inflado → valor da regra · `creditoId` inventado → 400 · conquista não
      cumprida → 400 · exclusivo por `reason` forjado → 400 · preço abaixo do catálogo → 400 ·
      gasto sem saldo → 402
- [ ] 7.2 `tests/integration/billing-webhook.test.ts` ganha o caso da escalada de plano
- [ ] 7.3 `wordCount` absurdo → 400 em `tests/integration/validacao-input.test.ts`
- [ ] 7.4 Os 2.159 testes atuais continuam passando (o caminho feliz não muda)

## 8. Verificação

- [ ] 8.1 `npx vitest run` · `npm run typecheck` · `npm run lint` · `npm run audit:gate` ·
      `npx ast-grep scan -c sgconfig.yml src server server.ts`
- [ ] 8.2 Prova do ataque com `AUTH_REQUIRED=1` e token de teste: o `curl` de `amount: 10000`
      passa antes e falha depois
- [ ] 8.3 Navegador (`npm run dev:local`): comprar, equipar e creditar conquista continuam
      funcionando pelo caminho normal
