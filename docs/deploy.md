# Deploy — modo público multi-usuário

> **Banco desde a Fase 1 (ADR 0014):** o servidor fala Postgres (PGlite em dev/testes, `pg` em produção). Os trechos
> abaixo sobre SQLite, réplicas/cluster, WAL, `VACUUM INTO`, snapshot e Litestream descrevem o deploy atual no Fly e ficam
> pendentes para as fases seguintes; onde conflitarem com esta nota, vale esta nota.

Container genérico (Docker), sem amarra a fornecedor: roda em VPS, Fly, Railway, Render,
Coolify ou Kubernetes. Os números e limites citados aqui vêm de `docs/audit/04-scalability.md`.

**A produção do Babel Play roda no Fly.io (região GRU)** — `fly.toml`, `.env.production.example`
e o passo a passo do dono em [`docs/LANCAMENTO.md`](LANCAMENTO.md). Este documento cobre a imagem
em si e o `docker compose` de quem hospeda por conta própria.

## Subir

```bash
cp .env.docker.example .env.docker      # preencha (ver §Variáveis)
docker compose --env-file .env.docker up -d --build
curl -fsS http://localhost:3000/api/health
```

`--env-file` **não é opcional**: sem ele o compose usa o `.env` da raiz (configuração local
de desenvolvimento) para substituir as variáveis, e a imagem sairia com o Supabase errado
embutido no bundle do cliente.

## Variáveis

### Obrigatórias

| Variável                                       | Onde é usada                                                                                     | Se faltar                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `SECRET_KEY`                                   | cifra os segredos BYOK em repouso                                                                | **o boot ABORTA** (`server/boot/validar.ts`)          |
| `SUPABASE_URL`                                 | JWKS assimétrico (ES256) que verifica o JWT, e o `iss` exigido                                   | nenhum token valida → 401 em tudo                     |
| `SUPABASE_SERVICE_ROLE_KEY`                    | Admin API: exclusão de conta (LGPD art. 18, VI) e o 2FA exigido nas rotas sensíveis              | exclusão não desfaz o login; o AAL2 não é cobrado     |
| `TRUST_PROXY`                                  | quantos proxies há na frente (`1` atrás de Caddy/Nginx, `2` Cloudflare → Fly, `false` sem proxy) | **o boot ABORTA** com `NODE_ENV=production` (GAP-004) |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | **build time** — o Vite embute na SPA                                                            | a tela de login nunca aparece                         |

`SUPABASE_JWT_SECRET` **não** entra: com `SUPABASE_URL` a verificação é pelo JWKS e o segredo fica
inerte (o boot avisa). Ele só serve a projeto Supabase legado HS256, sem URL.

**Sem login, em produção, só declarado.** `AUTH_REQUIRED=0` com `NODE_ENV=production` aborta o boot
(GAP-003) — a não ser que `SELF_HOST=1` esteja declarado junto, que é a instalação pessoal de quem
roda a imagem só para si. As duas juntas, sempre; nunca no SaaS público.

As `VITE_*` são **build args**, não variáveis de runtime. O Dockerfile falha cedo, com
mensagem, se faltarem — em vez de produzir uma SPA sem login que sobe e não deixa ninguém entrar.

Gerar a `SECRET_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Definidas na imagem

`DATABASE_URL=file:/data/babel.db` (o `Dockerfile` ainda define isto; o preflight de produção recusa `file:`, então defina `DATABASE_URL=postgres://...`) · `AUDIO_DIR=/data/audio` · `HOST=0.0.0.0` · `PORT=3000`
· `NODE_ENV=production`. (`AUTH_REQUIRED=1` vem do `docker-compose.yml` e do `fly.toml`; com
`NODE_ENV=production` e sem valor ela já liga.)

O entrypoint é `scripts/iniciar-container.sh`: com as quatro `LITESTREAM_*` ele restaura o banco do
R2 se o volume estiver vazio e sobe o Node sob `litestream replicate` (§Backup); sem elas, sobe o
Node direto, como sempre.

`HOST=0.0.0.0` é obrigatório **dentro** do container: o default do app é `127.0.0.1` (decisão
de segurança para uso local) e por ele nada entraria de fora. Aqui a fronteira é a rede do
container mais o `AUTH_REQUIRED=1`, não o bind.

## Checklist antes de expor

- [ ] **HTTPS no proxy reverso.** O app não termina TLS. `AUTH_REQUIRED=1` sem HTTPS entrega o
      token em texto claro. O compose publica só em `127.0.0.1:3000` de propósito.
- [ ] **Volume montado.** Sem `babel-data:/data`, banco e áudios morrem a cada `up`.
- [x] **Migrations** — o boot aplica sozinho, antes do seed, e falha o processo se não conseguir
      (sem schema o app não serve nada). Idempotente. A `0005` deduplica `settings` antes de criar
      o índice único, então rodar por cima de um banco antigo é seguro. Ordem do boot (`server.ts`, passos em
      `server/boot/`): travas (`validar.ts`) → diário/Sentry → banco → migrations (com `statement_timeout = 0`),
      seed e backfills (`preparar.ts`) → `listen` → agendamentos diários (`jobs.ts`). Quem migra precisa de
      conexão direta ou pooler em modo sessão (5432): com o Supavisor em modo transação (6543) o boot recusa
      ("migrations exigem conexão direta ou pooler em modo sessão").
- [ ] **Backup do banco.** Com `postgres://`, `node scripts/backup.mjs` roda `pg_dump` e confere com
      `pg_restore --list`. Com `pglite:<dir>` (dev), copia o diretório e só vale com o servidor parado.
      Litestream e snapshot diário saíram do servidor (ADR 0014): NÃO há backup automático neste build
      (no Supabase, conte também com os backups gerenciados); o `pg_dump` semanal no CI é da Fase 2.
