## Why

Créditos são **compráveis e não-gastáveis**. A auditoria de 01/09 mediu:

- `creditsRepo.debitar` (`server/db/repositories/credits.ts:103`) é bem-feito — mesmo `ON CONFLICT`
  das Seeds, idempotente por `spendId` — e **nenhuma rota o chama**. Não existe
  `POST /api/billing/gastar`, nem `gastarCreditos()` no cliente.
- `origemDoItem` (`src/lib/loja.ts:276`) **nunca devolve `'creditos'`**, e nenhum item do catálogo
  tem preço em Créditos. `ORIGEM.creditos` existe com o rótulo "Passe Premium e prateleira paga" —
  e não há prateleira paga.
- O Passe **promete 1.134 Créditos** (`core/creditos.ts:41`, `PasseDeTemporada.tsx:284`) e nenhum
  código os credita. A fileira premium é `role="img"` sem handler (`PasseDeTemporada.tsx:243`), e
  as "Variante Dourada N" (`galeria/passe.ts:124`) são só uma string `nome` — não existem no
  catálogo.

Ou seja: quem pagar R$ 49,90 pelos 700 Créditos recebe **um número que aparece no cabeçalho e não
compra nada**. E quem pagar R$ 14,90 pelo Passe recebe uma fileira trancada que continua trancada.

Isso é pior do que não vender: é vender uma promessa que o código não cumpre. A Fase 1
(`servidor-e-autoridade`) fechou a economia das Seeds; esta fecha o outro lado, que é onde o
dinheiro de verdade entra.

Um quarto item entra junto porque é da mesma família — gate que só existe no cliente:
`youtubeImport` é conferido em `Library.tsx:621` e `server/routes/import.ts` **não checa
entitlement nenhum**. Quem chamar a rota direto importa do YouTube no plano Grátis.

## What Changes

- **`POST /api/billing/gastar`**, chamando `creditsRepo.debitar` com a mesma régua da Fase 1:
  motivo em formato fechado, preço vindo do catálogo, saldo conferido antes de debitar.
- **Itens com preço em Créditos**: `precoCreditos` no catálogo, `origemDoItem` passando a devolver
  `'creditos'`, e a prateleira paga na Loja — que a régua das quatro origens já anuncia.
- **O Passe entrega o que promete**: a fileira premium vira interativa para quem tem o passe,
  credita os Créditos por casa (idempotente por `passe:<temporada>:premium-<n>`), e as "Variante
  Dourada N" viram itens reais do catálogo, exclusivos do passe.
- **`youtubeImport` conferido no servidor**, como `managedCloudStt` e `managedCloudLlm` já são.

## Non-Goals

- Preço dos itens premium em Créditos: é decisão do dono, e entra como número no catálogo depois.
  Esta mudança entrega o CAMINHO (comprar, gastar, entregar), não a tabela de preços final.
- Mesada mensal de Créditos por plano (`economia-de-creditos` 2.3): depende de um relógio mensal
  idempotente que não existe ainda.
- `largerModels`: continua sem consumidor. Ou vira gate real ou sai da matriz — decisão de produto,
  registrada e não resolvida aqui.
