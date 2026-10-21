# Deploy — modo público multi-usuário

> **Produção e self-host (ADR 0014 e 0015):** a produção do Frasy é um Worker da Cloudflare com o Postgres do
> Supabase (seções "Publicar o Worker (CI)" e "Secrets do Worker"). Este documento cobre também a imagem Docker
> (Node + Postgres por `DATABASE_URL`) para quem hospeda por conta própria. O servidor fala Postgres (PGlite em
> dev/testes, `pg` em produção).

Container genérico (Docker), sem amarra a fornecedor: roda em VPS, Railway, Render,
Coolify ou Kubernetes. Os números e limites citados aqui vêm de `docs/audit/04-scalability.md`.

**A produção do Frasy roda como Worker da Cloudflare** — `wrangler.jsonc`, `worker.ts`, o workflow
`deploy-worker.yml` e o passo a passo do dono em [`docs/LANCAMENTO.md`](LANCAMENTO.md); a decisão está no
[ADR 0015](adr/0015-cloudflare-workers-no-lugar-do-fly.md). `.env.production.example` é o modelo do self-host.
Este documento cobre a imagem em si e o `docker compose` de quem hospeda por conta própria.

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

| Variável                                       | Onde é usada                                                                                             | Se faltar                                             |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `SECRET_KEY`                                   | cifra os segredos BYOK em repouso                                                                        | **o boot ABORTA** (`server/boot/validar.ts`)          |
| `SUPABASE_URL`                                 | JWKS assimétrico (ES256) que verifica o JWT, e o `iss` exigido                                           | nenhum token valida → 401 em tudo                     |
| `SUPABASE_SERVICE_ROLE_KEY`                    | Admin API: exclusão de conta (LGPD art. 18, VI) e o 2FA exigido nas rotas sensíveis                      | exclusão não desfaz o login; o AAL2 não é cobrado     |
| `TRUST_PROXY`                                  | quantos proxies há na frente (`1` atrás de Caddy/Nginx, `2` Cloudflare → Caddy/Nginx, `false` sem proxy) | **o boot ABORTA** com `NODE_ENV=production` (GAP-004) |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | **build time** — o Vite embute na SPA                                                                    | a tela de login nunca aparece                         |

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

No Worker, prefira o formato `hkdf:` (64 hex): a chave é derivada por HKDF em microssegundos, sem o
scrypt de 90–160 ms de CPU por isolate novo. Um `hkdf:` malformado derruba o boot (não cai no scrypt).

```bash
echo "hkdf:$(openssl rand -hex 32)"
```

Trocar a `SECRET_KEY` (ou o formato dela) invalida os segredos já cifrados na tabela `secrets` e também muda a `obterChaveDeHash`: os pseudônimos do rank, dos convidados e a deduplicação do teste grátis deixam de casar com os antigos.

### Definidas na imagem

`AUDIO_DIR=/data/audio` · `HOST=0.0.0.0` · `PORT=3000` · `NODE_ENV=production`. O banco NÃO vem na imagem:
passe `DATABASE_URL=postgres://...` ao subir (o `docker-compose.yml` traz um `postgres:17`). `AUTH_REQUIRED=1` vem do
`docker-compose.yml`; com `NODE_ENV=production` e sem valor ela já liga.

O `CMD` da imagem sobe o Node direto (`node dist-server/server.cjs`); a imagem não guarda estado.

`HOST=0.0.0.0` é obrigatório **dentro** do container: o default do app é `127.0.0.1` (decisão
de segurança para uso local) e por ele nada entraria de fora. Aqui a fronteira é a rede do
container mais o `AUTH_REQUIRED=1`, não o bind.

## Checklist antes de expor

- [ ] **HTTPS no proxy reverso.** O app não termina TLS. `AUTH_REQUIRED=1` sem HTTPS entrega o
      token em texto claro. O compose publica só em `127.0.0.1:3000` de propósito.
- [ ] **Áudio.** Sem `S3_*` o áudio vai para `/data/audio`; sem o volume `babel-data:/data` ele morre a cada `up`. O banco é o Postgres externo.
- [x] **Migrations** — o boot aplica sozinho, antes do seed, e falha o processo se não conseguir
      (sem schema o app não serve nada). Idempotente. A `0005` deduplica `settings` antes de criar
      o índice único, então rodar por cima de um banco antigo é seguro. Ordem do boot (`server.ts`, passos em
      `server/boot/`): travas (`validar.ts`) → diário/Sentry → banco → migrations (com `statement_timeout = 0`),
      seed e backfills (`preparar.ts`) → `listen` → agendamentos diários (`jobs.ts`). Quem migra precisa de
      conexão direta ou pooler em modo sessão (5432): com o Supavisor em modo transação (6543) o boot recusa
      ("migrations exigem conexão direta ou pooler em modo sessão").
- [ ] **Backup do banco.** Com `postgres://`, `node scripts/backup.mjs` roda `pg_dump` e confere com
      `pg_restore --list`. Com `pglite:<dir>` (dev), copia o diretório e só vale com o servidor parado.
      Não há backup automático dentro do servidor (no Supabase, conte também com os backups gerenciados); o
      `pg_dump` semanal no CI está em "Backup semanal do Postgres no R2", abaixo.
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
(`worker.ts`; `triggers.crons` do `wrangler.jsonc` sai desta tabela).

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
cron para não coincidir com a poda das janelas. O snapshot diário do SQLite saiu na migração para o Postgres.