- [ ] **Tetos por plano** (`PREMIUM_*` — `PREMIUM_MONTHLY_STT_SECONDS`, `PREMIUM_DAILY_STT_SECONDS` e as
      demais do inventário em `server/lib/config.ts`; defaults em `src/core/planos.ts`. As antigas
      `PRO_*`/`ESSENCIAL_*` NÃO são mais lidas: passe o valor para a `PREMIUM_*` correspondente) coerentes com o
      que você aceita gastar. A reserva é atômica (20 requisições simultâneas contra teto 5 aceitam
      5, não 20), mas o teto é seu.
- [ ] **`/api/health` no monitor externo.** Ele reporta banco **e** boot: um passo de migração
      que falhou deixa a probe em 503 em vez de o app subir mudo.

## Prazos de sessão do banco (`statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`)

A fonte de verdade é o **papel do banco**: a migration `0004_prazos_do_papel` roda `ALTER ROLE <papel> SET …`
(30 s, 10 s, 60 s) uma vez, e toda sessão daquele papel nasce com eles, por qualquer caminho. O
`options: -c …` que o `pg.Pool` manda na abertura é cinto e suspensório: o pooler do Supabase (Supavisor,
portas 5432 e 6543) e o Hyperdrive **o ignoram** (medido em 19/10/2026). Atrás de pooler, defina
`DB_SESSION_OPTIONS=0` para não mandar o que não é honrado. `DB_*_TIMEOUT_MS` só tem efeito onde o `options`
é honrado; para mudar o prazo atrás de pooler, altere o papel (docs/runbook.md §8). Sem privilégio para
`ALTER ROLE`, a migration avisa (`NOTICE`) e segue: defina à mão.

## Executor por requisição (Node × Worker)

Todo repository importa o mesmo `db` (`server/db/db.ts`), que é um Proxy: a cada acesso ele resolve para o
**executor da requisição**, se houver, ou para a instância única do processo. No **Node** não há executor:
`db` é o `pg.Pool` (ou o PGlite) aberto no primeiro acesso, e `fecharBanco()` o encerra no desligamento. No
**Worker** não há pool global — o pool é do Hyperdrive —, e cada requisição roda dentro de
`comExecutor(await abrirClienteDoHyperdrive(env.HYPERDRIVE.connectionString), …)` (`server/db/executor.ts`,
`server/db/clientePorRequisicao.ts`): um `pg.Client` aberto no começo e fechado (`fechar()`) no fim, com os
mesmos parsers de int8/numeric, prazos e gancho de medição do Pool. Dentro do escopo, `db.*`, `emTransacao`,
`emLote` e `travar*` usam esse `Client`. Diferenças de uma conexão só: as transações da requisição entram em
fila (duas em paralelo não embaralham `BEGIN`/`COMMIT`); uma `db.transaction` de dentro de outra rejeita (use
`tx.transaction`); e uma consulta avulsa em `db` disparada em paralelo a uma transação aberta cai dentro dela.

## Jobs periódicos (Node × Worker)

Os trabalhos periódicos moram num registro só, `server/jobs/registro.ts`, e passam todos por
`executarJob` (`server/jobs/executar.ts`): confere a condição, toma a **lease** do job, roda, loga
`job_inicio` / `job_fim` (com `latencyMs` e o `resumo` numérico) / `job_pulado` / `job_falhou` e solta a lease.
No **Node**, o processo que prepara os dados agenda cada job com `setTimeout` (`server/boot/jobs.ts`): a
primeira passada alguns minutos depois do boot e as seguintes no intervalo da tabela. No **Worker**, o
`scheduled` dos Cron Triggers chama `executarJobsDoCron(controller.cron)`, que roda os jobs daquela expressão
(Task 12 liga; `triggers.crons` sai desta tabela).

| Job                        | Cron (UTC)   | Node: 1ª passada / intervalo | Condição                              | Teto por passada                    |
| -------------------------- | ------------ | ---------------------------- | ------------------------------------- | ----------------------------------- |
| `retencaoDeAudio`          | `5 3 * * *`  | 5 min / 24 h                 | `AUDIO_RETENCAO_DIAS` > 0 (padrão 90) | 50 lotes de 200 sessões             |
| `limpezaDeConvidados`      | `7 3 * * *`  | 7 min / 24 h                 | modo público (`authRequired()`)       | 20 lotes de 100 convidados          |
| `podaDoCacheDeTraducao`    | `11 3 * * *` | 11 min / 24 h                | sempre                                | 2 instruções (vencidas, excedentes) |
| `podaDasMarcasDeTeste`     | `13 3 * * *` | 13 min / 24 h                | modo público                          | 1 instrução                         |
| `podaDasJanelasDiarias`    | `17 3 * * *` | 17 min / 24 h                | modo público                          | 1 instrução por métrica             |
| `limpezaDiaria`            | `23 3 * * *` | 17 min / 24 h                | `LIMPEZA_DIARIA=1` (e fora de teste)  | 200 lotes de 500 linhas             |
| `reconciliarArmazenamento` | `19 * * * *` | 19 min / 1 h                 | `STORAGE_RECONCILE_MODE=job`          | 200 usuários                        |

A reconciliação é a única horária: ela cobre todo usuário a cada `STORAGE_RECONCILE_HOURS` (padrão 24 h), e com teto de 200 usuários por passada uma vez por dia só daria conta de 200 usuários por dia; de hora em hora são até 4.800, em passadas curtas (cada uma faz `stat`/`HEAD` por arquivo) espalhadas pelo dia. O minuto do cron repete o atraso do Node, para a ordem ser a mesma; a `limpezaDiaria` vai para `:23` no
cron para não coincidir com a poda das janelas. O snapshot diário (`BACKUP_DIARIO`) foi aposentado na
migração para o Postgres e saiu do registro: a variável é legado, e ligada só gera um aviso no boot.

**A lease.** Cada passada toma a linha `g:job:<nome>` da tabela `travas` numa instrução só, em autocommit
(`INSERT … ON CONFLICT DO UPDATE … WHERE criado_em < agora − 15 min RETURNING`). Quem não recebe a linha
de volta é `job_pulado` (outra passada está rodando: dois isolates do mesmo cron, ou dois processos Node).
No fim, a linha sai — só se ainda for desta passada. Uma passada que morreu no meio deixa a linha, que vence
em 15 min (o teto de duração de um Cron Trigger): a próxima roda normalmente. Não é uma transação aberta
durante o job (`travarGlobal`), porque um job longo seguraria uma conexão do Hyperdrive e uma transação no
Postgres por minutos. Os jobs são idempotentes de qualquer forma; a lease tira o trabalho em dobro.

