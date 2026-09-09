#!/usr/bin/env bash
# A MATRIZ E2E EM LOTES — para rodar os tres viewports numa maquina de desenvolvimento.
#
# `npm run test:e2e` roda os tres projetos num comando so, e e isso que a CI faz. Localmente
# (Windows) o processo do Playwright MORRE quando um unico comando passa de ~30 testes: medido em
# 9/114 e em 32/38, sempre sem falha de assercao e sempre com o JSON por escrever. Este script
# quebra a matriz em cinco lotes por projeto e grava um JSON por lote, para que a morte de um lote
# nao apague o resultado dos outros.
#
#   bash scripts/testes/matriz-e2e.sh              # usa $TMPDIR/matriz-e2e
#   TMP=/caminho bash scripts/testes/matriz-e2e.sh
#
# Os bancos e os JSON ficam em `$S` (um banco por projeto, apagado no inicio de cada projeto).
# NAO aponte para `data/`: os testes escrevem de verdade.
set -u
cd "$(dirname "$0")/../.." || exit 1
S="${TMP:-${TMPDIR:-/tmp}}/matriz-e2e"
mkdir -p "$S/audio" "$S/erros"
# No Windows o Node precisa do caminho nativo em `DATABASE_URL`; noutros sistemas os dois coincidem.
SW="$(cd "$S" && { pwd -W 2>/dev/null || pwd; })"

LOTE1="tests/e2e/fumaca.e2e.ts tests/e2e/grade-so-com-jogos-do-sistema.e2e.ts tests/e2e/idioma-da-interface.e2e.ts tests/e2e/quatro-superficies-alcancaveis.e2e.ts tests/e2e/rota-de-aquisicao.e2e.ts tests/e2e/login.e2e.ts tests/e2e/limites-anonimo.e2e.ts"
LOTE2="tests/e2e/baralhos.e2e.ts tests/e2e/facetas.e2e.ts tests/e2e/trilha-carregamento.e2e.ts tests/e2e/pseudo-localizacao.e2e.ts"
LOTE3="tests/e2e/estatisticas.e2e.ts tests/e2e/fsrs-revisao.e2e.ts tests/e2e/seeds.e2e.ts tests/e2e/tema.e2e.ts tests/e2e/transcricao.e2e.ts"
LOTE4="tests/e2e/sessao-de-jogo.e2e.ts"
LOTE5="tests/e2e/dois-dispositivos.e2e.ts"

falhou=0

rodar() { # $1 projeto  $2 numero do lote  $3... arquivos
  proj="$1"; n="$2"; shift 2
  saida="$S/lote-$proj-$n"
  rm -f "$saida.json" "$saida.log"
  DATABASE_URL="file:$SW/lote-$proj.db" \
  AUDIO_DIR="$SW/audio" ERROS_DIR="$SW/erros" \
  PLAYWRIGHT_JSON_OUTPUT_NAME="$saida.json" \
  node node_modules/@playwright/test/cli.js test "$@" --project="$proj" --reporter=json > "$saida.log" 2>&1
  code=$?
  if [ -f "$saida.json" ]; then
    echo "OK     $proj lote$n (exit $code)"
    [ "$code" != "0" ] && falhou=1
  else
    echo "MORREU $proj lote$n (exit $code) — ultimo: $(grep -o '\[[0-9]*/[0-9]*\]' "$saida.log" | tail -1). Rode este lote de novo."
    falhou=1
  fi
}

for proj in mobile-375 tablet-768 desktop-1280; do
  rm -f "$S/lote-$proj.db"*
  rodar "$proj" 1 $LOTE1
  rodar "$proj" 2 $LOTE2
  rodar "$proj" 3 $LOTE3
  rodar "$proj" 4 $LOTE4
  rodar "$proj" 5 $LOTE5
done
echo "MATRIZ COMPLETA — JSON por lote em $S"
exit $falhou