**A lease.** Cada passada toma a linha `g:job:<nome>` da tabela `travas` numa instrução só, em autocommit
(`INSERT … ON CONFLICT DO UPDATE … WHERE criado_em < agora − 15 min RETURNING`). Quem não recebe a linha
de volta é `job_pulado` (outra passada está rodando: dois isolates do mesmo cron, ou dois processos Node).
No fim, a linha sai — só se ainda for desta passada. Uma passada que morreu no meio deixa a linha, que vence
em 15 min (o teto de duração de um Cron Trigger): a próxima roda normalmente. Não é uma transação aberta
durante o job (`travarGlobal`), porque um job longo seguraria uma conexão do Hyperdrive e uma transação no
Postgres por minutos. Os jobs são idempotentes de qualquer forma; a lease tira o trabalho em dobro.

**Rodar um job à mão.** No Node, com o mesmo `.env` do servidor: `npm run job` lista os jobs (com cron e se a
condição vale) e `npm run job -- <nome>` roda um (sai 0 em `ok`/`pulado`, 1 em `falhou`). No Worker,
em `wrangler dev` (ver "Worker em desenvolvimento"): `curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=23+3+*+*+*"` dispara o
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
pública da Cloudflare, sem rede privada nem porta interna do servidor para alcançar. **Cache de DoH:** cada
isolate guarda por 60 s (até 512 hosts) só a resolução bem-sucedida e toda pública; resultado privado,
NXDOMAIN e erro nunca são guardados, e a entrada vencida consulta de novo (e recusa se agora for privada).
Isso alarga a janela para no máximo 60 s num host que era público na primeira vista — aceitável porque o
próprio resolvedor do Worker também guarda respostas, a importação só busca páginas públicas, e um
resultado privado nunca é reaproveitado. Em `fetchSeguro`, no
Node, IP literal, esquema e `localhost`/`*.localhost` são recusados antes de conectar (o `lookup` do socket
só confere nome). **Isentos de `fetchSeguro`** (destino fixo do operador, nunca escolhido pelo usuário):
provedores do registro e Ollama local em `server/ai/llmClient.ts` (endereço vem de `ops/ia-provedores*.json`
ou do ambiente; o Ollama local é justamente loopback), Asaas (`server/lib/asaas.ts`), Supabase Admin
(`server/lib/aal.ts`, `server/routes/me.ts`), Openverse (`server/routes/images.ts`, host fixo), Sentry
(DSN do ambiente) e Langfuse (`LANGFUSE_BASE_URL`). Para eles, o que ainda precisa de `waitUntil` passa por
`emSegundoPlano`. **Compressão:** o
middleware `compression` é montado só no Node; no Worker quem comprime é a borda.

## Secrets do Worker

Os secrets do Worker vão por script, nunca à mão e nunca versionados. A lista vem de `server/lib/config.ts`
(obrigatórias em produção/modo público e as `impede-servico`). `REPLICAS` e `ASAAS_SANDBOX` não são secrets:
`ASAAS_SANDBOX=1` e a `ASAAS_BASE_URL` do sandbox (`https://api-sandbox.asaas.com/v3`) estão nos `vars` do
`env.staging`; a produção declara só a `ASAAS_BASE_URL` real (`https://api.asaas.com/v3`, `vars` do topo). Sem
isso, com `ASAAS_API_KEY`, o boot aborta (`erroDeAsaasSandboxEmProducao`). O modelo, só com nomes, é
`.secrets.example.json`.

1. `cp .secrets.example.json .secrets.<ambiente>.json` (`staging` ou `production`) e preencha os valores. O `.gitignore`
   ignora `.secrets.*.json`; **nunca** faça commit dele.
2. `npx tsx scripts/cloudflare/secrets.ts <ambiente> --dry-run`: confere o arquivo (obrigatórias ausentes e
   chaves com valor vazio dão erro, com os nomes; chaves desconhecidas, aviso) sem enviar nada e sem imprimir
   valores. Quem não tem o valor tira a chave do arquivo. Sem o arquivo, lista os nomes esperados.
3. `npx tsx scripts/cloudflare/secrets.ts <ambiente>`: o mesmo, e depois `wrangler secret bulk -c wrangler.jsonc`
   (com `--env staging` no staging).

Depois de um `wrangler versions upload` que ainda não foi implantado, o comando para mexer em secrets é
`npx wrangler versions secret bulk <arquivo> -c wrangler.jsonc [--env staging]` (cria versão nova com eles; o
`secret bulk` implantaria direto).

**Recomendadas** (fora do `.secrets.example.json`, que só tem as obrigatórias e é conferido por teste; sem elas a
capacidade correspondente se declara indisponível): `ASAAS_API_KEY` (a `ASAAS_BASE_URL` é `var`), `RESEND_API_KEY`
e `EMAIL_REMETENTE`, `SENTRY_DSN`, `APP_URL`, as chaves de IA dos provedores declarados, `IA_PROVEDORES`, as
`LLM_*` e as `AI_BUDGET_*`. A lista comentada está no `.env.production.example`.

Depois do deploy, o primeiro boot de cada isolate registra a configuração (evento `configuracao`) e, se faltar
variável crítica, `/api/health` responde `degraded` com `bootErros: ['configuracao']` (os nomes ficam no log).
`npx tsx scripts/cloudflare/secrets.ts --exemplo` regenera o modelo; `tests/secrets-example.test.ts` impede que ele fique para trás.

## Worker em desenvolvimento

O app inteiro roda como Cloudflare Worker: `worker.ts` (ponto de entrada) + `wrangler.jsonc`. **Sempre com
`-c wrangler.jsonc`**: o `wrangler.toml` ao lado é o projeto Pages da edição estática (`functions/quest/*`) e
é o que o wrangler acha sozinho. Localmente nada precisa de credencial da Cloudflare: o Miniflare simula o R2
(`MIDIA`) e os assets (`dist/`, o build do Vite), e o Hyperdrive vai direto a um Postgres local.

