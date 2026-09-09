## Why

O servidor sabia contar coisas de negocio e escrever uma linha JSON por evento, e nao sabia
responder "a p95 desta rota subiu depois do deploy?". Log responde o que aconteceu com UM request;
distribuicao e outro instrumento, e nao havia nenhum.

## What Changes

- `GET /metrics` na raiz, montado so com `METRICS_ENABLED=1` e protegido por `METRICS_TOKEN` em
  comparacao de tempo constante.
- Histograma por rota/metodo/status com a label vinda do PADRAO da rota, nunca do caminho pedido.
- `AggregatorRegistry` recusado com evidencia; a resposta e do processo que atendeu e se declara
  parcial.

## Nao-escopo

Agregacao entre processos. O conserto e um listener proprio no primario, uma linha em `server.ts`,
registrada no arquivo em vez de disfarcada de resolvida.
