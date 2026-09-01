## Why

A auditoria de 01/09 (economia · monetização · autenticação) achou que **a contabilidade é de
padrão de indústria e a autorização de valor não existe**. O ledger está certo — append-only, saldo
derivado nas duas moedas, idempotência por índice único parcial com `ON CONFLICT DO NOTHING` numa
instrução (`server/db/schema.ts:298`, `server/db/repositories/seedSpends.ts:54-58`), `userId`
sempre do token, replay-protection do webhook antes de qualquer efeito (`billing.ts:228-233`).

O que falta é o outro metade do padrão: **o cliente diz QUAL evento aconteceu; o servidor decide
QUANTO vale.** Hoje o servidor não conhece o catálogo — `grep -rn "CATALOGO_DA_LOJA\|CONQUISTAS"
server/` devolve zero — e grava fielmente o número que o cliente mandar. O próprio projeto já faz
certo do outro lado: `server/routes/billing.ts:78-83` resolve o preço do pacote de Créditos
server-side a partir de `src/core/creditos.ts`. Nunca foi aplicado às Seeds.

Quatro consequências, todas exploráveis com um `curl` por qualquer conta autenticada:

1. `POST /api/metrics/seeds/creditar` (`server/routes/metrics.ts:101`) credita o `amount` e o `xp`
   do corpo. O Zod (`server/validation.ts:195-200`) só confere formato: `creditoId` é string livre
   de 8–80 chars, `amount` e `xp` vão a 10.000 cada. Com o teto de escrita de 120 req/min
   (`server.ts:111`), são **1,2 M de Seeds e 1,2 M de XP por minuto**. O `xp` entra direto no nível
   (`src/core/learning/xp.ts:107`), que destrava de graça todo item gateado por nível.
2. A **posse é derivada do razão do gasto** (`reason LIKE 'loja:%'` / `'croma:%'`,
   `server/db/repositories/seedSpends.ts:91-112`) e `seedSpendSchema` (`server/validation.ts:187`)
   aceita `reason` livre com `amount` a partir de 1. `{amount:1, reason:'loja:tema-custom'}` entrega
   o lendário de 600 Seeds por 1 — e o servidor passa a **atestar** essa posse.
3. `seedSpendsRepo.debitar` (`server/db/repositories/seedSpends.ts:31-72`) **nunca lê o ganho**.
   Não existe "saldo insuficiente" no servidor; os únicos guardas são de UI (`Play.tsx:725`,
   `EditorDoItem.tsx:143`).
4. **Escalada de plano com dinheiro real**: `POST /api/billing/assinar` reescreve a intenção sem
   pagar (`billing.ts:131-137`) e o webhook concede `atual.plan` sem conferir
   `providerSubscriptionId` nem o valor pago (`billing.ts:272-282`). Assinar `essencial` → assinar
   `pro` → pagar só o essencial → **receber Pro por R$ 9,90**.

Mais cinco portas laterais: `wordCount` sem teto (`server/validation.ts:306`) vale 2 XP por palavra;
`/api/exercises/rodada` aceita `correct:1` para 200 itens com `itemRef` arbitrário;
`liberadoTudo()` destrava o catálogo com uma chave de localStorage avaliada antes de tudo
(`src/lib/desbloqueios.ts:46` → `src/lib/loja.ts:212`); aprimoramentos não têm contraparte no
servidor; e o webhook não tem rate limit.

**A malha de testes não cobre nada disso.** `tests/integration/economia-v2.test.ts` protege
idempotência, unicidade por usuário, `amount` negativo e janela de fuso — nunca valor correto nem
conquista real. Os testes travam contabilidade, não autorização; é coerente com o que o código faz,
e é exatamente onde está o furo.

Esta mudança **bloqueia** `credito-com-destino`, `porta-de-entrada` e `vender-onde-se-ve`: vender
numa economia falsificável cria dívida com dinheiro real no meio, e correção depois vira estorno.

## What Changes

- **O catálogo passa a ser legível pelo servidor.** `CATALOGO_DA_LOJA` sai de `src/lib/loja.ts`
  para `src/core/` (única mudança estrutural), junto com as conquistas e `REGRAS` — o mesmo lugar
  de onde `planos.ts` e `creditos.ts` já servem cliente e servidor.
- **`/seeds/creditar` deriva o valor da regra** e ignora o do cliente; `creditoId` desconhecido é
  400; conquista não cumprida (conferida contra os contadores do servidor) é 400.
- **`/seeds/gastar` valida motivo, preço e saldo**: `reason` em formato conhecido, id existente no
  catálogo, `amount` igual ao preço, exclusivo de conquista nunca comprável, e saldo conferido
  dentro de transação → 402 com o que falta.
- **A assinatura confirmada tem de ser a que foi paga**: o webhook confere `payment.subscription`
  contra a intenção e o valor contra `PLAN_MATRIX`; `currentPeriodEnd` deriva do ciclo pago.
- **Portas laterais fechadas**: teto em `wordCount`; itens de rodada referenciando cartões do
  próprio usuário; `writeLimiter` também no webhook; `liberadoTudo()` só em build de desenvolvimento.
- **Aprimoramentos derivam do ledger** (`reason LIKE 'aprimoramento:%'`), como a posse já deriva.
- **A hidratação deixa de ser UNION em modo público**: o servidor substitui o espelho local, que
  hoje preserva posse forjada (`src/lib/loja.ts:196`, `src/lib/galeria/cromas.ts:70`). Sem conta o
  UNION continua, porque lá o local é a única fonte.
- **Testes que reprovam o ataque**, que é o que falta hoje.

## Non-Goals

- Migrar o ledger para dupla entrada. Saldo derivado de eventos com idempotência no banco já é o
  padrão para moeda de jogo; dupla entrada resolveria um problema (conciliação contábil entre
  contas) que este produto não tem.
- Trocar o bearer estático do webhook por assinatura HMAC do corpo: é o que o Asaas oferece. O que
  entra é rate limit e a conferência de valor, que não dependem do provedor.
- Qualquer tela. Esta mudança é de servidor e de contrato.
