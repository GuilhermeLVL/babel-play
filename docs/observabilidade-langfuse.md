# Observabilidade de IA com o Langfuse

Para que serve: saber quanto a IA de nuvem custa **por usuário, por plano e por função** (STT,
tradução falada, tradução de texto, tutor), com latência p50/p95 e taxa de fallback, para precificar
os planos com número medido e não com estimativa.

Código: `server/lib/langfuse.ts` (cliente, sem SDK) e `server/ai/telemetriaDeIa.ts` (um rastro por
requisição, uma geração por tentativa ao provedor). Instrumentados: `sttProxy.ts`, `mtProxy.ts` (com a
cascata primário → reserva), `routes/tutor.ts` (tutor e corretor, incluindo o Ollama do self-host) e o
proxy BYOK (`proxy.ts`, só latência e status).

## Endpoint: OTLP, não a ingestão antiga

O servidor manda **OTLP/HTTP JSON** para `POST {LANGFUSE_BASE_URL}/api/public/otel/v1/traces`, com
Basic auth (`public:secret`) e `x-langfuse-ingestion-version: 4`. A ingestão antiga
(`/api/public/ingestion`, eventos `trace-create`/`generation-create`) está depreciada no Langfuse
Cloud, e a partir de **16/11/2026** só aceita scores. O arquivo local (`LANGFUSE_ARQUIVO`) continua
gravando no formato legível da ingestão antiga, porque é mais fácil de ler.

Envio em lote: 50 eventos ou a cada 5 s. Timeout de 5 s, uma retentativa, fila limitada a 1.000
eventos (os mais antigos saem e são contados). Tudo é descarregado no desligamento gracioso. Nada
disso lança erro no caminho da requisição.

## Criar o projeto

1. Crie uma conta em <https://cloud.langfuse.com> (**região EU**) e uma organização com **2FA**.
2. Crie o projeto `babel-play` → _Settings → API Keys → Create_. Copie `pk-lf-…` e `sk-lf-…`.
3. _Settings → Data retention_: defina a retenção (sugestão: 90 dias). Aceite o DPA e peça as
   cláusulas da Res. CD/ANPD 19/2024 (`docs/lgpd/operadores.md`).
4. No Fly: `fly secrets set LANGFUSE_PUBLIC_KEY=pk-lf-… LANGFUSE_SECRET_KEY=sk-lf-…`.

Antes de o projeto existir, dá para medir localmente: `LANGFUSE_ARQUIVO=./data/telemetria-ia.jsonl`
(funciona sem as chaves).

## Variáveis

| variável              | efeito                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `LANGFUSE_PUBLIC_KEY` | com a secreta, liga o envio. Sem as duas, nada vai para a rede                           |
| `LANGFUSE_SECRET_KEY` | par da pública                                                                           |
| `LANGFUSE_BASE_URL`   | padrão `https://cloud.langfuse.com` (UE)                                                 |
| `LANGFUSE_ARQUIVO`    | `.jsonl` com os mesmos eventos, para DuckDB/planilha; funciona sem chaves                |
| `LANGFUSE_CONTEUDO`   | `1` inclui o texto de entrada/saída, **só em dev**. Com `NODE_ENV=production` é recusada |

## O que é enviado

**Rastro** (um por requisição HTTP): nome = função (`stt`, `mt-fala`, `mt-texto`, `tutor`,
`corretor`, `byok-chat`); `userId` = `u_` + HMAC-SHA256(sal derivado da `SECRET_KEY`, id do usuário)
truncado a 96 bits (estável, não reversível fora do servidor); `sessionId` = pseudônimo do cabeçalho
opcional `x-sessao-captura`; tags `[função, plano]`; metadados `plano`, `feature`, `statusHttp`,
`tentativas`, `fallback`, `cacheHit`, `parDeIdiomas`, `menor` (booleano), `byok`,
`segmentosDescartados`, `custoUsd`.

**Geração** (uma por tentativa ao provedor, então o fallback aparece): `model`; `usageDetails` com
`input`/`output`/`cached_input` (tokens) ou `audio_seconds`/`audio_seconds_billed` (STT: real e com
o mínimo de 10 s da Groq); `costDetails.total` em US$ pela **tabela única** de `orcamentoDeIa.ts` (a
mesma do orçamento global e do Prometheus; BYOK não tem custo, porque o dinheiro não é nosso); nível
`WARNING` para 429/vazio/filtrado/disjuntor e `ERROR` para 5xx/timeout; metadados `provedor` (`groq`,
`openrouter`, `ollama`, `byok`, `outro`; nunca a URL), `status` (`ok`, `429`, `4xx`, `5xx`,
`timeout`, `rede`, `vazio`, `filtrado-vazio`, `disjuntor`), `tentativa`, `rotulo`, `esforco`
(raciocínio), contagens do filtro de qualidade do STT.

**Nunca**, por padrão: texto de transcrição, tradução, prompt ou resposta do tutor, áudio, e-mail,
IP, id do usuário em claro.

## Limite do provedor (429)

Cada 429 soma em `ia_provedor_limite_total{provedor,modelo}` (Prometheus, `/metrics`) e gera o aviso
`ia_provedor_limite` no log **no máximo uma vez por minuto por provedor**. Esse aviso está em
`AVISOS_QUE_ALERTAM`, então chega ao Sentry. Se ele se repete, suba o tier da Groq ou confira a
reserva (`LLM_RESERVA_*`/`OPENROUTER_API_KEY`). No Langfuse, a geração correspondente fica com
`status=429` e nível `WARNING`.

## Painéis e consultas úteis

No Langfuse, em _Dashboards → New dashboard_, crie widgets sobre **Observations** (tipo
`generation`) ou **Traces**:

- **Custo por plano e função:** métrica `Total cost`, agrupar por `metadata.plano` e depois por
  `metadata.feature` (ou pela tag). Janela de 30 dias. É a base do preço.
- **Custo por usuário ativo:** _Users_ lista custo e tokens por `userId` (pseudônimo). Custo total do
  plano ÷ usuários distintos do plano no mês = custo por usuário ativo. Ordene de forma decrescente
  para achar o uso atípico (o "p99 de usuário" é o que quebra o plano ilimitado).
- **Latência p50/p95 por função:** métrica `Latency` com percentis p50/p95, filtrando
  `metadata.status = ok`, agrupada por `metadata.feature` e `metadata.provedor`.
- **Taxa de fallback:** Traces com `metadata.fallback = true` ÷ total, por função. Subindo, o
  primário está instável ou no limite.
- **Taxa de 429:** gerações com `metadata.status = 429` agrupadas por `metadata.provedor` e `model`.
- **Custo do mínimo de 10 s do STT:** some `audio_seconds_billed − audio_seconds`; se for grande, vale
  juntar falas curtas antes de mandar.
- **Alucinação paga:** gerações de STT com `metadata.status = filtrado-vazio`: áudio pago que só
  virou texto inventado. Indica VAD mandando silêncio.

Análise local do arquivo, com DuckDB:

```sql
-- custo e p95 por plano e função
select t.body.metadata.plano as plano, t.body.metadata.feature as funcao,
       count(*) as chamadas, sum(g.body.costDetails.total) as custo_usd,
       quantile_cont(g.body.metadata.latenciaMs, 0.95) as p95_ms
from read_json_auto('data/telemetria-ia.jsonl') g
join read_json_auto('data/telemetria-ia.jsonl') t
  on t.type = 'trace-create' and g.body.traceId = t.body.id
where g.type = 'generation-create'
group by all order by custo_usd desc;
```