```bash
# 1. Postgres 17 de teste, migrado (o Worker NÃO migra: confere o schema e responde 503 se faltar)
docker run --rm -d --name pg-worker -e POSTGRES_PASSWORD=teste -p 5433:5432 postgres:17
DATABASE_URL=postgres://postgres:teste@localhost:5433/postgres npm run db:migrate

# 2. segredos locais em .dev.vars (fora do git; nunca versionar)
#    SECRET_KEY=hkdf:<64 hex aleatórios>     (echo "hkdf:$(openssl rand -hex 32)")
#    SUPABASE_URL=https://<projeto>.supabase.co   (o JWKS do login; AUTH_REQUIRED=1 já vem do wrangler.jsonc)

# 3. subir (http://localhost:8787); /api/* vai ao Express, o resto aos assets (SPA)
npm run worker:dev
curl -s localhost:8787/api/health            # {"status":"ok","db":"up","banco":"postgres",…}
curl "localhost:8787/cdn-cgi/local/scheduled?cron=17+3+*+*+*"   # dispara o cron daquela expressão
docker stop pg-worker
```

**E2E contra o Worker:** `BASE_URL=http://localhost:8787 npm run test:e2e` (com os assets do `npm run build` em
`dist/`). A importação de Anki roda nos dois runtimes (o navegador lê o `.apkg` e o servidor recebe as notas em
lotes), então nenhuma suíte pula por causa dela. Ver `tests/e2e/README.md`.

O `worker:dev` e a fumaça sobem com `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false`: sem isso o wrangler carrega
o `.env` do repositório como vars, e as chaves reais de desenvolvimento entrariam no isolate. Os segredos
locais do Worker moram SÓ no `.dev.vars`.

**Sempre produção.** O `define` do `wrangler.jsonc` fixa o literal `process.env.NODE_ENV` em `"production"`
(o wrangler, sozinho, poria `"development"` no `dev`), e `vars.NODE_ENV` + `fixarModo()` no `worker.ts` põem o
mesmo valor no `process.env` do runtime, que é o que `config.ts`, o registro de IA e o Langfuse leem. Vale no
`dev`, no deploy e no staging: as travas de produção (SECRET_KEY, retenção zero da IA, sandbox do Asaas,
`/metrics` com token, Langfuse sem conteúdo) nunca ficam abertas no Worker. Por isso o `.dev.vars` local
precisa do que a produção exige (no mínimo `SECRET_KEY` e `SUPABASE_URL`).

**Travas de boot.** `validarBoot()` roda na primeira requisição do isolate (`server/boot/portaoDoWorker.ts`).
Com achado que aborta, toda `/api/*` responde `503 boot_falhou`, o log traz `boot_falhou` com o motivo, e a
conferência se repete a cada requisição até passar (um `wrangler secret put` corrige sem reciclar o isolate).
`IA_PROVEDORES_ARQUIVO` não vale no Worker (não há disco): o registro de IA vai inteiro em `IA_PROVEDORES`.

**IP do cliente.** O `worker.ts` apaga o `X-Forwarded-For` (e `X-Real-IP`/`Forwarded`) que o cliente mandou e
põe nele só o `CF-Connecting-IP` da borda; no Worker o app confia em exatamente um salto, e `TRUST_PROXY` é
ignorada (a trava "TRUST_PROXY obrigatória em produção" não vale lá). Os baldes do limitador ficam por IP real.

**Versão.** `define.__VERSAO_DO_PACOTE__` (conferido contra o `package.json` por `tests/worker/wrangler.test.ts`;
um `release` que muda a versão precisa mudar os dois) e o sha por `GIT_SHA` como var no deploy
(`--var GIT_SHA:$(git rev-parse HEAD)`). `/metrics` responde 404 no Worker.

**Staging** (Fase 4, T5): o `env.staging` do `wrangler.jsonc` é publicável. Worker `frasy-staging` em
`https://frasy-staging.guigui-cruzeiro.workers.dev` (`workers_dev: true`; a produção fica fora do workers.dev),
banco `frasy_staging` no MESMO Supabase SP da produção (o banco `postgres` da produção não é tocado), pelo
Hyperdrive `frasy-staging-sp` (mesmo perfil do `babel-sp`: verify-full com a CA supabase-2021, cache desligado,
20 conexões de origem), bucket `frasy-midia-staging` e **nenhum cron**. Bindings, `vars` e `define` não são
herdados pelos ambientes, por isso o `env.staging` repete o `define` (`tests/worker/wrangler.test.ts` confere);
o bundle do staging sai byte a byte igual ao da produção. Na ordem:

1. `set -a; source .env; set +a; node scripts/cloudflare/hyperdrive-staging.mjs` (`--dry-run` mostra o plano;
   `--sem-migrar` pula as migrações). Idempotente: cria o banco se faltar (conexão direta; sem IPv6, o pooler
   de sessão), cria o Hyperdrive se faltar (pela API, com a senha no corpo da requisição e não em argv),
   roda `npm run db:migrate` contra `frasy_staging` e imprime o bloco `hyperdrive` para o `env.staging`.
   Nunca imprime a senha.
2. Secrets do staging: `.secrets.staging.json` e `npx tsx scripts/cloudflare/secrets.ts staging` (seção
   "Secrets do Worker").
3. Deploy: `npx wrangler deploy -c wrangler.jsonc --env staging --var GIT_SHA:$(git rev-parse HEAD)` (Fase 4, T9).
   Antes, `npx wrangler deploy --dry-run -c wrangler.jsonc --env staging --outdir /tmp/x` lista os bindings
   (HYPERDRIVE, MIDIA, METRICAS, ASSETS e os `vars`) sem publicar.