**Rodar um job à mão.** No Node, com o mesmo `.env` do servidor: `npm run job` lista os jobs (com cron e se a
condição vale) e `npm run job -- <nome>` roda um (sai 0 em `ok`/`pulado`, 1 em `falhou`). No Worker (Task 12),
em `wrangler dev`: `curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=23+3+*+*+*"` dispara o
`scheduled` com aquela expressão. `POST /api/admin/armazenamento/reconciliar` continua reconciliando todo
mundo de uma vez, pelo mesmo `reconciliarVencidos` do job.

## Segundo plano, SSRF e compressão (Node × Worker)

**Trabalho depois da resposta** (envelope do Sentry, lote do Langfuse, recálculo de dificuldade depois da
rodada, poda do limitador) passa por `emSegundoPlano(p)` (`server/lib/runtime.ts`). No **Worker**, uma
promessa solta morre com o fim da requisição: dentro de `comContextoDoWorker(ctx, fn)` — que o `worker.ts`
abre em volta de cada requisição (Task 12) — a promessa vai para `ctx.waitUntil`; o Langfuse lá não tem
`setInterval` e descarrega a cada envio, também pelo `waitUntil`. No **Node** só não espera, e o relógio do
Langfuse segue igual. Nos dois, falha vira o log `segundo_plano_falhou`, nunca rejeição solta.
**SSRF:** todo `fetch` para destino escolhido pelo usuário passa por `fetchSeguro` (`server/ai/ssrf.ts`), que
nunca segue redirect (quem segue, a importação de página, confere cada salto). No Node o IP é conferido no
`lookup` do socket (`despachanteSeguro`, `node:dns` + `undici`, carregados no primeiro uso). No Worker não
há nenhum dos dois: o nome é resolvido por DNS-over-HTTPS (`cloudflare-dns.com`, A e AAAA) imediatamente
antes de conectar, com a mesma lista de bloqueio e o mesmo `DestinoBloqueado`. **Janela residual no Worker:**
o `fetch` resolve o nome de novo pelo resolvedor da Cloudflare, e um domínio com TTL 0 pode trocar a
resposta entre as duas consultas — não há `lookup` de socket para fechá-la como no Node. Ela fica pequena
(conferência imediatamente antes de cada conexão e de cada salto) e o que está do outro lado é a rede
pública da Cloudflare, sem rede privada nem porta interna do servidor para alcançar. Em `fetchSeguro`, no
Node, IP literal, esquema e `localhost`/`*.localhost` são recusados antes de conectar (o `lookup` do socket
só confere nome). **Isentos de `fetchSeguro`** (destino fixo do operador, nunca escolhido pelo usuário):
provedores do registro e Ollama local em `server/ai/llmClient.ts` (endereço vem de `ops/ia-provedores*.json`
ou do ambiente; o Ollama local é justamente loopback), Asaas (`server/lib/asaas.ts`), Supabase Admin
(`server/lib/aal.ts`, `server/routes/me.ts`), Openverse (`server/routes/images.ts`, host fixo), Sentry
(DSN do ambiente) e Langfuse (`LANGFUSE_BASE_URL`). Para eles, o que ainda precisa de `waitUntil` passa por
`emSegundoPlano`. **Compressão:** o
middleware `compression` é montado só no Node; no Worker quem comprime é a borda.

## O que fica desativado por design

No modo público, uma capacidade local responde **403 mesmo com token válido** — ela
executa coisas no servidor que só fazem sentido no self-host:

- `/api/audio/*` — captura WASAPI loopback (Windows).

`POST /api/import/youtube` (que rodava `yt-dlp` como subprocesso) foi **aposentada na Task 10 da Fase 2**:
responde `410 { code: "rota_removida" }` em qualquer modo, e `YTDLP_PATH` não é mais lida.

Sem token elas devolvem **401**, não 403: o `authMiddleware` roda antes do guard. Os dois
códigos significam "indisponível aqui" — o 403 é o que você vê depois de autenticar.

Não é limitação da imagem; é `server.ts` decidindo pela flag.

## Escalar

**Réplicas na MESMA máquina, mesmo volume: funciona.** Medido: 2 processos escrevendo
concorrentemente → 0% de falha (era 50% antes do WAL). Medição histórica, em SQLite: com PGlite o boot recusa
`REPLICAS>1`; com `postgres://` as réplicas são o caminho normal (o cluster foi aposentado).

**Réplicas em HOSTS distintos: ainda não.** Dois motivos:

1. O PGlite aceita um processo por diretório (o boot recusa `REPLICAS>1`, e um segundo
   processo no mesmo diretório é recusado pela trava `<dir>/.babel-lock`; a de um pid morto é sobrescrita). Multi-host
   exige o **Postgres** de produção (`postgres://`), que o servidor já fala desde a Fase 1.
2. `AUDIO_DIR` num volume compartilhado resolve o áudio entre réplicas do mesmo storage;
   hosts sem storage comum exigem **object store** (S3/R2).

O rate-limit **já** é compartilhado entre réplicas (contador no banco, não no heap) e chaveado
por tenant, então esse não é mais um bloqueio.

## Migrar os dados do SQLite para o Postgres

Com o servidor antigo **parado** (a leitura da origem não é um snapshot), e `DATABASE_URL` apontando o destino:

```bash
npx tsx scripts/migracao/sqlite-para-postgres.ts --origem file:./data/babel.db
```

Copia em lotes de 500 com os triggers desligados (`DISABLE TRIGGER USER`) numa só transação e confere a paridade
por checksum sha256 de cada tabela (`scripts/migracao/paridade.ts`). A tabela `flags` da origem vence a do destino.
Sai com código 1 se qualquer tabela divergir. Para repetir sobre um destino não vazio, use `--continuar`.

