#!/bin/sh
# Entrypoint da imagem (Fase 5 do lançamento).
#
# Com as quatro LITESTREAM_* no ambiente (produção no Fly):
#   1. se o banco NÃO existe no volume e EXISTE réplica no R2, restaura antes de tudo — é o que faz
#      um volume novo (máquina trocada, volume perdido) voltar com os dados, sem ninguém rodar nada;
#   2. sobe o servidor como FILHO do `litestream replicate -exec`. O Litestream repassa o SIGTERM ao
#      Node (o desligamento gracioso de server/lib/desligamento.ts drena e faz o checkpoint do WAL),
#      espera o Node sair e só então faz a última sincronização e sai. Por isso o `kill_timeout` do
#      fly.toml é maior que DESLIGAMENTO_TIMEOUT_MS: sobra tempo para o Litestream fechar.
#
# Sem elas (dev, self-host, CI): o servidor sobe direto, como sempre subiu.
#
# `exec` nos dois caminhos: o processo principal do container é o Litestream ou o Node, nunca este
# shell — senão o sinal do orquestrador pararia aqui e o desligamento gracioso não aconteceria.
set -eu

BANCO="/data/babel.db"
SERVIDOR="node dist-server/server.cjs"

if [ -n "${LITESTREAM_BUCKET:-}" ] && [ -n "${LITESTREAM_ENDPOINT:-}" ] \
  && [ -n "${LITESTREAM_ACCESS_KEY_ID:-}" ] && [ -n "${LITESTREAM_SECRET_ACCESS_KEY:-}" ]; then
  if [ "${DATABASE_URL:-file:$BANCO}" != "file:$BANCO" ]; then
    echo "[iniciar] ERRO: com Litestream o banco precisa ser $BANCO (litestream.yml), e DATABASE_URL=${DATABASE_URL}" >&2
    exit 1
  fi
  echo "[iniciar] Litestream: restaurando $BANCO do R2 se ele não existir aqui"
  litestream restore -config /etc/litestream.yml -if-db-not-exists -if-replica-exists -integrity-check quick "$BANCO"
  echo "[iniciar] Litestream: replicação contínua ligada; servidor sobe como filho"
  exec litestream replicate -config /etc/litestream.yml -exec "$SERVIDOR"
fi

echo "[iniciar] LITESTREAM_* ausentes: sem replicação contínua (dev/self-host)"
exec $SERVIDOR