O banco local vem da `localConnectionString` do `wrangler.jsonc` (porta 5433); a variável
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` tem precedência sobre ela. `wrangler dev --remote`
usaria o Hyperdrive de verdade (`babel-sp`) e exige `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`.

**Por requisição** o `worker.ts` liga o R2 (`ligarBucketDoR2(env.MIDIA)`), abre um `pg.Client` pelo Hyperdrive
dentro de `comExecutor` e um `comContextoDoWorker` cujo `waitUntil` anota cada promessa; o `Client` só fecha
depois que o corpo da resposta saiu inteiro e todo `waitUntil` assentou (`server/lib/escopoDaRequisicao.ts`).
O handler de cada rota entra nessa lista (`capturarAssincrono`): o `finally` que devolve a vaga de IA ou
estorna a cota roda DEPOIS da resposta e ainda usa o banco. E o `fechar()` do executor espera o trabalho em
voo (consultas e a fila de transações) até 20 s antes do `end()`; estourou, fecha e loga
`executor_fechou_ocupado`. Upload cancelado no meio: o `worker.ts` percebe a fonte do corpo falhar e encerra o
escopo (sem isso o `Client` ficava aberto). Promessa de uma requisição nunca é esperada por outra (os
single-flight de flags, ready, Langfuse e métricas não dividem promessa no Worker). Fora desse escopo, `db` lança no
Worker ("db fora de comExecutor") em vez de abrir um Pool por isolate. O `scheduled` faz o mesmo em volta de
`executarJobsDoCron(controller.cron)`. Os `vars`/secrets chegam em `process.env` pelo `nodejs_compat` (data
de compatibilidade 2026-09-01). Cron: as 7 expressões do registro estão em `triggers.crons` (plano Workers
Paid; no Free, com teto de 5, os diários das 03h teriam de virar uma expressão só).

**Bundle** (`npm run worker:build`): o próprio wrangler empacota (`deploy --dry-run`, os mesmos `alias` do
`dev`) em `dist-worker/`, com relatório de tamanho e de quem importa `node:fs`. Medido em 20/10/2026: 5,7 MB
bruto, 1,3 MB gzip. `tests/worker/bundle.test.ts` trava o teto de 10 MB e a lista de importadores.

**Só no Node** (no bundle do Worker viram stubs de `server/stubs/`, que lançam se forem usados):
`@electric-sql/pglite` (o banco do Worker é o `Client` da requisição), os migradores do Drizzle (migração é do
deploy), `jsdom` (só testes) e `pdfjs-dist` + `mammoth` (lidos no navegador, não entram no servidor), `loopback-capture` (`/api/audio` responde 403 no Worker) e `dotenv/config`. `prom-client` e
`undici` nem entram: são carregados por `createRequire` só no ramo do Node. A importação de link roda no Worker
(`linkedom` + `@mozilla/readability`, charset decodificado à mão; provada na fumaça contra a Wikipédia). O `iconv-lite` 0.7 (o 0.4 do Express
quebra no workerd) vem do `overrides` do `package.json`, para Node e Worker.

**Fumaça** (`npm run fumaca:worker`, ou `WRANGLER_FUMACA=1 npx vitest run tests/worker/fumaca.test.ts`): sobe
um Postgres 17 próprio (`pg-worker-fumaca`, porta 5434), migra, gera uma chave ES256 servida num JWKS local no
papel do Supabase, sobe o `wrangler dev` e confere health (`banco: 'postgres'`), JWT → `/api/me`, upload de
1 MB + leitura com `Range` (206) e um cron; também a CSP de produção, a versão, `/metrics` 404, os baldes do
limitador por `CF-Connecting-IP` (um `X-Forwarded-For` forjado é ignorado) e, num segundo `wrangler dev` com
`METRICS_ENABLED=1` sem token, o `503 boot_falhou`. Derruba tudo no fim, inclusive no Ctrl-C. `--verboso`
imprime o log do wrangler.

## Publicar o Worker (CI)

**Primeiro deploy de cada ambiente: dois runs do workflow.** `wrangler versions upload` não cria o Worker ("You
cannot upload a new version of a Worker that does not yet exist"), então o workflow detecta o Worker ausente e faz
um `wrangler deploy` comum, SEM fumaça (os secrets ainda não existem e o boot responde 503). Uma vez por ambiente:

1. Actions → deploy-worker → `ambiente`: o run cria o Worker, sobe os assets e aplica `workers_dev`,
   `preview_urls` e os crons (`wrangler deploy` exige **Analytics Engine ativado** no painel da conta, código 10089);
2. os secrets (`scripts/cloudflare/secrets.ts`, seção "Secrets do Worker"), da sua máquina;
3. um segundo run: daí em diante é o fluxo por versões, com fumaça e rollback.

Fazer o primeiro deploy à mão (`npx wrangler deploy -c wrangler.jsonc [--env staging]`) funciona, mas só numa rede
com upload decente: são ~120 MB de assets (ONNX/WASM), e de uma conexão doméstica o upload caía com `EPIPE`
(20/10/2026). O `dist/.assetsignore`, gerado no build, deixa os `.br`/`.gz` de fora (o Worker comprime na borda).

Ao apontar o Worker para um banco que já serviu um servidor Node, apague a linha `configuracao` de
`boot_falhas` (`DELETE FROM boot_falhas WHERE passo = 'configuracao'`): o Worker só espelha esse passo em memória
e uma linha antiga deixaria o `/api/health` em `degraded`.

`.github/workflows/deploy-worker.yml` (manual: Actions → deploy-worker → Run workflow; inputs `ambiente`
`staging|production` e `ref` opcional) publica por **versões** do Cloudflare, com fumaça e rollback:

1. confere os secrets/vars do Environment (reprova dizendo o NOME que falta) e se o Worker já existe
   (`wrangler deployments list`; não existindo, este run vira o primeiro deploy, acima);
2. `npm run build` com os `VITE_*` do Environment;
3. `npm run db:migrate` (o Worker nunca migra; é a conexão de sessão do Supabase, TLS `verify-full`);
4. `wrangler versions upload` (versão SEM tráfego) com `--var GIT_SHA:<sha>` e `--preview-alias fumaca`; o id da
   versão e a URL de preview saem do `WRANGLER_OUTPUT_FILE_PATH` (evento `version-upload`);
5. `scripts/cloudflare/fumaca-remota.mjs <preview> <sha>`: `/api/ready` 200 (10 tentativas, 3 s) e
   `/api/health` com `status: ok` e `versao` terminando em `+<sha7>`;
6. `wrangler versions deploy <id>@100% -y` e a mesma fumaça na URL final (`vars.URL_DO_WORKER`);
7. `wrangler triggers deploy`: versões não levam crons, rotas nem `workers_dev`/`preview_urls` ("Changes to
   triggers … must be applied with `wrangler triggers deploy`"); é este passo que aplica mudança de cron ou rota;
8. se a fumaça final falhar: `wrangler rollback` para o deploy anterior (o job fica vermelho). Falha só no
   passo 7 não desfaz a versão (ela passou na fumaça): reexecute o comando.

**Quem pode publicar qual ref.** O input `ref` é livre; o portão é o Environment: configure a política de
ramos de deploy (só `main`/tags de release) e revisores obrigatórios no `production`. O workflow publica o SHA
efetivamente baixado (`git rev-parse HEAD`), e é ele que vai em `GIT_SHA` e na fumaça.

Falha antes do passo 6 não mexe no tráfego (a versão fica no histórico, sem receber requisições). Um deploy por
ambiente de cada vez (`concurrency`). Rollback só roda se o `versions deploy` teve sucesso e a fumaça final
falhou; se o próprio deploy falhou, o tráfego não mudou e o job só avisa. **Portão antes do tráfego:** o
`wrangler.jsonc` liga `preview_urls: true` no topo (o staging herda); a produção continua fora do workers.dev
(`workers_dev: false`) para o tráfego. A URL de preview é protegida pelo `AUTH_REQUIRED=1` como qualquer outra.
Na produção, sem URL de preview o passo 5 REPROVA (no staging, só avisa). O dono pode desligar `preview_urls`; aí o
portão volta a ser só a fumaça final + rollback, e o passo 5 da produção precisa deixar de exigir a URL.

**GitHub Environments** (Settings → Environments → `staging` e `production`; nada disso mora no repositório):

| Nome                                                                                                                                                                                               | Tipo   | Conteúdo                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`                                                                                                                                                                             | secret | token com _Workers Scripts: Edit_ (cobre upload, deploy e rollback de versões)                                                                                                                                           |
| `CLOUDFLARE_ACCOUNT_ID`                                                                                                                                                                            | secret | id da conta                                                                                                                                                                                                              |
| `DATABASE_URL_MIGRACAO`                                                                                                                                                                            | secret | pooler de **sessão** do Supabase com `?sslmode=verify-full` (a 6543, em modo transação, não serve)                                                                                                                       |
| `SUPABASE_CA_PEM`                                                                                                                                                                                  | secret | CA do Supabase (PEM). O runner não tem a CA: o passo grava num arquivo `600` e usa `NODE_EXTRA_CA_CERTS`, como o `backup-pg-dump.yml` faz com o `PGSSLROOTCERT`; sem ela, `verify-full` falha (nunca cai para `require`) |
| `URL_DO_WORKER`                                                                                                                                                                                    | var    | URL final (staging: `https://frasy-staging.guigui-cruzeiro.workers.dev`; a produção entra com o domínio)                                                                                                                 |
| `VITE_PUBLIC_URL`, `VITE_ORT_WASM_URL`                                                                                                                                                             | var    | canônica/og e base do WASM (R2)                                                                                                                                                                                          |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SELF_HOST_MODELS`, `VITE_SENTRY_DSN`, `VITE_TURNSTILE_SITE_KEY`, `VITE_LOGIN_GOOGLE`, `VITE_DESENHO_NOVO_PADRAO`, `VITE_BERGAMOT_MODELOS_URL` | var    | os mesmos do build da imagem Docker; todos públicos                                                                                                                                                                      |

Os secrets do Worker (`SECRET_KEY`, chaves de IA…) continuam por `scripts/cloudflare/secrets.ts`, não pelo CI.

**Fumaça no CI.** O job `worker` do `ci.yml` roda `npm run worker:build`, `tests/worker` e a fumaça do
`wrangler dev` com o Postgres do `services:` (`FUMACA_PG_URL`, porta 5434; sem Docker no script, com o `psql` do
runner). Localmente o script continua subindo o seu Postgres em Docker quando `FUMACA_PG_URL` não existe.

**Alternativa manual** (sem CI; `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` no ambiente, build já feito):

```sh
sha=$(git rev-parse HEAD)
npx wrangler versions upload -c wrangler.jsonc --env staging --var GIT_SHA:$sha --preview-alias fumaca  # anote o Version ID
node scripts/cloudflare/fumaca-remota.mjs <url-de-preview> $sha
npx wrangler versions deploy <version-id>@100% -y -c wrangler.jsonc --env staging
node scripts/cloudflare/fumaca-remota.mjs https://frasy-staging.guigui-cruzeiro.workers.dev $sha
npx wrangler rollback -c wrangler.jsonc --env staging --message "motivo" -y   # se precisar voltar
```

Para a produção, tire o `--env staging`. O Lighthouse manual (`lighthouse.yml`) aceita o input `url` para medir
uma versão publicada (sem servidor local e sem o onboarding pré-marcado).

## Anúncios

Desligados por padrão (flag `anuncios`, `docs/flags.md`). Desenho dos rulings R32 e R35
(`docs/pesquisa/2026-10-21-rede-de-anuncios.md`): o GPT do Google não suporta COEP e só aceita CSP por nonce,
então a página de anúncios roda num **Worker próprio, `frasy-anuncios`**, numa origem que nunca é a do app, e o
app a embute por `<iframe credentialless sandbox>`.

- **Página de anúncios:** `anuncios/espaco.html` + `espaco.js` (fora de `public/`: o `dist` do app nunca a
  leva). `npm run anuncios:build` (`scripts/anuncios/build.mjs`) gera `dist-anuncios/` com `config.js` (o código
  da rede `VITE_ANUNCIOS_REDE_CONTA` e a origem do app `APP_URL`, do BUILD, nunca da query) e `_headers` (sem
  COOP/COEP/DIP, CSP larga com `'unsafe-inline'` e os hosts do Google, `frame-ancestors` só a origem de
  `APP_URL`, sem ela `'none'`). A página só roda dentro de um quadro e fora da origem do app; só carrega o GPT
  com `consentimento=1`; tira a query do endereço antes do GPT; liga `childDirectedTreatment`,
  `underAgeOfConsent`, `restrictDataProcessing`, `nonPersonalizedAds` e o SafeFrame antes de qualquer bloco;
  nunca `setPublisherProvidedId`. O premiado avisa o app por `postMessage` (`recompensa`/`fechou`/`vazio`).
- **Publicar a página** (manual, passo do dono; o `deploy-worker.yml` não a publica):
  `APP_URL=<origem do app> VITE_ANUNCIOS_REDE_CONTA=<código> npm run anuncios:build && npx wrangler deploy -c wrangler.anuncios.jsonc [--env staging]`
  (`APP_URL` = a origem do app, passada só neste comando; o `deploy-worker.yml` não a lê).
  Staging: `https://frasy-anuncios-staging.<conta>.workers.dev`. Produção: domínio personalizado
  `https://ads.<domínio>` no painel da Cloudflare, apontando para o Worker `frasy-anuncios`.
