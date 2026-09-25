# ADR 0006 — Manter SQLite numa máquina até o gatilho medido, e então migrar para Postgres

- **Data:** 2026-09-25
- **Estado:** proposto
- **Change OpenSpec:** `prontidao-producao`

## Contexto

O banco é SQLite via `@libsql/client` com driver síncrono, WAL, uma conexão, num volume do Fly de uma máquina
(`server/db/db.ts:11-33,77-80`; `fly.toml:3-6`). Rate limit, cotas, orçamento e ranking vivem nele. Medido em
25/09/2026 (`openspec/audits/2026-09-25-prontidao/fase2-escala.md`):

- escritor único: 654–1.275 pares incremento+estorno/s e 1.035–3.515 reservas/s num núcleo local; ~80–160
  escritas/s sustentadas no `shared-cpu-1x`;
- demanda estimada: ~0,076 × cadastrados escritas/s (76/s com 1.000, 760/s com 10.000);
- até 1.000 cadastrados a **CPU** quebra antes do banco (`vocab` 133 ms, `profile` 77 ms de CPU por request);
- banco ~3,9 MB por usuário pesado: 3,9 GB com 1.000, 39 GB com 10.000 (volume limitado a 10 GB).

O Supabase Pro já está no plano de lançamento para autenticação (`docs/LANCAMENTO.md:3-6`) e inclui Postgres.

## Decisão

O SQLite continua sendo o banco enquanto houver **uma máquina**, e a migração para o Postgres do Supabase
começa quando o **primeiro** destes gatilhos disparar: escritas sustentadas acima de 50/s no pico; necessidade de
uma segunda máquina (CPU acima de 60% sustentada já em `performance-1x`, ou alta disponibilidade exigida); banco
acima de 5 GB; ou 1.000 cadastrados ativos no mês. A trava de boot passa a recusar `REPLICAS>1` com banco local.

## Alternativas consideradas

- **Migrar já para Postgres.** Rejeitada agora: não resolve o gargalo real até 1.000 (CPU das rotas caras),
  adiciona latência de rede em cada uma das 3–7 queries fixas por request e custa semanas de migração do schema
  drizzle (30 migrations) antes de haver usuário.
- **Turso / libsql remoto com réplicas.** Mantém o dialeto, mas o escritor continua único e remoto; a
  recomendação antiga (`docs/auditoria/decisao-infraestrutura-v1.md`) foi superada pelo deploy no Fly.
- **LiteFS com réplicas de leitura.** Escalaria leitura, não escrita, e o gargalo previsto é escrita + CPU.

## Consequências

Melhor: nenhuma migração de dados antes do produto provar demanda; backup contínuo (Litestream) já testado no
CI. Pior: sem alta disponibilidade — deploy e `fly secrets set` derrubam o serviço por ~20 s; queda da região
exige ação manual. Proibido: `fly scale count 2` com SQLite (dois bancos divergentes).

## Como isto é cobrado

- Trava de boot recusa `REPLICAS>1` quando o banco é arquivo local (teste de boot).
- Métricas de escritas e de CPU com alerta ao cruzar 70% do gatilho (Fase 5).
- Revisão deste ADR quando o alerta disparar.
