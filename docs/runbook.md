# Runbook — operar o Babel Play em produção

Este documento responde perguntas de **plantão**: o serviço está de pé? por que caiu? o que faço
agora? Ele não substitui [`docs/deploy.md`](deploy.md), que explica como **subir** e o que cada
variável faz — aqui é o que se lê com o serviço já rodando, e às vezes já quebrado.

Tudo abaixo foi verificado por execução na rodada de saneamento de 2026-09-09, salvo onde estiver
escrito "inferido".

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
- **Alertas.** Não há regra de alerta escrita; o `/metrics` existe, quem consome ainda não.
- **Agregação de métricas em cluster** (§3).