- **CSP do app:** com `ANUNCIOS_ORIGEM` (var do Worker do app) **e** a flag ligada, o Worker sobrepõe o
  `Content-Security-Policy` dos documentos (`Sec-Fetch-Dest: document` ou HTML, inclusive o 304) e põe a
  origem em `frame-src` (nada em `script-src`). A flag é lida uma vez por isolate a cada 60 s. Uma
  `ANUNCIOS_ORIGEM` igual à origem do app é recusada. Por isso o `run_worker_first` do `wrangler.jsonc` é `/*`
  menos os estáticos pesados.
- **Build do app:** `VITE_ANUNCIOS_ORIGEM` (a mesma origem) registra o provedor real
  (`src/lib/anuncios/ligar.ts`), e só com a flag ligada o módulo dele é baixado.
- **Demonstração no staging (R38):** com a var `VITE_ANUNCIOS_DEMONSTRACAO=1` no Environment `staging`
  (`gh variable set VITE_ANUNCIOS_DEMONSTRACAO --env staging --body 1`), o build do `deploy-worker.yml` liga o
  provedor de DEMONSTRAÇÃO: os 15 espaços do protótipo aparecem com "Patrocinado · exemplo", marcas inventadas,
  nada da rede e recompensa simulada, sem precisar de flag nem de `localStorage`. O perfil protegido, o plano pago,
  o teste, o headset e a tela ocupada continuam negando. O workflow só passa a var quando o ambiente é o
  `staging`; **nunca a defina no `production`**. Sem ela o Vite tira a demonstração do pacote:
  `npm run build && node scripts/anuncios/conferir-demonstracao.mjs --espera ausente` (e, com a var,
  `--espera presente`). Os premiados fora de `ESPACOS_PREMIADOS_ATIVOS` (`nuvem-30`, `tema-24h`,
  `ajuda-premiada`) só a demonstração desenha; o provedor real os esconde (R39).