Ainda pendentes para as próximas fases: `ENV DATABASE_URL=file:` do `Dockerfile`, `iniciar-container.sh`,
`litestream.yml`, `fly.toml` e os jobs de CI `restauracao-litestream` e `imagem-construir`.

## Tamanho da imagem — 847 MB (medido)

A imagem saiu de **4,08 GB** para **847 MB** com duas mudanças, ambas verificadas subindo o container:

1. **Não fazer `chown -R` em `/app`.** O chown recursivo reescreve cada arquivo, e o Docker grava
   a árvore inteira de novo numa camada nova — sozinho, isso custava ~1,3 GB. O app só LÊ de `/app`;
   só `/data` precisa pertencer ao usuário `node`.
2. **Podar as dependências de CLIENTE do runtime.** O Vite já as embutiu em `dist/` no estágio de
   build e o servidor nunca as carrega. Medido dentro da imagem: `onnxruntime-node` 513 MB,
   `@ricky0123` (VAD) 138 MB, `onnxruntime-web` 130 MB, `tesseract.js-core` 44 MB, `lucide-react`
   44 MB, `country-flag-icons` 22 MB.

O servidor exige 14 pacotes em runtime, e todos foram verificados DENTRO da imagem podada
(`require.resolve` dos 13 estáticos + `import()` do `pdfjs-dist`):

```
@google/genai  @libsql/client  @mozilla/readability  dotenv  drizzle-orm  express
express-rate-limit  helmet  jose  jsdom  jszip  mammoth  zod  +  pdfjs-dist (dinâmico)
```

Se você adicionar uma dependência de servidor nova, confira se ela não cai na lista de poda do
Dockerfile — o sintoma seria `Cannot find module` no boot, que o healthcheck pega na hora.

## Verificar a imagem

```bash
docker compose --env-file .env.docker build
docker compose --env-file .env.docker up -d
curl -fsS localhost:3000/api/health          # {"status":"ok","db":"up","boot":"ok",...}
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/sessions   # 401 = auth ativa
docker compose logs app | tail -20
```

O log **não** deve conter o aviso `AUTH_REQUIRED desligada`. Se contiver, o modo público
não subiu e todas as rotas estão tratando qualquer request como o dono local.

Verificado nesta máquina, com volume zerado (`down -v`): a imagem constrói, o container fica
`healthy`, `/api/health` responde `{"status":"ok","db":"up","boot":"ok"}`, `/api/sessions` sem
token responde 401, a SPA é servida, e o log não tem nenhum erro.

## Backup automatizado

`npm run backup` fecha o achado **F5-01** da auditoria: o procedimento de restore já era correto e
estava provado, mas o backup em si não acontecia — o mais recente tinha 6,5 dias, com 822 linhas e
688 arquivos de mídia sem cópia nenhuma.

```bash
npm run backup                     # banco + mídia, verificado, guardando 7 cópias
npm run backup -- --manter=14      # quantas cópias guardar
npm run backup -- --sem-midia      # só o banco (use se a mídia já vai para object storage)
npm run backup -- --destino=/backup
pg_restore --list backups/<pasta>/babel.dump                                  # confere um dump (postgres://)
```

Dentro da imagem o script também existe: `node scripts/backup.mjs --sem-midia --destino=/data/backups`.

**O que ele faz que um `cp` não faz:**

1. **`pg_dump`, não cópia de arquivo.** Com `postgres://` o próprio Postgres entrega um instantâneo
   consistente; com `pglite:<dir>` a cópia do diretório só é consistente com o servidor parado.
2. **Verifica antes de dar por feito** — com `postgres://` lista o `babel.dump` com `pg_restore --list`;
   com `pglite:` exige que o diretório `pg` copiado tenha conteúdo. Sai com código != 0 se algo não fechar, que é o que faz um agendador
   avisar.
3. **Inclui a mídia.** `data/audio` pesa 33× o banco; um backup só do banco restaura ponteiros para
   arquivos que não existem mais.

### Backup em produção (Fase 5): Litestream + snapshot diário, os dois no R2

1. **Litestream, contínuo.** Com `LITESTREAM_BUCKET`, `LITESTREAM_ENDPOINT`,
   `LITESTREAM_ACCESS_KEY_ID` e `LITESTREAM_SECRET_ACCESS_KEY`, o entrypoint sobe o Node como filho
   do `litestream replicate` (config em `litestream.yml`, versão e sha256 fixados no `Dockerfile`):
   cada escrita chega ao R2 em ~10 s (`sync-interval`). Num volume vazio, o boot restaura sozinho
   (`-if-db-not-exists -if-replica-exists`). O CI prova isso a cada push (job `restauracao-litestream`).
2. **Snapshot diário, independente** (aposentado na migração para o Postgres; `BACKUP_DIARIO` é legado, ver "Jobs periódicos"). `BACKUP_DIARIO=1` fazia o processo primário rodar, às
   `BACKUP_HORA_UTC`, `VACUUM INTO` + `integrity_check` + gzip e enviar
   `backups/diario/AAAA-MM-DD.db.gz` ao `BACKUP_S3_BUCKET` (ou `S3_BUCKET`). Ele existe porque o
   Litestream copia o ERRO também: um `DELETE` sem `WHERE` chega à réplica em um segundo, e a foto de
   ontem não muda. Dentro do processo, e não num cron externo, porque o volume do Fly monta numa
   máquina só (o porquê completo em `server/operacao/snapshot.ts`).
3. **Alarme.** Depois de cada snapshot enviado E conferido, o servidor chama
   `BACKUP_HEARTBEAT_URL` (heartbeat do UptimeRobot, que avisa quando a chamada não vem em 25 h).
   A falha vira `log('error', { event: 'backup_diario_falhou' })`, que chega ao Sentry.

Restaurar (os dois caminhos): [`docs/runbook.md`](runbook.md), "Restaurar o banco".

### Agendar fora do Fly (self-host)

No host, com `cron` (diário às 3h, log em arquivo):

```cron
0 3 * * * cd /caminho/do/app && /usr/bin/node scripts/backup.mjs >> /var/log/babel-backup.log 2>&1
```

