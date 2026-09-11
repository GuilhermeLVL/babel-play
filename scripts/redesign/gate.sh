#!/usr/bin/env bash
# Gate do redesign v3 — idempotente, sai != 0 em qualquer falha e imprime resumo.
#
# Roda os mesmos comandos reais do projeto (ver docs/redesign/FERRAMENTAS.md).
# Uso:  bash scripts/redesign/gate.sh            (tudo)
#       GATE_PULAR_E2E=1 bash scripts/redesign/gate.sh   (sem E2E, para iterar rápido)
set -uo pipefail
cd "$(dirname "$0")/../.."

RESULTADOS=()
FALHOU=0

etapa() {
  local nome="$1"; shift
  echo ""
  echo "──────── $nome ────────"
  if "$@"; then
    RESULTADOS+=("OK    $nome")
  else
    RESULTADOS+=("FALHA $nome")
    FALHOU=1
  fi
}

# 8. Integridade: nenhum teste removido em relação à main, nenhum .skip/.only novo.
integridade() {
  # `--ignore-cr-at-eol` e obrigatorio desde a normalizacao de fim de linha: sem ele o diff contra
  # a main mostra CADA linha dos 185 arquivos renormalizados como adicionada, e todo `.skip`
  # pre-existente aparece como novo. O gate acusava uma lacuna declarada ha meses como se tivesse
  # sido introduzida agora.
  local base="${GATE_BASE:-main}" apagados novos
  apagados=$(git diff --diff-filter=D --name-only --ignore-cr-at-eol "$base" -- 'tests/**' 'src/**/*.test.*' 'server/**/*.test.*' || true)
  if [ -n "$apagados" ]; then
    echo "ARQUIVO DE TESTE REMOVIDO em relação a $base:"; echo "$apagados"; return 1
  fi
  novos=$(git diff -U0 --ignore-cr-at-eol "$base" -- 'tests/**' | grep -E '^\+.*\b(it|test|describe)\.(skip|only)\b' || true)
  if [ -n "$novos" ]; then
    echo "SKIP/ONLY NOVO introduzido:"; echo "$novos"; return 1
  fi
  echo "Nenhum teste removido, nenhum .skip/.only novo em relação a $base."
}

etapa "1. Typecheck"                 npm run typecheck
etapa "2. Lint"                      npm run lint
etapa "3. Testes unitários"          npm run test:unit
etapa "4. Build de produção"         npm run build
# 5. E2E — contra um BANCO DESCARTAVEL, e a razao vale ser escrita.
#
# Este gate passou a maior parte desta rodada comparando o resultado com uma lista de "falhas
# conhecidas da main". A lista estava ERRADA. Rodando a suite no worktree de baseline, a main com
# banco limpo passa nos cinco testes que a lista acusava; rodando a main com o banco REAL do
# operador (12 MB, anos de uso), os mesmos cinco falham. O codigo nunca teve nada a ver: o que
# falhava era o ESTADO DO BANCO daquela maquina — fila com 3 cartoes vencidos onde o teste exige
# 6, Loja sem item com preco em Seeds porque o dono ja os possui.
#
# Uma suite cujo resultado depende de quantos cartoes o dono revisou ontem nao mede o codigo.
# `DATABASE_URL` sempre foi configuravel (server/db/db.ts:16); o gate agora aponta para um arquivo
# proprio, apagado antes de cada corrida, e sobe numa porta propria para nao reaproveitar um
# servidor de desenvolvimento que esteja de pe com o banco do operador.
#
# Com isso a lista de excecoes deixou de existir: o resultado e reproduzivel e a exigencia volta a
# ser a simples — ZERO falhas.
e2e() {
  local saida="${TMPDIR:-/tmp}/gate-e2e.txt"
  rm -f data/gate-e2e.db data/gate-e2e.db-wal data/gate-e2e.db-shm
  PORT=3300 BASE_URL=http://localhost:3300 DATABASE_URL=file:./data/gate-e2e.db     npm run test:e2e > "$saida" 2>&1
  local codigo=$? ok falhas
  ok=$(grep -cE "^  ok" "$saida" || true)
  falhas=$(grep -cE "^  x " "$saida" || true)
  echo "E2E: $ok aprovados, $falhas falhas (banco descartavel)."
  if [ "$codigo" -ne 0 ]; then
    grep -E "^  x " "$saida" || true
    echo "--- saida completa: $saida"
    return 1
  fi
}

if [ "${GATE_PULAR_E2E:-0}" != "1" ]; then
  etapa "5. E2E (paridade, 3 viewports)" e2e
else
  RESULTADOS+=("PULADO 5. E2E (GATE_PULAR_E2E=1)")
fi
etapa "6. Integridade de testes"     integridade

echo ""
echo "════════════ RESUMO DO GATE ════════════"
printf '%s\n' "${RESULTADOS[@]}"
echo "════════════════════════════════════════"
if [ "$FALHOU" -ne 0 ]; then echo "GATE VERMELHO"; exit 1; fi
echo "GATE VERDE"