- **Limitações:** Firefox não tem `credentialless` (sem anúncio, aceito). A recompensa do premiado não tem
  verificação do Google na web: o servidor credita por exibição com teto (Task 5). O Express (Node) não
  sobrepõe a CSP: anúncios só com o Worker.

### Bancada (staging, 21/10/2026)

Provado no Chromium contra o staging isolado (COOP/COEP/DIP), sem código da rede: a folha de consentimento, o
quadro `credentialless sandbox` carregando com 200, nenhuma violação de CSP nem bloqueio de COEP, e a página
postando `vazio` (com o aviso "sem código da rede" no console). O 304 de um documento já sai com a CSP
sobreposta. Sem `VITE_ANUNCIOS_REDE_CONTA` nada vai ao Google: o anúncio real aguarda a aprovação do domínio e da
rede. Relatório: `docs/auditoria/2026-10-21-anuncios-bancada.md`; e2e local:
`npx playwright test -c playwright.publico.config.ts bancada-anuncios`.

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

No Worker, a escala é a da plataforma (isolates por requisição; veja `docs/escala.md`). No self-host: com PGlite o boot
recusa `REPLICAS>1`; com `postgres://` as réplicas são o caminho normal (o cluster foi aposentado).

**Réplicas em HOSTS distintos** (self-host) exigem:

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

