# ADR 0014 — Postgres agora (PGlite em dev, `pg` em produção), como passo da migração para a Cloudflare

- **Data:** 2026-10-19
- **Estado:** aceito
- **Substitui:** ADR 0006 (o gatilho medido deixa de valer: a migração começa já)
- **Spec:** `docs/specs/2026-10-19-migracao-cloudflare.md` (opção C)
- **Medições:** `docs/auditoria/2026-10-19-spikes-cloudflare.md`

## Contexto

O ADR 0006 mantinha o SQLite numa máquina do Fly até um gatilho medido (escritas, segunda máquina, tamanho ou
1.000 cadastrados). Em 19/10/2026 o dono decidiu centralizar o servidor na Cloudflare e o banco no Supabase
(spec acima, opção C). Os spikes mostraram que o destino óbvio, o SQLite dentro da Cloudflare, não serve do Brasil:

- **D1** não roda na América do Sul: cada ida custa ~130 ms; uma rota de 7 consultas em sequência leva 1,1 s
  (p95 1,3 s) e o piso com `batch` é ~250 ms (S1).
- **Durable Objects** não nascem na América do Sul; o salto Worker→DO custa os mesmos ~130 ms (S1).
- **Containers** rodam em `SAM`, mas toda requisição passa por um DO em ENAM, o disco é efêmero e um experimento
  público perdeu escritas num `kill -9` com Litestream (spec, seção Problema).
- O Express do app roda em Workers (S2) e o servidor empacotado cabe no limite (S5); o bloqueio era o banco
  (`@libsql/client` recusa `file:` no Worker).

Um Worker com `placement` em `aws:sa-east-1` falando com o Postgres do Supabase em `sa-east-1` (via Hyperdrive) é o
único caminho que mantém a latência por consulta compatível com o Fly de hoje. Ele exige Postgres, e a troca de
dialeto vale em qualquer variante da opção C, inclusive se o servidor ficar no Fly por um tempo.

## Decisão

O servidor passa a falar **Postgres**, e não mais SQLite/libsql (Fase 1 da migração):

- **Produção:** `pg` com `DATABASE_URL=postgres://...` (Supabase em `sa-east-1`; Hyperdrive nas fases seguintes).
- **Desenvolvimento e testes:** **PGlite** (`@electric-sql/pglite`, Postgres 17 em WASM): `pglite:./data/pg` no
  `dev:local` e `pglite://memory` nos testes. Mesmo dialeto da produção, sem Docker.
- `server/db/db.ts` é a única costura (`emTransacao`, `emLote`, `travarUsuario`, `linhas`, `linhasAfetadas`,
  `fecharBanco`); `server/db/tipoDoBanco.ts` decide `pglite:` ou `postgres:`.
- Schema em `pg-core` com baseline único em `server/db/migrations-pg/` (`0000_baseline`, `0001_triggers_e_flags`,
  `0002_seguranca_supabase` com RLS nas 38 tabelas). As 54 migrações antigas ficam em `migrations-sqlite/` só
  para o teste de migração de dados e para ler snapshots legados.
- Os dados saem do SQLite por um CLI próprio (`scripts/migracao/sqlite-para-postgres.ts`) com paridade por
  checksum por tabela.

## Alternativas consideradas

- **Turso (SQLite remoto em São Paulo).** Manteria o dialeto e as migrações, mas é um terceiro fornecedor, cobra
  por linha escrita e o escritor continua único. O dono tirou a opção da mesa em 19/10/2026.
- **D1.** Reprovado pelo S1: ~130 ms por ida, 5 a 10 vezes mais lento que o Fly sem reescrever toda rota para
  uma ida ao banco, e mesmo assim com piso de ~250 ms.
- **Cloudflare Containers com SQLite + Litestream.** Passa por um DO fora da América do Sul, disco efêmero e
  perda de escritas medida em `kill -9`.
- **Ficar no Fly com SQLite (opção A).** Funciona hoje, mas mantém dois fornecedores, não tem alta
  disponibilidade e um escritor único. Segue como plano de contingência: o Postgres da Fase 1 também serve ao
  servidor no Fly.

## Consequências

Melhor: banco gerenciado com backup do fornecedor (PITR como add-on), transações interativas reais, várias
máquinas possíveis, dev e testes no mesmo dialeto da produção. Pior: reescrita do acesso a dados e das 25
triggers, latência de rede em cada consulta (a validar no spike S6), e um dialeto novo para quem operava SQLite.

- **PGlite não tem autovacuum:** `ANALYZE` roda após as migrações e no fim da limpeza diária quando o banco é
  embutido. Aceita **um processo por diretório**: o boot recusa `CLUSTER_WORKERS>1` e `REPLICAS>1` com PGlite.
- **Backup:** `pg_dump` (credenciais por variáveis `PG*`, nunca argv) com `postgres://`; cópia do diretório com
  `pglite:<dir>`, só com o servidor parado. Snapshot, WAL, `VACUUM INTO` e Litestream saíram do servidor
  (`server/operacao/snapshot.ts` virou no-op com `SNAPSHOT_INDISPONIVEL`). O `pg_dump` semanal no CI fica para a Fase 2.
- **Preflight de produção** bloqueia `DATABASE_URL` ausente ou que não seja `postgres://`/`postgresql://`.
- **`/api/health`** devolve `banco: 'pglite' | 'postgres'` no lugar de `journal_mode`.
- **`@libsql/client`** fica só para importar `.apkg` (Anki) e para ler SQLite legado (anonimização de fixtures,
  snapshots antigos).
- **Testes de concorrência e multiprocesso** rodam num Postgres real apenas com `TESTE_POSTGRES_URL`
  (o `docker-compose.yml` tem um serviço `postgres:17`); sem a variável, são pulados com motivo.
- **Pendente nas fases seguintes:** `Dockerfile`, `iniciar-container.sh`, `litestream.yml`, `fly.toml`, jobs de CI
  `restauracao-litestream` e `imagem-construir`, e o corte de dados em produção (o servidor antigo precisa estar
  parado durante a cópia).

## Como isto é cobrado

- `npm run preflight` recusa o banco errado em produção.
- Boot recusa `CLUSTER_WORKERS>1`/`REPLICAS>1` com PGlite.
- A migração de dados sai com código 1 se qualquer tabela divergir em contagem ou checksum.