Dentro do container, com um sidecar no `docker-compose.yml` (mesma imagem do `app`; o `entrypoint`
troca o servidor pelo laço de backup):

```yaml
backup:
  build: .
  entrypoint:
    ['sh', '-c', 'while true; do node scripts/backup.mjs --destino=/backup; sleep 86400; done']
  volumes: [babel-data:/data, ./backups:/backup]
  depends_on: [app]
```

**Sem monitorar o código de saída, isto não é backup — é uma pasta.** Em produção quem fecha o
ciclo é o heartbeat acima; aqui, alerte quando `scripts/backup.mjs` sair diferente de zero.

## Mídia em object storage

A mídia é 33× o banco (176,9 MB vs 5,3 MB por usuário; ~173 GB projetados para 1.000). O ADR 001
decidiu object storage; `server/lib/armazenamento.ts` é o único ponto que precisa saber disso.

```bash
S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com
S3_BUCKET=babel-midia
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_REGION=auto
```

As quatro primeiras precisam estar presentes. **Configuração pela metade cai para filesystem** em
vez de falhar no primeiro upload em produção.

Compatível com qualquer S3 (R2, S3, MinIO). A assinatura é SigV4 própria, sem SDK — o Dockerfile
poda dependências de cliente e um SDK de 20 MB no runtime iria contra isso.

**Não testado contra bucket real** — os testes cobrem a assinatura, o contrato e os códigos de
erro contra um transporte falso. A primeira subida com credenciais de verdade precisa ser
verificada à mão.

### Binding R2 × S3 × disco (Fase 2)

A escolha é uma só (`armazenamentoDoAmbiente`): **binding R2** (o `R2Bucket` do Worker, ligado pelo
ponto de entrada com `ligarBucketDoR2`, `server/lib/armazenamentoR2.ts`) → **S3** (as quatro `S3_*`) →
**disco** (`AUDIO_DIR`). No Worker não há disco: o upload de `POST /api/sessions/:id/audio` vai do
request para o bucket em stream (`receberCorpo(...).paraStream()` + `gravarDeStream`), em multipart de
5 MiB por parte com `abort` em qualquer erro; a cota é reservada antes e devolvida em falha, e o corpo
`chunked` reserva o teto (120 MB) e devolve a diferença no fim. No Node nada muda (temporário em
`AUDIO_DIR/.recebendo` + `rename`, ou PUT em stream no S3). O S3 também aceita stream, em multipart
assinado parte a parte (cada parte de 5 MiB tem o seu sha256; nada de `UNSIGNED-PAYLOAD`). **Limite
de corpo da zona:** no Worker o request passa antes pelo limite do plano da zona da Cloudflare (100 MB
no Free/Pro), abaixo dos 120 MB do app — áudio entre 100 e 120 MB é recusado pela borda (413 da
Cloudflare) antes de chegar à rota. Os limites do app ficam como estão; subir o plano ou baixar o teto
é decisão de produto. A folga do volume (`statfs`) só vale com disco, e o teto do R2 abaixo embrulha o
binding do mesmo jeito que o S3 (HEAD conta classe B).

### Teto do R2

A Cloudflare **não bloqueia** o uso do R2 quando o nível gratuito acaba (10 GB guardados, 1 milhão de
operações de classe A e 10 milhões de classe B por mês): ela cobra e avisa depois. O app trava do
lado dele, só quando o armazenamento é o R2 — binding ou S3 (`server/lib/tetoDoR2.ts`,
`openspec/changes/r2-teto-de-uso`):

| Variável            | Padrão (90 % do grátis) | O que acontece no teto                                            |
| ------------------- | ----------------------- | ----------------------------------------------------------------- |
| `R2_TETO_MB`        | `9216`                  | upload novo recebe `507` neutro; a retenção continua apagando     |
| `R2_TETO_OPS_A_MES` | `900000`                | gravar (PUT) recusa e a rota responde `503`; remover sempre passa |
| `R2_TETO_OPS_B_MES` | `9000000`               | ler o áudio (GET/HEAD) responde `503`                             |

- O total guardado é a soma dos contadores de cota (`usage_counters`, `storage_bytes`); as
  operações contam em `usage_counters` com `user_id = '__r2__'`, `r2_ops_a`/`r2_ops_b`, janela
  `AAAA-MM` em UTC.
- A 80 % de qualquer teto sai `r2_teto_alerta_80` (uma vez por processo e janela; vai aos destinos
  externos de alerta) e o gauge `r2_uso_fracao{recurso}` no `/metrics`. Cada recusa loga
  `r2_teto_recusa`.
- Exclusão de conta, apagar sessão, retenção e reconciliação usam a via sem teto (`semTeto`): contam,
  mas nunca são recusadas.
- **Reverter ou ajustar** é só variável: `ilimitado` desliga o teto, `0` fecha tudo (kill switch), um
  número muda o teto. `R2_TETO_MB` é relido a cada reserva; os dois tetos de operações são lidos no
  boot e só mudam com reinício. Valor inválido aborta o boot.
- **A reconciliação não tem teto de B.** Ela usa a via `semTeto` (um HEAD por arquivo de cada usuário
  varrido): conta no `r2_ops_b`, mas nunca é recusada. Um cron de `POST /api/admin/armazenamento/reconciliar`
  frequente consome classe B da conta inteira; espace-o (diário basta).
- **Passo do ambiente (painel da Cloudflare, não é código):** criar um _Budget Alert_ de US$ 1 para o
  R2 na área de cobrança da conta (o caminho exato no painel pode mudar; confira ao criar). É a rede de baixo se o contador do app divergir
  do uso real (upload fora do app, outro bucket na mesma conta, readiness do `/api/ready`, que não
  conta).

## Mais de uma instancia (`REPLICAS`)

Com `pglite:` o boot recusa `REPLICAS>1`; com `postgres://` o banco deixa de ser o limite (o áudio segue valendo, abaixo).