## Tamanho da imagem — 847 MB (medido)

A imagem saiu de **4,08 GB** para **847 MB** com duas mudanças, ambas verificadas subindo o container:

1. **Não fazer `chown -R` em `/app`.** O chown recursivo reescreve cada arquivo, e o Docker grava
   a árvore inteira de novo numa camada nova — sozinho, isso custava ~1,3 GB. O app só LÊ de `/app`;
   só `/data` precisa pertencer ao usuário `node`.
2. **Podar as dependências de CLIENTE do runtime.** O Vite já as embutiu em `dist/` no estágio de
   build e o servidor nunca as carrega. Medido dentro da imagem: `onnxruntime-node` 513 MB,
   `@ricky0123` (VAD) 138 MB, `onnxruntime-web` 130 MB, `tesseract.js-core` 44 MB, `lucide-react`
   44 MB, `country-flag-icons` 22 MB.

O servidor exige estes pacotes em runtime (lista da imagem Docker; desde a Fase 3 `jsdom`, `jszip`, `mammoth`,
`pdfjs-dist` e `@libsql/client` NÃO são mais carregados pelo servidor — Anki, PDF e DOCX são lidos no navegador
e a página web usa `linkedom`; a lista abaixo ainda não foi reconferida dentro de uma imagem nova):

```
@mozilla/readability  dotenv  drizzle-orm  express  express-rate-limit  helmet  jose
linkedom  pg  zod
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

### Backup semanal do Postgres no R2 (Fase 2, Task 13)

`.github/workflows/backup-pg-dump.yml` roda toda segunda às 06:00 UTC (e em Actions → "Backup semanal do Postgres" →
Run workflow): `pg_dump --format=custom --schema=public --schema=drizzle` do Supabase (via `scripts/backup.mjs`),
`pg_restore --list` no arquivo, envio ao bucket `frasy-backups` do R2 em **`semanal/AAAA-MM-DD.dump`** e leitura de
volta com conferência de sha256. Sem algum secret o primeiro passo reprova dizendo o nome; nunca fica verde sem backup.

- **Secrets do repositório:** `SUPABASE_DB_HOST`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_NAME`,
  `SUPABASE_CA_PEM` (CA do Supabase; o TLS é `verify-full`), `R2_S3_ENDPOINT`, `R2_S3_ACCESS_KEY_ID`,
  `R2_S3_SECRET_ACCESS_KEY` (token R2 com escrita em `frasy-backups`).
- **Host:** o direto do Supabase é só IPv6 e o runner do GitHub não tem IPv6. Use o pooler de sessão
  (`aws-1-sa-east-1.pooler.supabase.com`, porta 5432, usuário `postgres.<ref>`); o `pg_dump` funciona nele.
- **Retenção:** 8 semanas. A regra `semanal` (`semanal/` expira em 56 dias) é ligada no `frasy-backups` por
  `scripts/cloudflare/r2.mjs` (ver "R2: criar/conferir buckets").
- **Restaurar** num banco novo (credenciais por `PG*`, nunca na linha de comando):

```bash
# baixe semanal/AAAA-MM-DD.dump do R2 (dashboard ou aws s3 cp --endpoint-url $R2_S3_ENDPOINT), então:
export PGHOST=… PGPORT=5432 PGUSER=… PGPASSWORD=… PGDATABASE=postgres_novo PGSSLMODE=verify-full PGSSLROOTCERT=ca.pem
pg_restore --list AAAA-MM-DD.dump | head                 # abre e lista
pg_restore --no-owner --schema=public --schema=drizzle --dbname="$PGDATABASE" AAAA-MM-DD.dump
```

#### Exercício de restauração

Um backup que nunca foi restaurado não é backup. Dois caminhos, uma vez por mês (anote em `docs/runbook.md` §8):

- **Local, contra o banco vivo (compara contagens).** `scripts/backup/drill-restauracao.mjs` faz o `pg_dump` da origem
  (ou usa `--dump <arquivo>`), restaura num banco VAZIO e compara `count(*)` de todas as tabelas de `public` mais
  `drizzle.__drizzle_migrations`; imprime a tabela Markdown (só contagens) e sai 1 se divergir. Recusa (saída 2) destino
  que já tenha tabela em `public`. Precisa do cliente 17 (`pg_dump`, `pg_restore`, `psql`) no PATH:

```bash
docker run -d --name pg-drill -e POSTGRES_PASSWORD=teste -p 5433:5432 postgres:17
docker exec pg-drill createdb -U postgres drill
export PGSSLROOTCERT=data/supabase-ca.crt        # a URL da origem usa sslmode=verify-full
# URLs pelo AMBIENTE, não pela flag: senha no argv aparece em `ps` e no histórico do shell
export DRILL_ORIGEM="$URL_DO_STAGING" DRILL_DESTINO=postgres://postgres:teste@localhost:5433/drill
node scripts/backup/drill-restauracao.mjs
docker rm -f pg-drill                            # o banco do exercício tem dados pessoais
```

- **No GitHub, contra o dump do R2 (sem origem).** `.github/workflows/restauracao-drill.yml` (Actions →
  "Exercício de restauração do Postgres" → Run workflow; `arquivo` vazio = o `semanal/*.dump` mais recente,
  `idade_maxima_dias` = 8) baixa o dump com chaves S3 só de leitura, restaura num `postgres:17` de serviço, exige
  tabelas e `__drizzle_migrations` ≥ 1, escreve as contagens no resumo da execução e apaga o banco (`if: always()`).
  Nunca sobe o dump como artefato. **Só roda depois que o dono criar o Environment `restauracao`** com os secrets
  `R2_S3_ENDPOINT`, `R2_LEITURA_ACCESS_KEY_ID`, `R2_LEITURA_SECRET_ACCESS_KEY` (token R2 só de leitura em
  `frasy-backups`) e a variável `BACKUP_BUCKET` (`frasy-backups`).

