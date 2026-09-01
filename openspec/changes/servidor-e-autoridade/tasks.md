## 1. O catálogo passa a ser do core (pré-requisito de tudo)

- [x] 1.1 `CATALOGO_DA_LOJA` e os tipos (`ItemDaLoja`, `Raridade`) saem de `src/lib/loja.ts` para
      `src/core/loja.ts` — módulo puro, sem DOM e sem localStorage, no molde de `core/planos.ts`.
      `src/lib/loja.ts` passa a reexportar, para nenhum import de tela quebrar
- [x] 1.2 `src/core/economia-servidor.ts`: `precoDoItem(id)`, `itemDoCatalogo(id)`,
      `recompensaDaConquista(id)` e `condicaoDaConquista(id)` — as funções que o servidor consulta
- [x] 1.3 `npm run typecheck:core` continua passando (o core não pode ganhar dependência de browser)

## 2. `/seeds/creditar` — o valor vem da regra

- [x] 2.1 A rota resolve `creditoId` no catálogo e usa `amount`/`xp` DA REGRA
- [x] 2.2 `creditoId` desconhecido → 400
- [x] 2.3 Condição conferida contra os contadores do servidor (`computeProfile`) → não cumprida = 400
- [x] 2.4 `seedCreditSchema` deixa de aceitar `amount`/`xp` do cliente (campos saem do contrato)

## 3. `/seeds/gastar` — motivo, preço e saldo

- [x] 3.1 `reason` validado por formato fechado: `loja:<id>` · `croma:<item>:<matiz>` ·
      `apr-<alvo>-n<N>` · `pular-rodada`
- [x] 3.2 O id citado tem de existir no catálogo, e `amount` tem de ser o preço dele
- [x] 3.3 Item com `exclusivoDe` nunca é comprável por esta porta → 400
- [x] 3.4 Saldo conferido na mesma transação do débito → 402 com quanto falta
- [x] 3.5 A idempotência por `spendId` continua intacta (o caminho feliz não muda)

## 4. A assinatura concedida é a que foi paga

- [x] 4.1 O webhook confere `payment.subscription` contra `providerSubscriptionId` da intenção
- [x] 4.2 E o `payment.value` contra `PLAN_MATRIX[plano].precoMensalBrl`
- [x] 4.3 Divergência não promove e fica registrada em `billing_events` para auditoria
- [x] 4.4 `currentPeriodEnd` deriva do vencimento da parcela paga quando ele vem no evento;
      sem `dueDate`, o mês redondo de antes

## 5. Portas laterais de XP e de posse

- [x] 5.1 Teto em `wordCount` no `patchSessionSchema` (`server/validation.ts:306`)
- [ ] 5.2 `/api/exercises/rodada` — PRECISA DE DECISÃO DO DONO, não de código. `addRodada` já
      confere o dono do cartão e anula referência alheia (`exerciseResults.ts:229-237`), mas o
      ITEM continua contando para XP e Seeds, e `Play.tsx:822` mostra que item legítimo PODE vir
      sem cartão — então exigir cartão zeraria ganho de jogo real. O guarda proporcional é um TETO
      DIÁRIO de ganho por jogo, como `capturaMinutosPremiados` já faz para gravação; isso muda o
      equilíbrio do jogo e é decisão de produto
- [x] 5.3 `writeLimiter` também no webhook (hoje montado antes de tudo, `server.ts:144`)
- [x] 5.4 `liberadoTudo()` só com `import.meta.env.DEV` (`src/lib/desbloqueios.ts:46`)
- [x] 5.5 Aprimoramentos derivam do ledger (`reason LIKE 'aprimoramento:%'`), não do localStorage
- [x] 5.6 Hidratação de posse e cromas substitui o espelho local em modo público; UNION continua
      no modo sem conta (`src/lib/loja.ts:196`, `src/lib/galeria/cromas.ts:70`)

## 6. A invariante declarada passa a valer

- [x] 6.0 `computeProfile` passa a calcular `sequencias7`, `capturaMinutosPremiados` e
      `rodadasPerfeitas` — eram `?? 0` no cliente e viraram BLOQUEIO ao ligar a conferência de
      saldo: subestimar o ganho é recusar compra legítima. Cálculo espelhado do servidor efêmero

- [x] 6.1 O comentário de `computeXpHistory` deixa de afirmar uma igualdade que o código não
      cumpre, e passa a listar o que entra e o que não entra. Igualar de fato (bucketizar crédito
      de conquista, presença e marcos no tempo) é trabalho de uma mudança própria — afirmar
      invariante que não existe é pior do que não ter invariante

## 7. Testes que reprovam o ataque

- [x] 7.1 `tests/integration/economia-autoridade.test.ts`, no molde dos `mt1-tenant-*` (Express real,
      dois tokens): valor inflado → valor da regra · `creditoId` inventado → 400 · conquista não
      cumprida → 400 · exclusivo por `reason` forjado → 400 · preço abaixo do catálogo → 400 ·
      gasto sem saldo → 402
- [x] 7.2 `tests/integration/billing-webhook.test.ts` ganha o caso da escalada de plano
- [x] 7.3 `wordCount` absurdo → 400 em `tests/integration/validacao-input.test.ts`
- [x] 7.4 Os 2.159 testes atuais continuam passando (o caminho feliz não muda)

## 8. Verificação

- [x] 8.1 `npx vitest run` · `npm run typecheck` · `npm run lint` · `npm run audit:gate` ·
      `npx ast-grep scan -c sgconfig.yml src server server.ts`
- [x] 8.2 Prova do ataque com `AUTH_REQUIRED=1` e token de teste: o `curl` de `amount: 10000`
      passa antes e falha depois
- [x] 8.3 Navegador (`npm run dev:local`): comprar, equipar e creditar conquista continuam
      funcionando pelo caminho normal
