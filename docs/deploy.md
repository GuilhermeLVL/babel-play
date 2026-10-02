# Deploy — modo público multi-usuário

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
| `SECRET_KEY`                                   | cifra os segredos BYOK em repouso                                                                | **o boot ABORTA** (`server/crypto.ts`)                |
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

`DATABASE_URL=file:/data/babel.db` · `AUDIO_DIR=/data/audio` · `HOST=0.0.0.0` · `PORT=3000`
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
      o índice único, então rodar por cima de um banco antigo é seguro.
- [ ] **Backup do SQLite.** Em WAL há três arquivos (`.db`, `.db-wal`, `.db-shm`) — copiar só o
      `.db` com o app rodando dá backup **corrompido**. Use o Litestream + snapshot diário (§Backup)
      ou, à mão, `node scripts/backup.mjs` (que faz `VACUUM INTO` e confere).
- [ ] **Tetos por plano** (`PREMIUM_*` — `PREMIUM_MONTHLY_STT_SECONDS`, `PREMIUM_DAILY_STT_SECONDS` e as
      demais do inventário em `server/lib/config.ts`; defaults em `src/core/planos.ts`. As antigas
      `PRO_*`/`ESSENCIAL_*` NÃO são mais lidas: passe o valor para a `PREMIUM_*` correspondente) coerentes com o
      que você aceita gastar. A reserva é atômica (20 requisições simultâneas contra teto 5 aceitam
      5, não 20), mas o teto é seu.
- [ ] **`/api/health` no monitor externo.** Ele reporta banco **e** boot: um passo de migração
      que falhou deixa a probe em 503 em vez de o app subir mudo.

## O que fica desativado por design

No modo público, duas capacidades locais respondem **403 mesmo com token válido** — elas
executam coisas no servidor que só fazem sentido no self-host:

- `POST /api/import/youtube` — roda `yt-dlp` como subprocesso.
- `/api/audio/*` — captura WASAPI loopback (Windows).

Sem token elas devolvem **401**, não 403: o `authMiddleware` roda antes do guard. Os dois
códigos significam "indisponível aqui" — o 403 é o que você vê depois de autenticar.

Não é limitação da imagem; é `server.ts` decidindo pela flag.

## Escalar

**Réplicas na MESMA máquina, mesmo volume: funciona.** Medido: 2 processos escrevendo
concorrentemente → 0% de falha (era 50% antes do WAL). Serve para deploy sem downtime.

**Réplicas em HOSTS distintos: ainda não.** Dois motivos:

1. WAL exige memória compartilhada — não funciona sobre NFS/SMB. Multi-host exige **Postgres**
   (`server/db/db.ts` é o único arquivo a trocar; schema e repositories são portáveis).
2. `AUDIO_DIR` num volume compartilhado resolve o áudio entre réplicas do mesmo storage;
   hosts sem storage comum exigem **object store** (S3/R2).

O rate-limit **já** é compartilhado entre réplicas (contador no banco, não no heap) e chaveado
por tenant, então esse não é mais um bloqueio.

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
node dist-server/operacao.cjs verificar --arquivo=backups/<pasta>/babel.db   # confere uma cópia
```

Dentro da imagem o script também existe: `node scripts/backup.mjs --sem-midia --destino=/data/backups`.

**O que ele faz que um `cp` não faz:**

1. **`VACUUM INTO`, não cópia de arquivo.** Sob WAL o banco são três arquivos e copiar só o `.db`
   com o app rodando produz backup corrompido ou defasado.
2. **Verifica antes de dar por feito** — abre a cópia, roda `PRAGMA integrity_check` e confere as
   contagens contra a origem. Sai com código != 0 se algo não fechar, que é o que faz um agendador
   avisar.
3. **Inclui a mídia.** `data/audio` pesa 33× o banco; um backup só do banco restaura ponteiros para
   arquivos que não existem mais.

### Backup em produção (Fase 5): Litestream + snapshot diário, os dois no R2

1. **Litestream, contínuo.** Com `LITESTREAM_BUCKET`, `LITESTREAM_ENDPOINT`,
   `LITESTREAM_ACCESS_KEY_ID` e `LITESTREAM_SECRET_ACCESS_KEY`, o entrypoint sobe o Node como filho
   do `litestream replicate` (config em `litestream.yml`, versão e sha256 fixados no `Dockerfile`):
   cada escrita chega ao R2 em ~10 s (`sync-interval`). Num volume vazio, o boot restaura sozinho
   (`-if-db-not-exists -if-replica-exists`). O CI prova isso a cada push (job `restauracao-litestream`).
2. **Snapshot diário, independente.** `BACKUP_DIARIO=1` faz o processo primário rodar, às
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

## Mais de uma instancia (`REPLICAS`)

Duas maquinas atras de um balanceador nao sao dois processos na mesma maquina, e a diferenca
importa: o audio gravado por uma **nao existe no disco da outra**. O mesmo pedido responde 200 ou
404 conforme quem atendeu — medido, com a mensagem "arquivo ausente".

O servidor nao tem como descobrir quantas instancias existem, entao quem opera declara e o boot
verifica:

```bash
REPLICAS=2                      # instancias independentes (nao processos: veja CLUSTER_WORKERS)
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
# e um cron chamando, com um token de admin:
#   curl -X POST https://<host>/api/admin/armazenamento/reconciliar
```

## Modo cluster

`CLUSTER_WORKERS=N` sobe N processos compartilhando a mesma porta. Vazio ou `1` = um processo,
que é o comportamento de sempre. Sao processos do MESMO host, com o MESMO disco — para maquinas
diferentes, veja `REPLICAS` acima.

Duas coisas mudam em cluster: a **captura de loopback do servidor** (`/api/audio/loopback/*`)
recusa, porque o mutex do dispositivo WASAPI e por processo e N processos teriam N mutexes
independentes brigando pelo mesmo hardware; e o **diario de erros** passa a ter um arquivo por
processo (`AAAA-MM-DD.<pid>.jsonl`), com a poda a cargo so do primario. A leitura em
`GET /api/admin/erros` junta todos os arquivos do dia.

**Por que existe (F6-01).** A carga contra o container mediu vazão **plana** (~100 req/s) com a
latência crescendo linear a partir de 2 VUs — saturação de processo único, não consulta lenta: sem
concorrência, `/api/sessions` responde em 7 ms e `/api/metrics/profile` em 37 ms. Índice não
resolve fila.

**As três barreiras já caíram e estão medidas:** WAL + `busy_timeout` (0 % de falha em 14.220
escritas com 3 processos), rate limit contado no banco e não no heap, e áudio fora do `cwd`
(`AUDIO_DIR`).

**Só o primário prepara os dados.** Migrations, seed e backfill rodam uma vez, antes de qualquer
worker existir — o que elimina a contenção de lock no boot que hoje depende de restart do
orquestrador.

**Aborta se o WAL não pegar.** `PRAGMA journal_mode = WAL` não lança quando falha: sobre NFS/SMB
devolve `delete` e segue. Sem WAL, medido, 3 processos perdem 28,9 % das escritas. Em modo cluster
isso vira falha dura no boot, não aviso no log.

**Suba a memória junto.** Cada worker é um heap Node inteiro; `deploy.resources.limits.memory: 1g`
foi dimensionado para um processo.

```bash
CLUSTER_WORKERS=4 docker compose --env-file .env.docker up -d
```