Duas maquinas atras de um balanceador nao sao dois processos na mesma maquina, e a diferenca
importa: o audio gravado por uma **nao existe no disco da outra**. O mesmo pedido responde 200 ou
404 conforme quem atendeu — medido, com a mensagem "arquivo ausente".

O servidor nao tem como descobrir quantas instancias existem, entao quem opera declara e o boot
verifica:

```bash
REPLICAS=2                      # instancias independentes (nao processos)
# e uma das duas coisas abaixo:
#  a) as quatro S3_* da secao acima, ou
#  b) ARMAZENAMENTO_COMPARTILHADO=1   # as replicas montam o MESMO volume
```

Com `REPLICAS>1` e nenhuma das duas, **o boot recusa subir**, com a mensagem dizendo o porque.
E de proposito: servir dado que some conforme o balanceador e pior que nao servir.

O que mais atravessa as instancias, e ja resolvido:

- **A chave dos segredos** (`secret.key`) vive em `DATA_DIR` (ou no diretorio do banco), nao no
  `cwd` do processo. Em producao, defina `SECRET_KEY` no ambiente — e obrigatorio la, e e o unico
  jeito de duas maquinas com discos separados lerem as mesmas credenciais cifradas.
- **O estado do boot** e uma linha em `boot_falhas`, no banco. Antes ficava na memoria do processo
  e `/api/health` alternava entre `ok` e `degraded` conforme a replica sorteada.
- **A reconciliacao de armazenamento** reivindica a janela antes de varrer, entao duas requisicoes
  simultaneas nao varrem duas vezes. Em deploy grande, prefira tirar a varredura do caminho de
  quem usa o app:

```bash
STORAGE_RECONCILE_MODE=job
# o job `reconciliarArmazenamento` do registro roda de hora em hora (ver "Jobs periódicos");
# para todo mundo de uma vez, com um token de admin:
#   curl -X POST https://<host>/api/admin/armazenamento/reconciliar
```

## Modo cluster (aposentado)

**Removido na Task 10 da Fase 2 (migração para o Cloudflare).** `CLUSTER_WORKERS` não é mais lida e
`node:cluster` não existe mais no servidor: o PGlite é de processo único e, com Postgres, escala-se
por **instâncias** (`REPLICAS`, veja acima). Consequências: a captura de loopback do servidor
(`/api/audio/loopback/*`) não tem mais a recusa por cluster, e o diário de erros volta a ter um arquivo
por dia (a leitura em `GET /api/admin/erros` continua juntando também os arquivos por PID antigos).
A medição que motivou o modo (F6-01: vazão plana, saturação de processo único) segue válida como
argumento para subir mais instâncias.

## Escalar

**Réplicas na MESMA máquina, mesmo volume: funciona.** Medido: 2 processos escrevendo
concorrentemente → 0% de falha (era 50% antes do WAL). Medição histórica, em SQLite: com PGlite o boot recusa
`REPLICAS>1`; com `postgres://` as réplicas são o caminho normal (o cluster foi aposentado).

**Réplicas em HOSTS distintos: ainda não.** Dois motivos:

1. O PGlite aceita um processo por diretório (o boot recusa `REPLICAS>1`, e um segundo
   processo no mesmo diretório é recusado pela trava `<dir>/.babel-lock`; a de um pid morto é sobrescrita). Multi-host
   exige o **Postgres** de produção (`postgres://`), que o servidor já fala desde a Fase 1.
2. `AUDIO_DIR` num volume compartilhado resolve o áudio entre réplicas do mesmo storage;
   hosts sem storage comum exigem **object store** (S3/R2).

O rate-limit **já** é compartilhado entre réplicas (contador no banco, não no heap) e chaveado
por tenant, então esse não é mais um bloqueio.

## Migrar os dados do SQLite para o Postgres

Com o servidor antigo **parado** (a leitura da origem não é um snapshot), e `DATABASE_URL` apontando o destino:

```bash
npx tsx scripts/migracao/sqlite-para-postgres.ts --origem file:./data/babel.db
```

Copia em lotes de 500 com os triggers desligados (`DISABLE TRIGGER USER`) numa só transação e confere a paridade
por checksum sha256 de cada tabela (`scripts/migracao/paridade.ts`). A tabela `flags` da origem vence a do destino.
Sai com código 1 se qualquer tabela divergir. Para repetir sobre um destino não vazio, use `--continuar`.

Ainda pendentes para as próximas fases: `ENV DATABASE_URL=file:` do `Dockerfile`, `iniciar-container.sh`,
`litestream.yml`, `fly.toml` e os jobs de CI `restauracao-litestream` e `imagem-construir`.

## Tamanho da imagem — 847 MB (medido)

A imagem saiu de **4,08 GB** para **847 MB** com duas mudanças, ambas verificadas subindo o container:

1. **Não fazer `chown -R` em `/app`.** O chown recursivo reescreve cada arquivo, e o Docker grava
   a árvore inteira de novo numa camada nova — sozinho, isso custava ~1,3 GB. O app só LÊ de `/app`;
   só `/data` precisa pertencer ao usuário `node`.
2. **Podar as dependências de CLIENTE do runtime.** O Vite já as embutiu em `dist/` no estágio de
   build e o servidor nunca as carrega. Medido dentro da imagem: `onnxruntime-node` 513 MB,
   `@ricky0123` (VAD) 138 MB, `onnxruntime-web` 130 MB, `tesseract.js-core` 44 MB, `lucide-react`
   44 MB, `country-flag-icons` 22 MB.

O servidor exige 14 pacotes em runtime, e todos foram verificados DENTRO da imagem podada
(`require.resolve` dos 13 estáticos + `import()` do `pdfjs-dist`):

```
@google/genai  @libsql/client  @mozilla/readability  dotenv  drizzle-orm  express
express-rate-limit  helmet  jose  jsdom  jszip  mammoth  zod  +  pdfjs-dist (dinâmico)
```

Se você adicionar uma dependência de servidor nova, confira se ela não cai na lista de poda do
Dockerfile — o sintoma seria `Cannot find module` no boot, que o healthcheck pega na hora.

## Verificar a imagem

