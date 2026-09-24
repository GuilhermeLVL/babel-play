# Runbook — operar o Babel Play em produção

Este documento responde perguntas de **plantão**: o serviço está de pé? por que caiu? o que faço
agora? Ele não substitui [`docs/deploy.md`](deploy.md), que explica como **subir** e o que cada
variável faz — aqui é o que se lê com o serviço já rodando, e às vezes já quebrado.

Tudo abaixo foi verificado por execução na rodada de saneamento de 2026-09-09, salvo onde estiver
escrito "inferido". As seções 0, 0.1 a 0.5 e 12 entraram na Fase 6 do lançamento (2026-09-24), para
a produção no Fly.io + Cloudflare + R2.

---

## 0. INCIDENTE — uma página

Algo quebrou, vazou, ou está gastando dinheiro sem parar. Faça nesta ordem, e anote a HORA de cada
passo num arquivo (`incidentes/AAAA-MM-DD.md` fora do repositório público) — a ANPD e o pós-mortem
vão pedir a linha do tempo.

**1. DETECTAR — o que está errado, desde quando, quem é afetado.**

- Sinais: e-mail do UptimeRobot (queda ou heartbeat do backup), issue `producao-caiu` aberta pelo
  `uptime.yml`, alerta do Sentry, alerta de gasto do Groq/OpenRouter, reclamação de usuário.
- Primeiro olhar: `curl -s https://<domínio>/api/ready | jq .` · `fly status --app babel-play` ·
  `fly logs --app babel-play | jq -c 'select(.level=="error")'` · Sentry → Issues das últimas 24 h.

**2. CONTER — as chaves de emergência** (cada uma é `fly secrets set X=… --app babel-play`; o Fly
reinicia a máquina em ~20 s):

| situação                                                       | chave                                                                      |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| IA gastando demais, abuso de prompt, provedor respondendo lixo | `AI_ENABLED=0` (o app volta para os modelos locais)                        |
| cobrança errada, webhook suspeito, preço errado na tela        | `CHECKOUT_ENABLED=0` (quem já assina segue)                                |
| enxurrada de contas falsas, ataque de cadastro                 | `SIGNUP_ENABLED=0`                                                         |
| deploy novo quebrou                                            | rollback (§0.3)                                                            |
| suspeita de vazamento de chave                                 | trocar a chave NO PROVEDOR primeiro, depois `fly secrets set` (§6)         |
| tráfego hostil                                                 | Cloudflare → Security → "Under Attack Mode"; bloquear o país/ASN/IP na WAF |

**3. COMUNICAR.**

