# Economia v2 — Seeds, XP, presença, tempo de sessão e conquistas (2026-08-28)

## O problema medido

Seeds eram `palavrasCapturadas × 1 + revisõesCertas × 4`, e `palavrasCapturadas` é a soma de palavras
dos transcritos. Uma importação de 325 palavras rendia **325 Seeds sem nenhuma ação**; jogar não rendia
Seed; presença, sequência e tempo de sessão não existiam. Com a Loja custando 30-400, quem só capturava
comprava metade do catálogo sem jogar.

## A regra agora (uma fonte só: `src/core/learning/economia.ts` → `REGRAS`)

| Ação | XP | Seeds | Limite |
| --- | --- | --- | --- |
| Abrir o app no dia | 10 | 5 | 1×/dia |
| 7 dias seguidos de presença (a cada 7) | 50 | 25 | por marco, nunca cobrado de volta |
| Cada 5 min de sessão gravada | 10 | 1 | 30 min/dia (6 Seeds) |
| Salvar a sessão | 25 | 0 | |
| Fichar uma palavra no caderno | 2 | 1 | |
| Revisão certa | 3+2 | 2 | |
| Item de jogo certo | 1+2 | 1 | |
| Rodada 100% (≥ mínimo do jogo) | 15 | 5 | |
| Conquista | varia | varia | 1× |

Palavra capturada continua dando 2 XP e **zero Seeds**. Dia ativo típico ≈ 86 Seeds; o lendário mais
caro (600) sai em ≈ 7 dias (teste `economia.test.ts` trava entre 5 e 8).

Preços: comum 40-60 · raro 100-140 · épico 200-260 · lendário 380-600. Aprimoramentos 50/110/220.
Pular rodada mantendo combo: 40.

## Persistência (edição leve = IndexedDB, `data/efemero`)

- Stores novos (`store.ts` v2): `presencas {dia}` e `creditos {creditoId, amount, xp}`; o `upgrade`
  cria só o que falta.
- Rotas: `POST /api/metrics/presenca` (idempotente por dia local) e `POST /api/metrics/seeds/creditar`
  (idempotente por `creditoId`), mesmo padrão de `gastar`.
- `AppMetrics` ganhou campos **opcionais**: `presencas, streakPresenca, maiorSequenciaPresenca,
  sequencias7, capturaMinutos, capturaMinutosPremiados, rodadasPerfeitas, seedsCreditadas, xpCreditado,
  idiomas`. A edição completa (Postgres) ainda não os calcula: `deriveProgress` trata ausência como
  zero. **Follow-up da edição completa:** tabelas `presencas`/`creditos` + os mesmos agregados em
  `server/db/repositories/metrics.ts`.

## Conquistas (`src/core/learning/conquistas.ts`)

14 conquistas com progresso `atual/meta` e recompensa fixa. Quatro dão cosméticos que a Loja **não
vende** (`exclusivoDe` no catálogo): tema Aurora (Constante, 30 dias), partículas Cometa (Ouvinte,
60 min), cursor Coroa (Perfeccionista, 10 rodadas 3★), rastro Arco-íris (Colecionador, todos os
eventos raros). O cliente (`lib/conquistas.ts`) só marca a conquista DEPOIS de o crédito entrar no
servidor; sem rede, tenta de novo na próxima avaliação.

Onde ver: aba **Conquistas & como ganhar** dentro da Loja (edição leve) e aba **Conquistas** no
Perfil (edição completa). A tabela "Como ganhar" é gerada de `REGRAS`: o que está escrito é o que é
creditado.

## Saldos antigos

Recalculados pela regra nova (decisão do dono): Seeds são função dos contadores, então quem só
capturou perde o saldo "de graça". Compras já feitas continuam possuídas (posse local).