### Backup em produção

O backup de produção é o **`pg_dump` semanal no R2** (seção anterior) mais os backups gerenciados do Supabase. A
restauração e o ensaio dela (drill) estão em [`docs/runbook.md`](runbook.md), §8, "Restaurar o banco".

### Agendar o backup no self-host

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

**Sem monitorar o código de saída, isto não é backup — é uma pasta.** Alerte quando `scripts/backup.mjs` sair diferente de zero.

## Mídia em object storage

A mídia é 33× o banco (176,9 MB vs 5,3 MB por usuário; ~173 GB projetados para 1.000). O ADR 001
decidiu object storage; `server/lib/armazenamento.ts` é o único ponto que precisa saber disso.

```bash
S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com
S3_BUCKET=frasy-midia
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

### R2: criar/conferir buckets

`scripts/cloudflare/r2.mjs` (idempotente; usa o wrangler do `node_modules` com o `CLOUDFLARE_API_TOKEN` do `.env`):

```bash
set -a; source .env; set +a
node scripts/cloudflare/r2.mjs --dry-run      # o plano, sem tocar em nada
node scripts/cloudflare/r2.mjs                # cria o que falta e imprime a tabela final
node scripts/cloudflare/r2.mjs --origens https://frasy.com.br,https://frasy-staging.guigui-cruzeiro.workers.dev,http://localhost:3100
```

| Bucket                | Para quê                                                               | Configuração                                  |
| --------------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| `frasy-midia`         | áudio e anexos da produção (binding `MIDIA` do `wrangler.jsonc`)       | —                                             |
| `frasy-midia-staging` | o mesmo, do `env.staging`                                              | —                                             |
| `frasy-backups`       | `pg_dump` semanal (`scripts/backup/enviar-ao-r2.ts`)                   | lifecycle `semanal`: `semanal/` 56 dias       |
| `frasy-modelos`       | pesos, Bergamot e runtime do ONNX (`scripts/modelos/publicar-*-r2.ts`) | CORS GET/HEAD para `--origens`, max-age 86400 |

O `cors set` sobrescreve a política inteira: passe em `--origens` TODAS as origens que buscam do bucket (padrão: as três
acima). Localização: o wrangler 4.151 só oferece `weur|eeur|apac|wnam|enam|oc` (não há América do Sul); os buckets
nasceram sem dica e a Cloudflare os pôs em **ENAM** (EUA, leste; 20/10/2026): áudio, anexos e backups ficam nos
EUA, e o `docs/lgpd/operadores.md` lista a Cloudflare R2 (EUA) como operador por isso. Conferir:

```bash
npx wrangler r2 bucket list
npx wrangler r2 bucket lifecycle list frasy-backups
npx wrangler r2 bucket cors list frasy-modelos
```

**Runtime do ONNX no R2 (`VITE_ORT_WASM_URL`).** Por padrão o `ort-wasm-simd-threaded*.{wasm,mjs}` sai de `/` (os assets).
Para servi-lo do bucket (o `.jsep.wasm` tem ~25 MB, no limite de arquivo dos assets do Worker), publique com a versão do
`onnxruntime-web` no caminho e aponte o build para lá:

```bash
S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com S3_ACCESS_KEY_ID=<token modelos> S3_SECRET_ACCESS_KEY=<segredo> \
  npx tsx scripts/modelos/publicar-no-r2.ts --prefixo=ort/1.26.0          # --seco lista sem enviar; --dir=public é o padrão
VITE_ORT_WASM_URL=https://modelos.frasy.com.br/ort/1.26.0/ npm run build  # a CSP abre a origem em connect/script/worker-src
```

A troca efetiva espera o domínio público do bucket (`r2.dev` não é para produção). Valor inválido (sem `https://`, ou
`http://` fora de localhost) derruba o carregamento com `VITE_ORT_WASM_URL inválida: …` (`src/gateway/baseDoWasm.ts`).

### Modelos no R2

Os modelos do Bergamot (15 pares X→en, ~423 MB) sobem pelo workflow `publicar-modelos` (manual; inputs `ambiente` e
`pares`, padrão `all`): o runner baixa da Mozilla, confere o sha256 e faz `wrangler r2 object put --remote` no bucket
`frasy-modelos` (`scripts/modelos/publicar-bergamot-no-r2.ts --via=wrangler`), só com o token da Cloudflare do
Environment. O CORS do bucket (GET/HEAD para as origens do app) vem de `scripts/cloudflare/r2.mjs`.

- **Staging:** URL pública do r2.dev (`wrangler r2 bucket dev-url enable frasy-modelos`):
  `https://pub-e3b1825500e2432d831539425d18ec1a.r2.dev`. É o valor de `VITE_BERGAMOT_MODELOS_URL` no Environment
  `staging` (a raiz do bucket, sem sufixo); vale a partir do próximo build/deploy do Worker.
- **Produção:** domínio próprio `modelos.<domínio>` ligado ao bucket (`wrangler r2 bucket domain add`), não o r2.dev,
  que tem limite de taxa e não é para produção. O mesmo vale para `VITE_ORT_WASM_URL` (abaixo).

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

`CLUSTER_WORKERS` não é mais lida e `node:cluster` não existe mais no servidor (Task 10 da Fase 2): escala-se por
**instâncias** (`REPLICAS`, acima) ou, em produção, pelo Worker.