- Página de status do UptimeRobot: incidente aberto com uma frase ("tradução por IA indisponível;
  transcrição local funciona") — sem culpar ninguém, sem prometer hora.
- **Incidente com dado pessoal** (vazamento, acesso indevido, perda): isto é um incidente de
  segurança da LGPD (art. 48). O Babel Play é **agente de pequeno porte** (Res. CD/ANPD 2/2022), e a
  Res. CD/ANPD 15/2024 dá a ele prazo **em dobro: 6 dias úteis** a partir de quando se soube do
  incidente para comunicar a ANPD (formulário no site da ANPD) e os titulares afetados — quando o
  incidente puder causar risco ou dano relevante. Na dúvida, comunique. A comunicação diz: o que
  aconteceu, quais dados, quantos titulares, o que foi feito, o que o titular pode fazer, e o contato
  do encarregado. Guarde o registro do incidente por **5 anos**, mesmo o que não for comunicado.
- Operador envolvido (Supabase, Groq, Asaas…): abra chamado com o operador e peça o relatório dele.

**4. CORRIGIR** — a causa, não só o sintoma. Teste que reproduz o defeito ANTES do conserto (TDD),
deploy pelo workflow, e só então desligue a chave de emergência.

**5. PÓS-MORTEM** em até 5 dias úteis, sem culpados: linha do tempo, impacto (usuários, minutos,
reais), causa raiz, o que detectou (e o que deveria ter detectado antes), ações com dono e data.

### 0.1 SLO e os dois alertas

- **SLO: 99,5 % de disponibilidade por mês** (≈ 3 h 36 min de indisponibilidade tolerada), medido
  pelo UptimeRobot em `GET /api/ready` a cada 5 min, de fora (passa pelo Cloudflare).
- **Alerta 1 — indisponibilidade:** o monitor HTTP do UptimeRobot em `/api/ready` falhou 2 vezes
  seguidas → e-mail + app. (O `uptime.yml` do GitHub, com `HEALTH_URL`, é o segundo par de olhos.)
- **Alerta 2 — backup parado:** o monitor _heartbeat_ do UptimeRobot não recebeu a chamada de
  `BACKUP_HEARTBEAT_URL` em 25 h → e-mail. Backup que falha em silêncio é o pior tipo de falha.

Os erros de aplicação (Sentry) não são alerta de página: são revisados todo dia útil.

### 0.2 Restaurar o banco

Há duas fontes, as duas no R2:

**A. Litestream (réplica contínua, perda de ~1 s).** Para perda da máquina ou do volume.
O caminho automático: criar um volume novo e subir a máquina — o entrypoint restaura sozinho quando
`/data/babel.db` não existe. À mão, para CONFERIR sem tocar no banco vivo:

```bash
fly ssh console --app babel-play
litestream restore -config /etc/litestream.yml -o /data/restauro.db -integrity-check full /data/babel.db
node dist-server/operacao.cjs verificar --arquivo=/data/restauro.db    # integrity_check + contagens
rm /data/restauro.db
```

Para um momento específico (antes de um erro): `-timestamp 2026-09-24T14:05:00Z` no `restore`.

**B. Snapshot diário (uma foto por dia, 30 dias).** Para erro LÓGICO que o Litestream já replicou
(um `DELETE` sem `WHERE`, uma migração ruim):

```bash
fly ssh console --app babel-play
node dist-server/operacao.cjs restaurar-snapshot --dia=2026-09-23 --destino=/data/restauro.db
```

**Trocar o banco vivo** (qualquer das duas fontes), depois de o `verificar` dizer `ok`:

1. `fly secrets set CHECKOUT_ENABLED=0 SIGNUP_ENABLED=0` (ninguém escreve algo que vai se perder);
2. `fly ssh console` → `mv /data/babel.db /data/babel.db.antes && mv /data/restauro.db /data/babel.db && rm -f /data/babel.db-wal /data/babel.db-shm`;
3. `fly machine restart` — o Litestream passa a replicar o banco restaurado;
4. conferir `/api/ready`, religar as chaves, e anotar no pós-mortem o intervalo de dados perdido.

O CI restaura o Litestream a cada push (job `restauracao-litestream`) e a suíte restaura o snapshot
(`tests/integration/snapshot-e-restauracao.test.ts`). **Uma vez por mês, faça o caminho A à mão** e
registre a data aqui: _(ainda não feito em produção)_.

### 0.3 Rollback de deploy

GitHub → Actions → **Deploy (Fly.io)** → Run workflow → `imagem = registry.fly.io/babel-play:<sha anterior>`
(a lista sai de `fly releases --image --app babel-play`). É a MESMA imagem que já esteve no ar —
nada é reconstruído. Pelo terminal: `fly deploy --app babel-play --image registry.fly.io/babel-play:<sha>`.

**O banco não volta junto.** As migrações rodam no boot e são só para a frente; uma versão velha
sobre um banco migrado continua funcionando enquanto a migração nova só ACRESCENTOU coluna/tabela
(é a regra da casa). Se uma migração destrutiva estiver no meio, o rollback é restaurar o banco
(§0.2) também — por isso migração destrutiva vai sozinha num deploy próprio.

### 0.4 Quando um fornecedor cai

| cai                      | o que o usuário vê                                                                   | o que fazer                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Groq**                 | tradução/tutor ficam mais lentos por 30 s e passam para a reserva                    | nada — o disjuntor (§5) manda para a OpenRouter. Se a reserva também cair: `AI_ENABLED=0` e aviso na página de status                      |
| **OpenRouter** (reserva) | nada, enquanto a Groq estiver de pé                                                  | conferir o crédito pré-pago (sem recarga automática, ele acaba)                                                                            |
| **Asaas**                | checkout e cancelamento falham com mensagem; quem assina continua com acesso         | `CHECKOUT_ENABLED=0` se passar de 30 min; o Asaas reentrega os webhooks que não receberam 200 (idempotente)                                |
| **Supabase**             | ninguém novo entra; quem está logado segue até o token vencer (1 h)                  | nada a fazer do nosso lado; página de status. O servidor valida o token pelo JWKS em cache                                                 |
| **Fly.io** (região GRU)  | fora do ar                                                                           | status.flyio.net; se passar de 2 h, subir em outra região restaurando do Litestream (volume novo + `fly deploy`)                           |
| **Cloudflare**           | fora do ar                                                                           | status do Cloudflare; em último caso, DNS direto para o Fly (tira o WAF: religue assim que voltar) e remova `ORIGEM_SEGREDO` enquanto isso |
| **R2**                   | áudio novo não grava (`/api/ready` 503 → a máquina sai do roteamento); backup atrasa | página de status; o banco segue local no volume e o Litestream reenvia quando o R2 voltar                                                  |

### 0.5 Custo fora do previsto

Painel do Groq (teto mensal ligado) e da OpenRouter (crédito pré-pago) mandam e-mail ao chegar
perto do limite; o orçamento global `AI_BUDGET_USD_MONTH` desliga a IA sozinho em 100 %. Fly,
Supabase e Sentry têm alerta de fatura no painel — ligue os três (LANCAMENTO.md).

---

## 1. As duas perguntas de saúde, e por que são duas

| rota              | responde                                                                                            | quem lê decide           |
| ----------------- | --------------------------------------------------------------------------------------------------- | ------------------------ |
| `GET /api/health` | o processo está vivo e o boot terminou                                                              | **reiniciar**            |
| `GET /api/ready`  | ele consegue **atender** — migrações aplicadas, banco respondendo, armazenamento externo alcançável | **tirar do balanceador** |

As duas são **públicas**: uma sonda de orquestrador não tem token. `ready` responde `200` quando
pronto e `503` quando não.

O `HEALTHCHECK` do `Dockerfile` e do `docker-compose.yml` aponta para `/api/ready`, e o motivo é
esse: o healthcheck do Docker não reinicia nada — ele marca `unhealthy`, e quem lê esse estado
(`depends_on: service_healthy`, Swarm, proxy reverso) decide **rotear**. Isso é readiness. Enquanto
ele apontava para `health`, uma instância que subisse com o banco na versão anterior seria declarada
saudável.

**Provedores de IA ficam de fora do `ready`, de propósito.** Eles são terceiros: um provedor fora do
ar tiraria todas as réplicas do balanceador ao mesmo tempo, transformando uma degradação em queda.
Para saber se a IA está respondendo, veja o disjuntor (§5).

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<host>/api/health
curl -s https://<host>/api/ready | jq .
```

---

## 2. Ler o diário

Uma **linha JSON por evento**, no stdout. O logger tem allowlist de campos: chave fora da lista é
descartada, o que é a garantia — por construção — de que transcrição, prompt e chave de API não vão
para o diário.

```bash
docker logs babel-play 2>&1 | jq -c 'select(.level=="error")'
docker logs babel-play 2>&1 | jq -c 'select(.requestId=="<id>")'   # tudo de UM request
```

**Todo request tem `request_id`**, e ele volta ao cliente no header `x-request-id`. Uma pessoa que
reporta "deu erro interno (req: abc123)" está entregando a chave de busca do diário: a resposta ao
cliente é estável de propósito (nunca deriva da mensagem do erro, para não vazar com ela) e o
`requestId` é o elo com a linha que tem a causa.

O id é preenchido **sozinho** dentro do ciclo de um request, inclusive nas funções de domínio que
não têm um `Request` em mãos. Fora de request — boot, cron, worker — o campo simplesmente não
aparece; isso é a resposta certa, não uma falha.

**Os valores do usuário são redigidos antes de virar log** (`server/lib/redacao.ts`). O que sai
cortado: os parâmetros vinculados que o ORM anexa à mensagem de erro (`params: [redigido]`, a
consulta fica), e-mail, `Bearer`, chave de provedor e JWT. Se você precisa do valor exato para
investigar, ele **não** está no diário — reproduza com dados de teste.

Em produção o stack vai **dentro** da linha JSON, no campo `stack`, e não num dump ao lado: um
agregador consegue ler uma linha por evento, e não consegue ler um despejo multilinha.

---

## 3. Métricas

`GET /metrics`, formato Prometheus, **na raiz** — `/api/metrics` é outra coisa (perfil e seeds do
jogo, atrás do auth).

- Só existe com `METRICS_ENABLED=1`. Desligado, a rota responde o mesmo `404` de qualquer caminho
  inexistente — de propósito: uma rota montada respondendo `403` confirmaria a um estranho que o
  servidor é instrumentado e que há segredo a adivinhar.
- Com `METRICS_TOKEN` definida, exige `Authorization: Bearer <token>` (comparação em tempo
  constante). **Sem ela o scrape é aberto**: aceitável em rede interna fechada, não em rede pública
  — o corpo de um scrape descreve todas as rotas, o volume de cada uma e a taxa de erro.

```bash
curl -s -H "Authorization: Bearer $METRICS_TOKEN" https://<host>/metrics | head -40
```

**Em cluster, o `/metrics` responde os números DO PROCESSO que atendeu o scrape**, e diz qual foi
(header `x-metrics-processo` e métrica `processo_info`). Não há agregação, e isso é decisão
registrada: o agregador do `prom-client` só enxerga os workers, e aqui o primário também atende —
com `CLUSTER_WORKERS=4` a resposta "agregada" omitiria ~1/4 do tráfego em silêncio. Se os seus
gráficos oscilarem entre patamares, é o scrape alternando de processo. O conserto é dar ao
`/metrics` um listener próprio no primário.

A label de rota é o **padrão** (`/api/sessions/:id`), nunca o caminho pedido, e o que não casou rota
cai num balde `desconhecida`. É o que impede um scanner de porta de criar mil séries temporais.

---

## 4. Reiniciar, atualizar e parar

O servidor trata `SIGTERM` e `SIGINT`: para de aceitar conexões, **drena as em curso** (teto de
`DESLIGAMENTO_TIMEOUT_MS`, padrão 10.000 ms), faz `PRAGMA wal_checkpoint(TRUNCATE)`, fecha o banco e
sai com `0`. Estourado o teto, sai com `1` — a requisição foi abandonada, e o código de saída é o
único canal para dizer isso.

O padrão de 10 s é o prazo que o `docker stop` dá antes do `SIGKILL`; um teto maior nunca chegaria a
ser usado. Se você roda com `docker stop -t` menor ou `terminationGracePeriodSeconds` diferente,
ajuste a variável junto.

```bash
docker stop babel-play          # SIGTERM, drena, checkpoint, sai 0
docker compose up -d --build    # atualizar
```

Em cluster, o primário **repassa o sinal aos workers e para de refazê-los**. Antes disso, o
`cluster.on('exit')` refazia qualquer worker — inclusive durante o desligamento, o que fazia o
serviço "não morrer".

Medido em 2026-09-09, sobre uma cópia do banco real: o dreno leva **1–3 ms**; o `-wal` de 659.232
bytes é dobrado no `.db` pelo checkpoint e zerado.

### Se o processo morrer de morte matada (`kill -9`, OOM)

Medido: `health` volta a `200` em **~1,6 s** com supervisor (`restart: unless-stopped`), e o teste
de perda registrou **zero** requisições que o cliente viu como `2xx` sem a linha correspondente no
banco. `PRAGMA integrity_check` devolveu `ok`. Requisições cortadas no meio (sem `2xx`) são
aceitáveis: o cliente repete.

Para reproduzir a medição:

```bash
node scripts/perf/recuperacao.mjs --db=<COPIA.db> --porta=3104 --carga=30 --matar=10
```

---

## 5. Quando a IA para de responder

Há um **disjuntor por provedor** (`base·modelo`): cinco falhas seguidas o abrem por 30 s, e depois
ele volta meio-aberto, com **uma** sondagem. Enquanto está aberto, a chamada nem toca o provedor e
cai direto na reserva — antes disso, cada tradução pagava os 12 s de timeout antes de chegar lá.

- `413` **não** conta como falha: é o nosso teto de prompt, decidido antes de qualquer socket.
- Há retry **só no STT**, que não tem cascata, e **só em 429 e 5xx**. Não há retry em timeout: o
  timeout é o nosso `AbortSignal`, e a requisição pode estar sendo processada — e cobrada — naquele
  momento.

O que o usuário vê quando o provedor cai é `code: 'provedor_indisponivel'` mais o `requestId`. O
corpo do upstream **não** vai na resposta; ele vai para o log.

Configurar a reserva exige as **três** variáveis (`LLM_RESERVA_BASE_URL`, `LLM_RESERVA_API_KEY`,
`LLM_RESERVA_MODEL`): meia configuração viraria uma segunda tentativa contra um endereço incompleto,
o que atrasa a falha sem evitá-la.

---

## 6. Rotação de segredos

| segredo                       | onde                                             | ao rotacionar                                                                           |
| ----------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `SECRET_KEY`                  | cifra as credenciais de IA guardadas por usuário | **as credenciais existentes deixam de abrir.** Não rotacione sem plano de recifra       |
| `LLM_API_KEY` / `STT_API_KEY` | chave gerenciada do dono                         | troca e reinicia; nada persistido depende dela                                          |
| `ASAAS_WEBHOOK_TOKEN`         | autentica o webhook de cobrança                  | trocar dos dois lados na mesma janela; o Asaas reentrega o evento que não recebeu `200` |
| `SUPABASE_JWT_SECRET` / JWKS  | verifica o token de login                        | invalida as sessões em voo                                                              |
| `METRICS_TOKEN`               | protege o scrape                                 | trocar aqui e no scraper                                                                |

O histórico do repositório é varrido por `gitleaks` a cada push (`.github/workflows/seguranca.yml`).
A allowlist é por **valor** e não por caminho, para não abrir um arquivo inteiro; hoje ela tem uma
entrada só, a constante de teste `segredo-e2e-hs256-marco1`, que nunca foi chave de nada.

---

## 7. Limites que respondem 429, e o que cada um protege

| balde                                                 | teto               | chave  | protege              |
| ----------------------------------------------------- | ------------------ | ------ | -------------------- |
| autenticação                                          | 30 falhas / 15 min | IP     | adivinhação de token |
| rotas caras (`/api/ai`, `/api/import`, `/api/gemini`) | 60 / min           | tenant | gasto com terceiros  |
| escrita (CRUD, admin, áudio)                          | 120 / min          | tenant | memória do processo  |

Os três contam **no banco**, não no heap: em memória o teto viraria "teto × número de réplicas", e
atrás de proxy a chave seria a do proxy, fazendo um visitante esgotar a cota de todos.

**Atenção ao balde de autenticação**: ele fica **antes** do `authMiddleware`, que é o que faz dele
proteção de verdade (recusa a requisição, em vez de só trocar a resposta). O preço é que, uma vez
estourado, ele bloqueia tudo daquela origem na janela, **inclusive requisição com token bom**. É o
comportamento de qualquer bloqueio por origem — e é por isso que `TRUST_PROXY` precisa estar certo:
sem ela, atrás de proxy, a chave é o IP do proxy e o bloqueio de um atacante pega todo mundo junto.

`TRUST_PROXY` **não liga sozinha**, e o motivo é que o erro para o outro lado é pior: confiar em
`X-Forwarded-For` sem proxy à frente entrega a chave do balde ao cliente, e o limitador deixa de
existir **em silêncio**.

---

## 8. Banco

```bash
sqlite3 <banco> 'PRAGMA integrity_check;'      # esperado: ok
sqlite3 <banco> 'PRAGMA foreign_key_check;'    # esperado: vazio
node scripts/backup.mjs                        # cópia consistente
```

Restaurar é **restaurar backup e subir** — não há migração reversa. As migrações são aplicadas no
boot; se a pasta não estiver no disco, `/api/ready` responde `desconhecida` para esse item e **não**
reprova, porque é a topologia legítima de uma imagem que já subiu migrada.

Nunca aponte um script de medição para `data/babel.db`: todos eles escrevem de verdade. Use cópia.

---

## 9. Medir de novo

Os mesmos comandos da linha de base e do relatório final, para comparar com números e não com
impressões. Todos exigem `NODE_ENV=production`, `SECRET_KEY` definida e **cópia** do banco.

```bash
node scripts/perf/latencia.mjs --api=http://127.0.0.1:3101 --duracao=15 --conexoes=10 --card=<id>
node scripts/perf/arranque.mjs --db=<COPIA.db>
node scripts/perf/recuperacao.mjs --db=<COPIA.db> --porta=3104 --carga=30 --matar=10
node scripts/perf/concorrencia.mjs --db=<COPIA.db> --porta=3105 --gastos=40 --ondas=12
k6 run scripts/perf/carga.k6.js          # BASE=... CARTAO=...
```

`127.0.0.1`, nunca `localhost`: no Windows a resolução tenta IPv6 primeiro e some ~200 ms fantasma
em cada requisição.

**Cópia nova a cada corrida de carga.** Cada corrida grava ~16 mil linhas em `exercise_results`, e
reaproveitar o banco da anterior derruba a seguinte — medido, 108 req/s numa cópia limpa contra 59
req/s no banco já engordado. Comparar corridas sobre bancos de tamanhos diferentes não compara nada.

---

## 10. Sintomas conhecidos

| sintoma                                                         | causa provável                                                                                                                | o que fazer                                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `/api/ready` em 503 e `/api/health` em 200                      | banco inalcançável, migração pendente, ou S3 recusando                                                                        | ler o corpo do `ready`, que nomeia o item                                             |
| `429` em massa de uma origem só                                 | balde de autenticação estourado (§7)                                                                                          | conferir `TRUST_PROXY`; a janela é de 15 min                                          |
| gráficos de `/metrics` oscilando entre patamares                | scrape alternando de processo em cluster (§3)                                                                                 | ler `x-metrics-processo`                                                              |
| tradução lenta e depois instantânea falhando                    | disjuntor abriu (§5)                                                                                                          | ver o log do provedor; a reserva assume                                               |
| `SQLITE_ERROR: too many SQL variables` ao salvar sessão         | **defeito conhecido**: o schema aceita 5.000 falas e o repositório grava tudo num `batch` só. Medido: 1.500 passam, 2.000 não | quebrar a sessão em partes menores; o conserto está registrado no relatório da Fase 5 |
| `ECONNREFUSED` disparando centenas de conexões novas de uma vez | limite do **cliente**, não do servidor (medido: com o pool quente o mesmo servidor atende 300 simultâneas)                    | mandar em ondas                                                                       |

---

## 11. O que este runbook não cobre

- **Tracing distribuído.** Não há OpenTelemetry. A correlação existente é o `request_id` no log e o
  histograma por rota no `/metrics`; ligar spans é decisão aberta, e o arranque já custa ~400 ms a
  mais desde a Fase 5.
- **Alertas sobre métricas.** Os dois alertas de página são os do §0.1 (UptimeRobot); o `/metrics`
  existe, mas ninguém o raspa em produção ainda.
- **Agregação de métricas em cluster** (§3).

---

## 12. Segurança que o servidor passou a cobrar (Fase 6)

| o quê                                                                      | onde                             | sintoma quando falta                                                                  |
| -------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| `TRUST_PROXY` declarada em produção                                        | `server/lib/config.ts`           | boot aborta com a instrução                                                           |
| `ORIGEM_SEGREDO` (cabeçalho do Cloudflare)                                 | `server/http/origemProtegida.ts` | acesso direto a `*.fly.dev` recebe 403; as sondas passam                              |
| corpo JSON de 100 KB antes do login, 5 MB só em rotas listadas depois dele | `server/http/limitesDeCorpo.ts`  | `413 corpo_grande_demais`                                                             |
| 2FA (AAL2) nas rotas sensíveis para quem o ativou                          | `server/lib/aal.ts`              | `403 aal2_requerido`; `503 aal_indisponivel` se a Admin API do Supabase não responder |
| CSP com `connect-src` fechado                                              | `server/http/csp.ts`             | recurso bloqueado no console do navegador — um host novo precisa entrar na lista      |