```bash
docker compose --env-file .env.docker build
docker compose --env-file .env.docker up -d
curl -fsS localhost:3000/api/health          # {"status":"ok","db":"up","boot":"ok",...}
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/sessions   # 401 = auth ativa
docker compose logs app | tail -20
```

O log **não** deve conter o aviso `AUTH_REQUIRED desligada`. Se contiver, o modo público
não subiu e todas as rotas estão tratando qualquer request como o dono local.

Verificado nesta máquina, com volume zerado (`down -v`): a imagem constrói, o container fica
`healthy`, `/api/health` responde `{"status":"ok","db":"up","boot":"ok"}`, `/api/sessions` sem
token responde 401, a SPA é servida, e o log não tem nenhum erro.

## Backup automatizado

`npm run backup` fecha o achado **F5-01** da auditoria: o procedimento de restore já era correto e
estava provado, mas o backup em si não acontecia — o mais recente tinha 6,5 dias, com 822 linhas e
688 arquivos de mídia sem cópia nenhuma.

```bash
npm run backup                     # banco + mídia, verificado, guardando 7 cópias
npm run backup -- --manter=14      # quantas cópias guardar
npm run backup -- --sem-midia      # só o banco (use se a mídia já vai para object storage)
npm run backup -- --destino=/backup
pg_restore --list backups/<pasta>/babel.dump                                  # confere um dump (postgres://)
```

Dentro da imagem o script também existe: `node scripts/backup.mjs --sem-midia --destino=/data/backups`.

**O que ele faz que um `cp` não faz:**

1. **`pg_dump`, não cópia de arquivo.** Com `postgres://` o próprio Postgres entrega um instantâneo
   consistente; com `pglite:<dir>` a cópia do diretório só é consistente com o servidor parado.
2. **Verifica antes de dar por feito** — com `postgres://` lista o `babel.dump` com `pg_restore --list`;
   com `pglite:` exige que o diretório `pg` copiado tenha conteúdo. Sai com código != 0 se algo não fechar, que é o que faz um agendador
   avisar.
3. **Inclui a mídia.** `data/audio` pesa 33× o banco; um backup só do banco restaura ponteiros para
   arquivos que não existem mais.

### Backup em produção (Fase 5): Litestream + snapshot diário, os dois no R2

1. **Litestream, contínuo.** Com `LITESTREAM_BUCKET`, `LITESTREAM_ENDPOINT`,
   `LITESTREAM_ACCESS_KEY_ID` e `LITESTREAM_SECRET_ACCESS_KEY`, o entrypoint sobe o Node como filho
   do `litestream replicate` (config em `litestream.yml`, versão e sha256 fixados no `Dockerfile`):
   cada escrita chega ao R2 em ~10 s (`sync-interval`). Num volume vazio, o boot restaura sozinho
   (`-if-db-not-exists -if-replica-exists`). O CI prova isso a cada push (job `restauracao-litestream`).
2. **Snapshot diário, independente** (aposentado na migração para o Postgres; `BACKUP_DIARIO` é legado, ver "Jobs periódicos"). `BACKUP_DIARIO=1` fazia o processo primário rodar, às
   `BACKUP_HORA_UTC`, `VACUUM INTO` + `integrity_check` + gzip e enviar
   `backups/diario/AAAA-MM-DD.db.gz` ao `BACKUP_S3_BUCKET` (ou `S3_BUCKET`). Ele existe porque o
   Litestream copia o ERRO também: um `DELETE` sem `WHERE` chega à réplica em um segundo, e a foto de
   ontem não muda. Dentro do processo, e não num cron externo, porque o volume do Fly monta numa
   máquina só (o porquê completo em `server/operacao/snapshot.ts`).
3. **Alarme.** Depois de cada snapshot enviado E conferido, o servidor chama
   `BACKUP_HEARTBEAT_URL` (heartbeat do UptimeRobot, que avisa quando a chamada não vem em 25 h).
   A falha vira `log('error', { event: 'backup_diario_falhou' })`, que chega ao Sentry.

Restaurar (os dois caminhos): [`docs/runbook.md`](runbook.md), "Restaurar o banco".

### Agendar fora do Fly (self-host)

No host, com `cron` (diário às 3h, log em arquivo):

```cron
0 3 * * * cd /caminho/do/app && /usr/bin/node scripts/backup.mjs >> /var/log/babel-backup.log 2>&1
```

Dentro do container, com um sidecar no `docker-compose.yml` (mesma imagem do `app`; o `entrypoint`
troca o servidor pelo laço de backup):

```yaml
backup:
  build: .
  entrypoint:
    ['sh', '-c', 'while true; do node scripts/backup.mjs --destino=/backup; sleep 86400; done']
  volumes: [babel-data:/data, ./backups:/backup]
  depends_on: [app]
```

**Sem monitorar o código de saída, isto não é backup — é uma pasta.** Em produção quem fecha o
ciclo é o heartbeat acima; aqui, alerte quando `scripts/backup.mjs` sair diferente de zero.

## Mídia em object storage

A mídia é 33× o banco (176,9 MB vs 5,3 MB por usuário; ~173 GB projetados para 1.000). O ADR 001
decidiu object storage; `server/lib/armazenamento.ts` é o único ponto que precisa saber disso.

```bash
S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com
S3_BUCKET=babel-midia
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_REGION=auto
```

As quatro primeiras precisam estar presentes. **Configuração pela metade cai para filesystem** em
vez de falhar no primeiro upload em produção.

Compatível com qualquer S3 (R2, S3, MinIO). A assinatura é SigV4 própria, sem SDK — o Dockerfile
poda dependências de cliente e um SDK de 20 MB no runtime iria contra isso.

**Não testado contra bucket real** — os testes cobrem a assinatura, o contrato e os códigos de
erro contra um transporte falso. A primeira subida com credenciais de verdade precisa ser
verificada à mão.

### Binding R2 × S3 × disco (Fase 2)

A escolha é uma só (`armazenamentoDoAmbiente`): **binding R2** (o `R2Bucket` do Worker, ligado pelo
ponto de entrada com `ligarBucketDoR2`, `server/lib/armazenamentoR2.ts`) → **S3** (as quatro `S3_*`) →
**disco** (`AUDIO_DIR`). No Worker não há disco: o upload de `POST /api/sessions/:id/audio` vai do
request para o bucket em stream (`receberCorpo(...).paraStream()` + `gravarDeStream`), em multipart de
5 MiB por parte com `abort` em qualquer erro; a cota é reservada antes e devolvida em falha, e o corpo
`chunked` reserva o teto (120 MB) e devolve a diferença no fim. No Node nada muda (temporário em
`AUDIO_DIR/.recebendo` + `rename`, ou PUT em stream no S3). O S3 também aceita stream, em multipart
assinado parte a parte (cada parte de 5 MiB tem o seu sha256; nada de `UNSIGNED-PAYLOAD`). **Limite
de corpo da zona:** no Worker o request passa antes pelo limite do plano da zona da Cloudflare (100 MB
no Free/Pro), abaixo dos 120 MB do app — áudio entre 100 e 120 MB é recusado pela borda (413 da
Cloudflare) antes de chegar à rota. Os limites do app ficam como estão; subir o plano ou baixar o teto
é decisão de produto. A folga do volume (`statfs`) só vale com disco, e o teto do R2 abaixo embrulha o
binding do mesmo jeito que o S3 (HEAD conta classe B).

### Teto do R2

A Cloudflare **não bloqueia** o uso do R2 quando o nível gratuito acaba (10 GB guardados, 1 milhão de
operações de classe A e 10 milhões de classe B por mês): ela cobra e avisa depois. O app trava do
lado dele, só quando o armazenamento é o R2 — binding ou S3 (`server/lib/tetoDoR2.ts`,
`openspec/changes/r2-teto-de-uso`):

| Variável            | Padrão (90 % do grátis) | O que acontece no teto                                            |
| ------------------- | ----------------------- | ----------------------------------------------------------------- |
| `R2_TETO_MB`        | `9216`                  | upload novo recebe `507` neutro; a retenção continua apagando     |
| `R2_TETO_OPS_A_MES` | `900000`                | gravar (PUT) recusa e a rota responde `503`; remover sempre passa |
| `R2_TETO_OPS_B_MES` | `9000000`               | ler o áudio (GET/HEAD) responde `503`                             |

- O total guardado é a soma dos contadores de cota (`usage_counters`, `storage_bytes`); as
  operações contam em `usage_counters` com `user_id = '__r2__'`, `r2_ops_a`/`r2_ops_b`, janela
  `AAAA-MM` em UTC.
- A 80 % de qualquer teto sai `r2_teto_alerta_80` (uma vez por processo e janela; vai aos destinos
  externos de alerta) e o gauge `r2_uso_fracao{recurso}` no `/metrics`. Cada recusa loga
  `r2_teto_recusa`.
- Exclusão de conta, apagar sessão, retenção e reconciliação usam a via sem teto (`semTeto`): contam,
  mas nunca são recusadas.
- **Reverter ou ajustar** é só variável: `ilimitado` desliga o teto, `0` fecha tudo (kill switch), um
  número muda o teto. `R2_TETO_MB` é relido a cada reserva; os dois tetos de operações são lidos no
  boot e só mudam com reinício. Valor inválido aborta o boot.
- **A reconciliação não tem teto de B.** Ela usa a via `semTeto` (um HEAD por arquivo de cada usuário
  varrido): conta no `r2_ops_b`, mas nunca é recusada. Um cron de `POST /api/admin/armazenamento/reconciliar`
  frequente consome classe B da conta inteira; espace-o (diário basta).
- **Passo do ambiente (painel da Cloudflare, não é código):** criar um _Budget Alert_ de US$ 1 para o
  R2 na área de cobrança da conta (o caminho exato no painel pode mudar; confira ao criar). É a rede de baixo se o contador do app divergir
  do uso real (upload fora do app, outro bucket na mesma conta, readiness do `/api/ready`, que não
  conta).

## Mais de uma instancia (`REPLICAS`)

Com `pglite:` o boot recusa `REPLICAS>1`; com `postgres://` o banco deixa de ser o limite (o áudio segue valendo, abaixo).

Duas maquinas atras de um balanceador nao sao dois processos na mesma maquina, e a diferenca
importa: o audio gravado por uma **nao existe no disco da outra**. O mesmo pedido responde 200 ou
404 conforme quem atendeu — medido, com a mensagem "arquivo ausente".

O servidor nao tem como descobrir quantas instancias existem, entao quem opera declara e o boot
verifica:

```bash
REPLICAS=2                      # instancias independentes (nao processos)
# e uma das duas coisas abaixo:
#  a) as quatro S3_* da secao acima, ou
#  b) ARMAZENAMENTO_COMPARTILHADO=1   # as replicas montam o MESMO volume
```

Com `REPLICAS>1` e nenhuma das duas, **o boot recusa subir**, com a mensagem dizendo o porque.
E de proposito: servir dado que some conforme o balanceador e pior que nao servir.

O que mais atravessa as instancias, e ja resolvido:

- **A chave dos segredos** (`secret.key`) vive em `DATA_DIR` (ou no diretorio do banco), nao no
  `cwd` do processo. Em producao, defina `SECRET_KEY` no ambiente — e obrigatorio la, e e o unico
  jeito de duas maquinas com discos separados lerem as mesmas credenciais cifradas.
- **O estado do boot** e uma linha em `boot_falhas`, no banco. Antes ficava na memoria do processo
  e `/api/health` alternava entre `ok` e `degraded` conforme a replica sorteada.
- **A reconciliacao de armazenamento** reivindica a janela antes de varrer, entao duas requisicoes
  simultaneas nao varrem duas vezes. Em deploy grande, prefira tirar a varredura do caminho de
  quem usa o app:

```bash
STORAGE_RECONCILE_MODE=job
# o job `reconciliarArmazenamento` do registro roda de hora em hora (ver "Jobs periódicos");
# para todo mundo de uma vez, com um token de admin:
#   curl -X POST https://<host>/api/admin/armazenamento/reconciliar
```
